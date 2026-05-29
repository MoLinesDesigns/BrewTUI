import SwiftUI

/// Glass sheet that surfaces the live state of a `brew upgrade`. Renders a
/// scrollable per-package list (stage icon + label) plus a global progress bar
/// and a Close button gated on `progress.isFinished`.
struct InstallProgressView: View {
    let progress: InstallProgress
    let onClose: () -> Void
    var onCancel: (() -> Void)? = nil

    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var headerSubtitle: String {
        if progress.isFinished {
            if progress.finalError != nil {
                return String(localized: "Finished with errors")
            }
            return String(localized: "All set")
        }
        if let current = progress.currentPackage, !current.stage.isTerminal {
            return String(format: String(localized: "%@ — %@"), current.name, current.stage.label)
        }
        if progress.packages.isEmpty {
            return String(localized: "Resolving packages…")
        }
        return String(localized: "Preparing…")
    }

    var body: some View {
        VStack(spacing: CrystalGlass.Spacing.lg) {
            header
            packageList
            globalBar
            footer
        }
        .padding(CrystalGlass.Spacing.lg)
        .frame(width: 360)
        .frame(minHeight: 320, idealHeight: 420, maxHeight: 520)
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
                Image(systemName: progress.isFinished
                    ? (progress.finalError == nil ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    : "arrow.down.circle.fill"
                )
                    .font(.title2)
                    .foregroundStyle(
                        progress.finalError != nil
                            ? BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased)
                            : CrystalGlass.glassCyan
                    )
                    .symbolEffect(.pulse, options: reduceMotion ? .nonRepeating : .repeating, isActive: !progress.isFinished)
                    .accessibilityHidden(true)

                Text(progress.title)
                    .font(.headline)
                    .fontWeight(legibilityWeight == .bold ? .bold : .semibold)
                    .accessibilityAddTraits(.isHeader)

                Spacer()
            }

            Text(headerSubtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }

    // MARK: - List

    private var packageList: some View {
        ScrollView {
            VStack(spacing: 6) {
                if progress.packages.isEmpty {
                    placeholderRow
                } else {
                    ForEach(progress.packages) { item in
                        row(for: item)
                            .transition(.opacity.combined(with: .move(edge: .leading)))
                    }
                }
            }
            .animation(
                reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.85),
                value: progress.packages
            )
            .padding(CrystalGlass.Spacing.sm)
        }
        .frame(maxHeight: .infinity)
        .glassPanel(cornerRadius: CrystalGlass.Radius.panel - 4, strokeOpacity: 0.35, ambientGlow: 0.05)
    }

    private var placeholderRow: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            ProgressView()
                .scaleEffect(0.7)
            Text(String(localized: "Waiting for brew…"))
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func row(for item: InstallProgress.Item) -> some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            stageIcon(item.stage)
                .frame(width: 18, alignment: .center)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.system(.body, design: .monospaced))
                    .fontWeight(.medium)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(item.stage.label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if case .failed(let reason) = item.stage {
                    Text(reason)
                        .font(.caption2)
                        .foregroundStyle(BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased))
                        .lineLimit(2)
                }
            }

            Spacer(minLength: CrystalGlass.Spacing.xs)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, CrystalGlass.Spacing.sm)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.white.opacity(item.stage.isTerminal ? 0.0 : 0.04))
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.name), \(item.stage.label)")
    }

    @ViewBuilder
    private func stageIcon(_ stage: InstallStage) -> some View {
        switch stage {
        case .pending:
            Image(systemName: "circle")
                .foregroundStyle(.tertiary)
        case .fetching:
            Image(systemName: "arrow.down.circle")
                .foregroundStyle(CrystalGlass.glassCyan)
                .symbolEffect(.pulse, options: reduceMotion ? .nonRepeating : .repeating)
        case .installing, .pouring:
            Image(systemName: "shippingbox")
                .foregroundStyle(CrystalGlass.glassCyan)
                .symbolEffect(.pulse, options: reduceMotion ? .nonRepeating : .repeating)
        case .linking:
            Image(systemName: "link.circle")
                .foregroundStyle(CrystalGlass.glassCyan)
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(colorSchemeContrast == .increased ? Color(red: 0, green: 0.6, blue: 0) : .green)
        case .failed:
            Image(systemName: "xmark.octagon.fill")
                .foregroundStyle(BrewTUIBarTheme.critical(highContrast: colorSchemeContrast == .increased))
        }
    }

    // MARK: - Global bar

    private var globalBar: some View {
        VStack(spacing: 6) {
            HStack {
                Text(String(
                    format: String(localized: "%lld of %lld"),
                    Int64(progress.completedCount),
                    Int64(max(progress.packages.count, 1))
                ))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(percentLabel)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            CrystalProgressBar(fraction: progress.overallFraction)
                .frame(height: 6)
        }
    }

    private var percentLabel: String {
        let pct = Int((progress.overallFraction * 100).rounded())
        return "\(pct)%"
    }

    // MARK: - Footer

    private var footer: some View {
        HStack(spacing: CrystalGlass.Spacing.sm) {
            if !progress.isFinished, let onCancel {
                Button {
                    onCancel()
                } label: {
                    Text(String(localized: "Cancel"))
                }
                .buttonStyle(.glassPill)
                .keyboardShortcut(.cancelAction)
                .accessibilityLabel(String(localized: "Cancel upgrade"))
            }

            Spacer()

            Button {
                onClose()
            } label: {
                Text(progress.isFinished
                    ? String(localized: "Done")
                    : String(localized: "Working…"))
                    .fontWeight(.semibold)
            }
            .buttonStyle(progress.isFinished ? .glassPillProminent : .glassPill)
            .disabled(!progress.isFinished)
            .keyboardShortcut(.defaultAction)
            .accessibilityLabel(progress.isFinished
                ? String(localized: "Close install progress")
                : String(localized: "Upgrade still running"))
        }
    }
}

// MARK: - Crystal progress bar

/// Cyan glass progress bar. Uses the Apple Liquid Glass language: capsule
/// track on `.ultraThinMaterial`, capsule fill with a cyan/white gradient
/// and a subtle ambient glow that grows with the fraction.
struct CrystalProgressBar: View {
    var fraction: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.ultraThinMaterial)
                Capsule()
                    .strokeBorder(
                        LinearGradient(
                            colors: [
                                CrystalGlass.glassCyan.opacity(0.45),
                                .white.opacity(0.18),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        ),
                        lineWidth: 1
                    )

                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                CrystalGlass.glassCyan.opacity(0.85),
                                .white.opacity(0.65),
                                CrystalGlass.glassCyan.opacity(0.9),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: max(6, geo.size.width * CGFloat(min(max(fraction, 0), 1))))
                    .shadow(color: CrystalGlass.glassCyan.opacity(0.35), radius: 4, y: 0)
                    .animation(
                        reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.85),
                        value: fraction
                    )
            }
        }
        .accessibilityElement()
        .accessibilityValue(Text("\(Int(fraction * 100)) %"))
    }
}

// MARK: - Previews

#Preview("In progress") {
    let p: InstallProgress = {
        var prog = InstallProgress(mode: .all, seeds: ["git", "node", "wget", "ffmpeg"])
        prog.mark("git", stage: .done)
        prog.mark("node", stage: .fetching)
        return prog
    }()
    return InstallProgressView(progress: p) {}
        .padding()
        .background(Color(red: 0.05, green: 0.07, blue: 0.10))
}

#Preview("Single package — finished") {
    let p: InstallProgress = {
        var prog = InstallProgress(mode: .singlePackage("git"), seeds: ["git"])
        prog.finishSuccess()
        return prog
    }()
    return InstallProgressView(progress: p) {}
        .padding()
        .background(Color(red: 0.05, green: 0.07, blue: 0.10))
}

#Preview("Failed") {
    let p: InstallProgress = {
        var prog = InstallProgress(mode: .singlePackage("ffmpeg"), seeds: ["ffmpeg"])
        prog.finishFailure("brew exited with code 1")
        return prog
    }()
    return InstallProgressView(progress: p) {}
        .padding()
        .background(Color(red: 0.05, green: 0.07, blue: 0.10))
}
