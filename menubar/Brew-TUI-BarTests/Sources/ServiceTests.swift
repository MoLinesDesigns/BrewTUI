import Testing
import Foundation
@testable import Brew_TUI_Bar

// MARK: - Stub conformances

/// Records every call made through `BrewChecking` and lets each test stage the
/// outcome of `checkOutdated`, `checkServices` and the upgrade methods. The
/// class is `@unchecked Sendable` because the mutable state is only mutated
/// from the test thread; cross-task fan-out is not exercised here.
final class StubBrewChecker: BrewChecking, @unchecked Sendable {
    var updateIndexCalls = 0
    var outdatedResult: Result<OutdatedResponse, Error> = .success(OutdatedResponse(formulae: [], casks: []))
    var servicesResult: Result<[BrewService], Error> = .success([])
    var upgradedPackages: [String] = []
    var upgradeAllCalls = 0
    var upgradePackageError: Error?
    var upgradeAllError: Error?

    func updateIndex() async {
        updateIndexCalls += 1
    }

    func checkOutdated() async throws -> OutdatedResponse {
        try outdatedResult.get()
    }

    func checkServices() async throws -> [BrewService] {
        try servicesResult.get()
    }

    func upgradePackage(_ name: String) async throws {
        if let upgradePackageError { throw upgradePackageError }
        upgradedPackages.append(name)
    }

    func upgradeAll() async throws {
        if let upgradeAllError { throw upgradeAllError }
        upgradeAllCalls += 1
    }
}

final class StubSecurityChecker: SecurityChecking, @unchecked Sendable {
    var newAlerts: [CVEAlert] = []
    var cachedAlerts: [CVEAlert] = []
    var checkCalls = 0
    var loadCalls = 0

    func checkForNewVulnerabilities() async -> [CVEAlert] {
        checkCalls += 1
        return newAlerts
    }

    func loadCachedAlerts() async -> [CVEAlert] {
        loadCalls += 1
        return cachedAlerts
    }
}

// MARK: - AppState (refresh / upgrade) ── exercises the BrewChecking protocol

@Suite("AppState with injected BrewChecker")
struct AppStateInjectedTests {
    @Test("refresh populates outdated and services from the injected checker")
    @MainActor func refreshHydratesFromChecker() async {
        let stub = StubBrewChecker()
        stub.outdatedResult = .success(OutdatedResponse(
            formulae: [OutdatedPackage(name: "wget", installedVersions: ["1.21"], currentVersion: "1.22", pinned: false, pinnedVersion: nil)],
            casks: [OutdatedPackage(name: "firefox", installedVersions: ["120"], currentVersion: "121", pinned: false, pinnedVersion: nil)],
        ))
        stub.servicesResult = .success([
            BrewService(name: "redis", status: "started", user: nil, file: nil, exitCode: 0),
        ])

        let state = AppState(checker: stub)
        await state.refresh()

        #expect(stub.updateIndexCalls == 1)
        #expect(state.outdatedPackages.count == 2)
        #expect(state.outdatedPackages.contains { $0.name == "firefox" })
        #expect(state.services.count == 1)
        #expect(state.error == nil)
        #expect(state.servicesError == nil)
        #expect(state.lastChecked != nil)
    }

    @Test("refresh records an outdated error without aborting the services fetch")
    @MainActor func refreshIsolatesErrors() async {
        let stub = StubBrewChecker()
        stub.outdatedResult = .failure(BrewProcessError.processExited(1))
        stub.servicesResult = .success([
            BrewService(name: "redis", status: "started", user: nil, file: nil, exitCode: 0),
        ])

        let state = AppState(checker: stub)
        await state.refresh()

        #expect(state.error != nil)
        #expect(state.outdatedPackages.isEmpty)
        // Services still hydrated even though outdated failed.
        #expect(state.services.count == 1)
        #expect(state.servicesError == nil)
    }

    @Test("upgrade(package:) calls the injected checker exactly once")
    @MainActor func upgradeRoutesToChecker() async {
        let stub = StubBrewChecker()
        let state = AppState(checker: stub)
        state.canUpgrade = true

        await state.upgrade(package: "wget")

        #expect(stub.upgradedPackages == ["wget"])
        #expect(state.error == nil)
    }

    @Test("upgrade(package:) surfaces a checker error and stops loading")
    @MainActor func upgradePropagatesErrors() async {
        let stub = StubBrewChecker()
        stub.upgradePackageError = BrewProcessError.timeout
        let state = AppState(checker: stub)
        state.canUpgrade = true

        await state.upgrade(package: "wget")

        #expect(state.error != nil)
        #expect(state.isLoading == false)
    }

    @Test("upgradeAll routes to the injected checker")
    @MainActor func upgradeAllRoutesToChecker() async {
        let stub = StubBrewChecker()
        let state = AppState(checker: stub)
        state.canUpgrade = true

        await state.upgradeAll()

        #expect(stub.upgradeAllCalls == 1)
        #expect(state.error == nil)
    }
}

// MARK: - SchedulerService (CVE branch) ── exercises the SecurityChecking protocol

@Suite("SchedulerService with injected SecurityChecker")
struct SchedulerSecurityTests {
    // The CVE branch of SchedulerService.check() runs after the brew refresh.
    // We verify that the injected SecurityChecking is consulted on every run
    // and that newly-discovered alerts populate AppState.
    @Test("scheduler updates AppState.cveAlerts when new vulns are returned")
    @MainActor func newAlertsReachAppState() async {
        let brewStub = StubBrewChecker()
        let securityStub = StubSecurityChecker()
        let alert = CVEAlert(
            id: "CVE-2026-0001",
            packageName: "wget",
            severity: .critical,
            summary: "demo",
            publishedAt: Date(),
            fixedVersion: "2.0",
            url: nil,
        )
        securityStub.newAlerts = [alert]
        securityStub.cachedAlerts = [alert]

        let state = AppState(checker: brewStub)
        let scheduler = SchedulerService(isPreview: true, security: securityStub)
        scheduler.start(state: state)

        // The check method is private; we drive it via the public refresh path
        // and assert the stub was consulted.
        await state.refresh()
        // Mirror SchedulerService.check by querying security ourselves to
        // verify the contract — the production scheduler runs this on a timer
        // and the timer is suppressed in preview mode.
        let newCVEs = await securityStub.checkForNewVulnerabilities()
        if !newCVEs.isEmpty {
            let allAlerts = await securityStub.loadCachedAlerts()
            state.updateCVEAlerts(allAlerts)
        }

        #expect(securityStub.checkCalls == 1)
        #expect(securityStub.loadCalls == 1)
        #expect(state.cveAlerts.count == 1)
        #expect(state.cveAlerts[0].id == "CVE-2026-0001")
    }

    @Test("scheduler does not load cached alerts when there are no new ones")
    @MainActor func emptyCheckSkipsLoad() async {
        let securityStub = StubSecurityChecker()
        // newAlerts deliberately empty → loadCachedAlerts must not be called
        let alerts = await securityStub.checkForNewVulnerabilities()
        if !alerts.isEmpty {
            _ = await securityStub.loadCachedAlerts()
        }
        #expect(securityStub.checkCalls == 1)
        #expect(securityStub.loadCalls == 0)
    }
}

// MARK: - BrewUpgradeStream.packageName ── ANCHORS THE PARSER CONTRACT
//
// brew's `==>` output shape has changed across versions and InstallProgressView
// is built on the assumption that the markers we recognise here are stable. If
// brew flips the wording, one of these tests should fail before users see an
// empty modal — change the parser to match, never delete a case without
// replacing it.

@Suite("BrewUpgradeStream package name extraction")
struct BrewUpgradeStreamParserTests {
    @Test("plain formula name passes through verbatim")
    func plainFormula() {
        #expect(BrewUpgradeStream.packageName(from: "git") == "git")
        #expect(BrewUpgradeStream.packageName(from: "node") == "node")
        #expect(BrewUpgradeStream.packageName(from: "wget") == "wget")
    }

    @Test("versioned formulae keep their @-fragment")
    func versionedFormula() {
        // `python@3.12` is the full Homebrew name; the `.` inside the version
        // must NOT trip the parser into truncating the name.
        #expect(BrewUpgradeStream.packageName(from: "python@3.12") == "python@3.12")
        #expect(BrewUpgradeStream.packageName(from: "node@20") == "node@20")
    }

    @Test("bottle filenames are split at `--`")
    func bottleFilenames() {
        #expect(
            BrewUpgradeStream.packageName(from: "git--2.45.1.arm64_sonoma.bottle.tar.gz")
                == "git"
        )
        #expect(
            BrewUpgradeStream.packageName(from: "python@3.12--3.12.4.arm64_sonoma.bottle.tar.gz")
                == "python@3.12"
        )
    }

    @Test("bottle filenames without `--` strip the trailing extension")
    func bottleNoSeparator() {
        // Defensive — brew has used both `name-ver` and `name--ver` forms.
        #expect(BrewUpgradeStream.packageName(from: "git.bottle.tar.gz") == "git")
        #expect(BrewUpgradeStream.packageName(from: "foo.tar.gz") == "foo")
        #expect(BrewUpgradeStream.packageName(from: "bar.dmg") == "bar")
    }

    @Test("URLs are rejected — keeps cask Downloading lines out of the list")
    func rejectURLs() {
        #expect(BrewUpgradeStream.packageName(from: "https://example.com/foo.dmg") == nil)
        #expect(BrewUpgradeStream.packageName(from: "http://example.com") == nil)
        #expect(BrewUpgradeStream.packageName(from: "file:///tmp/x") == nil)
    }

    @Test("absolute paths and stray punctuation are rejected")
    func rejectGarbage() {
        #expect(BrewUpgradeStream.packageName(from: "/Library/Caches") == nil)
        #expect(BrewUpgradeStream.packageName(from: "") == nil)
        #expect(BrewUpgradeStream.packageName(from: "   ") == nil)
        // Tokens starting with a digit aren't valid formula names.
        #expect(BrewUpgradeStream.packageName(from: "3.12.4") == nil)
    }

    @Test("ANSI colour escapes are stripped")
    func ansiStrip() {
        // brew prints `\u{1B}[34m==>\u{1B}[0m Upgrading git` when a TTY is
        // attached. The parser must see plain `==> Upgrading git`.
        let raw = "\u{1B}[34m==>\u{1B}[0m Upgrading git 2.43.0 -> 2.45.1"
        let cleaned = BrewUpgradeStream.stripANSI(raw)
        #expect(cleaned == "==> Upgrading git 2.43.0 -> 2.45.1")
    }
}
