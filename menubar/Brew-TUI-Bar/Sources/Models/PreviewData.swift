import Foundation

// MARK: - Mock data for SwiftUI Previews

enum PreviewData {
    static let outdatedPackages: [OutdatedPackage] = [
        OutdatedPackage(
            name: "git",
            installedVersions: ["2.43.0"],
            currentVersion: "2.45.1",
            pinned: false,
            pinnedVersion: nil
        ),
        OutdatedPackage(
            name: "node",
            installedVersions: ["20.11.0"],
            currentVersion: "22.2.0",
            pinned: false,
            pinnedVersion: nil
        ),
        OutdatedPackage(
            name: "python@3.12",
            installedVersions: ["3.12.2"],
            currentVersion: "3.12.4",
            pinned: true,
            pinnedVersion: "3.12.2"
        ),
        OutdatedPackage(
            name: "wget",
            installedVersions: ["1.21.4"],
            currentVersion: "1.24.5",
            pinned: false,
            pinnedVersion: nil
        ),
        OutdatedPackage(
            name: "ffmpeg",
            installedVersions: ["6.1.1"],
            currentVersion: "7.0",
            pinned: false,
            pinnedVersion: nil
        ),
    ]

    static let errorServices: [BrewService] = [
        BrewService(name: "postgresql@16", status: "error", user: "molinesmac", file: nil, exitCode: 1),
        BrewService(name: "redis", status: "error", user: "molinesmac", file: nil, exitCode: 78),
    ]

    static let runningServices: [BrewService] = [
        BrewService(name: "nginx", status: "started", user: "molinesmac", file: nil, exitCode: nil),
        BrewService(name: "dnsmasq", status: "started", user: "root", file: nil, exitCode: nil),
    ]

    @MainActor
    static func makeScheduler() -> SchedulerService {
        SchedulerService(isPreview: true)
    }

    @MainActor
    static func makeAppState(
        packages: [OutdatedPackage] = outdatedPackages,
        services: [BrewService] = [],
        isLoading: Bool = false,
        error: String? = nil,
        servicesError: String? = nil
    ) -> AppState {
        let state = AppState()
        state.outdatedPackages = packages
        state.services = services
        state.lastChecked = Date()
        state.isLoading = isLoading
        state.error = error
        state.servicesError = servicesError
        return state
    }
}
