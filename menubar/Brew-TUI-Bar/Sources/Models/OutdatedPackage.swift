import Foundation

/// Whether an outdated row originated in the `formulae` or `casks` array of
/// `brew outdated --json=v2`. We need this because `brew upgrade <name>`
/// without an explicit `--cask` / `--formula` flag is ambiguous for some
/// casks (auto-updates, version :latest, cask-metadata desync) — brew can
/// silently no-op and exit 0, leaving the modal with a "Done" banner over a
/// package that re-appears in the next refresh as still outdated.
enum PackageKind: String, Codable, Sendable {
    case formula
    case cask
}

struct OutdatedPackage: Identifiable, Codable, Sendable {
    var id: String { name }
    let name: String
    let installedVersions: [String]
    let currentVersion: String
    let pinned: Bool
    let pinnedVersion: String?
    /// Set in `BrewChecker.checkOutdated` after decoding by tagging the
    /// formulae array as `.formula` and the casks array as `.cask`. The JSON
    /// itself does not carry this field — it's implicit in which array the
    /// row came from — so the decoder defaults to `.formula` and BrewChecker
    /// overwrites the cask rows.
    var kind: PackageKind

    enum CodingKeys: String, CodingKey {
        case name
        case installedVersions = "installed_versions"
        case currentVersion = "current_version"
        case pinned
        case pinnedVersion = "pinned_version"
    }

    init(name: String, installedVersions: [String], currentVersion: String, pinned: Bool = false, pinnedVersion: String? = nil, kind: PackageKind = .formula) {
        self.name = name
        self.installedVersions = installedVersions
        self.currentVersion = currentVersion
        self.pinned = pinned
        self.pinnedVersion = pinnedVersion
        self.kind = kind
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
        kind = .formula
    }

    var installedVersion: String {
        installedVersions.first ?? "?"
    }
}

struct OutdatedResponse: Codable, Sendable {
    let formulae: [OutdatedPackage]
    let casks: [OutdatedPackage]
    /// New Brew-TUI-Bar version detected in the tap (when present), populated
    /// in-process by `BrewChecker.checkOutdated()` after filtering the
    /// self-cask out of the visible badge. Not part of the JSON schema —
    /// excluded from CodingKeys so the decoder never expects it.
    var selfUpdateVersion: String?

    enum CodingKeys: String, CodingKey {
        case formulae
        case casks
    }

    init(formulae: [OutdatedPackage], casks: [OutdatedPackage], selfUpdateVersion: String? = nil) {
        self.formulae = formulae
        self.casks = casks
        self.selfUpdateVersion = selfUpdateVersion
    }
}
