import Foundation
import Observation

/// User-controlled visibility for the three badges that can decorate the
/// status-bar item title (outdated count, CVE count, sync indicator).
/// Defaults to all-on, matching the pre-1.0 behaviour. Each setter mirrors
/// the change into UserDefaults so the choice survives relaunches.
@MainActor
@Observable
final class BadgePreferences {
    private static let showOutdatedKey = "badgeShowOutdated"
    private static let showCVEKey = "badgeShowCVE"
    private static let showSyncKey = "badgeShowSync"

    var showOutdated: Bool {
        didSet {
            UserDefaults.standard.set(showOutdated, forKey: Self.showOutdatedKey)
            onChange?()
        }
    }

    var showCVE: Bool {
        didSet {
            UserDefaults.standard.set(showCVE, forKey: Self.showCVEKey)
            onChange?()
        }
    }

    var showSync: Bool {
        didSet {
            UserDefaults.standard.set(showSync, forKey: Self.showSyncKey)
            onChange?()
        }
    }

    /// Callback fired after any toggle flips. AppDelegate uses it to repaint
    /// the menu-bar title without watching @Observable changes from non-View
    /// code.
    var onChange: (() -> Void)?

    init() {
        let defaults = UserDefaults.standard
        self.showOutdated = defaults.object(forKey: Self.showOutdatedKey) as? Bool ?? true
        self.showCVE = defaults.object(forKey: Self.showCVEKey) as? Bool ?? true
        self.showSync = defaults.object(forKey: Self.showSyncKey) as? Bool ?? true
    }
}
