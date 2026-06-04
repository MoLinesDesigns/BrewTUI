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
    /// v2 (current): the LicenseData payload signed by the brewtui-api backend.
    /// v1 envelopes set this too but combine it with `encrypted/iv/tag`; we
    /// reject those in checkLicense() regardless of the field's presence.
    let license: LicenseData?
    /// v2: Ed25519 signature over canonical JSON of `license`, base64.
    let sig: String?
    /// v1 legacy fields — kept Decodable only so we can detect & reject these
    /// envelopes with a helpful log message. Never used for authorisation.
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

    // SEG-009 v2 (4.0.0): the symmetric HKDF/AES-GCM scheme was replaced by
    // an Ed25519 signature issued by the brewtui-api backend. The private key
    // lives only on the NAS (LICENSE_SIGNING_PRIVATE_KEY env var); the public
    // counterpart below is embedded so the app verifies offline without ever
    // round-tripping the network. Exposing the public key is by design — a
    // verifier needs it, but it cannot be used to forge signatures.
    //
    // Cross-platform contract: the same constant ships in the TUI's
    // src/lib/license/license-manager.ts (LICENSE_PUBLIC_KEY_B64). Rotating
    // the key means updating BOTH constants in the same release and bumping
    // the LICENSE_SIGNING_PRIVATE_KEY env var on the NAS. The cross-check
    // vector in src/lib/license/signature-cross-check.test.ts pins the
    // agreement between the three implementations.
    private static let licensePublicKeyB64 = "oHtzyU7ZACt8Eqga+U4PSagr0rSj1YLs3oVSpmjmwq0="

    private static let licensePublicKey: Curve25519.Signing.PublicKey? = {
        guard let raw = Data(base64Encoded: licensePublicKeyB64),
              raw.count == 32 else { return nil }
        return try? Curve25519.Signing.PublicKey(rawRepresentation: raw)
    }()

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

        // v2: signed envelope. The only authorised path since 4.0.0.
        if file.version == 2, let license = file.license, let sig = file.sig {
            guard verifySignedLicense(license, signatureBase64: sig) else {
                logger.warning("License signature verification failed — refusing to authorize")
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

        // v1 (any shape): AES-GCM envelope or unencrypted plaintext. Both are
        // rejected — the symmetric HKDF key was shipped in the public npm
        // bundle, so any v1 file is forgeable. The TUI's `brew-tui revalidate`
        // re-issues a v2 signed envelope; users with a genuinely v1 license
        // just need to run it once.
        if file.version == 1 {
            logger.warning("License file is in legacy v1 format — refusing to authorize. Run `brew-tui revalidate` to migrate.")
            return .notFound
        }

        logger.info("License file has no usable license data (version \(file.version, privacy: .public))")
        return .notFound
    }

    // MARK: - Ed25519 signature verification

    /// Verifies the envelope returned by the backend. Returns false on any
    /// failure — malformed base64, wrong-length signature, mismatched bytes —
    /// so the caller has a single boolean to gate Pro access.
    static func verifySignedLicense(_ license: LicenseData, signatureBase64: String) -> Bool {
        guard let pub = licensePublicKey else {
            logger.error("License public key is malformed at compile time — this is a code bug")
            return false
        }
        guard let sig = Data(base64Encoded: signatureBase64), sig.count == 64 else {
            return false
        }
        guard let message = canonicalJSONData(for: license) else {
            return false
        }
        return pub.isValidSignature(sig, for: message)
    }

    /// Builds the same byte sequence the backend and TUI sign / verify.
    /// Order: keys of LicenseData sorted alphabetically, JSON.stringify for
    /// each value, no whitespace. The TUI's canonicalJSON in
    /// src/lib/license/license-manager.ts implements the same algorithm.
    private static func canonicalJSONData(for license: LicenseData) -> Data? {
        // LicenseData has a fixed shape, so we don't need a generic JSON
        // canonicaliser — just emit the fields in sorted order.
        var parts: [(String, String)] = []
        parts.append(("activatedAt", jsonString(license.activatedAt)))
        parts.append(("customerEmail", jsonString(license.customerEmail)))
        parts.append(("customerName", jsonString(license.customerName)))
        if let exp = license.expiresAt {
            parts.append(("expiresAt", jsonString(exp)))
        } else {
            parts.append(("expiresAt", "null"))
        }
        parts.append(("instanceId", jsonString(license.instanceId)))
        parts.append(("key", jsonString(license.key)))
        parts.append(("lastValidatedAt", jsonString(license.lastValidatedAt)))
        parts.append(("plan", jsonString(license.plan)))
        parts.append(("status", jsonString(license.status)))

        // sorted() is a no-op here (the array is already built in sorted
        // order) but keeps the contract explicit — future fields added in
        // the wrong place still come out correct.
        let serialized = parts.sorted(by: { $0.0 < $1.0 })
            .map { "\(jsonString($0.0)):\($0.1)" }
            .joined(separator: ",")
        return "{\(serialized)}".data(using: .utf8)
    }

    /// JSON-encode a string with escapes matching JavaScript's JSON.stringify:
    /// double quotes, backslash escapes, control character \uXXXX, slashes
    /// not escaped. Matches the canonical encoding the signer uses.
    private static func jsonString(_ s: String) -> String {
        var out = "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"":   out += "\\\""
            case "\\":   out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n":   out += "\\n"
            case "\r":   out += "\\r"
            case "\t":   out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
        return out
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
        // SEC-L1: future lastValidatedAt is almost always a clock-skew
        // exploit (user advances system clock to keep Pro forever). Fail
        // closed; the next online revalidate resets things if benign.
        if elapsed < 0 { return .expired }
        let days = elapsed / (24 * 60 * 60)
        if days <= warningThresholdDays { return .none }
        if days <= limitedThresholdDays { return .warning }
        if days <= expiredThresholdDays { return .limited }
        return .expired
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

