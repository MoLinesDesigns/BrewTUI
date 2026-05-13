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
    private var badgeTimer: Timer?
    private var launchTask: Task<Void, Never>?
    private var hostingController: NSHostingController<PopoverView>?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard !Self.isRunningForPreviews else { return }

        // Install crash reporter as early as possible so NSException handlers
        // catch failures during the rest of launch. No-op if not configured.
        CrashReporter.install()

        launchTask = Task {
            guard await checkBrewTuiInstalled() else {
                showBrewTuiRequired()
                return
            }

            // Cross-platform version contract: warn (non-blocking) when the
            // installed BrewBar drifts from the brew-tui CLI. License decryption
            // may still work today, but skew has bitten us before (HKDF schema
            // bump). Continue to license check either way.
            let versionStatus = await VersionChecker.check()
            if case let .mismatch(brewTui, brewBar) = versionStatus {
                showVersionMismatch(brewTui: brewTui, brewBar: brewBar)
            }

            // Check Pro license
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
                showProRequired()
                return
            }

            setupStatusItem()
            setupPopover()
            appState.onRefreshComplete = { [weak self] in
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
    }

    // MARK: - Login item

    /// Registers BrewBar as a login item the first time it runs as Pro.
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
        alert.informativeText = String(localized: "BrewBar requires Brew-TUI to be installed.\n\nInstall it with:\n  npm install -g brew-tui\n\nThen relaunch BrewBar.")
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

    private func showProRequired() {
        let alert = NSAlert()
        alert.messageText = String(localized: "BrewBar requires Pro")
        alert.informativeText = String(localized: "BrewBar is a Pro feature. Activate your license with:\n\n  brew-tui activate <your-key>\n\nThen relaunch BrewBar.")
        alert.alertStyle = .informational
        alert.addButton(withTitle: String(localized: "Quit"))
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func showVersionMismatch(brewTui: String, brewBar: String) {
        let alert = NSAlert()
        alert.messageText = String(localized: "BrewBar version mismatch")
        let template = String(localized: "BrewBar %@ is out of sync with Brew-TUI %@. They must match for license decryption and updates.\n\nRun this in the terminal:\n\n  brew-tui install-brewbar --force")
        alert.informativeText = String(format: template, brewBar, brewTui)
        alert.alertStyle = .warning
        alert.addButton(withTitle: String(localized: "Copy Update Command"))
        alert.addButton(withTitle: String(localized: "Continue Anyway"))

        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString("brew-tui install-brewbar --force", forType: .string)
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
            button.image?.accessibilityDescription = String(localized: "BrewBar")
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
            rootView: PopoverView(appState: appState, scheduler: scheduler)
        )
        popover.contentViewController = hostingController
    }

    private func updateBadge() {
        guard let button = statusItem.button else { return }

        let outdated = appState.outdatedCount
        let cve = appState.criticalCveCount
        let sync = appState.syncActivity

        var parts: [String] = []
        if outdated > 0 { parts.append("\(outdated)↑") }
        if cve > 0      { parts.append("\(cve)⚠") }
        if sync         { parts.append("⟳") }
        // No leading space: AppKit already pads between image and title via imagePosition.
        // An empty string here is required so variable-length collapses fully when there's
        // no badge to show; a leading " " would keep one glyph of width reserved.
        let badge = parts.joined(separator: " ")

        if badge != button.title {
            button.title = badge
        }

        let icon = NSImage(named: "MenuBarIcon")
        icon?.isTemplate = true
        icon?.size = Self.menuBarIconSize
        let desc = parts.isEmpty
            ? String(localized: "BrewBar")
            : String(format: String(localized: "BrewBar — %@"), parts.joined(separator: ", "))
        icon?.accessibilityDescription = desc
        button.image = icon
    }

    @objc private func togglePopover() {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
    }
}
