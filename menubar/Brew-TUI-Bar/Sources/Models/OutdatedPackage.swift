import Foundation

struct OutdatedPackage: Identifiable, Codable, Sendable {
    var id: String { name }
    let name: String
    let installedVersions: [String]
    let currentVersion: String
    let pinned: Bool
    let pinnedVersion: String?

    enum CodingKeys: String, CodingKey {
        case name
        case installedVersions = "installed_versions"
        case currentVersion = "current_version"
        case pinned
        case pinnedVersion = "pinned_version"
    }

    init(name: String, installedVersions: [String], currentVersion: String, pinned: Bool = false, pinnedVersion: String? = nil) {
        self.name = name
        self.installedVersions = installedVersions
        self.currentVersion = currentVersion
        self.pinned = pinned
        self.pinnedVersion = pinnedVersion
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        installedVersions = try c.decode([String].self, forKey: .installedVersions)
        currentVersion = try c.decode(String.self, forKey: .currentVersion)
        // Casks from `brew outdated --json=v2 --greedy` omit `pinned` / `pinned_version`.
        // Treat absence as not pinned so the decoder doesn't fail and silently abort the whole refresh.
        pinned = try c.decodeIfPresent(Bool.self, forKey: .pinned) ?? false
        pinnedVersion = try c.decodeIfPresent(String.self, forKey: .pinnedVersion)
    }

    var installedVersion: String {
        installedVersions.first ?? "?"
    }
}

struct OutdatedResponse: Codable, Sendable {
    let formulae: [OutdatedPackage]
    let casks: [OutdatedPackage]
}
