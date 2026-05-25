//  Brew-TUI-BarDesignVariants.swift
//  Brew-TUI-Bar · Design Exploration — Xcode Preview only, not production code.
//
//  Five conceptual directions for the Brew-TUI-Bar popover (340 × 420 pt).
//  Each variant is fully self-contained; no changes to existing source.

#if DEBUG
import SwiftUI

// MARK: - Private mock types (preview only)

fileprivate struct MockPackage: Identifiable {
    let id   = UUID()
    let name: String
    let installed: String
    let available: String
    var pinned: Bool = false
}

fileprivate struct MockCVE: Identifiable {
    let id  = UUID()
    let pkg: String
    let sev: Sev
    enum Sev { case critical, high, medium }
    var dot: Color {
        switch sev {
        case .critical: .red
        case .high:     Color(red: 1, green: 0.45, blue: 0)
        case .medium:   .yellow
        }
    }
}

fileprivate enum Mock {
    static let pkgs: [MockPackage] = [
        .init(name: "git",         installed: "2.43.0",  available: "2.45.1"),
        .init(name: "node",        installed: "20.11.0", available: "22.2.0"),
        .init(name: "python@3.12", installed: "3.12.2",  available: "3.12.4", pinned: true),
        .init(name: "wget",        installed: "1.21.4",  available: "1.24.5"),
        .init(name: "ffmpeg",      installed: "6.1.1",   available: "7.0"),
    ]
    static let cves: [MockCVE] = [
        .init(pkg: "node", sev: .critical),
        .init(pkg: "wget", sev: .high),
    ]
}

// MARK: - Shared color tokens

private extension Color {
    static let brewAmber    = Color(red: 1.00, green: 0.60, blue: 0.05)
    static let brewAmberDim = Color(red: 1.00, green: 0.60, blue: 0.05, opacity: 0.50)
    static let brewObsidian = Color(red: 0.04, green: 0.04, blue: 0.04)
    static let brewCream    = Color(red: 0.97, green: 0.95, blue: 0.91)
    static let brewTeal     = Color(red: 0.16, green: 0.61, blue: 0.56)
    static let brewRose     = Color(red: 0.91, green: 0.43, blue: 0.32)
    static let mondRed      = Color(red: 0.88, green: 0.08, blue: 0.08)
    static let mondBlue     = Color(red: 0.05, green: 0.18, blue: 0.82)
    static let mondYellow   = Color(red: 0.98, green: 0.86, blue: 0.05)
    static let meshPurple   = Color(red: 0.32, green: 0.16, blue: 0.82)
    static let meshTeal     = Color(red: 0.05, green: 0.60, blue: 0.75)
}

// MARK: ─────────────────────────────────────────────────────────────
// VARIANT 1 · Void Terminal
// Bauhaus radical functionalism × Japanese Ma (間)
// Radical negative space. The count is the only protagonist.
// ─────────────────────────────────────────────────────────────────

struct VariantVoidTerminal: View {
    fileprivate var packages: [MockPackage] = Mock.pkgs
    fileprivate var cves: [MockCVE]         = Mock.cves
    var isLoading: Bool         = false

    private var count: Int { packages.count }

    var body: some View {
        ZStack {
            Color.brewObsidian.ignoresSafeArea()
            VStack(spacing: 0) {
                vtHeader
                vtCounter
                vtRule
                vtList
                Spacer(minLength: 0)
                vtFooter
            }
        }
        .frame(width: 340, height: 420)
        .colorScheme(.dark)
    }

    private var vtHeader: some View {
        HStack {
            Image(systemName: "mug.fill")
                .font(.system(size: 13, weight: .ultraLight))
                .foregroundStyle(Color.brewAmber)
            Spacer()
            if isLoading {
                ProgressView()
                    .scaleEffect(0.55)
                    .tint(.white.opacity(0.28))
                    .frame(width: 18, height: 18)
            }
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 10, weight: .ultraLight))
                .foregroundStyle(.white.opacity(0.16))
        }
        .padding(.horizontal, 22)
        .padding(.top, 20)
        .padding(.bottom, 6)
    }

    private var vtCounter: some View {
        VStack(spacing: 1) {
            Text("\(count)")
                .font(.system(size: 82, weight: .ultraLight, design: .monospaced))
                .foregroundStyle(count > 0 ? Color.brewAmber : Color.white.opacity(0.05))
                .contentTransition(.numericText())
                .animation(.easeInOut(duration: 0.35), value: count)

            Text(count == 1 ? "package outdated" : "packages outdated")
                .font(.system(size: 8, weight: .medium, design: .monospaced))
                .kerning(4)
                .foregroundStyle(.white.opacity(0.15))
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
        .padding(.bottom, 22)
    }

    private var vtRule: some View {
        Rectangle()
            .frame(maxWidth: .infinity, maxHeight: 0.5)
            .foregroundStyle(.white.opacity(0.07))
    }

    private var vtList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(packages) { pkg in
                    HStack {
                        if pkg.pinned {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 7))
                                .foregroundStyle(Color.brewAmberDim)
                                .padding(.trailing, 4)
                        }
                        Text(pkg.name)
                            .font(.system(size: 11.5, weight: .regular, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.50))
                        Spacer()
                        Text(pkg.available)
                            .font(.system(size: 10, weight: .light, design: .monospaced))
                            .foregroundStyle(Color.brewAmberDim)
                    }
                    .padding(.horizontal, 22)
                    .padding(.vertical, 9)

                    Rectangle()
                        .frame(maxWidth: .infinity, maxHeight: 0.5)
                        .foregroundStyle(.white.opacity(0.04))
                        .padding(.horizontal, 22)
                }
            }
        }
        .frame(maxHeight: 188)
    }

    private var vtFooter: some View {
        HStack {
            if !cves.isEmpty {
                HStack(spacing: 5) {
                    ForEach(cves.prefix(3)) { cve in
                        Circle()
                            .fill(cve.dot)
                            .frame(width: 4.5, height: 4.5)
                    }
                    Text("\(cves.count) CVE")
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.20))
                }
            }
            Spacer()
            HStack(spacing: 18) {
                Image(systemName: "terminal")
                    .font(.system(size: 11, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.18))
                Image(systemName: "gear")
                    .font(.system(size: 11, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.18))
                Image(systemName: "power")
                    .font(.system(size: 11, weight: .ultraLight))
                    .foregroundStyle(.white.opacity(0.18))
            }
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 18)
        .padding(.top, 14)
    }
}

// MARK: ─────────────────────────────────────────────────────────────
// VARIANT 2 · Organic Bloom
// Miró biomorfismo × Brancusi organic sculpture
// The popover breathes. Biomorphic blobs. Warm cream canvas.
// ─────────────────────────────────────────────────────────────────

struct VariantOrganicBloom: View {
    fileprivate var packages: [MockPackage] = Mock.pkgs
    fileprivate var cves: [MockCVE]         = Mock.cves
    var isLoading: Bool         = false

    private var count: Int { packages.count }

    var body: some View {
        ZStack {
            Color.brewCream.ignoresSafeArea()
            blobLayer
            VStack(spacing: 0) {
                obHeader
                obOrb
                obList
                Spacer(minLength: 0)
                obFooter
            }
        }
        .frame(width: 340, height: 420)
        .colorScheme(.light)
    }

    private var blobLayer: some View {
        ZStack {
            Ellipse()
                .fill(Color.brewAmber.opacity(0.18))
                .frame(width: 200, height: 150)
                .blur(radius: 55)
                .offset(x: -90, y: -110)

            Ellipse()
                .fill(Color.brewTeal.opacity(0.14))
                .frame(width: 170, height: 220)
                .blur(radius: 65)
                .offset(x: 100, y: 90)

            Circle()
                .fill(Color.brewRose.opacity(0.10))
                .frame(width: 110, height: 110)
                .blur(radius: 45)
                .offset(x: 70, y: -75)
        }
    }

    private var obHeader: some View {
        HStack {
            HStack(spacing: 6) {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.brewTeal)
                Text("Brew-TUI-Bar")
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(Color(red: 0.22, green: 0.20, blue: 0.16))
            }
            Spacer()
            if isLoading {
                ProgressView()
                    .scaleEffect(0.60)
                    .tint(Color.brewTeal)
                    .frame(width: 18, height: 18)
            }
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 12))
                .foregroundStyle(Color(red: 0.42, green: 0.40, blue: 0.36))
        }
        .padding(.horizontal, 18)
        .padding(.top, 17)
        .padding(.bottom, 4)
    }

    private var obOrb: some View {
        ZStack {
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [Color.brewAmber.opacity(0.13), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 65
                    )
                )
                .frame(width: 145, height: 112)

            VStack(spacing: 0) {
                Text("\(count)")
                    .font(.system(size: 62, weight: .thin, design: .rounded))
                    .foregroundStyle(
                        count > 0 ? Color.brewAmber : Color(red: 0.70, green: 0.67, blue: 0.62)
                    )
                    .contentTransition(.numericText())

                Text(count == 0 ? "all fresh ✓" : count == 1 ? "update ready" : "updates ready")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(Color(red: 0.42, green: 0.39, blue: 0.35))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }

    private var obList: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 4) {
                ForEach(packages) { pkg in
                    HStack(spacing: 10) {
                        Ellipse()
                            .fill(pkg.pinned ? Color.brewTeal : Color.brewAmber.opacity(0.55))
                            .frame(width: 5, height: 7)

                        Text(pkg.name)
                            .font(.system(size: 12, weight: .regular, design: .rounded))
                            .foregroundStyle(Color(red: 0.22, green: 0.20, blue: 0.17))

                        if pkg.pinned {
                            Text("pinned")
                                .font(.system(size: 7.5, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color.brewTeal)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.brewTeal.opacity(0.12), in: Capsule())
                        }

                        Spacer()

                        HStack(spacing: 3) {
                            Text(pkg.installed)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(Color(red: 0.55, green: 0.52, blue: 0.48))
                            Image(systemName: "arrow.right")
                                .font(.system(size: 7))
                                .foregroundStyle(Color(red: 0.55, green: 0.52, blue: 0.48))
                            Text(pkg.available)
                                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                                .foregroundStyle(Color.brewAmber)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.40), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 10)
                }

                if !cves.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(cves) { cve in
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(cve.dot)
                                    .frame(width: 6, height: 6)
                                Text(cve.pkg)
                                    .font(.system(size: 9, design: .rounded))
                                    .foregroundStyle(Color(red: 0.36, green: 0.33, blue: 0.29))
                            }
                        }
                        Spacer()
                        Text("vulnerabilities")
                            .font(.system(size: 8, design: .rounded))
                            .foregroundStyle(Color.brewRose.opacity(0.65))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.brewRose.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 10)
                }
            }
        }
        .frame(maxHeight: 192)
    }

    private var obFooter: some View {
        HStack {
            HStack(spacing: 5) {
                Image(systemName: "terminal")
                    .font(.system(size: 10))
                Text("Open Brew-TUI")
                    .font(.system(size: 10, design: .rounded))
            }
            .foregroundStyle(Color.brewTeal)

            Spacer()

            HStack(spacing: 14) {
                Image(systemName: "gear")
                    .font(.system(size: 12))
                    .foregroundStyle(Color(red: 0.42, green: 0.40, blue: 0.36))
                Image(systemName: "power")
                    .font(.system(size: 12))
                    .foregroundStyle(Color(red: 0.42, green: 0.40, blue: 0.36))
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
    }
}

// MARK: ─────────────────────────────────────────────────────────────
// VARIANT 3 · Chiaroscuro Stage
// Caravaggio dramatic light × Kubrick one-point perspective
// Theater of data. Perfect bilateral symmetry. Light from above.
// ─────────────────────────────────────────────────────────────────

struct VariantChiaroscuroStage: View {
    fileprivate var packages: [MockPackage] = Mock.pkgs
    fileprivate var cves: [MockCVE]         = Mock.cves
    var isLoading: Bool         = false

    private var count: Int    { packages.count }
    private let warmGold = Color(red: 1.0, green: 0.83, blue: 0.46)

    var body: some View {
        ZStack {
            Color(red: 0.06, green: 0.05, blue: 0.04).ignoresSafeArea()

            // Caravaggio: single radial source from top-center
            RadialGradient(
                colors: [warmGold.opacity(0.07), .clear],
                center: .init(x: 0.5, y: 0.0),
                startRadius: 0,
                endRadius: 300
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                csTop
                csCounter
                csPackages
                Spacer(minLength: 0)
                csIcons
            }
        }
        .frame(width: 340, height: 420)
        .colorScheme(.dark)
    }

    private var csTop: some View {
        HStack {
            Spacer()
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.55)
                        .tint(warmGold.opacity(0.35))
                        .frame(width: 16, height: 16)
                }
                Image(systemName: "mug.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(warmGold)
            }
            Spacer()
        }
        .padding(.top, 18)
    }

    private var csCounter: some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.system(size: 70, weight: .ultraLight, design: .serif))
                .foregroundStyle(count > 0 ? warmGold : Color.white.opacity(0.05))
                .shadow(color: count > 0 ? warmGold.opacity(0.22) : .clear, radius: 18)
                .contentTransition(.numericText())

            Text(count == 0
                 ? "— everything is current —"
                 : count == 1 ? "— one package behind —"
                 : "— \(count) packages behind —")
                .font(.system(size: 8.5, weight: .ultraLight))
                .kerning(2.5)
                .foregroundStyle(.white.opacity(0.20))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 10)
        .padding(.bottom, 22)
    }

    private var csPackages: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                ForEach(Array(packages.enumerated()), id: \.element.id) { idx, pkg in
                    let fade = max(0.22, 1.0 - Double(idx) * 0.14)
                    HStack(spacing: 10) {
                        Text(pkg.installed)
                            .font(.system(size: 9.5, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.16 * fade))
                            .frame(width: 65, alignment: .trailing)

                        Image(systemName: "chevron.right")
                            .font(.system(size: 7))
                            .foregroundStyle(warmGold.opacity(0.22 * fade))

                        Text(pkg.name)
                            .font(.system(size: 11.5, weight: .light))
                            .foregroundStyle(.white.opacity(0.68 * fade))
                            .frame(minWidth: 90, alignment: .leading)

                        Text(pkg.available)
                            .font(.system(size: 9.5, design: .monospaced))
                            .foregroundStyle(warmGold.opacity(0.52 * fade))
                            .frame(width: 56, alignment: .leading)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)

                    if idx < packages.count - 1 {
                        Rectangle()
                            .frame(width: 48, height: 0.5)
                            .foregroundStyle(.white.opacity(0.05))
                    }
                }

                if !cves.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(cves) { cve in
                            HStack(spacing: 3) {
                                Circle()
                                    .fill(cve.dot)
                                    .frame(width: 5, height: 5)
                                    .shadow(color: cve.dot.opacity(0.9), radius: 4)
                                Text(cve.pkg)
                                    .font(.system(size: 9))
                                    .foregroundStyle(.white.opacity(0.26))
                            }
                        }
                    }
                    .padding(.top, 12)
                }
            }
        }
        .frame(maxHeight: 212)
    }

    private var csIcons: some View {
        HStack(spacing: 30) {
            Spacer()
            csIconCell("terminal", label: "TUI")
            csIconCell("gear",     label: "Settings")
            csIconCell("power",    label: "Quit")
            Spacer()
        }
        .padding(.bottom, 18)
        .padding(.top, 10)
    }

    private func csIconCell(_ icon: String, label: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .ultraLight))
                .foregroundStyle(.white.opacity(0.26))
            Text(label)
                .font(.system(size: 7, weight: .light))
                .kerning(1.5)
                .foregroundStyle(.white.opacity(0.13))
                .textCase(.uppercase)
        }
    }
}

// MARK: ─────────────────────────────────────────────────────────────
// VARIANT 4 · Grid Constructivist
// Mondrian neoplasticism × Bauhaus system
// Bold rules. Primary color zones. Honest grid. No radius.
// ─────────────────────────────────────────────────────────────────

struct VariantGridConstructivist: View {
    fileprivate var packages: [MockPackage] = Mock.pkgs
    fileprivate var cves: [MockCVE]         = Mock.cves
    var isLoading: Bool         = false

    private var count: Int        { packages.count }
    private let ruleColor = Color(red: 0.12, green: 0.10, blue: 0.08)
    private let accentCycle: [Color] = [.mondRed, .mondBlue, .mondYellow]

    var body: some View {
        VStack(spacing: 0) {
            gcHeader
            gcColumnRow
            Rectangle().frame(height: 2).foregroundStyle(ruleColor)
            gcList
            Spacer(minLength: 0)
            Rectangle().frame(height: 2).foregroundStyle(ruleColor)
            gcFooter
        }
        .frame(width: 340, height: 420)
        .background(Color(red: 0.96, green: 0.94, blue: 0.90))
        .colorScheme(.light)
    }

    private var gcHeader: some View {
        ZStack {
            Color.mondRed
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("BREW")
                        .font(.system(size: 22, weight: .black, design: .monospaced))
                        .foregroundStyle(.white)
                        .kerning(-0.5)
                    Text("MONITOR")
                        .font(.system(size: 7.5, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.44))
                        .kerning(3)
                }
                Spacer()
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.6)
                        .tint(.white)
                        .frame(width: 20, height: 20)
                        .padding(.trailing, 10)
                }
                // Mondrian yellow badge — touches the right edge
                ZStack {
                    Color.mondYellow.frame(width: 60, height: 70)
                    VStack(spacing: -1) {
                        Text("\(count)")
                            .font(.system(size: 30, weight: .black, design: .monospaced))
                            .foregroundStyle(Color.mondRed)
                        Text("PKG")
                            .font(.system(size: 6, weight: .heavy, design: .monospaced))
                            .foregroundStyle(Color.mondRed.opacity(0.52))
                    }
                }
            }
            .padding(.leading, 16)
        }
        .frame(height: 70)
    }

    private var gcColumnRow: some View {
        HStack {
            Text("PACKAGE")
                .font(.system(size: 7, weight: .heavy, design: .monospaced))
                .kerning(2)
                .foregroundStyle(Color(red: 0.32, green: 0.30, blue: 0.27))
                .padding(.leading, 14)
            Spacer()
            Text("AVAILABLE")
                .font(.system(size: 7, weight: .heavy, design: .monospaced))
                .kerning(2)
                .foregroundStyle(Color(red: 0.32, green: 0.30, blue: 0.27))
                .padding(.trailing, 14)
        }
        .padding(.vertical, 6)
        .background(Color(red: 0.89, green: 0.87, blue: 0.83))
    }

    private var gcList: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(Array(packages.enumerated()), id: \.element.id) { idx, pkg in
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(accentCycle[idx % accentCycle.count])
                            .frame(width: 5)

                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(pkg.name)
                                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(Color(red: 0.10, green: 0.08, blue: 0.06))
                                Text(pkg.installed)
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundStyle(Color(red: 0.46, green: 0.44, blue: 0.41))
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 1) {
                                Text(pkg.available)
                                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                                    .foregroundStyle(Color(red: 0.10, green: 0.08, blue: 0.06))
                                if pkg.pinned {
                                    Text("PINNED")
                                        .font(.system(size: 6.5, weight: .heavy, design: .monospaced))
                                        .foregroundStyle(Color.mondBlue)
                                }
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 10)
                    }
                    Rectangle()
                        .frame(height: 1)
                        .foregroundStyle(ruleColor.opacity(0.10))
                }

                if !cves.isEmpty {
                    HStack(spacing: 0) {
                        Rectangle().fill(Color.mondBlue).frame(width: 5)
                        HStack(spacing: 8) {
                            Image(systemName: "shield.fill")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(Color.mondBlue)
                            Text("\(cves.count) VULNERABILITIES")
                                .font(.system(size: 9, weight: .heavy, design: .monospaced))
                                .foregroundStyle(Color.mondBlue)
                            Spacer()
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 10)
                    }
                    .background(Color.mondBlue.opacity(0.06))
                }
            }
        }
        .frame(maxHeight: 268)
    }

    private var gcFooter: some View {
        ZStack {
            Color.mondBlue
            HStack {
                HStack(spacing: 5) {
                    Image(systemName: "terminal")
                        .font(.system(size: 10, weight: .bold))
                    Text("OPEN TUI")
                        .font(.system(size: 8, weight: .heavy, design: .monospaced))
                        .kerning(1)
                }
                .foregroundStyle(.white)

                Spacer()

                HStack(spacing: 16) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.52))
                    Image(systemName: "gear")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.52))
                    Image(systemName: "power")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.52))
                }
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 46)
    }
}

// MARK: ─────────────────────────────────────────────────────────────
// VARIANT 5 · Aura Glass
// Vasarely optical field × Kengo Kuma material transparency
// Mesh gradient universe. Each card is a glass membrane.
// ─────────────────────────────────────────────────────────────────

struct VariantAuraGlass: View {
    fileprivate var packages: [MockPackage] = Mock.pkgs
    fileprivate var cves: [MockCVE]         = Mock.cves
    var isLoading: Bool         = false

    private var count: Int { packages.count }

    var body: some View {
        ZStack {
            agMesh
            VStack(spacing: 8) {
                agHeader
                agCounter
                agList
                Spacer(minLength: 0)
                agFooter
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 14)
        }
        .frame(width: 340, height: 420)
        .colorScheme(.dark)
    }

    // Vasarely-inspired overlapping radial color fields
    private var agMesh: some View {
        ZStack {
            Color(red: 0.05, green: 0.04, blue: 0.16).ignoresSafeArea()
            RadialGradient(
                colors: [Color.meshPurple.opacity(0.52), .clear],
                center: .init(x: 0.18, y: 0.22),
                startRadius: 0, endRadius: 200
            )
            RadialGradient(
                colors: [Color.meshTeal.opacity(0.36), .clear],
                center: .init(x: 0.88, y: 0.78),
                startRadius: 0, endRadius: 180
            )
            RadialGradient(
                colors: [Color(red: 0.60, green: 0.10, blue: 0.72).opacity(0.26), .clear],
                center: .init(x: 0.82, y: 0.14),
                startRadius: 0, endRadius: 150
            )
        }
    }

    private var agHeader: some View {
        HStack {
            HStack(spacing: 7) {
                Image(systemName: "mug.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.62))
                Text("Brew-TUI-Bar")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.80))
            }
            Spacer()
            if isLoading {
                ProgressView()
                    .scaleEffect(0.55)
                    .tint(.white.opacity(0.48))
                    .frame(width: 18, height: 18)
            }
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.36))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.09), lineWidth: 0.5))
    }

    private var agCounter: some View {
        ZStack {
            // Aura glow field behind the number
            if count > 0 {
                Circle()
                    .fill(Color.meshPurple.opacity(0.42))
                    .frame(width: 112, height: 112)
                    .blur(radius: 32)
            }

            VStack(spacing: 2) {
                Text("\(count)")
                    .font(.system(size: 62, weight: .thin))
                    .foregroundStyle(
                        LinearGradient(
                            colors: count > 0
                                ? [.white, Color(red: 0.72, green: 0.60, blue: 1.0)]
                                : [.white.opacity(0.12), .white.opacity(0.06)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .contentTransition(.numericText())

                Text(count == 0
                     ? "up to date"
                     : count == 1 ? "update available"
                     : "updates available")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.white.opacity(0.36))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
    }

    private var agList: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 5) {
                ForEach(packages) { pkg in
                    HStack(spacing: 0) {
                        // Vasarely chromatic stripe
                        LinearGradient(
                            colors: [Color.meshPurple, Color.meshTeal],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(width: 3)
                        .clipShape(RoundedRectangle(cornerRadius: 1.5))

                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pkg.name)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.80))
                                HStack(spacing: 4) {
                                    Text(pkg.installed)
                                        .font(.system(size: 9, design: .monospaced))
                                        .foregroundStyle(.white.opacity(0.28))
                                    Image(systemName: "arrow.right")
                                        .font(.system(size: 7))
                                        .foregroundStyle(.white.opacity(0.20))
                                    Text(pkg.available)
                                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                                        .foregroundStyle(Color(red: 0.72, green: 0.60, blue: 1.0).opacity(0.82))
                                }
                            }
                            Spacer()
                            if pkg.pinned {
                                Image(systemName: "pin.fill")
                                    .font(.system(size: 9))
                                    .foregroundStyle(.white.opacity(0.26))
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                    }
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.white.opacity(0.07), lineWidth: 0.5))
                }

                if !cves.isEmpty {
                    HStack(spacing: 0) {
                        LinearGradient(
                            colors: [.red, Color(red: 1, green: 0.30, blue: 0)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(width: 3)
                        .clipShape(RoundedRectangle(cornerRadius: 1.5))

                        HStack(spacing: 7) {
                            Image(systemName: "shield.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(.red.opacity(0.72))
                            Text("\(cves.count) security alert\(cves.count == 1 ? "" : "s")")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white.opacity(0.65))
                            Spacer()
                            ForEach(cves.prefix(3)) { cve in
                                Circle()
                                    .fill(cve.dot)
                                    .frame(width: 6, height: 6)
                                    .shadow(color: cve.dot, radius: 3)
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 9)
                    }
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.red.opacity(0.16), lineWidth: 0.5))
                }
            }
        }
        .frame(maxHeight: 195)
    }

    private var agFooter: some View {
        HStack {
            HStack(spacing: 5) {
                Image(systemName: "terminal").font(.system(size: 10))
                Text("Brew-TUI").font(.system(size: 10, weight: .medium))
            }
            .foregroundStyle(.white.opacity(0.52))

            Spacer()

            HStack(spacing: 14) {
                Image(systemName: "gear")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.34))
                Image(systemName: "power")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.34))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08), lineWidth: 0.5))
    }
}

// MARK: - Previews

#Preview("V1 · Void Terminal")        { VariantVoidTerminal() }
#Preview("V1 · Void Terminal — empty") { VariantVoidTerminal(packages: [], cves: []) }

#Preview("V2 · Organic Bloom")         { VariantOrganicBloom() }
#Preview("V2 · Organic Bloom — empty") { VariantOrganicBloom(packages: [], cves: []) }

#Preview("V3 · Chiaroscuro Stage")         { VariantChiaroscuroStage() }
#Preview("V3 · Chiaroscuro Stage — empty") { VariantChiaroscuroStage(packages: [], cves: []) }
#Preview("V3 · Chiaroscuro Stage — loading") {
    VariantChiaroscuroStage(isLoading: true)
}

#Preview("V4 · Grid Constructivist")         { VariantGridConstructivist() }
#Preview("V4 · Grid Constructivist — loading") {
    VariantGridConstructivist(isLoading: true)
}

#Preview("V5 · Aura Glass")         { VariantAuraGlass() }
#Preview("V5 · Aura Glass — empty") { VariantAuraGlass(packages: [], cves: []) }
#endif
