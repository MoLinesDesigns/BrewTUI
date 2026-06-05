import SwiftUI

struct ServiceDiagnosticsView: View {
    let diagnostics: ServiceDiagnostics
    let onClose: () -> Void

    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    var body: some View {
        VStack(spacing: 0) {
            header
            GlassDivider()
                .padding(.horizontal, CrystalGlass.Spacing.md)
            content
            GlassDivider()
                .padding(.horizontal, CrystalGlass.Spacing.md)
            footer
        }
        .frame(width: 520)
        .frame(minHeight: 360)
        .background(CrystalAmbientBackground())
    }

    private var header: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            Image(systemName: "stethoscope")
                .foregroundStyle(BrewTUIBarTheme.accent(highContrast: colorSchemeContrast == .increased))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Service Diagnostics")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Text(diagnostics.serviceName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                onClose()
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.glassIcon)
            .accessibilityLabel(String(localized: "Close"))
        }
        .padding(CrystalGlass.Spacing.md)
    }

    @ViewBuilder
    private var content: some View {
        if diagnostics.isLoading {
            VStack(spacing: CrystalGlass.Spacing.md) {
                Spacer()
                ProgressView(String(localized: "Running diagnostics..."))
                Spacer()
            }
            .frame(maxWidth: .infinity, minHeight: 240)
            .padding(CrystalGlass.Spacing.md)
        } else {
            ScrollView {
                Text(verbatim: diagnostics.output)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.primary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(CrystalGlass.Spacing.md)
            }
            .frame(minHeight: 240)
            .glassPanel(cornerRadius: CrystalGlass.Radius.panel - 6, strokeOpacity: 0.35, ambientGlow: 0.04)
            .padding(CrystalGlass.Spacing.md)
        }
    }

    private var footer: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(diagnostics.output, forType: .string)
            } label: {
                Label("Copy Output", systemImage: "doc.on.doc")
                    .font(.caption)
            }
            .buttonStyle(.glassPill)
            .disabled(diagnostics.output.isEmpty)
            .accessibilityLabel(String(localized: "Copy diagnostic output"))

            Spacer()

            Button {
                onClose()
            } label: {
                Text(String(localized: "Close"))
                    .font(.caption)
            }
            .buttonStyle(.glassPill)
        }
        .padding(CrystalGlass.Spacing.md)
    }
}

#Preview("Service Diagnostics") {
    ServiceDiagnosticsView(
        diagnostics: ServiceDiagnostics(
            serviceName: "colima",
            output: """
            $ brew services info colima
            colima (homebrew.mxcl.colima)
            Running: false

            $ colima status
            colima is not running
            [exit 1]
            """,
            isLoading: false
        ),
        onClose: {}
    )
}

#Preview("Service Diagnostics Loading") {
    ServiceDiagnosticsView(
        diagnostics: ServiceDiagnostics(serviceName: "colima"),
        onClose: {}
    )
}
