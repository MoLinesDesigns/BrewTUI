import Foundation
import os

private let brewCheckerLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "BrewChecker")

struct BrewChecker: Sendable {
    private static let updateTimeout: TimeInterval = 120

    /// Refreshes the local formula/cask index. Errors are non-fatal — the
    /// outdated check proceeds with whatever index is already cached.
    func updateIndex() async {
        brewCheckerLogger.info("Running brew update")
        do {
            _ = try await BrewProcess.run(
                ["update", "--quiet"],
                suppressAutoUpdate: false,
                timeout: Self.updateTimeout
            )
            brewCheckerLogger.info("brew update completed")
        } catch {
            brewCheckerLogger.warning("brew update failed (non-fatal): \(error.localizedDescription, privacy: .public)")
        }
    }

    func checkOutdated() async throws -> OutdatedResponse {
        brewCheckerLogger.info("Checking for outdated packages")
        // Match `brew outdated` exactly: skip `--greedy`. Auto-updating casks
        // (Firefox, Docker, Warp, …) carry stale Homebrew metadata and would
        // otherwise show as outdated even when the app already updated itself.
        let data = try await BrewProcess.run(["outdated", "--json=v2"])
        let result = try JSONDecoder().decode(OutdatedResponse.self, from: data)
        brewCheckerLogger.info("Found \(result.formulae.count + result.casks.count) outdated packages")
        return result
    }

    func checkServices() async throws -> [BrewService] {
        brewCheckerLogger.info("Checking services")
        let data = try await BrewProcess.run(["services", "list", "--json"])
        let result = try JSONDecoder().decode([BrewService].self, from: data)
        brewCheckerLogger.info("Found \(result.count) services")
        return result
    }

    func upgradePackage(_ name: String) async throws {
        brewCheckerLogger.info("Upgrading package: \(name, privacy: .public)")
        _ = try await BrewProcess.run(["upgrade", name])
        brewCheckerLogger.info("Successfully upgraded \(name, privacy: .public)")
    }

    func upgradeAll() async throws {
        brewCheckerLogger.info("Upgrading all packages")
        _ = try await BrewProcess.run(["upgrade"])
        brewCheckerLogger.info("Successfully upgraded all packages")
    }
}

/// Backwards-compatible alias for code that referenced BrewError directly.
typealias BrewError = BrewProcessError
