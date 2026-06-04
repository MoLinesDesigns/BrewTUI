import AppKit
import ServiceManagement
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private static let isRunningForPreviews =
        ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1" ||
        ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PLAYGROUNDS"] == "1"
    private static let didAutoRegisterLoginItemKey = "didAutoRegisterLoginItem"

    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private let appState = AppState()
    private let scheduler = SchedulerService()
    // Side-effect: BadgePreferences reads UserDefaults in its init, so the
    // UserDefaults phase of the legacy migrator must run before that read.
    // The Login Item phase runs later from applicationDidFinishLaunching
    // (SMAppService needs an initialised NSApp).
    private let badgePreferences: BadgePreferences = {
        LegacyMigrator.migrateUserDefaultsIfNeeded()
        return BadgePreferences()
    }()
    private var badgeTimer: Timer?
    private var launchTask: Task<Void, Never>?
    private var hostingController: NSHostingController<PopoverView>?
    // Red de seguridad sobre `.transient`: en algunos escenarios (popover con
    // foco forzado vía `makeKey()`, tasks largos corriendo, sheet de Settings
    // dejando foco residual) el cierre automático en click fuera no dispara.
    // Este monitor lo garantiza sin tocar el subprocess de brew — `performClose`
    // solo oculta la UI; los Tasks viven en AppState y siguen ejecutándose.
    private var clickOutsideMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard !Self.isRunningForPreviews else { return }

        // Install crash reporter as early as possible so NSException handlers
        // catch failures during the rest of launch. No-op if not configured.
        CrashReporter.install()

        // Phase 2 of the legacy migrator — UserDefaults already migrated in
        // the stored-property init. SMAppService needs NSApp running, so the
        // Login Item re-register happens here.
        LegacyMigrator.completePendingLoginItemMigration()

        launchTask = Task {
            guard await checkBrewTuiInstalled() else {
                showBrewTuiRequired()
                return
            }

            // Cross-platform version contract: warn (non-blocking) when the
            // installed Brew-TUI-Bar drifts from the brew-tui CLI. License decryption
            // may still work today, but skew has bitten us before (HKDF schema
            // bump). Continue to license check either way.
            let versionStatus = await VersionChecker.check()
            if case let .mismatch(brewTui, brewBar) = versionStatus {
                showVersionMismatch(brewTui: brewTui, brewBar: brewBar)
            }

            // Check Pro license. 2.1.0: .notFound no longer terminates — the
            // popover shows an in-app upgrade prompt instead, so Free users
            // get the same menu bar presence and click flow as Pro users.
            let licenseStatus = LicenseChecker.checkLicense()
            switch licenseStatus {
            case .pro:
                appState.canUpgrade = true
                autoRegisterLoginItemIfNeeded()
                // future: surface DegradationLevel.warning/.limited in UI
            case .expired:
                appState.canUpgrade = false
                showLicenseExpired()
                // Continue in degraded mode — app stays open without Pro badge
            case .notFound:
                appState.canUpgrade = false
                // No alert, no terminate. PopoverView renders freeTierView
                // when licenseSummary.tier == .basic && !wasEverActive.
            }

            // Snapshot the license for the popover tier badge + Settings panel.
            // Built from the same value `checkLicense()` returned so we never
            // re-decode the file.
            appState.licenseSummary = LicenseSummary(from: licenseStatus)
            // Surface the brew-tui CLI version alongside Brew-TUI-Bar's in the
            // About section. Reused from VersionChecker so we do not spawn
            // a second `brew-tui --version` process at launch.
            if case let .match(version) = versionStatus {
                appState.brewTuiCliVersion = version
            } else if case let .mismatch(brewTui, _) = versionStatus {
                appState.brewTuiCliVersion = brewTui
            }

            setupStatusItem()
            setupPopover()
            appState.onRefreshComplete = { [weak self] in
                self?.updateBadge()
            }
            badgePreferences.onChange = { [weak self] in
                self?.updateBadge()
            }

            scheduler.start(state: appState)
            await appState.refresh()

            // Load cached CVE alerts on launch (no network, just cache)
            let cachedAlerts = await SecurityMonitor.shared.loadCachedAlerts()
            appState.updateCVEAlerts(cachedAlerts)

            // Check sync activity on launch
            let hasSyncActivity = await SyncMonitor.shared.checkForSyncActivity()
            let machineCount = await SyncMonitor.shared.getKnownMachineCount()
            appState.updateSyncStatus(hasActivity: hasSyncActivity, machineCount: machineCount)

            // Listen for actions performed in the Brew-TUI CLI so the popover
            // reflects them immediately and shows a friendly status banner.
            LastActionMonitor.shared.start { [weak self] action in
                guard let self else { return }
                self.appState.applyLastAction(action)
            }

            updateBadge()

            badgeTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.updateBadge() }
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        launchTask?.cancel()
        launchTask = nil
        appState.onRefreshComplete = nil
        badgeTimer?.invalidate()
        badgeTimer = nil
        scheduler.stop()
        LastActionMonitor.shared.stop()
        removeClickOutsideMonitor()
    }

    // MARK: - Login item

    /// Registers Brew-TUI-Bar as a login item the first time it runs as Pro.
    /// Honors the user's choice afterwards: if they later disable it in Settings,
    /// we won't re-register on subsequent launches.
    private func autoRegisterLoginItemIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: Self.didAutoRegisterLoginItemKey) else { return }

        do {
            if SMAppService.mainApp.status != .enabled {
                try SMAppService.mainApp.register()
            }
            defaults.set(true, forKey: Self.didAutoRegisterLoginItemKey)
        } catch {
            // Non-fatal: user can enable manually from Settings later.
            // Don't set the flag so we retry on next launch.
        }
    }

    // MARK: - brew-tui dependency check

    private func checkBrewTuiInstalled() async -> Bool {
        let paths = [
            "/usr/local/bin/brew-tui",
            "/opt/homebrew/bin/brew-tui",
            "\(NSHomeDirectory())/.npm/bin/brew-tui",
        ]

        // Check known paths
        for path in paths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return true
            }
        }

        // Fallback: check via shell PATH (non-blocking via terminationHandler)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["brew-tui"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            let found = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Bool, Error>) in
                process.terminationHandler = { proc in
                    cont.resume(returning: proc.terminationStatus == 0)
                }
                do {
                    try process.run()
                } catch {
                    cont.resume(throwing: error)
                }
            }
            return found
        } catch {
            return false
        }
    }

    private func showBrewTuiRequired() {
        let alert = NSAlert()
        alert.messageText = String(localized: "Brew-TUI is required")
        alert.informativeText = String(localized: "Brew-TUI-Bar requires Brew-TUI to be installed.\n\nInstall it with:\n  npm install -g brew-tui\n\nThen relaunch Brew-TUI-Bar.")
        alert.alertStyle = .critical
        alert.addButton(withTitle: String(localized: "Copy Install Command"))
        alert.addButton(withTitle: String(localized: "Quit"))

        let response = alert.runModal()

        if response == .alertFirstButtonReturn {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString("npm install -g brew-tui", forType: .string)
        }

        NSApp.terminate(nil)
    }

    private func showVersionMismatch(brewTui: String, brewBar: String) {
        let alert = NSAlert()
        alert.messageText = String(localized: "Brew-TUI-Bar version mismatch")
        let template = String(localized: "Brew-TUI-Bar %@ is out of sync with Brew-TUI %@. They must match for license decryption and updates.\n\nRun this in the terminal:\n\n  brew-tui install-brew-tui-bar --force")
        alert.informativeText = String(format: template, brewBar, brewTui)
        alert.alertStyle = .warning
        alert.addButton(withTitle: String(localized: "Copy Update Command"))
        alert.addButton(withTitle: String(localized: "Continue Anyway"))

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString("brew-tui install-brew-tui-bar --force", forType: .string)
        }
    }

    private func showLicenseExpired() {
        let alert = NSAlert()
        alert.messageText = String(localized: "Pro license expired")
        alert.informativeText = String(localized: "Your Pro license has expired or needs revalidation.\n\nRun `brew-tui revalidate` in the terminal, or renew your subscription.\n\nThe app will continue in basic mode.")
        alert.alertStyle = .warning
        alert.addButton(withTitle: String(localized: "Continue"))
        alert.runModal()
    }

    // MARK: - Status item

    // Apple HIG: menu bar icons render at 22x22 max; ours uses 18x18 for visual balance.
    // Without this explicit size the NSImage would expose its native pixel dimensions and
    // the variable-length status item would reserve extra horizontal space around the icon.
    private static let menuBarIconSize = NSSize(width: 18, height: 18)

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            let icon = NSImage(named: "MenuBarIcon")
            icon?.isTemplate = true
            icon?.size = Self.menuBarIconSize
            button.image = icon
            button.image?.accessibilityDescription = String(localized: "Brew-TUI-Bar")
            button.imagePosition = .imageLeft
            button.title = ""
            button.action = #selector(togglePopover)
            button.target = self
        }
    }

    private func setupPopover() {
        popover = NSPopover()
        popover.contentSize = NSSize(width: 340, height: 420)
        popover.behavior = .transient
        // Create the hosting controller once and reuse on each popover open
        hostingController = NSHostingController(
            rootView: PopoverView(
                appState: appState,
                scheduler: scheduler,
                badgePreferences: badgePreferences
            )
        )
        popover.contentViewController = hostingController
    }

    private func updateBadge() {
        guard let button = statusItem.button else { return }

        let outdated = appState.outdatedCount
        let cve = appState.criticalCveCount
        let sync = appState.syncActivity

        // Each part remembers if it represents outdated packages so we can
        // selectively tint only that segment in red. CVE warnings and sync
        // status keep the system color — they're informational, not alerting,
        // and overloading red across all three would dilute the cue.
        var parts: [(text: String, isOutdated: Bool)] = []
        if outdated > 0, badgePreferences.showOutdated { parts.append(("\(outdated)↑", true)) }
        if cve > 0, badgePreferences.showCVE          { parts.append(("\(cve)⚠", false)) }
        if sync, badgePreferences.showSync            { parts.append(("⟳", false)) }

        // Build the attributed title with per-segment colors. We always write
        // attributedTitle — even when empty — so a residual red from a previous
        // state can't linger after the outdated count drops to zero. CVE and
        // sync stay in the system color: red is reserved for "you have pending
        // updates" so it stays semantically distinct.
        let menuFont = NSFont.menuBarFont(ofSize: NSFont.systemFontSize(for: .small))
        let attributed = NSMutableAttributedString()
        for (idx, part) in parts.enumerated() {
            if idx > 0 {
                attributed.append(NSAttributedString(string: " ", attributes: [.font: menuFont]))
            }
            var attrs: [NSAttributedString.Key: Any] = [.font: menuFont]
            if part.isOutdated { attrs[.foregroundColor] = NSColor.systemRed }
            attributed.append(NSAttributedString(string: part.text, attributes: attrs))
        }
        if attributed != button.attributedTitle {
            button.attributedTitle = attributed
        }

        let icon = NSImage(named: "MenuBarIcon")
        icon?.isTemplate = true
        icon?.size = Self.menuBarIconSize
        let desc = parts.isEmpty
            ? String(localized: "Brew-TUI-Bar")
            : String(format: String(localized: "Brew-TUI-Bar — %@"), parts.map(\.text).joined(separator: ", "))
        icon?.accessibilityDescription = desc
        button.image = icon
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            closePopover()
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
            installClickOutsideMonitor()
        }
    }

    private func closePopover() {
        removeClickOutsideMonitor()
        if popover.isShown {
            popover.performClose(nil)
        }
    }

    private func installClickOutsideMonitor() {
        guard clickOutsideMonitor == nil else { return }
        // Global monitor sólo dispara en clicks fuera de la app, justo lo que
        // queremos. Clicks dentro del popover llegan como eventos locales y no
        // entran por aquí — el popover sigue navegable.
        clickOutsideMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown]
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.closePopover()
            }
        }
    }

    private func removeClickOutsideMonitor() {
        if let monitor = clickOutsideMonitor {
            NSEvent.removeMonitor(monitor)
            clickOutsideMonitor = nil
        }
    }
}
