import Foundation
import UserNotifications
import os

private let schedulerLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "SchedulerService")

@MainActor
@Observable
final class SchedulerService {
    enum Interval: Int, CaseIterable, Sendable {
        case thirtyMinutes = 1800
        case oneHour = 3600
        case twoHours = 7200
        case fourHours = 14400
        case eightHours = 28800

        var label: String {
            switch self {
            case .thirtyMinutes: String(localized: "Every 30 minutes")
            case .oneHour: String(localized: "Every hour")
            case .twoHours: String(localized: "Every 2 hours")
            case .fourHours: String(localized: "Every 4 hours")
            case .eightHours: String(localized: "Every 8 hours")
            }
        }
    }

    var interval: Interval {
        didSet {
            UserDefaults.standard.set(interval.rawValue, forKey: "checkInterval")
            restartTimer()
        }
    }

    var notificationsEnabled: Bool {
        didSet {
            UserDefaults.standard.set(notificationsEnabled, forKey: "notificationsEnabled")
            if notificationsEnabled { requestNotificationPermission() }
        }
    }

    /// True when the OS has denied notification permission — shown in Settings UI
    var notificationsDenied = false

    private var timer: Timer?
    private weak var state: AppState?
    private let isPreview: Bool
    private let security: any SecurityChecking
    // ARQ-009: notification dispatch lives in NotificationSender; the scheduler
    // only decides *when* to send. Injected so tests stub it without going
    // through UNUserNotificationCenter.
    private let notifier: any Notifying
    // ARQ-003: sync monitor injected through SyncMonitoring so the scheduler
    // can be exercised without a real iCloud directory.
    private let syncMonitor: any SyncMonitoring
    // ARQ-010: hold a strong handle to fire-and-forget tasks so stop() can
    // cancel them rather than leaving them to run after the scheduler is
    // dismissed.
    private var permissionSyncTask: Task<Void, Never>?
    /// Prevents overlapping scheduler ticks when `brew update` + CVE checks
    /// outlive the configured interval (e.g. 30 minutes).
    private var checkInFlight = false

    private static let hasLaunchedKey = "hasLaunchedBefore"

    init(
        isPreview: Bool? = nil,
        security: any SecurityChecking = SecurityMonitor.shared,
        notifier: any Notifying = NotificationSender(),
        syncMonitor: any SyncMonitoring = SyncMonitor.shared
    ) {
        let resolvedIsPreview = isPreview ?? (ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1")
        self.isPreview = resolvedIsPreview
        self.security = security
        self.notifier = notifier
        self.syncMonitor = syncMonitor

        if resolvedIsPreview {
            interval = .oneHour
            notificationsEnabled = false
            notificationsDenied = false
            return
        }

        let saved = UserDefaults.standard.integer(forKey: "checkInterval")
        interval = Interval(rawValue: saved) ?? .oneHour

        if !UserDefaults.standard.bool(forKey: Self.hasLaunchedKey) {
            UserDefaults.standard.set(true, forKey: Self.hasLaunchedKey)
            notificationsEnabled = true
            UserDefaults.standard.set(true, forKey: "notificationsEnabled")
            requestNotificationPermission()
        } else {
            notificationsEnabled = UserDefaults.standard.bool(forKey: "notificationsEnabled")
        }
    }

    func start(state: AppState) {
        guard !isPreview else { return }

        schedulerLogger.info("Starting scheduler with interval: \(self.interval.rawValue)s")
        self.state = state
        restartTimer()
        // Sync toggle with actual system permission on each launch
        permissionSyncTask?.cancel()
        permissionSyncTask = Task { [weak self] in
            await self?.syncNotificationPermission()
        }
    }

    func stop() {
        schedulerLogger.info("Stopping scheduler")
        timer?.invalidate()
        timer = nil
        permissionSyncTask?.cancel()
        permissionSyncTask = nil
    }

    /// Query the OS for the actual notification authorization status.
    /// If the user denied permission, turn off the toggle and flag it.
    func syncNotificationPermission() async {
        guard !isPreview else {
            notificationsDenied = false
            return
        }

        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .denied:
            notificationsDenied = true
            if notificationsEnabled {
                notificationsEnabled = false
                UserDefaults.standard.set(false, forKey: "notificationsEnabled")
            }
        case .authorized, .provisional, .ephemeral:
            notificationsDenied = false
        case .notDetermined:
            notificationsDenied = false
        @unknown default:
            notificationsDenied = false
        }
    }

    private func restartTimer() {
        timer?.invalidate()
        guard !isPreview else { return }

        schedulerLogger.info("Restarting timer with interval: \(self.interval.rawValue)s")
        timer = Timer.scheduledTimer(
            withTimeInterval: TimeInterval(interval.rawValue),
            repeats: true
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.check()
            }
        }
    }

    private func check() async {
        guard let state else { return }
        guard !checkInFlight else {
            schedulerLogger.info("Scheduled check skipped — previous tick still running")
            return
        }
        checkInFlight = true
        defer { checkInFlight = false }

        schedulerLogger.info("Scheduled check starting")
        let previousCount = state.outdatedCount
        await state.refresh()
        let newCount = state.outdatedCount

        if let error = state.error {
            schedulerLogger.error("Scheduler check failed: \(error, privacy: .public)")
            UserDefaults.standard.set(["message": error, "date": Date().ISO8601Format()], forKey: "lastSchedulerError")
        } else {
            schedulerLogger.info("Scheduled check completed: \(newCount) outdated packages")
        }

        if notificationsEnabled && newCount > previousCount {
            // Re-check permission before sending
            await syncNotificationPermission()
            if notificationsEnabled {
                notifier.sendOutdatedNotification(count: newCount)
            }
        }

        // CVE check (runs on same schedule as outdated check)
        let newCVEs = await security.checkForNewVulnerabilities()
        if !newCVEs.isEmpty {
            let allAlerts = await security.loadCachedAlerts()
            state.updateCVEAlerts(allAlerts)
            if notificationsEnabled {
                await syncNotificationPermission()
                if notificationsEnabled {
                    notifier.sendCVENotification(alerts: newCVEs)
                }
            }
        }

        // Sync activity monitor
        let hasSyncActivity = await syncMonitor.checkForSyncActivity()
        let machineCount = await syncMonitor.getKnownMachineCount()
        state.updateSyncStatus(hasActivity: hasSyncActivity, machineCount: machineCount)
        if hasSyncActivity && notificationsEnabled {
            await syncNotificationPermission()
            if notificationsEnabled {
                notifier.sendSyncNotification(machineCount: machineCount)
            }
        }
    }

    private func requestNotificationPermission() {
        guard !isPreview else { return }

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
            Task { @MainActor in
                if !granted {
                    self?.notificationsDenied = true
                    self?.notificationsEnabled = false
                    UserDefaults.standard.set(false, forKey: "notificationsEnabled")
                } else {
                    self?.notificationsDenied = false
                }
            }
        }
    }

}
