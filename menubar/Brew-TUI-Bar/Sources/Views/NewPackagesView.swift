import SwiftUI

/// Glass sheet listing formulae/casks recently added to Homebrew's core taps.
/// Discoverability surface for "what's new" — clicking a row copies the
/// `brew install <name>` command to the pasteboard so the user can paste it
/// straight into their shell (Brew-TUI-Bar deliberately stays out of the
/// install path; that's Brew-TUI's job).
struct NewPackagesView: View {
    let formulae: [NewPackage]
    let casks: [NewPackage]
    let isLoading: Bool
    let error: String?
    let fetchedAt: Date?
    let onClose: () -> Void
    let onRefresh: () -> Void

    @State private var selectedKind: NewPackage.Kind = .formula
    /// Brief "Copied" pill on the row the user just clicked. Cleared by a
    /// throwaway Task after 1.6s so several clicks don't pile up timers.
    @State private var copiedID: String?

    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var visiblePackages: [NewPackage] {
        switch selectedKind {
        case .formula: formulae
        case .cask:    casks
        }
    }

    var body: some View {
        VStack(spacing: CrystalGlass.Spacing.md) {
            header
            kindPicker
            content
            footer
        }
        .padding(CrystalGlass.Spacing.lg)
        .frame(width: 420)
        .frame(minHeight: 420, idealHeight: 520, maxHeight: 600)
        .background {
            ZStack {
                Color.clear
                CrystalAmbientBackground()
                GlassPanelBackground(
                    cornerRadius: CrystalGlass.Radius.panel,
                    strokeOpacity: 0.6
                )
            }
            .ignoresSafeArea()
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: CrystalGlass.Spacing.sm) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundStyle(CrystalGlass.glassCyan)
                    .accessibilityHidden(true)
                Text(String(localized: "What's new in Homebrew"))
                    .font(.headline)
                    .fontWeight(legibilityWeight == .bold ? .bold : .semibold)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button {
                    onRefresh()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.glassIcon)
                .disabled(isLoading)
                .accessibilityLabel(String(localized: "Refresh new packages"))
            }

            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var subtitle: String {
        if isLoading && visiblePackages.isEmpty {
            return String(localized: "Loading from Homebrew…")
        }
        if let fetchedAt {
            let template = String(localized: "Updated %@")
            return String(format: template, fetchedAt.formatted(.relative(presentation: .named)))
        }
        return String(localized: "Recently added to homebrew-core and homebrew-cask")
    }

    // MARK: - Picker

    private var kindPicker: some View {
        Picker(selection: $selectedKind) {
            Text(String(localized: "Formulae")).tag(NewPackage.Kind.formula)
            Text(String(localized: "Casks")).tag(NewPackage.Kind.cask)
        } label: {
            Text(String(localized: "Type"))
        }
        .pickerStyle(.segmented)
        .labelsHidden()
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if let error, visiblePackages.isEmpty {
            errorState(error)
        } else if visiblePackages.isEmpty && isLoading {
            loadingState
        } else if visiblePackages.isEmpty {
            emptyState
        } else {
            packagesList
        }
    }

    private var packagesList: some View {
        ScrollView {
            VStack(spacing: 6) {
                ForEach(visiblePackages) { pkg in
                    row(for: pkg)
                }
            }
            .padding(CrystalGlass.Spacing.sm)
        }
        .frame(maxHeight: .infinity)
        .glassPanel(cornerRadius: CrystalGlass.Radius.panel - 4, strokeOpacity: 0.35, ambientGlow: 0.05)
    }

    @ViewBuilder
    private func row(for pkg: NewPackage) -> some View {
        Button {
            copy(pkg)
        } label: {
            HStack(alignment: .top, spacing: CrystalGlass.Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(pkg.name)
                            .font(.system(.body, design: .monospaced))
                            .fontWeight(.medium)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text(pkg.addedAt.formatted(.relative(presentation: .numeric)))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    if let desc = pkg.desc, !desc.isEmpty {
                        Text(desc)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text(String(localized: "No description available"))
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .italic()
                    }
                }
                Spacer(minLength: CrystalGlass.Spacing.xs)
                trailingIndicator(for: pkg)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, CrystalGlass.Spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.white.opacity(copiedID == pkg.id ? 0.08 : 0.0))
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(pkg.name). \(pkg.desc ?? "")")
        .accessibilityHint(String(localized: "Double tap to copy install command"))
        .help(pkg.installCommand)
    }

    @ViewBuilder
    private func trailingIndicator(for pkg: NewPackage) -> some View {
        if copiedID == pkg.id {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(colorSchemeContrast == .increased ? Color(red: 0, green: 0.6, blue: 0) : .green)
                Text(String(localized: "Copied"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .transition(.opacity)
        } else {
            Image(systemName: "doc.on.doc")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: CrystalGlass.Spacing.md) {
            Spacer()
            ProgressView()
            Text(String(localized: "Fetching latest formulae and casks…"))
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: CrystalGlass.Spacing.sm) {
            Spacer()
            Image(systemName: "tray")
                .font(.largeTitle)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
            Text(String(localized: "No new packages found"))
                .font(.headline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
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
                onRefresh()
            } label: {
                Text(String(localized: "Retry"))
            }
            .buttonStyle(.glassPill)
            Spacer()
        }
        .padding(CrystalGlass.Spacing.md)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Footer

    private var footer: some View {
        HStack {
            Spacer()
            Button {
                onClose()
            } label: {
                Text(String(localized: "Close"))
                    .fontWeight(.semibold)
            }
            .buttonStyle(.glassPillProminent)
            .keyboardShortcut(.defaultAction)
            .accessibilityLabel(String(localized: "Close new packages"))
        }
    }

    // MARK: - Actions

    private func copy(_ pkg: NewPackage) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(pkg.installCommand, forType: .string)
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
            copiedID = pkg.id
        }
        let pkgID = pkg.id
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            if copiedID == pkgID {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                    copiedID = nil
                }
            }
        }
    }
}

// MARK: - Previews

#Preview("With data") {
    NewPackagesView(
        formulae: [
            NewPackage(name: "ripgrep-all", kind: .formula, addedAt: Date().addingTimeInterval(-3600), desc: "ripgrep, but also for PDFs, E-Books, Office documents, zip, tar.gz, etc.", homepage: URL(string: "https://example.com")),
            NewPackage(name: "zellij", kind: .formula, addedAt: Date().addingTimeInterval(-86_400), desc: "Pluggable terminal workspace, with terminal multiplexer as the base feature", homepage: nil),
            NewPackage(name: "uv", kind: .formula, addedAt: Date().addingTimeInterval(-172_800), desc: "Extremely fast Python package installer and resolver", homepage: nil),
        ],
        casks: [
            NewPackage(name: "ghostty", kind: .cask, addedAt: Date().addingTimeInterval(-7200), desc: "Fast, native, feature-rich terminal emulator", homepage: nil),
        ],
        isLoading: false,
        error: nil,
        fetchedAt: Date().addingTimeInterval(-1200),
        onClose: {},
        onRefresh: {}
    )
}

#Preview("Loading") {
    NewPackagesView(
        formulae: [],
        casks: [],
        isLoading: true,
        error: nil,
        fetchedAt: nil,
        onClose: {},
        onRefresh: {}
    )
}

#Preview("Error") {
    NewPackagesView(
        formulae: [],
        casks: [],
        isLoading: false,
        error: "Could not load new packages: GitHub rate limit exceeded",
        fetchedAt: nil,
        onClose: {},
        onRefresh: {}
    )
}

#Preview("Empty") {
    NewPackagesView(
        formulae: [],
        casks: [],
        isLoading: false,
        error: nil,
        fetchedAt: Date(),
        onClose: {},
        onRefresh: {}
    )
}
