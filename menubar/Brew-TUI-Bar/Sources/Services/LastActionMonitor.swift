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

// Watches `~/.brew-tui/last-action.json` with a DispatchSourceFileSystemObject
// and invokes a callback on every successful read. This is the same pattern
// SyncMonitor uses for iCloud — the goal is to keep Brew-TUI-Bar reactive to
// Brew-TUI without IPC, polling, or distributed notifications.
@MainActor
final class LastActionMonitor {
    static let shared = LastActionMonitor()

    private let path: URL
    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1
    private var lastSeenTimestamp: String?
    private var onChange: ((LastAction) -> Void)?

    init(path: URL? = nil) {
        if let path { self.path = path; return }
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.path = home.appendingPathComponent(".brew-tui/last-action.json")
    }

    // Begin watching. The directory is created lazily by Brew-TUI; if the file
    // is missing we still install a directory watcher so the first write picks
    // it up. Safe to call multiple times — re-installs the source.
    func start(onChange: @escaping (LastAction) -> Void) {
        stop()
        self.onChange = onChange

        // Seed lastSeenTimestamp from the current file so the first launch does
        // not replay an old action as if it just happened.
        if let initial = readPayload() {
            lastSeenTimestamp = initial.timestamp
        }

        installSource()
    }

    func stop() {
        source?.cancel()
        source = nil
        if fileDescriptor >= 0 {
            close(fileDescriptor)
            fileDescriptor = -1
        }
        onChange = nil
    }

    // MARK: - Internals

    private func installSource() {
        // Watch the parent directory because the file is replaced atomically via
        // rename(); a descriptor on the file itself becomes stale after rename
        // and stops emitting events. Directory watching survives the swap.
        let dir = path.deletingLastPathComponent().path

        // Ensure the directory exists; if not, retry installation in 5s.
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
            queue: .main
        )

        src.setEventHandler { [weak self] in
            guard let self else { return }
            self.handleFileSystemEvent()
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

    private func handleFileSystemEvent() {
        guard let payload = readPayload() else { return }
        // De-dupe: only fire if timestamp changed. Atomic rename produces one
        // event but the watcher may also fire on .extend during the temp write,
        // so timestamp is the canonical "is this new" signal.
        if payload.timestamp == lastSeenTimestamp { return }
        lastSeenTimestamp = payload.timestamp
        lastActionLogger.info("New last-action.json: action=\(payload.action, privacy: .public) packages=\(payload.packages.count) remaining=\(payload.remainingOutdated)")
        onChange?(payload)
    }

    private func readPayload() -> LastAction? {
        do {
            let data = try Data(contentsOf: path)
            return try JSONDecoder().decode(LastAction.self, from: data)
        } catch {
            lastActionLogger.debug("readPayload error (expected if no file yet): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
