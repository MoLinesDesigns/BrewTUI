import SwiftUI

struct PopoverView: View {
    let appState: AppState
    let scheduler: SchedulerService
    let badgePreferences: BadgePreferences

    @State private var showSettings = false
    @State private var refreshTask: Task<Void, Never>?
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    var body: some View {
        VStack(spacing: 0) {
            headerView
            Divider()

            if let message = appState.lastActionMessage {
                lastActionBanner(message)
                Divider()
            }

            if appState.isLoading && appState.outdatedPackages.isEmpty {
                loadingView
            } else if let error = appState.error {
                errorView(error)
            } else if appState.outdatedPackages.isEmpty {
                upToDateView
            } else {
                OutdatedListView(appState: appState)
            }

            if !appState.errorServices.isEmpty || appState.servicesError != nil {
                Divider()
                servicesErrorView
            }

            if !appState.canUpgrade {
                Divider()
                basicModeView
            }

            Divider()
            footerView
            Divider()
            versionFooter
        }
        // UI-015: drop the fixed 420 minHeight so users with large Dynamic Type
        // sizes do not get content clipped at the bottom of the popover.
        .frame(minWidth: 340, maxWidth: 340)
        .onDisappear { refreshTask?.cancel() }
        .sheet(isPresented: $showSettings) {
            SettingsView(
                scheduler: scheduler,
                appState: appState,
                badgePreferences: badgePreferences
            )
        }
    }

    // Cross-platform version contract: the bundle's CFBundleShortVersionString
    // is fed by `$(MARKETING_VERSION)`, which is read from package.json at
    // generate-time (see menubar/Project.swift). Falling back to "?" keeps the
    // footer rendering even if the Info.plist key is missing in tests/previews.
    private var bundleVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    }

    private var tierLabel: String {
        appState.licenseSummary?.tierLabel ?? String(localized: "Basic")
    }

    private var versionFooter: some View {
        HStack(spacing: 4) {
            Spacer()
            Text(verbatim: "BrewBar v\(bundleVersion)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            Text(verbatim: "·")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
            Text(tierLabel)
                .font(.caption2)
                .foregroundStyle(appState.canUpgrade
                    ? BrewBarTheme.accent(highContrast: colorSchemeContrast == .increased)
                    : .secondary)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(format: String(localized: "BrewBar version %@, tier %@"), bundleVersion, tierLabel))
    }

    private func lastActionBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "sparkles")
                .foregroundStyle(.tint)
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
            Spacer(minLength: 4)
            Button {
                appState.dismissLastActionMessage()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(String(localized: "Dismiss"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.accentColor.opacity(0.08))
    }

    private var headerView: some View {
        HStack {
            Image(systemName: "mug.fill")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Homebrew Updates")
                .font(.headline)
                .fontWeight(legibilityWeight == .bold ? .bold : .semibold)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            if appState.isLoading {
                ProgressView()
                    .scaleEffect(0.6)
                    .frame(width: 16, height: 16)
            }

            Button {
                // UI-008: cancel any in-flight refresh before launching a new
                // one so two concurrent tasks cannot land in arbitrary order.
                refreshTask?.cancel()
                refreshTask = Task { await appState.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .disabled(appState.isLoading)
            .accessibilityLabel(String(localized: "Refresh"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var loadingView: some View {
        VStack(spacing: 8) {
            Spacer()
            ProgressView("Checking for updates...")
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(BrewBarTheme.warning(highContrast: colorSchemeContrast == .increased))
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                // UI-008: cancel any in-flight refresh before launching a new
                // one so two concurrent tasks cannot land in arbitrary order.
                refreshTask?.cancel()
                refreshTask = Task { await appState.refresh() }
            }
            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var upToDateView: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.largeTitle)
                .foregroundStyle(colorSchemeContrast == .increased ? Color(red: 0, green: 0.6, blue: 0) : .green)
                .accessibilityHidden(true)
            Text("All packages up to date")
                .font(.headline)
                .foregroundStyle(.secondary)
            if let last = appState.lastChecked {
                Text(String(format: String(localized: "Last checked %@"), last.formatted(.relative(presentation: .named))))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var servicesErrorView: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Service Errors", systemImage: "exclamationmark.triangle")
                .font(.caption)
                .foregroundStyle(BrewBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                .accessibilityAddTraits(.isHeader)
            if let servicesError = appState.servicesError {
                Text(servicesError)
                    .font(.caption2)
                    .foregroundStyle(BrewBarTheme.critical(highContrast: colorSchemeContrast == .increased))
            }
            ForEach(appState.errorServices) { svc in
                HStack {
                    Text(svc.name)
                        .font(.caption2)
                    Spacer()
                    if let code = svc.exitCode {
                        Text(String(format: String(localized: "exit %lld"), Int64(code)))
                            .font(.caption2)
                            .foregroundStyle(BrewBarTheme.critical(highContrast: colorSchemeContrast == .increased))
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private var footerView: some View {
        HStack {
            Button {
                openBrewTUI()
            } label: {
                Label("Open Brew-TUI", systemImage: "terminal")
                    .font(.caption)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(String(localized: "Open Brew-TUI"))

            Spacer()

            if let last = appState.lastChecked, !appState.outdatedPackages.isEmpty {
                Text(last.formatted(.relative(presentation: .named)))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Button {
                showSettings = true
            } label: {
                Image(systemName: "gear")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(String(localized: "Settings"))

            Button {
                NSApp.terminate(nil)
            } label: {
                Image(systemName: "power")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(String(localized: "Quit"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // UX-008: same Polar checkout the TUI surfaces from `POLAR_CHECKOUT_URLS`.
    // Yearly Pro chosen as the default funnel — single SKU keeps copy short and
    // the dropdown of plans lives on the Polar page anyway.
    private static let renewURL = URL(string: "https://buy.polar.sh/polar_cl_yQsiUeDelyyEQznbWffD1j77JAyP24ra7iEVQ22PA4h")!

    private var basicModeView: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill")
                .foregroundStyle(BrewBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                .accessibilityHidden(true)
            Text(String(localized: "Pro license expired"))
                .font(.caption)
                .foregroundStyle(BrewBarTheme.accent(highContrast: colorSchemeContrast == .increased))
            Spacer()
            Button {
                NSWorkspace.shared.open(Self.renewURL)
            } label: {
                Text(String(localized: "Renew Pro"))
                    .font(.caption)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .accessibilityLabel(String(localized: "Renew Pro license"))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    private func openBrewTUI() {
        do {
            let scriptURL = try makeLaunchScript()
            guard NSWorkspace.shared.open(scriptURL) else {
                throw NSError(
                    domain: "BrewBar",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: String(localized: "Could not open Brew-TUI in your terminal app.")]
                )
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = String(localized: "Could not open Brew-TUI")
            alert.informativeText = error.localizedDescription
            alert.alertStyle = .warning
            alert.addButton(withTitle: String(localized: "Continue"))
            alert.runModal()
        }
    }

    private func makeLaunchScript() throws -> URL {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("brew-tui-launch", isDirectory: true)
        try FileManager.default.createDirectory(at: tempURL, withIntermediateDirectories: true, attributes: nil)

        let scriptURL = tempURL.appendingPathComponent("brew-tui.command")
        let script = """
        #!/bin/zsh
        exec brew-tui
        """

        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o755],
            ofItemAtPath: scriptURL.path
        )
        return scriptURL
    }
}

// MARK: - Previews

#Preview("Outdated Packages") {
    PopoverView(
        appState: PreviewData.makeAppState(),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
}

#Preview("Up to Date") {
    PopoverView(
        appState: PreviewData.makeAppState(packages: []),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
}

#Preview("Loading") {
    PopoverView(
        appState: PreviewData.makeAppState(packages: [], isLoading: true),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
}

#Preview("Error") {
    PopoverView(
        appState: PreviewData.makeAppState(
            packages: [],
            error: "Homebrew is not installed. Install it from https://brew.sh"
        ),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
}

#Preview("Service Errors") {
    PopoverView(
        appState: PreviewData.makeAppState(
            services: PreviewData.errorServices
        ),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
}

#Preview("Spanish / Outdated") {
    PopoverView(
        appState: PreviewData.makeAppState(),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
    .environment(\.locale, Locale(identifier: "es"))
}

#Preview("Spanish / Up to Date") {
    PopoverView(
        appState: PreviewData.makeAppState(packages: []),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
    .environment(\.locale, Locale(identifier: "es"))
}
