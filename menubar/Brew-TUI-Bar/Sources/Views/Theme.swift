import SwiftUI

/// Centralised colour tokens for Brew-TUI-Bar. Each token resolves to a different
/// hue when "Increase Contrast" is on (DS-002), so views never have to spell
/// out the high-contrast variant locally.
enum BrewTUIBarTheme {
    /// Installed (older) version — warning hue.
    static func installedVersion(highContrast: Bool) -> Color {
        highContrast ? Color(red: 0.8, green: 0.4, blue: 0) : .orange
    }

    /// Current (latest) version — informational hue.
    static func currentVersion(highContrast: Bool) -> Color {
        highContrast ? Color(red: 0, green: 0.5, blue: 0.7) : .cyan
    }

    /// Generic warning surface (sync banner, etc.).
    static func warning(highContrast: Bool) -> Color {
        highContrast ? Color(red: 0.7, green: 0.5, blue: 0) : .yellow
    }

    /// Critical alerts (CVE counts, errors).
    static func critical(highContrast: Bool) -> Color {
        highContrast ? Color(red: 0.7, green: 0, blue: 0) : .red
    }

    /// Brand accent for outdated counts and upgrade prompts.
    static func accent(highContrast: Bool) -> Color {
        highContrast ? Color(red: 0.7, green: 0.35, blue: 0) : .orange
    }
}
