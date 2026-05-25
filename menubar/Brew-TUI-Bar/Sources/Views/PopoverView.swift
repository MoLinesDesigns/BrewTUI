import SwiftUI

struct PopoverView: View {
    let appState: AppState
    let scheduler: SchedulerService
    let badgePreferences: BadgePreferences

    @State private var showSettings = false
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    /// True when the user has never activated Pro — show the upgrade funnel
    /// instead of the regular Homebrew UI. Expired Pro licenses keep the full
    /// UI plus the smaller renewal banner (basicModeView).
    private var showsFreeFunnel: Bool {
        guard let summary = appState.licenseSummary else { return false }
        return summary.tier == .basic && !summary.wasEverActive
    }

    var body: some View {
        VStack(spacing: 0) {
            headerView
            Divider()

            if showsFreeFunnel {
                freeTierView
            } else {
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
            }

            Divider()
            footerView
            Divider()
            versionFooter
        }
        // UI-015: drop the fixed 420 minHeight so users with large Dynamic Type
        // sizes do not get content clipped at the bottom of the popover.
        .frame(minWidth: 340, maxWidth: 340)
        // Intencional: no cancelamos tasks en onDisappear. El popover puede
        // ocultarse (click fuera, foco a otra app) mientras un refresh/upgrade
        // sigue en marcha; las operaciones viven en AppState y deben completar.
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
            Text(verbatim: "Brew-TUI-Bar v\(bundleVersion)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            if let newVersion = appState.selfUpdateVersion {
                Button {
                    runSelfUpgrade()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                }
                .buttonStyle(.borderless)
                .help(String(format: String(localized: "Brew-TUI-Bar %@ is available — click to upgrade"), newVersion))
                .accessibilityLabel(String(format: String(localized: "Self-update available, version %@"), newVersion))
            }
            Text(verbatim: "·")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
            Text(tierLabel)
                .font(.caption2)
                .foregroundStyle(appState.canUpgrade
                    ? BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased)
                    : .secondary)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
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
                // El guard `!isLoading` en AppState.refresh ya evita dobles
                // refreshes simultáneos. No retenemos el handle: si el popover
                // se cierra, el refresh debe terminar en background.
                Task { await appState.refresh() }
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
                .foregroundStyle(BrewTUIBarTheme.warning(highContrast: colorSchemeContrast == .increased))
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                // Sin handle retenido: si el popover se cierra el retry sigue
                // en background. El guard `!isLoading` evita reentradas.
                Task { await appState.refresh() }
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
                .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                .accessibilityAddTraits(.isHeader)
            if let servicesError = appState.servicesError {
                Text(servicesError)
                    .font(.caption2)
                    .foregroundStyle(BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased))
            }
            ForEach(appState.errorServices) { svc in
                HStack {
                    Text(svc.name)
                        .font(.caption2)
                    Spacer()
                    if let code = svc.exitCode {
                        Text(String(format: String(localized: "exit %lld"), Int64(code)))
                            .font(.caption2)
                            .foregroundStyle(BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased))
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
    private static let renewURL = URL(string: "https://buy.polar.sh/polar_cl_yQsiUeDelyyEQznbWffD1j77JAyP24ra7iEVQ22PA4h")!
    private static let monthlyURL = URL(string: "https://buy.polar.sh/polar_cl_QW1ZJ9887bU74drGr7JfujQfm3RKYnn1fuvc53DqD6D")!
    /// Canonical pricing/landing page. Lives at molinesdesigns.com (formerly
    /// linked to the GitHub README #pro-features anchor).
    private static let pricingURL = URL(string: "https://molinesdesigns.com/brewtui/")!

    /// Plan CTA colour family. Yearly is the saturated lila; monthly is a
    /// lighter shade of the same hue so the secondary plan still reads as
    /// "in the family" instead of muted gray. Both share the same shape.
    private static let yearlyTint = Color(red: 0.45, green: 0.30, blue: 0.85)
    private static let monthlyTint = Color(red: 0.70, green: 0.60, blue: 0.95)
    private static let planCornerRadius: CGFloat = 30
    private static let planVerticalPadding: CGFloat = 12

    private static let activateCommand = "brew-tui activate <your-license-key>"

    private var freeTierView: some View {
        // No ScrollView: the popover is fixed at 340×420 and Free funnel must
        // fit without the user having to scroll. Dynamic Type at accessibility
        // sizes can still overflow — see the preview at the bottom for catch.
        VStack(alignment: .leading, spacing: 10) {
                // Header
                HStack(spacing: 8) {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                        .font(.title2)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "Unlock Brew-TUI-Bar"))
                            .font(.headline)
                            .fontWeight(legibilityWeight == .bold ? .bold : .semibold)
                        Text(String(localized: "Brew-TUI-Bar is part of Brew-TUI Pro"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                // Features list — tight spacing so all five rows + label
                // fit inside the fixed-height popover without scrolling.
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "Brew-TUI Pro unlocks:"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    proFeatureRow(systemImage: "menubar.rectangle", text: String(localized: "Brew-TUI-Bar (this menu bar app)"))
                    proFeatureRow(systemImage: "doc.on.doc", text: String(localized: "Package Profiles"))
                    proFeatureRow(systemImage: "trash.slash", text: String(localized: "Smart Cleanup"))
                    proFeatureRow(systemImage: "clock.arrow.circlepath", text: String(localized: "Action History"))
                    proFeatureRow(systemImage: "exclamationmark.shield", text: String(localized: "Security Audit (CVE)"))
                }

                // Plans — monthly on top, yearly below. Both same size + shape;
                // colour shift signals which is the headline plan without
                // shouting it (yearly tint is more saturated).
                VStack(spacing: 8) {
                    Button {
                        NSWorkspace.shared.open(Self.monthlyURL)
                    } label: {
                        Text(String(localized: "Subscribe Monthly — €5.45"))
                            .fontWeight(.semibold)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Self.planVerticalPadding)
                            .background(Self.monthlyTint)
                            .clipShape(RoundedRectangle(cornerRadius: Self.planCornerRadius))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "Subscribe Monthly, 5 euros 45 cents"))

                    Button {
                        NSWorkspace.shared.open(Self.renewURL)
                    } label: {
                        VStack(spacing: 2) {
                            Text(String(localized: "Subscribe Yearly — €48"))
                                .fontWeight(.semibold)
                            Text(String(localized: "save 27%"))
                                .font(.caption2)
                                .opacity(0.85)
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Self.planVerticalPadding)
                        .background(Self.yearlyTint)
                        .clipShape(RoundedRectangle(cornerRadius: Self.planCornerRadius))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "Subscribe Yearly, 48 euros, save 27 percent"))
                }

                // Already have a license — compact one-row layout. The
                // standalone "Already have a license?" header is gone; the
                // monospaced box + copy button + the See-all-plans link sit
                // together below the CTAs to free vertical space.
                HStack(spacing: 6) {
                    Text(verbatim: Self.activateCommand)
                        .font(.system(.caption2, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Color.secondary.opacity(colorSchemeContrast == .increased ? 0.2 : 0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .truncationMode(.tail)
                        .accessibilityLabel(String(localized: "Activate command"))
                    Spacer()
                    Button {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(Self.activateCommand, forType: .string)
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .frame(minWidth: 22, minHeight: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(String(localized: "Copy activate command"))
                }

                Button {
                    NSWorkspace.shared.open(Self.pricingURL)
                } label: {
                    HStack(spacing: 4) {
                        Text(String(localized: "See all plans"))
                            .font(.caption)
                        Image(systemName: "arrow.up.right")
                            .font(.caption)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(String(localized: "See all plans on the website"))
            }
            .padding(12)
    }

    private func proFeatureRow(systemImage: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption)
                .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(text)
                .font(.caption)
            Spacer()
        }
    }

    private var basicModeView: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill")
                .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                .accessibilityHidden(true)
            Text(String(localized: "Pro license expired"))
                .font(.caption)
                .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
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
                    domain: "Brew-TUI-Bar",
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

    /// Opens Terminal with `brew upgrade --cask brew-tui-bar`. Shares the
    /// same .command-script pattern as `openBrewTUI` so the user sees the
    /// brew output and we don't need to drive the upgrade in-process
    /// (which would require quitting the app mid-upgrade).
    private func runSelfUpgrade() {
        do {
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("brew-tui-bar-upgrade", isDirectory: true)
            try FileManager.default.createDirectory(at: tempURL, withIntermediateDirectories: true, attributes: nil)
            let scriptURL = tempURL.appendingPathComponent("brew-tui-bar-upgrade.command")
            let script = """
            #!/bin/zsh
            echo "Upgrading Brew-TUI-Bar via Homebrew..."
            brew upgrade --cask brew-tui-bar
            """
            try script.write(to: scriptURL, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o755],
                ofItemAtPath: scriptURL.path
            )
            guard NSWorkspace.shared.open(scriptURL) else {
                throw NSError(
                    domain: "Brew-TUI-Bar",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: String(localized: "Could not launch the upgrade in your terminal app.")]
                )
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = String(localized: "Could not upgrade Brew-TUI-Bar")
            alert.informativeText = error.localizedDescription
            alert.alertStyle = .warning
            alert.addButton(withTitle: String(localized: "Continue"))
            alert.runModal()
        }
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

#Preview("Free tier") {
    PopoverView(
        appState: PreviewData.makeAppStateFreeTier(),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
}

#Preview("Spanish / Free tier") {
    PopoverView(
        appState: PreviewData.makeAppStateFreeTier(),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
    .environment(\.locale, Locale(identifier: "es"))
}

#Preview("Free tier / Accessibility size") {
    // Visual regression catch for Dynamic Type at accessibility sizes —
    // makes sure the upgrade funnel still fits / scrolls without clipping
    // the CTAs or activate command box.
    PopoverView(
        appState: PreviewData.makeAppStateFreeTier(),
        scheduler: PreviewData.makeScheduler(),
        badgePreferences: BadgePreferences()
    )
    .environment(\.dynamicTypeSize, .accessibility3)
}

// Note: there's no public way to inject \.colorSchemeContrast in a preview
// (the key path is read-only — SwiftUI derives it from the system). To
// validate the high-contrast accent + activate-box background tweaks,
// enable "Increase contrast" in System Settings > Accessibility > Display
// and re-open the popover in the running app.
