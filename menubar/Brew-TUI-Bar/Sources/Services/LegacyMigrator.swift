import Foundation
import ServiceManagement
import os

private let migratorLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "LegacyMigrator")

/// Two-phase migrator that lifts user state from the previous bundle ID
/// (`com.molinesdesigns.brewbar`, the app formerly known as BrewBar) into the
/// current Brew-TUI-Bar domain. Idempotent via flags stored in the new domain.
///
/// Why two phases:
/// - UserDefaults migration must happen *before* any service reads
///   `UserDefaults.standard` in its init (e.g. BadgePreferences), so it runs
///   from a stored-property closure in AppDelegate, before NSApp.run().
/// - `SMAppService.mainApp.register()` is documented to require a running
///   NSApp lifecycle; calling it from a stored-property initializer is
///   undocumented and may silently no-op. We park the intent in a flag and
///   replay it from `applicationDidFinishLaunching` instead.
///
/// Notification authorization is not migrated — macOS resets it on bundle ID
/// change and `requestAuthorization` re-prompts the user the first time the
/// scheduler tries to send one.
@MainActor
enum LegacyMigrator {
    // `nonisolated` so the default arguments below (which expand at the call
    // site, possibly outside a MainActor context) can reference them without
    // Swift 6 isolation warnings.
    nonisolated static let migratedFlagKey = "didMigrateFromLegacyBrewBar"
    nonisolated static let pendingLoginItemFlagKey = "pendingLoginItemMigrationFromLegacyBrewBar"
    nonisolated static let legacyBundleId = "com.molinesdesigns.brewbar"

    /// All UserDefaults keys BrewBar wrote under the legacy bundle ID. Kept as
    /// a flat list (not derived from constants in each service) so removing a
    /// service in the future does not silently drop its key from migration.
    nonisolated static let migratedKeys: [String] = [
        "checkInterval",
        "notificationsEnabled",
        "hasLaunchedBefore",
        "lastSchedulerError",
        "didAutoRegisterLoginItem",
        "badgeShowOutdated",
        "badgeShowCVE",
        "badgeShowSync",
        "crashReporterEndpoint",
        "crashReporterEnabled",
        "syncLastKnownUpdatedAt",
    ]

    /// Phase 1: UserDefaults. Safe to call from a stored-property initializer.
    ///
    /// `standard` and `legacy` are injectable so tests can drive the migrator
    /// against isolated suite-name domains without touching `.standard` or
    /// the real legacy plist on disk. Default arguments preserve the
    /// production contract — callers in the app pass nothing.
    static func migrateUserDefaultsIfNeeded(
        standard: UserDefaults = .standard,
        legacy: UserDefaults? = UserDefaults(suiteName: legacyBundleId)
    ) {
        guard !standard.bool(forKey: migratedFlagKey) else { return }

        guard let legacy else {
            standard.set(true, forKey: migratedFlagKey)
            return
        }

        // Fresh installs (no legacy plist) skip the work and flag immediately
        // so we don't pay the suite read on every launch forever.
        let hasLegacyState = migratedKeys.contains { legacy.object(forKey: $0) != nil }
        guard hasLegacyState else {
            standard.set(true, forKey: migratedFlagKey)
            return
        }

        migratorLogger.info("Migrating UserDefaults from legacy BrewBar bundle")

        var copied = 0
        for key in migratedKeys {
            guard let value = legacy.object(forKey: key) else { continue }
            // Preserve any value the user may have set in the new domain
            // during a partial recovery — don't clobber it.
            if standard.object(forKey: key) == nil {
                standard.set(value, forKey: key)
                copied += 1
            }
        }

        // Park the Login Item migration for phase 2. SMAppService needs an
        // initialised NSApplication, which we don't have at this point.
        if legacy.bool(forKey: "didAutoRegisterLoginItem") {
            standard.set(true, forKey: pendingLoginItemFlagKey)
        }

        standard.set(true, forKey: migratedFlagKey)
        migratorLogger.info("UserDefaults migration complete: copied \(copied, privacy: .public) keys from legacy domain")
    }

    /// Phase 2: Login Item re-registration. Must be called after NSApp has
    /// been initialised — i.e. from `applicationDidFinishLaunching`.
    ///
    /// `isLoginItemEnabled` + `registerLoginItem` are injectable so tests can
    /// observe the call without touching `SMAppService.mainApp` (which would
    /// affect the user's actual Login Items list).
    static func completePendingLoginItemMigration(
        standard: UserDefaults = .standard,
        isLoginItemEnabled: () -> Bool = { SMAppService.mainApp.status == .enabled },
        registerLoginItem: () throws -> Void = { try SMAppService.mainApp.register() }
    ) {
        guard standard.bool(forKey: pendingLoginItemFlagKey) else { return }

        do {
            if !isLoginItemEnabled() {
                try registerLoginItem()
                migratorLogger.info("Re-registered Login Item under new bundle ID")
            }
            // Always clear the flag once we've tried successfully or the
            // status was already enabled. Failures keep the flag so we retry
            // on next launch.
            standard.removeObject(forKey: pendingLoginItemFlagKey)
        } catch {
            migratorLogger.warning("Could not re-register login item: \(error.localizedDescription, privacy: .public). Will retry on next launch.")
            // Flag stays set so we retry next launch. If the failure is
            // permanent, the user can still toggle Launch at Login from
            // Settings.
        }
    }
}
