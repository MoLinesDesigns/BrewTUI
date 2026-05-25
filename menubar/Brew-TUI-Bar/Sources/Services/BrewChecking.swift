import Foundation

/// Abstract surface of `BrewChecker` so AppState (and tests) can swap in a mock.
/// Keep this protocol minimal — only methods AppState/SchedulerService consume.
protocol BrewChecking: Sendable {
    func updateIndex() async
    func checkOutdated() async throws -> OutdatedResponse
    func checkServices() async throws -> [BrewService]
    func upgradePackage(_ name: String) async throws
    func upgradeAll() async throws
}

extension BrewChecker: BrewChecking {}
