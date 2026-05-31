import Foundation
import Observation
import os

private let appStateLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "AppState")

@MainActor
@Observable
final class AppState {
    var outdatedPackages: [OutdatedPackage] = []
    var services: [BrewService] = []
    var lastChecked: Date?
    var isLoading = false
    var error: String?
    var servicesError: String?
    var canUpgrade = true
    var onRefreshComplete: (() -> Void)?
    var cveAlerts: [CVEAlert] = []
    var cveCheckError: String?
    var syncActivity = false
    var syncMachineCount = 0
    // Friendly toast shown after Brew-TUI publishes a `last-action.json`.
    // Auto-clears after 30s via lastActionFadeTask.
    var lastActionMessage: String?
    private var lastActionFadeTask: Task<Void, Never>?
    /// Snapshot of the license decoded at launch. Used by PopoverView's footer
    /// (tier badge) and SettingsView's License section. nil until the launch
    /// task in AppDelegate populates it.
    var licenseSummary: LicenseSummary?
    /// Version of the brew-tui CLI on PATH. Populated alongside the license at
    /// launch; shown in SettingsView's About section.
    var brewTuiCliVersion: String?
    /// New Brew-TUI-Bar version detected by `brew outdated`. Surfaced as a
    /// discrete `↑` indicator in the popover footer when non-nil; clicking
    /// opens Terminal with `brew upgrade --cask brew-tui-bar`. Kept separate
    /// from `outdatedPackages` so the self-cask never inflates the user-facing
    /// outdated count.
    var selfUpdateVersion: String?
    /// Live state of an in-flight `brew upgrade`. PopoverView shows the
    /// InstallProgressView sheet whenever this is non-nil; the sheet stays
    /// open after `isFinished` so the user can confirm the outcome before
    /// dismissing it.
    var installProgress: InstallProgress?

    /// Handle to the in-flight install task so the user can cancel it. We
    /// store it weakly via reference — cancelling propagates to the AsyncStream
    /// consumer loop, which trips `onTermination` and `process.terminate()`s
    /// brew.
    private var installTask: Task<Void, Never>?

    private let checker: any BrewChecking

    init(checker: any BrewChecking = BrewChecker()) {
        self.checker = checker
    }

    var outdatedCount: Int { outdatedPackages.count }
    var errorServices: [BrewService] { services.filter(\.hasError) }
    var criticalCveCount: Int { cveAlerts.filter { $0.severity == .critical || $0.severity == .high }.count }

    var lastSchedulerError: (message: String, date: String)? {
        guard let dict = UserDefaults.standard.dictionary(forKey: "lastSchedulerError"),
              let message = dict["message"] as? String,
              let date = dict["date"] as? String
        else { return nil }
        return (message, date)
    }

    func refresh(force: Bool = false) async {
        guard force || !isLoading else { return }
        isLoading = true
        error = nil
        defer {
            isLoading = false
            onRefreshComplete?()
        }

        // Refresh the tap index before `brew outdated`. Running both in parallel
        // (PERF-011) caused false "up to date" results because outdated reads the
        // local formula index, which is stale until `brew update` finishes.
        await checker.updateIndex()

        async let outdatedResult = checker.checkOutdated()
        async let servicesResult = checker.checkServices()

        do {
            let result = try await outdatedResult
            outdatedPackages = result.formulae + result.casks
            selfUpdateVersion = result.selfUpdateVersion
            lastChecked = Date()
        } catch {
            appStateLogger.error("Outdated check failed: \(error.localizedDescription, privacy: .public) | \(String(describing: error), privacy: .public)")
            self.error = error.localizedDescription
        }

        do {
            services = try await servicesResult
            servicesError = nil
        } catch {
            appStateLogger.error("Services check failed: \(error.localizedDescription, privacy: .public)")
            servicesError = error.localizedDescription
        }
    }

    func updateCVEAlerts(_ alerts: [CVEAlert]) {
        cveAlerts = alerts.sorted { $0.severity.sortOrder < $1.severity.sortOrder }
    }

    func updateSyncStatus(hasActivity: Bool, machineCount: Int) {
        syncActivity = hasActivity
        syncMachineCount = machineCount
    }

    // Builds a localized banner from the cross-process action payload and
    // schedules an auto-fade. Refreshes `outdatedPackages` so the badge lines
    // up with what the message claims is left.
    func applyLastAction(_ action: LastAction) {
        let message = formatLastActionMessage(
            action: action.action,
            packages: action.packages,
            remaining: action.remainingOutdated
        )
        lastActionMessage = message
        lastActionFadeTask?.cancel()
        lastActionFadeTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 30 * 1_000_000_000)
            guard !Task.isCancelled, let self else { return }
            self.lastActionMessage = nil
        }
        Task { await refresh(force: true) }
    }

    func dismissLastActionMessage() {
        lastActionFadeTask?.cancel()
        lastActionFadeTask = nil
        lastActionMessage = nil
    }

    private func formatLastActionMessage(action: String, packages: [String], remaining: Int) -> String {
        let isUpgrade = action == "upgrade"
        let pkgLabel: String
        if packages.isEmpty {
            pkgLabel = String(localized: "some packages")
        } else if packages.count == 1, let only = packages.first {
            pkgLabel = only
        } else {
            let template = String(localized: "%lld packages")
            pkgLabel = String(format: template, Int64(packages.count))
        }

        let actionLine: String
        if isUpgrade {
            let template = String(localized: "Just upgraded %@ from Brew-TUI.")
            actionLine = String(format: template, pkgLabel)
        } else {
            // install / uninstall — keep the wording neutral so future actions
            // surface here without code changes per verb.
            let template = String(localized: "Brew-TUI just ran %@ on %@.")
            actionLine = String(format: template, action, pkgLabel)
        }

        let tailLine: String
        if remaining == 0 {
            tailLine = String(localized: "No packages left to update — you're all set.")
        } else if remaining == 1 {
            tailLine = String(localized: "1 package still pending an update.")
        } else {
            let template = String(localized: "%lld packages still pending an update.")
            tailLine = String(format: template, Int64(remaining))
        }

        return "\(actionLine) \(tailLine)"
    }

    func upgrade(package name: String) async {
        guard !isLoading else { return }
        guard canUpgrade else {
            error = String(localized: "Pro license expired")
            return
        }
        await spawnInstallTask {
            await self.runUpgradeStream(
                mode: .singlePackage(name),
                seeds: [name],
                arguments: [name]
            )
        }
    }

    func upgradeAll() async {
        guard !isLoading else { return }
        guard canUpgrade else {
            error = String(localized: "Pro license expired")
            return
        }
        // Seed the progress with what we currently know is outdated so the
        // modal can render its rows immediately. The stream then refines the
        // list as `==> Upgrading X` lines arrive (brew may skip pinned or
        // already-current packages between our last refresh and now).
        let seeds = outdatedPackages
            .filter { !$0.pinned }
            .map(\.name)
        await spawnInstallTask {
            await self.runUpgradeStream(
                mode: .all,
                seeds: seeds,
                arguments: []
            )
        }
    }

    /// Wraps an upgrade flow in a tracked Task so `cancelInstallProgress()` has
    /// something to cancel. The caller still awaits completion, preserving the
    /// existing `await state.upgrade(...)` contract used by tests.
    private func spawnInstallTask(_ body: @escaping @Sendable () async -> Void) async {
        let task = Task { @MainActor in
            await body()
        }
        installTask = task
        await task.value
        installTask = nil
    }

    /// Dismisses the install-progress sheet. Allowed only once the run has
    /// finished — the view binding gates the close button on `isFinished`.
    func dismissInstallProgress() {
        guard installProgress?.isFinished == true else { return }
        installProgress = nil
    }

    /// Aborts an in-flight install. Cancels the wrapping Task; cancellation
    /// propagates to the `for await` loop in `runUpgradeStream`, the stream's
    /// `onTermination` callback fires, and brew receives SIGTERM. The modal
    /// stays open with a `.failed` final state so the user can read the
    /// outcome before dismissing.
    func cancelInstallProgress() {
        guard installProgress?.isFinished == false else { return }
        installTask?.cancel()
        installProgress?.finishFailure(String(localized: "Cancelled"))
        // The wrapping task will still re-enter and emit isLoading = false.
    }

    // MARK: - Streaming upgrade core

    /// Shared driver for single-package and upgrade-all flows. Consumes
    /// `BrewUpgradeStream` events, mutates `installProgress`, then refreshes
    /// the outdated list when the stream finishes.
    private func runUpgradeStream(
        mode: InstallProgress.Mode,
        seeds: [String],
        arguments: [String]
    ) async {
        isLoading = true
        error = nil
        installProgress = InstallProgress(mode: mode, seeds: seeds)

        // Drive the stream on the main actor — AppState is @MainActor, every
        // mutation happens here, and the modal observes the same actor. The
        // checker injects a real `BrewUpgradeStream` in production, while the
        // test MockChecker inherits the protocol's fallback (which routes
        // through `upgradePackage`/`upgradeAll`).
        var succeeded = true
        let events = checker.streamUpgrade(packages: arguments)
        for await event in events {
            switch event {
            case .packageDiscovered(let name):
                installProgress?.mark(name, stage: .pending)
            case .packageStage(let name, let stage):
                installProgress?.mark(name, stage: stage)
            case .logLine:
                break
            case .success:
                installProgress?.finishSuccess()
            case .failure(let reason):
                succeeded = false
                installProgress?.finishFailure(reason)
                self.error = String(format: String(localized: "Upgrade failed: %@"), reason)
            }
        }

        if succeeded {
            // Refresh the outdated badge so it reflects the new state.
            // Skipping the refresh on failure preserves the error message
            // (refresh wipes `error` on entry) and avoids re-querying brew
            // when nothing changed.
            await refresh(force: true)
        } else {
            isLoading = false
        }
    }
}
