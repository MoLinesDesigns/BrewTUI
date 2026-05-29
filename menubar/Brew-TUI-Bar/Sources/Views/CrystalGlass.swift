import SwiftUI

// MARK: - Tokens

/// Crystal Glass design tokens for Brew-TUI-Bar. Mirrors the Apple Liquid
/// Glass language used across MoLines Designs products: `.ultraThinMaterial`
/// fills, cyan + soft-white gradient borders, deep cyan ambient glow.
enum CrystalGlass {
    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    enum Radius {
        /// Panels and cards.
        static let panel: CGFloat = 18
        /// Pill / capsule buttons.
        static let pill: CGFloat = 22
        /// Circular icon buttons (set the size, the shape comes from `.circle`).
        static let icon: CGFloat = 28
    }

    enum Stroke {
        static let hairline: CGFloat = 1
    }

    /// Cyan accent reused across borders, glows and focus highlights.
    static let glassCyan = Color(red: 0.30, green: 0.85, blue: 0.95)

    /// Warm coral accent used for outdated counts, upgrade indicators and the
    /// Free funnel CTA. Replaces the legacy purple plan tints.
    static let warmAccent = Color(red: 1.0, green: 0.57, blue: 0.49)

    /// Soft cyan glow for ambient shadows under glass.
    static func ambientShadow(intensity: Double = 0.18) -> Color {
        Color.cyan.opacity(intensity)
    }
}

// MARK: - Glass background view

/// The standard Crystal Glass surface: `.ultraThinMaterial` base with a soft
/// white/cyan gradient overlay and a hairline gradient stroke. Use this as a
/// container background instead of `Color.something.opacity(0.x)`.
struct GlassPanelBackground: View {
    var cornerRadius: CGFloat = CrystalGlass.Radius.panel
    var tint: Color = .clear
    var strokeOpacity: Double = 0.55
    var fillOpacity: Double = 1.0

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.ultraThinMaterial)

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            .white.opacity(0.08 * fillOpacity),
                            .white.opacity(0.02 * fillOpacity),
                            CrystalGlass.glassCyan.opacity(0.06 * fillOpacity),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            if tint != .clear {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(tint.opacity(0.10))
            }

            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [
                            CrystalGlass.glassCyan.opacity(0.55 * strokeOpacity),
                            .white.opacity(0.35 * strokeOpacity),
                            CrystalGlass.glassCyan.opacity(0.45 * strokeOpacity),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: CrystalGlass.Stroke.hairline
                )
        }
    }
}

extension View {
    /// Applies the standard Crystal Glass panel background. Use this on any
    /// elevated surface (cards, banners, modals, footers) so the entire app
    /// reads as one cohesive glass system.
    func glassPanel(
        cornerRadius: CGFloat = CrystalGlass.Radius.panel,
        tint: Color = .clear,
        strokeOpacity: Double = 0.55,
        ambientGlow: Double = 0.12
    ) -> some View {
        self
            .background(
                GlassPanelBackground(
                    cornerRadius: cornerRadius,
                    tint: tint,
                    strokeOpacity: strokeOpacity
                )
            )
            .shadow(
                color: CrystalGlass.ambientShadow(intensity: ambientGlow),
                radius: 8,
                y: 4
            )
    }
}

// MARK: - Pill button style

/// Glass pill button: capsule shape, transparent material, optional warm /
/// cyan emphasis. Sizes to its content — never stretched full-width unless
/// the caller adds `.frame(maxWidth: .infinity)`.
struct GlassPillButtonStyle: ButtonStyle {
    enum Emphasis {
        /// Neutral glass — borders cyan, text follows foreground style.
        case neutral
        /// Headline plan / primary CTA. Slightly warmer tint + stronger border.
        case prominent
    }

    var emphasis: Emphasis = .neutral
    var horizontalPadding: CGFloat = CrystalGlass.Spacing.lg
    var verticalPadding: CGFloat = CrystalGlass.Spacing.sm

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    func makeBody(configuration: Configuration) -> some View {
        let highContrast = colorSchemeContrast == .increased
        let pressed = configuration.isPressed

        configuration.label
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
            .background(
                GlassPanelBackground(
                    cornerRadius: CrystalGlass.Radius.pill,
                    tint: emphasis == .prominent
                        ? CrystalGlass.warmAccent
                        : .clear,
                    strokeOpacity: emphasis == .prominent ? 0.85 : 0.55,
                    fillOpacity: pressed ? 1.4 : 1.0
                )
            )
            .overlay(
                // Press feedback: subtle inner glow.
                RoundedRectangle(cornerRadius: CrystalGlass.Radius.pill, style: .continuous)
                    .stroke(
                        CrystalGlass.glassCyan.opacity(pressed ? 0.6 : 0),
                        lineWidth: 1
                    )
            )
            .shadow(
                color: CrystalGlass.ambientShadow(
                    intensity: emphasis == .prominent ? 0.22 : 0.12
                ),
                radius: pressed ? 4 : 8,
                y: pressed ? 1 : 3
            )
            .scaleEffect(pressed ? 0.97 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.55)
            .animation(.spring(response: 0.35, dampingFraction: 0.75), value: pressed)
            .contentShape(Capsule())
            .accessibilityAddTraits(.isButton)
            .foregroundStyle(
                highContrast ? .primary : .primary
            )
    }
}

extension ButtonStyle where Self == GlassPillButtonStyle {
    /// Neutral glass pill (transparent material, cyan hairline border).
    static var glassPill: GlassPillButtonStyle { GlassPillButtonStyle(emphasis: .neutral) }

    /// Prominent glass pill (warm coral tint + stronger border) for primary CTAs.
    static var glassPillProminent: GlassPillButtonStyle {
        GlassPillButtonStyle(emphasis: .prominent)
    }
}

// MARK: - Icon button style

/// Circular glass button for toolbar-style controls (refresh, settings, quit,
/// dismiss). Always 28pt to satisfy AppKit's 28pt min hit area inside popovers.
struct GlassIconButtonStyle: ButtonStyle {
    var size: CGFloat = CrystalGlass.Radius.icon

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed

        configuration.label
            .font(.system(size: 13, weight: .medium))
            .frame(width: size, height: size)
            .background(
                Circle()
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                .white.opacity(0.08),
                                .white.opacity(0.02),
                                CrystalGlass.glassCyan.opacity(0.05),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                Circle()
                    .strokeBorder(
                        LinearGradient(
                            colors: [
                                CrystalGlass.glassCyan.opacity(pressed ? 0.85 : 0.5),
                                .white.opacity(0.25),
                                CrystalGlass.glassCyan.opacity(pressed ? 0.7 : 0.4),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            )
            .shadow(
                color: CrystalGlass.ambientShadow(intensity: pressed ? 0.05 : 0.12),
                radius: pressed ? 2 : 5,
                y: pressed ? 1 : 2
            )
            .scaleEffect(pressed ? 0.92 : 1.0)
            .opacity(isEnabled ? 1.0 : 0.45)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: pressed)
            .contentShape(Circle())
    }
}

extension ButtonStyle where Self == GlassIconButtonStyle {
    static var glassIcon: GlassIconButtonStyle { GlassIconButtonStyle() }
}

// MARK: - Gradient divider

/// Thin gradient line — transparent → cyan → transparent. Replaces plain
/// `Divider()` when the surface above/below is glass.
struct GlassDivider: View {
    var body: some View {
        LinearGradient(
            colors: [
                .clear,
                CrystalGlass.glassCyan.opacity(0.35),
                .white.opacity(0.18),
                CrystalGlass.glassCyan.opacity(0.35),
                .clear,
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
        .frame(height: 1)
    }
}

// MARK: - Window background (for popover-wide tint)

/// A subtle ambient background applied at the popover root. Keeps the overall
/// surface readable when macOS draws the popover chrome behind it.
struct CrystalAmbientBackground: View {
    var body: some View {
        ZStack {
            // Soft cyan/coral radial wash so the popover doesn't read flat.
            RadialGradient(
                colors: [
                    CrystalGlass.glassCyan.opacity(0.10),
                    .clear,
                ],
                center: .topLeading,
                startRadius: 10,
                endRadius: 320
            )
            RadialGradient(
                colors: [
                    CrystalGlass.warmAccent.opacity(0.06),
                    .clear,
                ],
                center: .bottomTrailing,
                startRadius: 10,
                endRadius: 360
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Previews

#Preview("Pill buttons") {
    VStack(spacing: 12) {
        Button("Renew Pro") {}
            .buttonStyle(.glassPill)

        Button {} label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.up.circle.fill")
                Text("Upgrade All")
            }
        }
        .buttonStyle(.glassPillProminent)

        Button("Disabled") {}
            .buttonStyle(.glassPill)
            .disabled(true)
    }
    .padding(24)
    .frame(width: 340)
}

#Preview("Icon buttons") {
    HStack(spacing: 12) {
        Button { } label: { Image(systemName: "arrow.clockwise") }
            .buttonStyle(.glassIcon)
        Button { } label: { Image(systemName: "gear") }
            .buttonStyle(.glassIcon)
        Button { } label: { Image(systemName: "power") }
            .buttonStyle(.glassIcon)
    }
    .padding(24)
    .frame(width: 200)
}

#Preview("Glass panel") {
    VStack(alignment: .leading, spacing: 8) {
        Text("3 updates available").font(.headline)
        Text("git, node, wget").font(.caption).foregroundStyle(.secondary)
        GlassDivider()
        Text("Last checked 2 minutes ago")
            .font(.caption2)
            .foregroundStyle(.tertiary)
    }
    .padding(16)
    .glassPanel()
    .padding(24)
    .frame(width: 340)
}
