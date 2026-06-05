import SwiftUI

struct PopoverView: View {
    let appState: AppState
    let scheduler: SchedulerService
    let badgePreferences: BadgePreferences

    @State private var showSettings = false
    @State private var showNewPackages = false
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    /// True when the user has never activated Pro — show the upgrade funnel
    /// instead of the regular Homebrew UI. Expired Pro licenses keep the full
    /// UI plus the smaller renewal banner (basicModeView).
    private var showsFreeFunnel: Bool {
        guard let summary = appState.licenseSummary else { return false }
        return summary.tier == .basic && !summary.wasEverActive
    }

    /// Sheet binding driven by `appState.installProgress`. We never want to
    /// dismiss while a run is still in flight, so the setter ignores `false`
    /// until the progress reports `isFinished`.
    private var installProgressBinding: Binding<Bool> {
        Binding(
            get: { appState.installProgress != nil },
            set: { isPresented in
                guard !isPresented else { return }
                appState.dismissInstallProgress()
            }
        )
    }

    private var serviceDiagnosticsBinding: Binding<ServiceDiagnostics?> {
        Binding(
            get: { appState.serviceDiagnostics },
            set: { diagnostics in
                if diagnostics == nil {
                    appState.dismissServiceDiagnostics()
                } else {
                    appState.serviceDiagnostics = diagnostics
                }
            }
        )
    }

    var body: some View {
        ZStack {
            CrystalAmbientBackground()
            VStack(spacing: 0) {
                headerView
                GlassDivider().padding(.horizontal, CrystalGlass.Spacing.md)

                if showsFreeFunnel {
                    freeTierView
                } else {
                    if let message = appState.lastActionMessage {
                        lastActionBanner(message)
                            .padding(.horizontal, CrystalGlass.Spacing.md)
                            .padding(.vertical, 6)
                    }

                    newPackagesBanner
                        .padding(.horizontal, CrystalGlass.Spacing.md)
                        .padding(.top, 4)
                        .padding(.bottom, 2)

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
                        servicesErrorView
                            .padding(.horizontal, CrystalGlass.Spacing.md)
                            .padding(.vertical, 6)
                    }

                    if !appState.canUpgrade {
                        basicModeView
                            .padding(.horizontal, CrystalGlass.Spacing.md)
                            .padding(.vertical, 6)
                    }
                }

                GlassDivider().padding(.horizontal, CrystalGlass.Spacing.md)
                footerView
                versionFooter
            }
        }
        // UI-015: drop the fixed 420 minHeight so users with large Dynamic Type
        // sizes do not get content clipped at the bottom of the popover.
        .frame(minWidth: 340, maxWidth: 340)
        // Intencional: no cancelamos tasks en onDisappear. El popover puede
        // ocultarse (click fuera, foco a otra app) mientras un refresh/upgrade
        // sigue en marcha; las operaciones viven en AppState y deben completar.
        // onDismiss in every sheet re-keys the popover window. macOS bug:
        // closing a SwiftUI .sheet over an NSPopover leaves the popover
        // visible but its NSWindow stops being key, so every subsequent
        // click hits the popover surface but isn't routed to the
        // SwiftUI buttons inside — they look enabled but do nothing.
        // Forcing makeKey() on the next runloop tick (after dismissal
        // finishes animating) restores hit testing without flicker.
        .sheet(isPresented: $showSettings, onDismiss: restorePopoverKey) {
            SettingsView(
                scheduler: scheduler,
                appState: appState,
                badgePreferences: badgePreferences
            )
        }
        .sheet(isPresented: installProgressBinding, onDismiss: restorePopoverKey) {
            if let progress = appState.installProgress {
                InstallProgressView(
                    progress: progress,
                    onClose: { appState.dismissInstallProgress() },
                    onCancel: { appState.cancelInstallProgress() }
                )
            }
        }
        .sheet(isPresented: $showNewPackages, onDismiss: restorePopoverKey) {
            NewPackagesView(
                formulae: appState.newPackagesFormulae,
                casks: appState.newPackagesCasks,
                isLoading: appState.newPackagesLoading,
                error: appState.newPackagesError,
                fetchedAt: appState.newPackagesFetchedAt,
                onClose: { showNewPackages = false },
                onRefresh: { appState.loadNewPackagesIfNeeded(force: true) }
            )
        }
        .sheet(item: serviceDiagnosticsBinding, onDismiss: restorePopoverKey) { diagnostics in
            ServiceDiagnosticsView(
                diagnostics: appState.serviceDiagnostics ?? diagnostics,
                onClose: { appState.dismissServiceDiagnostics() }
            )
        }
    }

    /// Compact "What's new in Homebrew" entry point. Shown above the outdated
    /// list (not below — users scan top-down and the banner is a discovery
    /// surface, not a status row). Triggers a lazy fetch the first time it's
    /// opened; cached for 24h after that. Hidden when an install is in flight
    /// to avoid distracting the user mid-action.
    private var newPackagesBanner: some View {
        Button {
            appState.loadNewPackagesIfNeeded()
            showNewPackages = true
        } label: {
            HStack(spacing: CrystalGlass.Spacing.sm) {
                Image(systemName: "sparkles")
                    .foregroundStyle(CrystalGlass.glassCyan)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(String(localized: "What's new in Homebrew"))
                        .font(.caption)
                        .fontWeight(.medium)
                    Text(String(localized: "Recently added formulae and casks"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, CrystalGlass.Spacing.md)
            .padding(.vertical, CrystalGlass.Spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .glassPanel(cornerRadius: CrystalGlass.Radius.panel - 6, strokeOpacity: 0.4, ambientGlow: 0.05)
        .accessibilityLabel(String(localized: "Open what's new in Homebrew"))
        .accessibilityHint(String(localized: "Shows recently added formulae and casks"))
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
        HStack(alignment: .top, spacing: CrystalGlass.Spacing.sm) {
            Image(systemName: "sparkles")
                .foregroundStyle(CrystalGlass.glassCyan)
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
            Spacer(minLength: 4)
            Button {
                appState.dismissLastActionMessage()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .semibold))
            }
            .buttonStyle(.glassIcon)
            .accessibilityLabel(String(localized: "Dismiss"))
        }
        .padding(.horizontal, CrystalGlass.Spacing.md)
        .padding(.vertical, CrystalGlass.Spacing.sm)
        .glassPanel(strokeOpacity: 0.4, ambientGlow: 0.08)
    }

    /// Restores key-window status on the popover after a sheet dismisses.
    /// Walks NSApp.windows to find the NSPopover's window (the popover
    /// itself is not exposed as a SwiftUI environment value, so we go
    /// through AppKit) and calls makeKey on the next runloop tick — doing
    /// it synchronously inside onDismiss races the sheet's own teardown
    /// and the key window gets stolen back by the closing sheet's NSWindow.
    private func restorePopoverKey() {
        DispatchQueue.main.async {
            // NSPopover hosts its content in a private NSWindow subclass
            // (`_NSPopoverWindow`). Match by className substring rather
            // than the private symbol so this survives macOS internal
            // renames; fall back to "the only window that's currently
            // visible and isn't a sheet" if the class match fails.
            let candidate = NSApp.windows.first { win in
                guard win.isVisible else { return false }
                let cls = String(describing: type(of: win))
                return cls.contains("Popover")
            } ?? NSApp.windows.first { $0.isVisible && $0.sheetParent == nil }
            candidate?.makeKey()
        }
    }

    /// Live app icon (the full-color one in `AppIcon.appiconset`). Prefers
    /// `NSApp.applicationIconImage` so a future Pro/branded variant of the
    /// icon flows in automatically; falls back to a direct NSImage lookup
    /// for SwiftUI previews where NSApp isn't initialised.
    private var appIconView: some View {
        let nsImage = NSApp?.applicationIconImage
            ?? NSImage(named: NSImage.applicationIconName)
            ?? NSImage(named: "AppIcon")
        return Image(nsImage: nsImage ?? NSImage())
            .resizable()
            .interpolation(.high)
    }

    private var headerView: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            appIconView
                .frame(width: 20, height: 20)
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
            .buttonStyle(.glassIcon)
            .disabled(appState.isLoading)
            .accessibilityLabel(String(localized: "Refresh"))
        }
        .padding(.horizontal, CrystalGlass.Spacing.md)
        .padding(.vertical, CrystalGlass.Spacing.md - 2)
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
        VStack(spacing: CrystalGlass.Spacing.md) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(BrewTUIBarTheme.warning(highContrast: colorSchemeContrast == .increased))
                .accessibilityHidden(true)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button {
                // Sin handle retenido: si el popover se cierra el retry sigue
                // en background. El guard `!isLoading` evita reentradas.
                Task { await appState.refresh() }
            } label: {
                Text(String(localized: "Retry"))
            }
            .buttonStyle(.glassPill)
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
                Button {
                    Task { await appState.showServiceDiagnostics(for: svc) }
                } label: {
                    HStack(spacing: CrystalGlass.Spacing.sm) {
                        Text(svc.name)
                            .font(.caption2)
                            .fontWeight(.semibold)
                        Spacer()
                        if let code = svc.exitCode {
                            Text(String(format: String(localized: "exit %lld"), Int64(code)))
                                .font(.caption2)
                                .foregroundStyle(BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased))
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(format: String(localized: "Show diagnostics for %@"), svc.name))
            }
        }
        .padding(CrystalGlass.Spacing.md)
        .glassPanel(tint: BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased), strokeOpacity: 0.45)
    }

    private var footerView: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            Button {
                openBrewTUI()
            } label: {
                Label("Open Brew-TUI", systemImage: "terminal")
                    .font(.caption)
            }
            .buttonStyle(.glassPill)
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
            .buttonStyle(.glassIcon)
            .accessibilityLabel(String(localized: "Settings"))

            Button {
                NSApp.terminate(nil)
            } label: {
                Image(systemName: "power")
            }
            .buttonStyle(.glassIcon)
            .accessibilityLabel(String(localized: "Quit"))
        }
        .padding(.horizontal, CrystalGlass.Spacing.md)
        .padding(.vertical, CrystalGlass.Spacing.sm)
    }

    // UX-008: same Polar checkout the TUI surfaces from `POLAR_CHECKOUT_URLS`.
    private static let renewURL = URL(string: "https://buy.polar.sh/polar_cl_yQsiUeDelyyEQznbWffD1j77JAyP24ra7iEVQ22PA4h")!
    private static let monthlyURL = URL(string: "https://buy.polar.sh/polar_cl_QW1ZJ9887bU74drGr7JfujQfm3RKYnn1fuvc53DqD6D")!
    /// Canonical pricing/landing page. Lives at molinesdesigns.com (formerly
    /// linked to the GitHub README #pro-features anchor).
    // Deep-link to the pricing cards (Pro + Team) anchor on the landing page,
    // so the user lands directly at the badges instead of having to scroll
    // through the feature grid first.
    private static let pricingURL = URL(string: "https://molinesdesigns.com/brewtui/#pricing")!

    private static let activateCommand = "brew-tui activate <your-license-key>"

    private var freeTierView: some View {
        // No ScrollView: the popover is fixed at 340×420 and Free funnel must
        // fit without the user having to scroll. Dynamic Type at accessibility
        // sizes can still overflow — see the preview at the bottom for catch.
        VStack(alignment: .leading, spacing: CrystalGlass.Spacing.md) {
                // Header
                HStack(spacing: CrystalGlass.Spacing.sm) {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(CrystalGlass.warmAccent)
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
                .padding(CrystalGlass.Spacing.md)
                .glassPanel(cornerRadius: CrystalGlass.Radius.panel - 4, strokeOpacity: 0.35, ambientGlow: 0.06)

                // Plans — compact pill buttons centered horizontally. Yearly
                // gets `glassPillProminent` (warm tint, stronger border) to
                // signal it as the headline plan without using a solid colour.
                VStack(spacing: CrystalGlass.Spacing.sm) {
                    HStack { Spacer()
                        Button {
                            NSWorkspace.shared.open(Self.monthlyURL)
                        } label: {
                            HStack(spacing: 6) {
                                Text(String(localized: "Monthly"))
                                Text(verbatim: "·")
                                    .foregroundStyle(.secondary)
                                Text(verbatim: "€5.45")
                                    .fontWeight(.semibold)
                            }
                            .font(.callout)
                        }
                        .buttonStyle(.glassPill)
                        .accessibilityLabel(String(localized: "Subscribe Monthly, 5 euros 45 cents"))
                    Spacer() }

                    HStack { Spacer()
                        Button {
                            NSWorkspace.shared.open(Self.renewURL)
                        } label: {
                            HStack(spacing: 6) {
                                Text(String(localized: "Yearly"))
                                Text(verbatim: "·")
                                    .opacity(0.6)
                                Text(verbatim: "€48")
                                    .fontWeight(.semibold)
                                Text(String(localized: "save 27%"))
                                    .font(.caption2)
                                    .opacity(0.85)
                            }
                            .font(.callout)
                        }
                        .buttonStyle(.glassPillProminent)
                        .accessibilityLabel(String(localized: "Subscribe Yearly, 48 euros, save 27 percent"))
                    Spacer() }
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
                        .background(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(.ultraThinMaterial)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(CrystalGlass.glassCyan.opacity(0.4), lineWidth: 0.5)
                        )
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
                            .font(.system(size: 11, weight: .medium))
                    }
                    .buttonStyle(.glassIcon)
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
            .padding(CrystalGlass.Spacing.md)
    }

    private func proFeatureRow(systemImage: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.caption)
                .foregroundStyle(CrystalGlass.warmAccent)
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(text)
                .font(.caption)
            Spacer()
        }
    }

    private var basicModeView: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            Image(systemName: "lock.fill")
                .foregroundStyle(CrystalGlass.warmAccent)
                .accessibilityHidden(true)
            Text(String(localized: "Pro license expired"))
                .font(.caption)
                .foregroundStyle(CrystalGlass.warmAccent)
            Spacer()
            Button {
                NSWorkspace.shared.open(Self.renewURL)
            } label: {
                Text(String(localized: "Renew Pro"))
                    .font(.caption)
            }
            .buttonStyle(.glassPillProminent)
            .accessibilityLabel(String(localized: "Renew Pro license"))
        }
        .padding(.horizontal, CrystalGlass.Spacing.md)
        .padding(.vertical, CrystalGlass.Spacing.sm)
        .glassPanel(strokeOpacity: 0.4, ambientGlow: 0.08)
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
