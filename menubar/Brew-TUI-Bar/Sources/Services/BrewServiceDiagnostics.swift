import Foundation
import os

private let serviceDiagnosticsLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "BrewServiceDiagnostics")

enum BrewServiceDiagnosticsError: LocalizedError {
    case invalidServiceName(String)

    var errorDescription: String? {
        switch self {
        case let .invalidServiceName(name):
            String(format: String(localized: "Invalid service name: %@"), name)
        }
    }
}

enum BrewServiceDiagnostics {
    private static let commandTimeout: TimeInterval = 20
    private static let validServicePattern = #"^[A-Za-z0-9][A-Za-z0-9@._+-]*$"#

    static func run(serviceName: String) async throws -> String {
        guard serviceName.range(of: validServicePattern, options: .regularExpression) != nil else {
            throw BrewServiceDiagnosticsError.invalidServiceName(serviceName)
        }

        let infoCommand = DiagnosticCommand(
            display: "brew services info \(serviceName)",
            executable: BrewExecutable.path,
            arguments: ["services", "info", serviceName]
        )
        let info = await runCommand(infoCommand)

        var blocks = [format(infoCommand, result: info)]
        if info.exitCode == 0 {
            let statusExecutable = executablePath(forServiceNamed: serviceName)
            let statusCommand = DiagnosticCommand(
                display: "\(serviceName) status",
                executable: statusExecutable,
                arguments: statusArguments(forServiceNamed: serviceName, executable: statusExecutable)
            )
            let status = await runCommand(statusCommand)
            blocks.append(format(statusCommand, result: status))
        } else {
            blocks.append(String(localized: "Skipped service status because the previous command failed."))
        }

        return blocks.joined(separator: "\n\n")
    }

    private static func executablePath(forServiceNamed serviceName: String) -> String {
        let brewBin = URL(fileURLWithPath: BrewExecutable.path).deletingLastPathComponent()
        let candidates = [
            brewBin.appendingPathComponent(serviceName).path,
            "/opt/homebrew/bin/\(serviceName)",
            "/usr/local/bin/\(serviceName)",
            "/home/linuxbrew/.linuxbrew/bin/\(serviceName)",
        ]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) } ?? "/usr/bin/env"
    }

    private static func statusArguments(forServiceNamed serviceName: String, executable: String) -> [String] {
        executable == "/usr/bin/env"
            ? [serviceName, "status"]
            : ["status"]
    }

    private static func runCommand(_ command: DiagnosticCommand) async -> DiagnosticResult {
        serviceDiagnosticsLogger.info("Running \(command.display, privacy: .public)")
        return await DiagnosticProcess.run(
            executable: command.executable,
            arguments: command.arguments,
            timeout: commandTimeout
        )
    }

    private static func format(_ command: DiagnosticCommand, result: DiagnosticResult) -> String {
        var lines = ["$ \(command.display)"]
        let trimmedOutput = result.output.trimmingCharacters(in: .whitespacesAndNewlines)
        lines.append(trimmedOutput.isEmpty ? String(localized: "(no output)") : trimmedOutput)
        if result.exitCode != 0 {
            lines.append(String(format: String(localized: "[exit %lld]"), Int64(result.exitCode)))
        }
        return lines.joined(separator: "\n")
    }
}

private struct DiagnosticCommand: Sendable {
    let display: String
    let executable: String
    let arguments: [String]
}

private struct DiagnosticResult: Sendable {
    let exitCode: Int32
    let output: String
}

private enum DiagnosticProcess {
    static func run(executable: String, arguments: [String], timeout: TimeInterval) async -> DiagnosticResult {
        final class OnceGuard: @unchecked Sendable {
            private var resumed = false
            private let lock = NSLock()
            private let continuation: CheckedContinuation<DiagnosticResult, Never>

            init(_ continuation: CheckedContinuation<DiagnosticResult, Never>) {
                self.continuation = continuation
            }

            func resume(with result: DiagnosticResult) -> Bool {
                lock.lock()
                defer { lock.unlock() }
                guard !resumed else { return false }
                resumed = true
                continuation.resume(returning: result)
                return true
            }
        }

        final class TimeoutBox: @unchecked Sendable {
            var task: Task<Void, Never>?
        }

        final class DataBuffer: @unchecked Sendable {
            private let lock = NSLock()
            private var data = Data()

            func append(_ chunk: Data) {
                lock.lock()
                defer { lock.unlock() }
                data.append(chunk)
            }

            func snapshot() -> Data {
                lock.lock()
                defer { lock.unlock() }
                return data
            }
        }

        return await withCheckedContinuation { continuation in
            let process = Process()
            let pipe = Pipe()
            let buffer = DataBuffer()
            let guard_ = OnceGuard(continuation)
            let timeoutBox = TimeoutBox()

            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            process.standardOutput = pipe
            process.standardError = pipe
            process.environment = ProcessInfo.processInfo.environment.merging(
                ["PATH": diagnosticPath()]
            ) { _, new in new }

            pipe.fileHandleForReading.readabilityHandler = { handle in
                let chunk = handle.availableData
                if chunk.isEmpty {
                    handle.readabilityHandler = nil
                } else {
                    buffer.append(chunk)
                }
            }

            process.terminationHandler = { proc in
                pipe.fileHandleForReading.readabilityHandler = nil
                if let remaining = try? pipe.fileHandleForReading.readToEnd(),
                   !remaining.isEmpty
                {
                    buffer.append(remaining)
                }
                let output = String(data: buffer.snapshot(), encoding: .utf8) ?? ""
                if guard_.resume(with: DiagnosticResult(exitCode: proc.terminationStatus, output: output)) {
                    timeoutBox.task?.cancel()
                }
            }

            do {
                try process.run()
            } catch {
                let message = String(format: String(localized: "Could not launch command: %@"), error.localizedDescription)
                _ = guard_.resume(with: DiagnosticResult(exitCode: 127, output: message))
                return
            }

            timeoutBox.task = Task {
                do {
                    try await Task.sleep(for: .seconds(timeout))
                } catch {
                    return
                }
                if process.isRunning {
                    process.terminate()
                    _ = guard_.resume(with: DiagnosticResult(
                        exitCode: 124,
                        output: String(localized: "Command timed out.")
                    ))
                }
            }
        }
    }

    private static func diagnosticPath() -> String {
        let existing = ProcessInfo.processInfo.environment["PATH"] ?? ""
        let prefixes = "/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin"
        return existing.isEmpty ? prefixes : "\(prefixes):\(existing)"
    }
}
