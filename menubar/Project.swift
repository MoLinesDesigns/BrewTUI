import ProjectDescription
import Foundation

// Single source of truth: the marketing version comes from ../package.json so
// Brew-TUI (TS) and BrewBar (Swift) cannot drift. Override at build time with
// `MARKETING_VERSION=x.y.z tuist generate` if you ever need to detach them.
//
// Tuist evaluates this manifest from a temp directory, so `#filePath` is not
// reliable — instead resolve relative to the current working directory, which
// Tuist sets to the manifest's containing folder (menubar/).
private func readMarketingVersion() -> String {
    let cwd = FileManager.default.currentDirectoryPath
    let url = URL(fileURLWithPath: cwd)
        .deletingLastPathComponent() // repo root
        .appendingPathComponent("package.json")
    guard let data = try? Data(contentsOf: url),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let version = json["version"] as? String,
          !version.isEmpty
    else {
        // Fail loud at generate-time rather than silently shipping a wrong version.
        fatalError("Project.swift: could not read \"version\" from package.json at \(url.path)")
    }
    return version
}

private let marketingVersion = readMarketingVersion()

let project = Project(
    name: "BrewBar",
    options: .options(
        defaultKnownRegions: ["en", "es"],
        developmentRegion: "en"
    ),
    settings: .settings(
        base: [
            "SWIFT_VERSION": "6.0",
            "MACOSX_DEPLOYMENT_TARGET": "14.0",
            "MARKETING_VERSION": .string("$(MARKETING_VERSION:default=\(marketingVersion))"),
            "CURRENT_PROJECT_VERSION": "1",
            "DEAD_CODE_STRIPPING": "YES",
            "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
            "STRING_CATALOG_GENERATE_SYMBOLS": "NO",
            "ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS": "YES",
            "SWIFT_STRICT_CONCURRENCY": "complete",
        ],
        configurations: [
            .debug(name: "Debug"),
            .release(name: "Release"),
        ]
    ),
    targets: [
        .target(
            name: "BrewBar",
            destinations: .macOS,
            product: .app,
            bundleId: "com.molinesdesigns.brewbar",
            deploymentTargets: .macOS("14.0"),
            infoPlist: .extendingDefault(with: [
                "LSUIElement": true,
                "LSApplicationCategoryType": "public.app-category.developer-tools",
                "NSMainStoryboardFile": "",
                "CFBundleDisplayName": "BrewBar",
                "CFBundleDevelopmentRegion": "en",
                "CFBundleShortVersionString": "$(MARKETING_VERSION)",
                "CFBundleVersion": "$(CURRENT_PROJECT_VERSION)",
                "NSHumanReadableCopyright": "MoLines Designs",
            ]),
            sources: ["BrewBar/Sources/**"],
            resources: ["BrewBar/Resources/**"],
            settings: .settings(
                base: [
                    "DEVELOPMENT_TEAM": "GD6M44DYPQ",
                    "CODE_SIGN_STYLE": "Manual",
                    "CODE_SIGN_IDENTITY": "Developer ID Application",
                    "ENABLE_HARDENED_RUNTIME": "YES",
                    "CODE_SIGN_INJECT_BASE_ENTITLEMENTS": "NO",
                    "OTHER_CODE_SIGN_FLAGS": "--timestamp",
                ],
                configurations: [
                    // Debug: relax signing so Xcode Preview JIT injection works.
                    // Hardened Runtime + Developer ID blocks the preview executor on Debug builds.
                    .debug(name: "Debug", settings: [
                        "CODE_SIGN_STYLE": "Automatic",
                        "CODE_SIGN_IDENTITY": "Apple Development",
                        "ENABLE_HARDENED_RUNTIME": "NO",
                        "CODE_SIGN_INJECT_BASE_ENTITLEMENTS": "YES",
                        "OTHER_CODE_SIGN_FLAGS": "",
                    ]),
                ]
            )
        ),
        .target(
            name: "BrewBarTests",
            destinations: .macOS,
            product: .unitTests,
            bundleId: "com.molinesdesigns.brewbar.tests",
            deploymentTargets: .macOS("14.0"),
            sources: ["BrewBarTests/Sources/**"],
            dependencies: [.target(name: "BrewBar")]
        ),
    ]
)
