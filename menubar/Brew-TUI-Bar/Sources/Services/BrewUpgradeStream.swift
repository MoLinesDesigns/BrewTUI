import Foundation
import os

private let brewStreamLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "BrewUpgradeStream")

/// Event emitted by `BrewUpgradeStream` as it parses `brew upgrade` stdout.
enum BrewUpgradeEvent: Sendable {
    /// Detected a new package the run is touching. For single-package runs
    /// this fires once before the first `.stage`; for upgrade-all it fires
    /// whenever brew prints `==> Upgrading <name>`.
    case packageDiscovered(String)
    /// A stage transition for a known package.
    case packageStage(name: String, stage: InstallStage)
    /// Raw log line (kept for debug / future "show details" disclosure).
    case logLine(String)
    /// Process exited with status 0.
    case success
    /// Process exited non-zero or failed to launch. Includes a localized reason.
    case failure(String)
}

/// Thread-safe sink for events produced from GCD-backed pipe readers. Lives at
/// file scope so the parser can take it by direct reference instead of going
/// through `AnyObject`. Access is serialised through `lock`.
private final class StreamBox: @unchecked Sendable {
    private let lock = NSLock()
    private var buffer = ""
    private var finished = false
    private let continuation: AsyncStream<BrewUpgradeEvent>.Continuation

    init(_ continuation: AsyncStream<BrewUpgradeEvent>.Continuation) {
        self.continuation = continuation
    }

    func emit(_ event: BrewUpgradeEvent) {
        lock.lock(); defer { lock.unlock() }
        guard !finished else { return }
        continuation.yield(event)
    }

    func finish(with event: BrewUpgradeEvent) {
        lock.lock(); defer { lock.unlock() }
        guard !finished else { return }
        finished = true
        continuation.yield(event)
        continuation.finish()
    }

    /// Appends raw stdout bytes to the buffer and returns any complete lines
    /// it can now extract (newline-delimited).
    func appendAndSplit(_ chunk: String) -> [String] {
        lock.lock(); defer { lock.unlock() }
        buffer.append(chunk)
        var lines: [String] = []
        while let newlineIdx = buffer.firstIndex(of: "\n") {
            lines.append(String(buffer[..<newlineIdx]))
            buffer = String(buffer[buffer.index(after: newlineIdx)...])
        }
        return lines
    }

    /// Final trailing fragment (no newline). Called once from the termination
    /// handler so the last line — typically `==> Linking foo` — is not lost.
    func drainTail() -> String? {
        lock.lock(); defer { lock.unlock() }
        guard !buffer.isEmpty else { return nil }
        let last = buffer
        buffer = ""
        return last
    }
}

/// Streams a `brew upgrade [args]` invocation, parsing the `==>` markers brew
/// emits and producing structured `BrewUpgradeEvent`s. Used by AppState to
/// drive `InstallProgressView` without blocking until the whole run finishes.
enum BrewUpgradeStream {
    /// Large upgrades can run for a long time; still bound so a stuck brew cannot
    /// leave AppState on `isLoading` indefinitely (see BrewProcess timeout).
    static let upgradeTimeout: TimeInterval = 30 * 60

    /// Runs `brew upgrade <packages>` (no packages → upgrade all) and yields
    /// events as the process produces output. The stream finishes on `.success`
    /// or `.failure`; the consumer should always await the final event before
    /// considering the run complete.
    static func run(packages: [String]) -> AsyncStream<BrewUpgradeEvent> {
        AsyncStream { continuation in
            let box = StreamBox(continuation)

            final class TimeoutBox: @unchecked Sendable {
                var task: Task<Void, Never>?
            }
            let timeoutBox = TimeoutBox()

            let process = Process()
            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()

            process.executableURL = URL(fileURLWithPath: BrewExecutable.path)
            // `brew upgrade` with no positional args = upgrade everything.
            process.arguments = ["upgrade"] + packages
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe
            // brew's progress output is line-buffered when stdout is not a tty;
            // these env tweaks keep it readable and disable the auto-update
            // detour that would prefix the run with a long opaque pause.
            var env = ProcessInfo.processInfo.environment
            env["HOMEBREW_NO_AUTO_UPDATE"] = "1"
            env["HOMEBREW_NO_EMOJI"] = "1"
            env["HOMEBREW_NO_ENV_HINTS"] = "1"
            process.environment = env

            // Drain stdout/stderr incrementally — same kernel-buffer-deadlock
            // guard as BrewProcess.run uses for `brew search`/`brew outdated`.
            let drain: @Sendable (FileHandle) -> Void = { handle in
                let chunk = handle.availableData
                if chunk.isEmpty {
                    handle.readabilityHandler = nil
                    return
                }
                guard let text = String(data: chunk, encoding: .utf8) else { return }
                for line in box.appendAndSplit(text) {
                    parseAndEmit(line: line, box: box)
                }
            }
            stdoutPipe.fileHandleForReading.readabilityHandler = drain
            // brew sends most progress to stdout, but `==> Fetching` and
            // similar markers can land on stderr depending on the formula.
            // Reading both keeps parsing complete even when output is split.
            stderrPipe.fileHandleForReading.readabilityHandler = drain

            process.terminationHandler = { proc in
                timeoutBox.task?.cancel()
                stdoutPipe.fileHandleForReading.readabilityHandler = nil
                stderrPipe.fileHandleForReading.readabilityHandler = nil
                if let tail = box.drainTail(), !tail.isEmpty {
                    parseAndEmit(line: tail, box: box)
                }
                if proc.terminationStatus == 0 {
                    box.finish(with: .success)
                } else {
                    let reason = String(
                        format: String(localized: "brew exited with code %lld"),
                        Int64(proc.terminationStatus)
                    )
                    box.finish(with: .failure(reason))
                }
            }

            continuation.onTermination = { @Sendable _ in
                timeoutBox.task?.cancel()
                if process.isRunning { process.terminate() }
            }

            do {
                try process.run()
            } catch let error as CocoaError
            where error.code == .fileNoSuchFile || error.code == .fileReadNoSuchFile {
                box.finish(with: .failure(String(localized: "Homebrew is not installed. Install it from https://brew.sh")))
            } catch {
                brewStreamLogger.error("Failed to launch brew upgrade: \(error.localizedDescription, privacy: .public)")
                box.finish(with: .failure(error.localizedDescription))
                return
            }

            timeoutBox.task = Task {
                do {
                    try await Task.sleep(for: .seconds(upgradeTimeout))
                } catch {
                    return
                }
                if process.isRunning {
                    brewStreamLogger.error("brew upgrade timed out after \(upgradeTimeout, privacy: .public)s")
                    process.terminate()
                    box.finish(with: .failure(BrewProcessError.timeout.localizedDescription))
                }
            }
        }
    }

    // MARK: - Parser (file-private, exposed for tests)

    /// Recognises the `==> <verb> <name>` markers brew emits. Lines that do
    /// not carry a `==>` marker are dropped silently — `brew install` emits
    /// thousands of progress lines during compilation (ffmpeg, node, …) and
    /// yielding a `.logLine` event per line was saturating the @MainActor
    /// runloop that serves the popover. The `.logLine` case is kept in the
    /// enum so the contract stays open for a future "show details" disclosure
    /// that batches lines off-actor.
    fileprivate static func parseAndEmit(line rawLine: String, box: StreamBox) {
        let stripped = stripANSI(rawLine).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !stripped.isEmpty else { return }

        // Detect brew's polite refusal: "Warning: Not upgrading <name>, the
        // latest version is already installed". The process still exits 0
        // even though nothing was installed — without this branch the modal
        // would render "Done" over a package that re-appears in the next
        // outdated refresh. Emitting a `.failed` stage lets runUpgradeStream
        // flip the overall success to failure so the user sees what happened.
        if let prefix = stripped.range(of: "Not upgrading "),
           let comma = stripped.range(of: ",", range: prefix.upperBound..<stripped.endIndex) {
            let name = String(stripped[prefix.upperBound..<comma.lowerBound])
            if let resolved = packageName(from: name) {
                let reason = String(localized: "Homebrew skipped the upgrade — try `brew reinstall` for this package")
                box.emit(.packageStage(name: resolved, stage: .failed(reason)))
            }
            return
        }

        guard let marker = stripped.range(of: "==>") else { return }
        let after = stripped[marker.upperBound...].trimmingCharacters(in: .whitespaces)

        // Greedy match on the verb + first identifier-like token.
        let tokens = after.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
        guard let verbRaw = tokens.first else { return }
        let verb = verbRaw.lowercased()
        let restRaw = tokens.count >= 2 ? String(tokens[1]) : ""
        // Trim trailing punctuation brew adds in some lines ("git:" → "git").
        let pkgCandidate = restRaw
            .trimmingCharacters(in: CharacterSet(charactersIn: ":.,;"))

        // Verb → stage mapping. "Upgrading" is also our "package discovered"
        // signal for the upgrade-all flow.
        switch verb {
        case "upgrading":
            guard let name = packageName(from: pkgCandidate) else { return }
            box.emit(.packageDiscovered(name))
            box.emit(.packageStage(name: name, stage: .installing))
        case "fetching", "downloading":
            guard let name = packageName(from: pkgCandidate) else { return }
            box.emit(.packageStage(name: name, stage: .fetching))
        case "installing":
            guard let name = packageName(from: pkgCandidate) else { return }
            box.emit(.packageStage(name: name, stage: .installing))
        case "pouring":
            guard let name = packageName(from: pkgCandidate) else { return }
            box.emit(.packageStage(name: name, stage: .pouring))
        case "linking", "summary":
            guard let name = packageName(from: pkgCandidate) else { return }
            box.emit(.packageStage(name: name, stage: .linking))
        case "caveats":
            // Caveats follow a successful install — flip to done.
            guard let name = packageName(from: pkgCandidate) else { return }
            box.emit(.packageStage(name: name, stage: .done))
        default:
            break
        }
    }

    /// Resolves the first non-empty package identifier. brew sometimes prints
    /// `==> Pouring git--2.45.1.arm64_sonoma.bottle.tar.gz` — split on `--` /
    /// `.bottle` so we recover the original formula name.
    ///
    /// Casks also emit `==> Downloading https://example.com/foo.dmg` — the URL
    /// is not a package name. We reject anything that looks like a URL, an
    /// absolute path, a host:port pair, or a token starting with a digit
    /// (Homebrew package names start with a letter).
    static func packageName(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }

        // Reject URLs (`https://…`) and absolute paths (`/Library/...`).
        if trimmed.contains("://") { return nil }
        if trimmed.hasPrefix("/") { return nil }
        let lower = trimmed.lowercased()
        if lower.hasPrefix("http") || lower.hasPrefix("file:") { return nil }

        // Package names start with a letter or underscore, never a digit
        // or punctuation. Filters out version strings and stray markers.
        guard let first = trimmed.unicodeScalars.first,
              CharacterSet.letters.union(CharacterSet(charactersIn: "_")).contains(first) else {
            return nil
        }

        if let dashDash = trimmed.range(of: "--") {
            return String(trimmed[..<dashDash.lowerBound])
        }
        // Trailing bottle / archive extensions (without `--` separator) —
        // strip them so the row keys cleanly. Versioned formulae like
        // `python@3.12` keep the `@3.12` because it sits BEFORE any extension.
        for ext in [".bottle.tar.gz", ".tar.gz", ".tar.xz", ".zip", ".dmg", ".pkg"] {
            if let r = trimmed.range(of: ext, options: [.backwards, .caseInsensitive]) {
                return String(trimmed[..<r.lowerBound])
            }
        }
        return trimmed
    }

    /// Cheap ANSI strip — brew uses ESC[…m sequences.
    static func stripANSI(_ s: String) -> String {
        guard s.contains("\u{1B}") else { return s }
        var out = ""
        var inEscape = false
        for ch in s {
            if ch == "\u{1B}" {
                inEscape = true
                continue
            }
            if inEscape {
                if ch == "m" { inEscape = false }
                continue
            }
            out.append(ch)
        }
        return out
    }
}
