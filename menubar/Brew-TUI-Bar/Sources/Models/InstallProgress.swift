import Foundation

/// Per-package phase reported by `brew upgrade` stdout. Maps to the `==>` markers
/// `brew` emits, plus a synthetic `.pending` / `.done` for UI use.
enum InstallStage: Sendable, Equatable {
    case pending
    case fetching
    case installing
    case pouring
    case linking
    case done
    case failed(String)

    /// Locale-aware verb shown next to the package name in the modal.
    var label: String {
        switch self {
        case .pending:    String(localized: "Pending")
        case .fetching:   String(localized: "Downloading…")
        case .installing: String(localized: "Installing…")
        case .pouring:    String(localized: "Unpacking…")
        case .linking:    String(localized: "Linking…")
        case .done:       String(localized: "Done")
        case .failed:     String(localized: "Failed")
        }
    }

    /// `0.0`–`1.0` weight inside a single package. Lets the global bar grow
    /// even when we don't know exact byte counts (brew never reports those).
    var unitWeight: Double {
        switch self {
        case .pending:    0.0
        case .fetching:   0.4
        case .installing: 0.7
        case .pouring:    0.8
        case .linking:    0.95
        case .done:       1.0
        case .failed:     1.0
        }
    }

    var isTerminal: Bool {
        switch self {
        case .done, .failed: true
        default:             false
        }
    }
}

/// Snapshot of an in-flight `brew upgrade` (single package or upgrade-all).
/// `AppState.installProgress` holds the live instance; `InstallProgressView`
/// renders it.
struct InstallProgress: Identifiable, Sendable, Equatable {
    enum Mode: Sendable, Equatable {
        case singlePackage(String)
        case all
    }

    let id: UUID
    var mode: Mode
    /// Ordered list of packages we know about. For `.all` the list starts empty
    /// and grows as `==> Upgrading X` lines arrive; `.singlePackage` seeds it
    /// with the one target up front so the UI can render immediately.
    var packages: [Item]
    /// Final brew error (process non-zero or timeout). Closing the modal clears it.
    var finalError: String?
    var isFinished: Bool

    init(mode: Mode, seeds: [String] = []) {
        self.id = UUID()
        self.mode = mode
        self.packages = seeds.map { Item(name: $0, stage: .pending) }
        self.finalError = nil
        self.isFinished = false
    }

    struct Item: Identifiable, Sendable, Equatable {
        var id: String { name }
        var name: String
        var stage: InstallStage
    }

    /// 0.0–1.0 overall fraction across the known set. Counts `.failed` as
    /// terminal so a partially-failed run still reaches 100%.
    var overallFraction: Double {
        guard !packages.isEmpty else { return isFinished ? 1.0 : 0.0 }
        let total = packages.reduce(0.0) { $0 + $1.stage.unitWeight }
        return total / Double(packages.count)
    }

    var completedCount: Int {
        packages.filter { $0.stage.isTerminal }.count
    }

    var currentPackage: Item? {
        packages.first { !$0.stage.isTerminal && $0.stage != .pending }
            ?? packages.first { $0.stage == .pending }
    }

    /// Header copy ("Updating N packages…", "Installing git…", etc).
    var title: String {
        switch mode {
        case .singlePackage(let name):
            return String(format: String(localized: "Upgrading %@"), name)
        case .all:
            let count = max(packages.count, 1)
            let template = String(localized: "Upgrading %lld packages")
            return String(format: template, Int64(count))
        }
    }

    // MARK: Mutation helpers

    mutating func mark(_ name: String, stage: InstallStage) {
        if let idx = packages.firstIndex(where: { $0.name == name }) {
            packages[idx].stage = stage
        } else {
            packages.append(Item(name: name, stage: stage))
        }
    }

    /// Final terminal flip: mark anything still pending/in-progress as done,
    /// stamp `isFinished`. Called once the brew process exits successfully.
    mutating func finishSuccess() {
        for idx in packages.indices where !packages[idx].stage.isTerminal {
            packages[idx].stage = .done
        }
        isFinished = true
    }

    /// Failure terminal flip: any non-terminal item gets `.failed(reason)`.
    mutating func finishFailure(_ reason: String) {
        for idx in packages.indices where !packages[idx].stage.isTerminal {
            packages[idx].stage = .failed(reason)
        }
        finalError = reason
        isFinished = true
    }
}
