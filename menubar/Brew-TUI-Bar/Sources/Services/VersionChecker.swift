import Foundation
import os

/// Cross-platform version contract: Brew-TUI-Bar's marketing version must match
/// the Brew-TUI CLI it talks to (license schema + future IPC). On mismatch we
/// surface a non-blocking warning at launch — license decryption may still
/// succeed today, but skew is the early signal that something will break.
struct VersionChecker {
    private static let logger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "VersionChecker")

    enum Status: Equatable {
        case match(brewTui: String)
        case mismatch(brewTui: String, brewBar: String)
        case unknown // brew-tui present but version unreadable
    }

    /// Marketing version embedded in Brew-TUI-Bar's bundle.
    static var brewBarVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    /// Calls `brew-tui --version` and parses the single-line output.
    /// Returns nil if brew-tui is missing or the call fails.
    static func brewTuiVersion() async -> String? {
        let executable = await locateBrewTui()
        guard let executable else { return nil }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = ["--version"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                process.terminationHandler = { _ in cont.resume() }
                do { try process.run() } catch { cont.resume(throwing: error) }
            }
        } catch {
            logger.error("brew-tui --version failed to launch: \(error.localizedDescription, privacy: .public)")
            return nil
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let raw = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // Defensive: accept either "0.7.0" or "vX.Y.Z" or any token starting with a digit.
        guard let token = raw.split(whereSeparator: { $0.isWhitespace }).first.map(String.init),
              !token.isEmpty
        else {
            logger.error("brew-tui --version returned empty output")
            return nil
        }
        return token.hasPrefix("v") ? String(token.dropFirst()) : token
    }

    static func check() async -> Status {
        guard let cliVersion = await brewTuiVersion() else {
            return .unknown
        }
        if cliVersion == brewBarVersion {
            return .match(brewTui: cliVersion)
        }
        return .mismatch(brewTui: cliVersion, brewBar: brewBarVersion)
    }

    // MARK: - Helpers

    private static func locateBrewTui() async -> String? {
        let knownPaths = [
            "/opt/homebrew/bin/brew-tui",
            "/usr/local/bin/brew-tui",
            "\(NSHomeDirectory())/.npm/bin/brew-tui",
        ]
        for path in knownPaths where FileManager.default.isExecutableFile(atPath: path) {
            return path
        }

        // Fallback: ask the shell PATH via /usr/bin/which
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["brew-tui"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                process.terminationHandler = { _ in cont.resume() }
                do { try process.run() } catch { cont.resume(throwing: error) }
            }
        } catch {
            return nil
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return path.isEmpty ? nil : path
    }
}
