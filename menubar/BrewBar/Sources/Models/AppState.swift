import Foundation
import Observation
import os

private let appStateLogger = Logger(subsystem: "com.molinesdesigns.brewbar", category: "AppState")

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

        // PERF-011: launch the index refresh in parallel with outdated and
        // services. The outdated list is the slow part of the user-visible
        // refresh — we tolerate showing the previous tap data for the first
        // tick rather than blocking the whole refresh on `brew update`.
        async let _indexUpdate: Void = checker.updateIndex()
        async let outdatedResult = checker.checkOutdated()
        async let servicesResult = checker.checkServices()

        do {
            let result = try await outdatedResult
            outdatedPackages = result.formulae + result.casks
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

        // Wait for the index refresh so its log messages and any later refresh()
        // call see a fresh tap state. We do not surface its result.
        await _indexUpdate
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
        isLoading = true
        error = nil
        do {
            try await checker.upgradePackage(name)
        } catch {
            self.error = String(format: String(localized: "Upgrade failed: %@"), error.localizedDescription)
            isLoading = false
            return
        }
        // Stay in loading state — refresh(force:) bypasses the guard
        await refresh(force: true)
    }

    func upgradeAll() async {
        guard !isLoading else { return }
        guard canUpgrade else {
            error = String(localized: "Pro license expired")
            return
        }
        isLoading = true
        error = nil
        do {
            try await checker.upgradeAll()
        } catch {
            self.error = String(format: String(localized: "Upgrade all failed: %@"), error.localizedDescription)
            isLoading = false
            return
        }
        // Stay in loading state — refresh(force:) bypasses the guard
        await refresh(force: true)
    }
}
