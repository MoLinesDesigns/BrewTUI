import Foundation
@preconcurrency import UserNotifications
import os

private let notifLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "NotificationSender")

// ARQ-009: extracted from SchedulerService so notification dispatch can be
// stubbed in tests and re-used from any caller (security daemon, sync poller).
// All identifiers carry a per-call timestamp so macOS does not silently drop
// follow-up notifications with the same id (UX-001).
protocol Notifying: Sendable {
    func sendOutdatedNotification(count: Int)
    func sendSyncNotification(machineCount: Int)
    func sendCVENotification(alerts: [CVEAlert])
}

struct NotificationSender: Notifying {
    private let center: UNUserNotificationCenter

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func sendOutdatedNotification(count: Int) {
        notifLogger.info("Sending notification for \(count) outdated packages")
        let content = UNMutableNotificationContent()
        content.title = String(localized: "Homebrew Updates")
        content.body = String(format: String(localized: "%lld packages can be updated."), Int64(count))
        content.sound = .default
        post(content, idPrefix: "brew-tui-bar-outdated")
    }

    func sendSyncNotification(machineCount: Int) {
        notifLogger.info("Sending sync notification (\(machineCount) machines)")
        let content = UNMutableNotificationContent()
        content.title = String(localized: "Sync activity detected")
        content.body = String(
            format: String(localized: "%lld machine(s) updated their packages."),
            Int64(machineCount)
        )
        content.sound = .default
        post(content, idPrefix: "brew-tui-bar-sync")
    }

    func sendCVENotification(alerts: [CVEAlert]) {
        guard !alerts.isEmpty else { return }
        let sorted = alerts.sorted { $0.severity.sortOrder < $1.severity.sortOrder }
        let hasCriticalOrHigh = sorted.first.map { $0.severity == .critical || $0.severity == .high } ?? false
        let count = alerts.count
        notifLogger.info("Sending CVE notification for \(count) new vulnerabilities")

        let content = UNMutableNotificationContent()
        content.sound = .default
        if hasCriticalOrHigh, let worst = sorted.first {
            content.title = String(localized: "Security Alert — Brew-TUI")
            content.body = String(
                format: String(localized: "%lld vulnerable packages found, including %@"),
                Int64(count),
                worst.packageName
            )
            content.userInfo = ["cveId": worst.id]
        } else {
            content.title = String(localized: "Security Notice — Brew-TUI")
            content.body = String(format: String(localized: "%lld vulnerable packages found"), Int64(count))
            if let worst = sorted.first {
                content.userInfo = ["cveId": worst.id]
            }
        }
        post(content, idPrefix: "brew-tui-bar-cve")
    }

    private func post(_ content: UNMutableNotificationContent, idPrefix: String) {
        let request = UNNotificationRequest(
            identifier: "\(idPrefix)-\(Date().timeIntervalSince1970)",
            content: content,
            trigger: nil
        )
        center.add(request)
    }
}
