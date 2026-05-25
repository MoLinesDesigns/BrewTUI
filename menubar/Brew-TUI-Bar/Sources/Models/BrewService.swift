import Foundation

struct BrewService: Identifiable, Codable, Sendable {
    var id: String { name }
    let name: String
    let status: String
    let user: String?
    let file: String?
    let exitCode: Int?

    enum CodingKeys: String, CodingKey {
        case name, status, user, file
        case exitCode = "exit_code"
    }

    var hasError: Bool { status == "error" }
    var isRunning: Bool { status == "started" }
}
