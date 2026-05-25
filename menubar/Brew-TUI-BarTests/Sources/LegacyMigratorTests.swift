import Foundation
import Testing
@testable import Brew_TUI_Bar

// MARK: - LegacyMigrator tests
//
// The migrator is one-shot per device and writes to UserDefaults. To keep the
// tests hermetic (and from polluting the maintainer's real defaults plist),
// every case uses a fresh suite-name pair for `standard` and `legacy`,
// purged on teardown.

@Suite("LegacyMigrator.migrateUserDefaultsIfNeeded")
@MainActor
struct LegacyMigratorMigrateUserDefaultsTests {
    private func makeSuites() -> (UserDefaults, UserDefaults, String, String) {
        let stdName = "com.molinesdesigns.brewtuibar.tests.\(UUID().uuidString)"
        let legacyName = "com.molinesdesigns.brewbar.tests.\(UUID().uuidString)"
        return (
            UserDefaults(suiteName: stdName)!,
            UserDefaults(suiteName: legacyName)!,
            stdName,
            legacyName
        )
    }

    private func clean(_ stdName: String, _ legacyName: String) {
        UserDefaults().removePersistentDomain(forName: stdName)
        UserDefaults().removePersistentDomain(forName: legacyName)
    }

    @Test("Already migrated: noop")
    func alreadyMigratedNoop() {
        let (std, legacy, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }
        std.set(true, forKey: LegacyMigrator.migratedFlagKey)
        legacy.set(42, forKey: "checkInterval")

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: legacy)

        // Standard untouched (no key copied)
        #expect(std.object(forKey: "checkInterval") == nil)
    }

    @Test("Legacy suite is nil: flag set, no work")
    func nilLegacySuite() {
        let (std, _, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: nil)

        #expect(std.bool(forKey: LegacyMigrator.migratedFlagKey) == true)
    }

    @Test("Legacy plist empty: flag set immediately, nothing copied")
    func legacyEmptyShortCircuits() {
        let (std, legacy, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: legacy)

        #expect(std.bool(forKey: LegacyMigrator.migratedFlagKey) == true)
        for key in LegacyMigrator.migratedKeys {
            #expect(std.object(forKey: key) == nil, "key \(key) should not be copied")
        }
    }

    @Test("Legacy plist with all keys: every value copied verbatim")
    func legacyFullCopy() {
        let (std, legacy, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }
        legacy.set(42, forKey: "checkInterval")
        legacy.set(true, forKey: "notificationsEnabled")
        legacy.set(true, forKey: "hasLaunchedBefore")
        legacy.set(false, forKey: "badgeShowOutdated")
        legacy.set("https://nas.local/crash", forKey: "crashReporterEndpoint")
        legacy.set("2026-05-01T00:00:00Z", forKey: "syncLastKnownUpdatedAt")

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: legacy)

        #expect(std.integer(forKey: "checkInterval") == 42)
        #expect(std.bool(forKey: "notificationsEnabled") == true)
        #expect(std.bool(forKey: "hasLaunchedBefore") == true)
        #expect(std.bool(forKey: "badgeShowOutdated") == false)
        #expect(std.string(forKey: "crashReporterEndpoint") == "https://nas.local/crash")
        #expect(std.string(forKey: "syncLastKnownUpdatedAt") == "2026-05-01T00:00:00Z")
        #expect(std.bool(forKey: LegacyMigrator.migratedFlagKey) == true)
    }

    @Test("Partial recovery: existing values in standard are not clobbered")
    func partialRecoveryPreservesExisting() {
        let (std, legacy, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }
        legacy.set(42, forKey: "checkInterval")
        // User already touched the new domain during a previous attempt:
        std.set(99, forKey: "checkInterval")

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: legacy)

        #expect(std.integer(forKey: "checkInterval") == 99, "must not overwrite a value the user already set")
        #expect(std.bool(forKey: LegacyMigrator.migratedFlagKey) == true)
    }

    @Test("didAutoRegisterLoginItem=true: pending flag set for phase 2")
    func loginItemFlagSet() {
        let (std, legacy, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }
        legacy.set(true, forKey: "didAutoRegisterLoginItem")

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: legacy)

        #expect(std.bool(forKey: LegacyMigrator.pendingLoginItemFlagKey) == true)
    }

    @Test("didAutoRegisterLoginItem=false: pending flag stays unset")
    func loginItemFlagNotSetWhenLegacyFalse() {
        let (std, legacy, stdName, legacyName) = makeSuites()
        defer { clean(stdName, legacyName) }
        legacy.set(false, forKey: "didAutoRegisterLoginItem")
        // Some other key to trip the "hasLegacyState" branch:
        legacy.set(42, forKey: "checkInterval")

        LegacyMigrator.migrateUserDefaultsIfNeeded(standard: std, legacy: legacy)

        #expect(std.object(forKey: LegacyMigrator.pendingLoginItemFlagKey) == nil)
    }
}

@Suite("LegacyMigrator.completePendingLoginItemMigration")
@MainActor
struct LegacyMigratorCompleteLoginItemTests {
    private func makeSuite() -> (UserDefaults, String) {
        let name = "com.molinesdesigns.brewtuibar.tests.\(UUID().uuidString)"
        return (UserDefaults(suiteName: name)!, name)
    }

    private func clean(_ name: String) {
        UserDefaults().removePersistentDomain(forName: name)
    }

    @Test("No pending flag: noop, register never called")
    func noFlagNoop() {
        let (std, name) = makeSuite()
        defer { clean(name) }
        var registerCalls = 0

        LegacyMigrator.completePendingLoginItemMigration(
            standard: std,
            isLoginItemEnabled: { false },
            registerLoginItem: { registerCalls += 1 }
        )

        #expect(registerCalls == 0)
    }

    @Test("Pending flag + already enabled: skip register, clear flag")
    func alreadyEnabledSkipsRegister() {
        let (std, name) = makeSuite()
        defer { clean(name) }
        std.set(true, forKey: LegacyMigrator.pendingLoginItemFlagKey)
        var registerCalls = 0

        LegacyMigrator.completePendingLoginItemMigration(
            standard: std,
            isLoginItemEnabled: { true },
            registerLoginItem: { registerCalls += 1 }
        )

        #expect(registerCalls == 0)
        #expect(std.object(forKey: LegacyMigrator.pendingLoginItemFlagKey) == nil, "flag must be cleared after observing already-enabled state")
    }

    @Test("Pending flag + disabled: register once, clear flag")
    func disabledRegistersOnce() {
        let (std, name) = makeSuite()
        defer { clean(name) }
        std.set(true, forKey: LegacyMigrator.pendingLoginItemFlagKey)
        var registerCalls = 0

        LegacyMigrator.completePendingLoginItemMigration(
            standard: std,
            isLoginItemEnabled: { false },
            registerLoginItem: { registerCalls += 1 }
        )

        #expect(registerCalls == 1)
        #expect(std.object(forKey: LegacyMigrator.pendingLoginItemFlagKey) == nil)
    }

    @Test("register throws: flag stays so next launch retries")
    func registerFailureKeepsFlag() {
        let (std, name) = makeSuite()
        defer { clean(name) }
        std.set(true, forKey: LegacyMigrator.pendingLoginItemFlagKey)
        struct TransientError: Error {}

        LegacyMigrator.completePendingLoginItemMigration(
            standard: std,
            isLoginItemEnabled: { false },
            registerLoginItem: { throw TransientError() }
        )

        #expect(std.bool(forKey: LegacyMigrator.pendingLoginItemFlagKey) == true, "flag must persist for retry on next launch")
    }
}
