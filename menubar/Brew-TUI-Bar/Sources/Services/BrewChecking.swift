import Foundation

/// Abstract surface of `BrewChecker` so AppState (and tests) can swap in a mock.
/// Keep this protocol minimal — only methods AppState/SchedulerService consume.
protocol BrewChecking: Sendable {
    func updateIndex() async
    func checkOutdated() async throws -> OutdatedResponse
    func checkServices() async throws -> [BrewService]
    func upgradePackage(_ name: String) async throws
    func upgradeAll() async throws
    /// Streaming variant of `brew upgrade <packages>` (empty packages = all).
    /// Production `BrewChecker` returns `BrewUpgradeStream.run(...)`; tests can
    /// inherit the default implementation, which routes through the legacy
    /// `upgradePackage` / `upgradeAll` methods and emits synthetic events so
    /// `AppState`'s progress state machine still ticks through the modal.
    func streamUpgrade(packages: [String]) -> AsyncStream<BrewUpgradeEvent>
}

extension BrewChecking {
    /// Default fallback that bridges non-streaming mocks (tests) to the
    /// AppState stream consumer. Yields a single `packageDiscovered` +
    /// `packageStage(.installing)` per known package, awaits the legacy call,
    /// then finishes with `.success` or `.failure`.
    func streamUpgrade(packages: [String]) -> AsyncStream<BrewUpgradeEvent> {
        AsyncStream { continuation in
            let task = Task {
                for name in packages {
                    continuation.yield(.packageDiscovered(name))
                    continuation.yield(.packageStage(name: name, stage: .installing))
                }
                do {
                    if packages.isEmpty {
                        try await upgradeAll()
                    } else if packages.count == 1, let only = packages.first {
                        try await upgradePackage(only)
                    } else {
                        // Multi-package non-stream path: run sequentially so a
                        // mid-run failure still reports a useful error.
                        for name in packages { try await upgradePackage(name) }
                    }
                    continuation.yield(.success)
                } catch {
                    continuation.yield(.failure(error.localizedDescription))
                }
                continuation.finish()
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }
}

extension BrewChecker: BrewChecking {
    /// Production override: drive the real stream that parses brew's stdout.
    func streamUpgrade(packages: [String]) -> AsyncStream<BrewUpgradeEvent> {
        BrewUpgradeStream.run(packages: packages)
    }
}
