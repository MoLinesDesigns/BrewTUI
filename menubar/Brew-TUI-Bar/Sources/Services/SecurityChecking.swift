import Foundation

/// Abstract surface of `SecurityMonitor` used by SchedulerService and AppDelegate.
/// Promoting these calls behind a protocol lets tests substitute a stub instead
/// of hitting OSV.dev or the on-disk cache.
protocol SecurityChecking: Sendable {
    func checkForNewVulnerabilities() async -> [CVEAlert]
    func loadCachedAlerts() async -> [CVEAlert]
}

extension SecurityMonitor: SecurityChecking {}
