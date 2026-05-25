import SwiftUI

struct OutdatedListView: View {
    let appState: AppState
    @State private var showUpgradeAllConfirm = false
    @State private var packageToConfirm: OutdatedPackage?
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(String(format: String(localized: "%lld updates available"), Int64(appState.outdatedCount)))
                    .font(.subheadline)
                    .fontWeight(legibilityWeight == .bold ? .bold : .regular)
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if appState.canUpgrade {
                    Button("Upgrade All") {
                        showUpgradeAllConfirm = true
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(appState.isLoading)
                    .accessibilityLabel(String(localized: "Upgrade All"))
                    .confirmationDialog(
                        String(localized: "Upgrade all packages?"),
                        isPresented: $showUpgradeAllConfirm,
                        titleVisibility: .visible
                    ) {
                        Button(String(localized: "Upgrade All"), role: .destructive) {
                            // Sin handle retenido: el popover puede ocultarse
                            // (click fuera) y el upgrade debe completar igual.
                            Task { await appState.upgradeAll() }
                        }
                        Button(String(localized: "Cancel"), role: .cancel) {}
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(appState.outdatedPackages) { pkg in
                        packageRow(pkg)
                        Divider().padding(.leading, 12)
                    }
                }
            }
        }
    }

    private func packageRow(_ pkg: OutdatedPackage) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(pkg.name)
                    .font(.system(.body, design: .monospaced))
                    .fontWeight(.medium)
                HStack(spacing: 4) {
                    Text(pkg.installedVersion)
                        .foregroundStyle(BrewTUIBarTheme.installedVersion(highContrast: colorSchemeContrast == .increased))
                    Image(systemName: "arrow.right")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    Text(pkg.currentVersion)
                        .foregroundStyle(BrewTUIBarTheme.currentVersion(highContrast: colorSchemeContrast == .increased))
                }
                .font(.caption)
            }
            // ACC-002: read each row as a single VoiceOver element so the
            // package, both versions and the pin badge come through together.
            .accessibilityElement(children: .combine)

            Spacer()

            if pkg.pinned {
                Image(systemName: "pin.fill")
                    .font(.caption)
                    .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                    .accessibilityLabel(String(localized: "Pinned"))
            }

            // Note: Task in button action — .task modifier not applicable here
            if appState.canUpgrade {
                Button {
                    packageToConfirm = pkg
                } label: {
                    Image(systemName: "arrow.up.circle")
                }
                .buttonStyle(.borderless)
                .disabled(appState.isLoading || pkg.pinned)
                .accessibilityLabel(
                    String(format: String(localized: "Upgrade %@", comment: "Accessibility label for upgrading a single package"), pkg.name)
                )
                .confirmationDialog(
                    String(format: String(localized: "Upgrade %@?"), pkg.name),
                    isPresented: Binding(
                        get: { packageToConfirm?.id == pkg.id },
                        set: { isPresented in
                            if !isPresented {
                                packageToConfirm = nil
                            }
                        }
                    ),
                    titleVisibility: .visible
                ) {
                    Button(String(localized: "Upgrade"), role: .destructive) {
                        // Sin handle retenido: el upgrade debe sobrevivir al
                        // cierre del popover (click fuera, foco a otra app).
                        Task { await appState.upgrade(package: pkg.name) }
                    }
                    Button(String(localized: "Cancel"), role: .cancel) {}
                }
            } else {
                Image(systemName: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(String(localized: "Upgrade not available — Pro license required"))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

// MARK: - Previews

#Preview("5 Packages") {
    OutdatedListView(appState: PreviewData.makeAppState())
        .frame(width: 340, height: 300)
}

#Preview("1 Package") {
    OutdatedListView(
        appState: PreviewData.makeAppState(packages: [PreviewData.outdatedPackages[0]])
    )
    .frame(width: 340, height: 200)
}

#Preview("Pinned Package") {
    OutdatedListView(
        appState: PreviewData.makeAppState(packages: [PreviewData.outdatedPackages[2]])
    )
    .frame(width: 340, height: 200)
}

#Preview("Spanish") {
    OutdatedListView(appState: PreviewData.makeAppState())
        .frame(width: 340, height: 300)
        .environment(\.locale, Locale(identifier: "es"))
}
