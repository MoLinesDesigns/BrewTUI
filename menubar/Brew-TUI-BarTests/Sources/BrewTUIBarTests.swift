import Testing
import Foundation
@testable import Brew_TUI_Bar

// MARK: - OutdatedPackage Tests

@Suite("OutdatedPackage Model")
struct OutdatedPackageTests {
    @Test("installedVersion returns first version")
    func installedVersionReturnsFirst() {
        let pkg = OutdatedPackage(
            name: "wget",
            installedVersions: ["1.21", "1.20"],
            currentVersion: "1.22",
            pinned: false,
            pinnedVersion: nil
        )
        #expect(pkg.installedVersion == "1.21")
    }

    @Test("installedVersion returns ? when empty")
    func installedVersionFallback() {
        let pkg = OutdatedPackage(
            name: "curl",
            installedVersions: [],
            currentVersion: "8.0",
            pinned: false,
            pinnedVersion: nil
        )
        #expect(pkg.installedVersion == "?")
    }

    @Test("id is derived from name")
    func idIsName() {
        let pkg = OutdatedPackage(
            name: "node",
            installedVersions: ["20.0"],
            currentVersion: "22.0",
            pinned: false,
            pinnedVersion: nil
        )
        #expect(pkg.id == "node")
    }

    @Test("JSON decoding with snake_case keys")
    func jsonDecoding() throws {
        let json = """
        {
            "name": "python@3.11",
            "installed_versions": ["3.11.8"],
            "current_version": "3.11.9",
            "pinned": true,
            "pinned_version": "3.11.8"
        }
        """.data(using: .utf8)!

        let pkg = try JSONDecoder().decode(OutdatedPackage.self, from: json)
        #expect(pkg.name == "python@3.11")
        #expect(pkg.pinned == true)
        #expect(pkg.pinnedVersion == "3.11.8")
        #expect(pkg.currentVersion == "3.11.9")
    }

    // QA-006: regression test for the 0.6.1 fix that made `pinned` optional
    // in the cask payload. brew omits the key for casks; without the fallback
    // decoding fails and the Brew-TUI-Bar outdated list goes blank.
    @Test("JSON decoding without pinned key (cask shape)")
    func jsonDecodingWithoutPinned() throws {
        let json = """
        {
            "name": "firefox",
            "installed_versions": ["120.0"],
            "current_version": "121.0"
        }
        """.data(using: .utf8)!

        let pkg = try JSONDecoder().decode(OutdatedPackage.self, from: json)
        #expect(pkg.name == "firefox")
        #expect(pkg.pinned == false)
        #expect(pkg.pinnedVersion == nil)
    }
}

// MARK: - OutdatedResponse Tests

@Suite("OutdatedResponse Model")
struct OutdatedResponseTests {
    @Test("decodes formulae and casks arrays")
    func decodesResponse() throws {
        let json = """
        {
            "formulae": [
                {
                    "name": "wget",
                    "installed_versions": ["1.21"],
                    "current_version": "1.22",
                    "pinned": false,
                    "pinned_version": null
                }
            ],
            "casks": []
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(OutdatedResponse.self, from: json)
        #expect(response.formulae.count == 1)
        #expect(response.casks.isEmpty)
        #expect(response.formulae[0].name == "wget")
    }
}

// MARK: - BrewService Tests

@Suite("BrewService Model")
struct BrewServiceTests {
    @Test("JSON decoding")
    func jsonDecoding() throws {
        let json = """
        {
            "name": "postgresql@14",
            "status": "started",
            "user": "testuser",
            "file": "/usr/local/opt/postgresql@14/homebrew.mxcl.postgresql@14.plist",
            "exit_code": 0
        }
        """.data(using: .utf8)!

        let service = try JSONDecoder().decode(BrewService.self, from: json)
        #expect(service.name == "postgresql@14")
        #expect(service.status == "started")
        #expect(service.user == "testuser")
    }

    @Test("hasError is true for error status")
    func hasError() {
        let service = BrewService(name: "redis", status: "error", user: nil, file: nil, exitCode: 1)
        #expect(service.hasError == true)
        #expect(service.isRunning == false)
    }

    @Test("isRunning is true for started status")
    func isRunning() {
        let service = BrewService(name: "redis", status: "started", user: "root", file: nil, exitCode: 0)
        #expect(service.isRunning == true)
        #expect(service.hasError == false)
    }
}

// MARK: - LicenseChecker Tests

@Suite("LicenseChecker")
struct LicenseCheckerTests {
    @Test("parseDate handles ISO8601 with fractional seconds")
    func parseDateFractional() {
        // LicenseChecker.parseDate is private, so we test via evaluate indirectly
        // by constructing LicenseData with known dates
        let license = LicenseData(
            key: "test-key",
            instanceId: "inst-1",
            status: "active",
            customerEmail: "test@example.com",
            customerName: "Test",
            plan: "pro",
            activatedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: nil,
            lastValidatedAt: ISO8601DateFormatter().string(from: Date())
        )
        // A recently validated active license should be .pro
        let result = LicenseChecker.checkLicenseWith(license)
        switch result {
        case .pro(let data, let level):
            #expect(data.key == "test-key")
            #expect(level == .none)
        default:
            Issue.record("Expected .pro but got \(result)")
        }
    }

    @Test("expired status returns .expired")
    func expiredStatus() {
        let license = LicenseData(
            key: "test-key",
            instanceId: "inst-1",
            status: "revoked",
            customerEmail: "test@example.com",
            customerName: "Test",
            plan: "pro",
            activatedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: nil,
            lastValidatedAt: ISO8601DateFormatter().string(from: Date())
        )
        let result = LicenseChecker.checkLicenseWith(license)
        switch result {
        case .expired:
            break // expected
        default:
            Issue.record("Expected .expired but got \(result)")
        }
    }

    @Test("past expiration date returns .expired")
    func pastExpiration() {
        let license = LicenseData(
            key: "test-key",
            instanceId: "inst-1",
            status: "active",
            customerEmail: "test@example.com",
            customerName: "Test",
            plan: "pro",
            activatedAt: "2025-01-01T00:00:00.000Z",
            expiresAt: "2025-06-01T00:00:00.000Z",
            lastValidatedAt: ISO8601DateFormatter().string(from: Date())
        )
        let result = LicenseChecker.checkLicenseWith(license)
        switch result {
        case .expired:
            break // expected
        default:
            Issue.record("Expected .expired but got \(result)")
        }
    }

    @Test("30+ days since validation returns .expired")
    func degradationExpired() {
        let thirtyOneDaysAgo = Date().addingTimeInterval(-31 * 24 * 60 * 60)
        let license = LicenseData(
            key: "test-key",
            instanceId: "inst-1",
            status: "active",
            customerEmail: "test@example.com",
            customerName: "Test",
            plan: "pro",
            activatedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: nil,
            lastValidatedAt: ISO8601DateFormatter().string(from: thirtyOneDaysAgo)
        )
        let result = LicenseChecker.checkLicenseWith(license)
        switch result {
        case .expired:
            break // expected
        default:
            Issue.record("Expected .expired but got \(result)")
        }
    }

    @Test("intermediate windows mirror TS thresholds (warning/limited)")
    func degradationLevels() {
        func licenseValidated(_ daysAgo: Double) -> LicenseData {
            let date = Date().addingTimeInterval(-daysAgo * 24 * 60 * 60)
            return LicenseData(
                key: "k", instanceId: "i", status: "active",
                customerEmail: "e", customerName: "n", plan: "pro",
                activatedAt: "2026-01-01T00:00:00.000Z", expiresAt: nil,
                lastValidatedAt: ISO8601DateFormatter().string(from: date)
            )
        }
        #expect(LicenseChecker.degradationLevel(for: licenseValidated(3)) == .none)
        #expect(LicenseChecker.degradationLevel(for: licenseValidated(10)) == .warning)
        #expect(LicenseChecker.degradationLevel(for: licenseValidated(20)) == .limited)
        #expect(LicenseChecker.degradationLevel(for: licenseValidated(31)) == .expired)
    }
}

// MARK: - AppState Tests

/// Tracks concurrent `updateIndex` calls to prove refresh serialisation.
actor SerializingStubBrewChecker: BrewChecking {
    private var inFlight = 0
    private(set) var updateIndexCalls = 0
    private(set) var maxConcurrentUpdateIndex = 0

    func updateIndex() async {
        updateIndexCalls += 1
        inFlight += 1
        maxConcurrentUpdateIndex = max(maxConcurrentUpdateIndex, inFlight)
        try? await Task.sleep(nanoseconds: 50_000_000)
        inFlight -= 1
    }

    func checkOutdated() async throws -> OutdatedResponse {
        OutdatedResponse(formulae: [], casks: [])
    }

    func checkServices() async throws -> [BrewService] { [] }

    func upgradePackage(_ name: String) async throws {}

    func upgradeAll() async throws {}

    func metrics() -> (calls: Int, maxConcurrent: Int) {
        (updateIndexCalls, maxConcurrentUpdateIndex)
    }
}

@Suite("AppState")
struct AppStateTests {
    @Test("outdatedCount reflects packages array")
    @MainActor func outdatedCount() {
        let state = AppState()
        #expect(state.outdatedCount == 0)

        state.outdatedPackages = [
            OutdatedPackage(name: "wget", installedVersions: ["1.21"], currentVersion: "1.22", pinned: false, pinnedVersion: nil),
            OutdatedPackage(name: "curl", installedVersions: ["8.0"], currentVersion: "8.1", pinned: false, pinnedVersion: nil),
        ]
        #expect(state.outdatedCount == 2)
    }

    @Test("errorServices filters by hasError")
    @MainActor func errorServices() {
        let state = AppState()
        state.services = [
            BrewService(name: "redis", status: "started", user: nil, file: nil, exitCode: 0),
            BrewService(name: "mysql", status: "error", user: nil, file: nil, exitCode: 1),
            BrewService(name: "nginx", status: "started", user: nil, file: nil, exitCode: 0),
        ]
        #expect(state.errorServices.count == 1)
        #expect(state.errorServices[0].name == "mysql")
    }

    @Test("upgrade blocked when canUpgrade is false")
    @MainActor func upgradeBlockedWithoutPro() async {
        let state = AppState()
        state.canUpgrade = false
        await state.upgrade(package: "wget")
        #expect(state.error != nil)
        #expect(state.error?.contains("expired") == true || state.error?.contains("Pro") == true)
    }

    @Test("upgradeAll blocked when canUpgrade is false")
    @MainActor func upgradeAllBlockedWithoutPro() async {
        let state = AppState()
        state.canUpgrade = false
        await state.upgradeAll()
        #expect(state.error != nil)
    }

    @Test("refresh guards against concurrent calls")
    @MainActor func refreshGuard() async {
        let state = AppState()
        state.isLoading = true
        // This should return immediately without changing state
        await state.refresh()
        // isLoading should still be true (the non-force path returned early)
        #expect(state.isLoading == true)
    }

    @Test("parallel force refresh serializes brew update (no overlap)")
    @MainActor func refreshSerializesForce() async {
        let stub = SerializingStubBrewChecker()
        let state = AppState(checker: stub)
        async let first: Void = state.refresh(force: true)
        async let second: Void = state.refresh(force: true)
        await first
        await second
        let metrics = await stub.metrics()
        let calls = metrics.calls
        let maxConcurrent = metrics.maxConcurrent
        #expect(calls >= 1)
        #expect(calls <= 2)
        #expect(maxConcurrent == 1)
    }

    @Test("lastSchedulerError reads from UserDefaults")
    @MainActor func schedulerErrorPersistence() {
        let state = AppState()
        UserDefaults.standard.set(
            ["message": "Test error", "date": "2026-04-24T10:00:00Z"],
            forKey: "lastSchedulerError"
        )
        let error = state.lastSchedulerError
        #expect(error?.message == "Test error")
        #expect(error?.date == "2026-04-24T10:00:00Z")
        // Cleanup
        UserDefaults.standard.removeObject(forKey: "lastSchedulerError")
    }
}

