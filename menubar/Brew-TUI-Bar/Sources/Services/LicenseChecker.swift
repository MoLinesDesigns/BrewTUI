import CryptoKit
import Foundation
import os

// MARK: - License data models

struct LicenseData: Codable {
    let key: String
    let instanceId: String
    let status: String
    let customerEmail: String
    let customerName: String
    let plan: String
    let activatedAt: String
    let expiresAt: String?
    let lastValidatedAt: String
}

struct LicenseFile: Codable {
    let version: Int
    // Legacy unencrypted format
    let license: LicenseData?
    // AES-256-GCM encrypted format
    let encrypted: String?
    let iv: String?
    let tag: String?
}

// MARK: - License status

/// Mirrors the four-level degradation in `src/lib/license/license-manager.ts`
/// (`getDegradationLevel`). The cutoff thresholds must stay in sync — both
/// codebases read the same license.json and compute against the same field.
/// Currently the Brew-TUI-Bar UI only distinguishes pro vs expired, but the level
/// is exposed so future affordances (warning banner, partial degradation)
/// can rely on it without divergence.
enum DegradationLevel: Sendable {
    case none      // 0–7 days since last server validation
    case warning   // 7–14 days — show notice, full access
    case limited   // 14–30 days — partial access
    case expired   // 30+ days — block Pro features
}

extension LicenseData: Sendable {}

enum LicenseStatus: Sendable {
    case pro(LicenseData, DegradationLevel)
    case expired
    case notFound
}

/// Flat, UI-friendly snapshot of the active license. Built once at launch
/// and stored on AppState so the popover and Settings can read it without
/// re-running the checker (and without holding a non-Sendable enum payload).
struct LicenseSummary: Sendable, Equatable {
    enum Tier: Sendable, Equatable {
        case pro
        case basic
    }

    let tier: Tier
    /// True when this user has had an active license at some point (current
    /// or expired). Used by the popover to distinguish "never activated" (show
    /// the upgrade funnel) from "expired" (show the smaller renewal banner on
    /// top of the regular app UI).
    let wasEverActive: Bool
    let email: String?
    let plan: String?
    let activatedAt: Date?
    let expiresAt: Date?
    let lastValidatedAt: Date?
    let degradation: DegradationLevelMirror

    /// Equatable mirror of DegradationLevel — keeps the original enum
    /// internal to the checker while exposing the value flat.
    enum DegradationLevelMirror: Sendable, Equatable {
        case none
        case warning
        case limited
        case expired
    }

    var tierLabel: String {
        switch tier {
        case .pro: String(localized: "Pro")
        case .basic: String(localized: "Basic")
        }
    }
}

extension LicenseSummary {
    init(from status: LicenseStatus) {
        switch status {
        case let .pro(data, level):
            self.tier = .pro
            self.wasEverActive = true
            self.email = data.customerEmail
            self.plan = data.plan
            self.activatedAt = LicenseChecker.parsePublicDate(data.activatedAt)
            self.expiresAt = data.expiresAt.flatMap(LicenseChecker.parsePublicDate)
            self.lastValidatedAt = LicenseChecker.parsePublicDate(data.lastValidatedAt)
            self.degradation = .init(level)
        case .expired:
            self.tier = .basic
            self.wasEverActive = true
            self.email = nil
            self.plan = nil
            self.activatedAt = nil
            self.expiresAt = nil
            self.lastValidatedAt = nil
            self.degradation = .expired
        case .notFound:
            self.tier = .basic
            self.wasEverActive = false
            self.email = nil
            self.plan = nil
            self.activatedAt = nil
            self.expiresAt = nil
            self.lastValidatedAt = nil
            self.degradation = .expired
        }
    }
}

private extension LicenseSummary.DegradationLevelMirror {
    init(_ level: DegradationLevel) {
        switch level {
        case .none: self = .none
        case .warning: self = .warning
        case .limited: self = .limited
        case .expired: self = .expired
        }
    }
}

// MARK: - LicenseChecker

struct LicenseChecker {
    private static let logger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "LicenseChecker")

    private static let licensePath: String = {
        NSHomeDirectory() + "/.brew-tui/license.json"
    }()

    // SEG-002: license keys are now derived per-user via HKDF-SHA256.
    // The TS bundle (license-manager.ts) ciphers with:
    //   hkdfSync('sha256', SECRET, SALT, machineId, 32)
    // Swift mirrors that here using CryptoKit's HKDF.
    //
    // Legacy fallback: license.json files written by 0.6.2 and earlier are
    // ciphered with the constant scrypt key whose pre-computed hex is below.
    // We try the HKDF key first, then fall back to legacy. TODO(SEG-003,
    // 0.6.3): delete the `let hex` legacy key path after telemetry confirms
    // zero fallback decrypts in the wild.
    private static let encryptionSecret = "brew-tui-license-aes256gcm-v1"
    private static let hkdfSalt = "brew-tui-salt-v1"
    private static let machineIdPath: String = NSHomeDirectory() + "/.brew-tui/machine-id"

    private static var derivedEncryptionKey: SymmetricKey {
        guard let machineId = readMachineId(), !machineId.isEmpty else {
            // Without a machine-id we cannot reproduce the TUI's HKDF output.
            // Fall back to the legacy key so we still degrade to the previous
            // behaviour rather than refusing to decrypt at all.
            return legacyEncryptionKey
        }
        let inputKey = SymmetricKey(data: Data(encryptionSecret.utf8))
        return HKDF<SHA256>.deriveKey(
            inputKeyMaterial: inputKey,
            salt: Data(hkdfSalt.utf8),
            info: Data(machineId.utf8),
            outputByteCount: 32
        )
    }

    private static let legacyEncryptionKey: SymmetricKey = {
        // Pre-computed scrypt('brew-tui-license-aes256gcm-v1', 'brew-tui-salt-v1', 32)
        let hex = "5c3b2ae2a3066bca28773f36db347d8c8a0a396d4b9fab628331446acd6d4126"
        return SymmetricKey(data: Data(hexString: hex)!)
    }()

    private static func readMachineId() -> String? {
        guard let data = FileManager.default.contents(atPath: machineIdPath),
              let raw = String(data: data, encoding: .utf8) else {
            return nil
        }
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Degradation thresholds (days since last validation). Must match
    /// `getDegradationLevel` in `src/lib/license/license-manager.ts`.
    private static let warningThresholdDays: Double = 7
    private static let limitedThresholdDays: Double = 14
    private static let expiredThresholdDays: Double = 30

    // SEG-009: built-in perennial PRO accounts removed in parity with the TS
    // bundle (src/lib/license/license-manager.ts). Operator licenses now go
    // through the same Polar validation as any customer.

    // MARK: - Public API

    static func checkLicense() -> LicenseStatus {
        logger.info("Checking license at \(licensePath, privacy: .public)")

        guard let data = FileManager.default.contents(atPath: licensePath) else {
            logger.info("License file not found")
            return .notFound
        }

        guard let file = try? JSONDecoder().decode(LicenseFile.self, from: data) else {
            logger.error("Failed to decode license file")
            return .notFound
        }

        // Try encrypted format first
        if let encrypted = file.encrypted, let iv = file.iv, let tag = file.tag {
            guard let license = decrypt(encrypted: encrypted, iv: iv, tag: tag) else {
                logger.error("Failed to decrypt license data")
                return .notFound
            }
            let status = evaluate(license)
            // SEG-003: la representacion `String(describing:)` de LicenseStatus
            // incluye email + license key + instanceId. Loguear solo el case
            // resumido en .public; el payload completo va en .private para
            // diagnostico interno via Console con permisos de desarrollador.
            logger.info("License check result: \(LicenseChecker.summarizeStatus(status), privacy: .public) (\(String(describing: status), privacy: .private))")
            return status
        }

        // Fallback: legacy unencrypted format
        if let license = file.license {
            let status = evaluate(license)
            logger.info("License check result (legacy format): \(LicenseChecker.summarizeStatus(status), privacy: .public) (\(String(describing: status), privacy: .private))")
            return status
        }

        logger.info("License file has no license data")
        return .notFound
    }

    /// Evaluate a license directly (for testing without filesystem access)
    static func checkLicenseWith(_ license: LicenseData) -> LicenseStatus {
        evaluate(license)
    }

    // SEG-003: resumen no-PII para logging publico. El caso de la enumeracion
    // y el nivel de degradacion son suficientes para diagnostico sin filtrar
    // email/license key/instanceId al Unified Log.
    static func summarizeStatus(_ status: LicenseStatus) -> String {
        switch status {
        case .pro(_, let level): return "pro(\(level))"
        case .expired: return "expired"
        case .notFound: return "notFound"
        }
    }

    // MARK: - Evaluation

    private static func evaluate(_ license: LicenseData) -> LicenseStatus {
        // Status must be active
        guard license.status == "active" else {
            return .expired
        }

        // Check explicit expiration date
        if let expiresAt = license.expiresAt {
            if let expDate = parseDate(expiresAt), expDate < Date() {
                return .expired
            }
        }

        let level = degradationLevel(for: license)
        if level == .expired {
            return .expired
        }
        return .pro(license, level)
    }

    /// Computes the four-level degradation; mirrors `getDegradationLevel` in
    /// the TS bundle. Exposed for future UI affordances.
    static func degradationLevel(for license: LicenseData) -> DegradationLevel {
        guard let lastValidated = parseDate(license.lastValidatedAt) else {
            // Corrupted/unparseable date — fail closed, same as TS.
            return .expired
        }
        let elapsed = Date().timeIntervalSince(lastValidated)
        if elapsed < 0 { return .none } // clock skew: future timestamp → fresh
        let days = elapsed / (24 * 60 * 60)
        if days <= warningThresholdDays { return .none }
        if days <= limitedThresholdDays { return .warning }
        if days <= expiredThresholdDays { return .limited }
        return .expired
    }

    // MARK: - AES-256-GCM decryption

    private static func decrypt(encrypted: String, iv ivBase64: String, tag tagBase64: String) -> LicenseData? {
        guard let ciphertext = Data(base64Encoded: encrypted),
              let nonce = Data(base64Encoded: ivBase64),
              let tag = Data(base64Encoded: tagBase64)
        else {
            return nil
        }

        let sealedBox: AES.GCM.SealedBox
        do {
            sealedBox = try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: nonce),
                ciphertext: ciphertext,
                tag: tag
            )
        } catch {
            logger.error("Sealed box error: \(error.localizedDescription, privacy: .public)")
            return nil
        }

        // Try the HKDF key first, fall back to the legacy scrypt key for
        // license.json files written by 0.6.2 and earlier.
        for key in [derivedEncryptionKey, legacyEncryptionKey] {
            if let plaintext = try? AES.GCM.open(sealedBox, using: key),
               let decoded = try? JSONDecoder().decode(LicenseData.self, from: plaintext) {
                return decoded
            }
        }
        logger.error("License decryption failed with both current and legacy keys")
        return nil
    }

    private static func parseDate(_ value: String) -> Date? {
        parsePublicDate(value)
    }

    static func parsePublicDate(_ value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        let plainFormatter = ISO8601DateFormatter()
        plainFormatter.formatOptions = [.withInternetDateTime]
        return plainFormatter.date(from: value)
    }
}

// MARK: - Data hex helper

extension Data {
    init?(hexString: String) {
        let len = hexString.count / 2
        var data = Data(capacity: len)
        var index = hexString.startIndex
        for _ in 0 ..< len {
            let nextIndex = hexString.index(index, offsetBy: 2)
            guard let byte = UInt8(hexString[index ..< nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }
}
