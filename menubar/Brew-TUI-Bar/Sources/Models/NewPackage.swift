import Foundation

/// A formula or cask recently added to Homebrew's core taps. Surfaced in the
/// "What's new in Homebrew" modal so users can discover packages without
/// browsing formulae.brew.sh manually.
struct NewPackage: Identifiable, Sendable, Equatable, Codable {
    enum Kind: String, Sendable, Codable {
        case formula
        case cask
    }

    /// Stable identity so SwiftUI ForEach doesn't recycle rows across kinds.
    var id: String { "\(kind.rawValue):\(name)" }
    let name: String
    let kind: Kind
    /// Commit date of the PR that added the formula/cask. Used to sort the
    /// list and to render a relative timestamp in the row.
    let addedAt: Date
    /// One-line description from formulae.brew.sh metadata. Nil when the
    /// metadata fetch failed or the formula was removed before we cached it.
    let desc: String?
    let homepage: URL?

    /// `brew install <name>` for formulae, `brew install --cask <name>` for
    /// casks. Used by the modal's row action to populate the pasteboard.
    var installCommand: String {
        switch kind {
        case .formula: "brew install \(name)"
        case .cask:    "brew install --cask \(name)"
        }
    }
}
