import Foundation
import Security
import os

private let crashLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "CrashReporter")

// File-private free function so it can be passed as a C function pointer
// to NSSetUncaughtExceptionHandler (no captured context allowed).
private let handleUncaught: @convention(c) (NSException) -> Void = { exception in
    CrashReporter.didReceiveUncaughtException(exception)
}

/// Opt-in crash reporting that posts JSON to a user-configured endpoint
/// (typically a self-hosted dashboard on the user's NAS).
///
/// Configuration is read from UserDefaults except for the bearer token, which
/// lives in Keychain (BK-011). Endpoint and enabled flag are not secrets:
///   defaults write com.molinesdesigns.brewtuibar crashReporterEndpoint https://nas.local:port/crash
///   defaults write com.molinesdesigns.brewtuibar crashReporterEnabled -bool YES
/// To set the token from Settings.app or a script, see `setToken(_:)`.
///
/// Note: this captures Objective-C `NSException` and explicitly reported
/// errors. Pure-Swift `fatalError` / runtime traps cannot be intercepted
/// without a native crash SDK.
// QA-007: seam for plugging in a real crash SDK (Sentry, Crashlytics, Bugsnag).
// Pure-Swift `fatalError`/runtime traps cannot be intercepted from inside the
// process — only a native handler installed via Sentry-Cocoa or equivalent can
// catch them. Until that PR lands, anyone wanting third-party crash capture
// implements this protocol and registers it via `CrashReporter.installSDK(_:)`.
//
// Keeping this protocol in-tree avoids tying the codebase to a specific SDK
// while letting the call sites (`CrashReporter.report(_:)`) forward to it.
protocol CrashReportingSDK: Sendable {
    func captureException(_ exception: NSException, context: [String: String])
    func captureError(_ error: Error, context: [String: String])
}

enum CrashReporter {
    private static let endpointKey = "crashReporterEndpoint"
    private static let enabledKey = "crashReporterEnabled"
    private static let keychainService = "com.molinesdesigns.brewbar.crashReporter"
    private static let keychainAccount = "token"
    private static let postTimeout: TimeInterval = 5

    nonisolated(unsafe) private static var externalSDK: (any CrashReportingSDK)?

    /// Register a third-party SDK. Pass nil to detach. See QA-007.
    static func installSDK(_ sdk: (any CrashReportingSDK)?) {
        externalSDK = sdk
    }

    private struct Report: Encodable {
        let app: String
        let version: String
        let platform: String
        let os: String
        let arch: String
        let machineId: String
        let timestamp: String
        let level: String
        let message: String
        let stack: String?
        let context: [String: String]
    }

    private static var endpoint: URL? {
        guard let raw = UserDefaults.standard.string(forKey: endpointKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty
        else { return nil }
        return URL(string: raw)
    }

    private static var token: String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty
        else { return nil }
        return value
    }

    /// Persist the bearer token in Keychain. Pass nil to clear.
    static func setToken(_ token: String?) {
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
        ]
        // Always delete first so updates do not collide with stale entries.
        SecItemDelete(baseQuery as CFDictionary)
        guard let token, !token.isEmpty, let data = token.data(using: .utf8) else { return }
        var insert = baseQuery
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(insert as CFDictionary, nil)
        if status != errSecSuccess {
            crashLogger.error("Could not store crash-reporter token: \(status, privacy: .public)")
        }
    }

    private static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: enabledKey) && endpoint != nil
    }

    /// Install global handlers. Safe to call from `applicationDidFinishLaunching`.
    static func install() {
        // QA-007: even when the NAS endpoint is disabled, we still want the
        // SDK forward to fire if one is registered. Both paths are independent.
        let sdkActive = externalSDK != nil
        guard isEnabled || sdkActive else { return }
        // The C function pointer NSSetUncaughtExceptionHandler expects cannot
        // capture context, so the handler reads the static SDK + posts the
        // NAS report through the static `send` entrypoint.
        NSSetUncaughtExceptionHandler(handleUncaught)
        crashLogger.info("CrashReporter enabled (NAS: \(isEnabled), SDK: \(sdkActive))")
    }

    /// Internal callback for the C uncaught-exception handler.
    static func didReceiveUncaughtException(_ exception: NSException) {
        externalSDK?.captureException(exception, context: ["kind": "NSException"])
        send(
            level: "fatal",
            message: exception.reason ?? exception.name.rawValue,
            stack: exception.callStackSymbols.joined(separator: "\n"),
            context: ["kind": "NSException"]
        )
    }

    /// Manually report a non-fatal error.
    static func report(_ error: Error, context: [String: String] = [:]) {
        externalSDK?.captureError(error, context: context)
        guard isEnabled else { return }
        send(
            level: "error",
            message: error.localizedDescription,
            stack: Thread.callStackSymbols.joined(separator: "\n"),
            context: context
        )
    }

    // MARK: - Internal

    private static func send(level: String, message: String, stack: String?, context: [String: String]) {
        guard let endpoint, isAllowedHost(endpoint) else { return }

        let report = Report(
            app: "brew-tui-bar",
            version: marketingVersion(),
            platform: "macos",
            os: ProcessInfo.processInfo.operatingSystemVersionString,
            arch: hardwareArch(),
            machineId: machineId(),
            timestamp: ISO8601DateFormatter().string(from: Date()),
            level: level,
            message: message,
            stack: stack,
            context: context
        )

        guard let body = try? JSONEncoder().encode(report) else { return }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = postTimeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = body

        // Fire-and-forget. Synchronous wait would block the host process.
        URLSession.shared.dataTask(with: request) { _, _, error in
            if let error {
                crashLogger.warning("crash POST failed: \(error.localizedDescription, privacy: .public)")
            }
        }.resume()
    }

    private static func isAllowedHost(_ url: URL) -> Bool {
        if url.scheme == "https" { return true }
        if url.scheme == "http", let host = url.host {
            // Allow plain http only for loopback / private LAN destinations.
            return host == "localhost"
                || host.hasPrefix("127.")
                || host.hasPrefix("10.")
                || host.hasPrefix("192.168.")
                || host.hasPrefix("172.16.") || host.hasPrefix("172.17.")
                || host.hasPrefix("172.18.") || host.hasPrefix("172.19.")
                || host.hasPrefix("172.20.") || host.hasPrefix("172.21.")
                || host.hasPrefix("172.22.") || host.hasPrefix("172.23.")
                || host.hasPrefix("172.24.") || host.hasPrefix("172.25.")
                || host.hasPrefix("172.26.") || host.hasPrefix("172.27.")
                || host.hasPrefix("172.28.") || host.hasPrefix("172.29.")
                || host.hasPrefix("172.30.") || host.hasPrefix("172.31.")
                || host == "::1"
        }
        return false
    }

    private static func machineId() -> String {
        let path = NSHomeDirectory() + "/.brew-tui/machine-id"
        if let raw = try? String(contentsOfFile: path, encoding: .utf8) {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return "unknown"
    }

    private static func marketingVersion() -> String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
    }

    private static func hardwareArch() -> String {
        var size: Int = 0
        sysctlbyname("hw.machine", nil, &size, nil, 0)
        var machine = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.machine", &machine, &size, nil, 0)
        return String(cString: machine)
    }
}
