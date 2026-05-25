import Foundation

struct CVEAlert: Codable, Identifiable, Sendable {
    let id: String              // "CVE-2024-XXXXX" o id OSV
    let packageName: String
    let severity: Severity
    let summary: String
    let publishedAt: Date
    let fixedVersion: String?
    let url: String?

    enum Severity: String, Codable, Sendable {
        case critical, high, medium, low, unknown

        var emoji: String {
            switch self {
            case .critical: "🔴"
            case .high:     "🟠"
            case .medium:   "🟡"
            case .low:      "🟢"
            case .unknown:  "⚪"
            }
        }

        // Orden para sorting (critical primero)
        var sortOrder: Int {
            switch self {
            case .critical: 0
            case .high:     1
            case .medium:   2
            case .low:      3
            case .unknown:  4
            }
        }
    }
}

// Cache file structure
struct CVECache: Codable, Sendable {
    let checkedAt: Date
    let alerts: [CVEAlert]
}
