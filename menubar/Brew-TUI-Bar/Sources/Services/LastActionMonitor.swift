import Foundation
import os

private let lastActionLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "LastActionMonitor")

// Payload Brew-TUI writes to ~/.brew-tui/last-action.json after a brew action
// completes. Decoded once per file change and forwarded to AppState as a banner
// update. Keep field names in sync with src/lib/data-dir.ts.
struct LastAction: Decodable, Sendable {
    let timestamp: String
    let action: String
    let packages: [String]
    let remainingOutdated: Int
    let source: String
}

// Watches `~/.brew-tui/` for atomic renames of `last-action.json`.
// Events are handled off the main thread with debounce so unrelated writes
// under `~/.brew-tui/` (history, license, CVE cache, profiles) do not block UI.
final class LastActionMonitor: @unchecked Sendable {
    static let shared = LastActionMonitor()

    private static let debounceInterval: TimeInterval = 0.3

    private let path: URL
    private let eventQueue = DispatchQueue(label: "com.molinesdesigns.brewtuibar.lastaction", qos: .utility)
    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1
    private var debounceWorkItem: DispatchWorkItem?
    private var lastSeenTimestamp: String?
    private var lastKnownFileModDate: Date?
    private var onChange: (@MainActor (LastAction) -> Void)?

    init(path: URL? = nil) {
        if let path {
            self.path = path
            return
        }
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.path = home.appendingPathComponent(".brew-tui/last-action.json")
    }

    func start(onChange: @escaping @MainActor (LastAction) -> Void) {
        eventQueue.async { [self] in
            self.stopOnQueue()
            self.onChange = onChange

            if let initial = self.readPayloadOnQueue() {
                self.lastSeenTimestamp = initial.timestamp
                self.lastKnownFileModDate = self.fileModificationDateOnQueue()
            }

            self.installSourceOnQueue()
        }
    }

    func stop() {
        eventQueue.async { [self] in
            self.stopOnQueue()
        }
    }

    // MARK: - Internals (event queue only)

    private func stopOnQueue() {
        debounceWorkItem?.cancel()
        debounceWorkItem = nil
        source?.cancel()
        source = nil
        if fileDescriptor >= 0 {
            close(fileDescriptor)
            fileDescriptor = -1
        }
        onChange = nil
    }

    private func installSourceOnQueue() {
        let dir = path.deletingLastPathComponent().path

        if !FileManager.default.fileExists(atPath: dir) {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: nil)
        }

        let fd = open(dir, O_EVTONLY)
        guard fd >= 0 else {
            lastActionLogger.warning("Could not open \(dir, privacy: .public) for watching")
            return
        }
        fileDescriptor = fd

        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .delete, .rename, .extend],
            queue: eventQueue
        )

        src.setEventHandler { [weak self] in
            self?.scheduleDebouncedReadOnQueue()
        }

        src.setCancelHandler { [weak self] in
            guard let self else { return }
            if self.fileDescriptor >= 0 {
                close(self.fileDescriptor)
                self.fileDescriptor = -1
            }
        }

        src.resume()
        source = src
        lastActionLogger.info("Watching \(dir, privacy: .public) for last-action.json changes")
    }

    private func scheduleDebouncedReadOnQueue() {
        debounceWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.handleFileSystemEventOnQueue()
        }
        debounceWorkItem = work
        eventQueue.asyncAfter(deadline: .now() + Self.debounceInterval, execute: work)
    }

    private func handleFileSystemEventOnQueue() {
        guard let modDate = fileModificationDateOnQueue() else { return }
        if let lastMod = lastKnownFileModDate, modDate == lastMod {
            return
        }
        lastKnownFileModDate = modDate

        guard let payload = readPayloadOnQueue() else { return }
        if payload.timestamp == lastSeenTimestamp { return }
        lastSeenTimestamp = payload.timestamp
        lastActionLogger.info(
            "New last-action.json: action=\(payload.action, privacy: .public) packages=\(payload.packages.count) remaining=\(payload.remainingOutdated)"
        )

        guard let callback = onChange else { return }
        Task { @MainActor in
            callback(payload)
        }
    }

    private func fileModificationDateOnQueue() -> Date? {
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        return try? path.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
    }

    private func readPayloadOnQueue() -> LastAction? {
        do {
            let data = try Data(contentsOf: path)
            return try JSONDecoder().decode(LastAction.self, from: data)
        } catch {
            lastActionLogger.debug("readPayload error (expected if no file yet): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
