import Testing
import SwiftUI
import AppKit
import Foundation
@testable import Brew_TUI_Bar

// MARK: - Screenshot generation suite (on-demand)
//
// Renders the redesigned PopoverView / InstallProgressView / Free funnel via
// NSHostingController into a real NSWindow so .ultraThinMaterial composes
// correctly, then writes PNGs to /tmp/brew-tui-bar-screenshots/.
//
// Tagged `.screenshots` so the regular test runs do NOT execute it — opt in
// with `-only-testing:Brew-TUI-BarTests/Screenshot\\ generation` or set the
// `RUN_SCREENSHOTS=1` environment variable.

extension Tag {
    @Tag static var screenshots: Self
}

@Suite(
    "Screenshot generation",
    .tags(.screenshots),
    .enabled(if: ProcessInfo.processInfo.environment["RUN_SCREENSHOTS"] == "1")
)
@MainActor
struct ScreenshotTests {
    private static let outputDir = "/tmp/brew-tui-bar-screenshots"

    static func makeDir() {
        try? FileManager.default.createDirectory(
            atPath: outputDir,
            withIntermediateDirectories: true
        )
    }

    /// Renders `view` at `size` into a borderless `NSWindow` (so materials
    /// composite against an actual backing store), waits for layout, then
    /// writes a PNG snapshot to `path`.
    @MainActor
    static func snapshot<V: View>(_ view: V, size: CGSize, to path: String) throws {
        // Wrap in an opaque dark backdrop layer so the offscreen bitmap cache
        // composites correctly. `.preferredColorScheme(.dark)` flips the
        // SwiftUI environment so text-hierarchy / system colors resolve as
        // the running app would in a popover (which is dark by default).
        let wrapper = ZStack {
            Color(red: 0.06, green: 0.07, blue: 0.10)
                .ignoresSafeArea()
            view
        }
        .preferredColorScheme(.dark)

        let host = NSHostingController(rootView: wrapper)
        let frame = NSRect(origin: .zero, size: size)
        host.view.frame = frame
        host.view.appearance = NSAppearance(named: .darkAqua)

        // Real NSWindow backing — required for .ultraThinMaterial / blur.
        let window = NSWindow(
            contentRect: frame,
            styleMask: [.borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.appearance = NSAppearance(named: .darkAqua)
        window.isOpaque = true
        window.backgroundColor = NSColor(red: 0.06, green: 0.07, blue: 0.10, alpha: 1.0)
        window.contentView = host.view
        window.orderFrontRegardless()

        // Force layout + a few runloop turns so SwiftUI publishes & materials
        // resolve. Without these spins the snapshot can land mid-transition.
        host.view.layoutSubtreeIfNeeded()
        for _ in 0..<5 {
            RunLoop.current.run(until: Date().addingTimeInterval(0.04))
        }

        guard let rep = host.view.bitmapImageRepForCachingDisplay(in: host.view.bounds) else {
            throw NSError(domain: "snapshot", code: 1, userInfo: [NSLocalizedDescriptionKey: "no bitmap rep"])
        }
        rep.size = host.view.bounds.size
        host.view.cacheDisplay(in: host.view.bounds, to: rep)

        guard let data = rep.representation(using: .png, properties: [:]) else {
            throw NSError(domain: "snapshot", code: 2, userInfo: [NSLocalizedDescriptionKey: "PNG encode failed"])
        }
        try data.write(to: URL(fileURLWithPath: path))

        window.orderOut(nil)
    }

    private static let popoverSize = CGSize(width: 340, height: 480)
    private static let modalSize = CGSize(width: 380, height: 460)

    @Test func popoverOutdatedList() throws {
        Self.makeDir()
        let state = PreviewData.makeAppState()
        let view = PopoverView(
            appState: state,
            scheduler: PreviewData.makeScheduler(),
            badgePreferences: BadgePreferences()
        )
        try Self.snapshot(view, size: Self.popoverSize, to: "\(Self.outputDir)/01-popover-outdated.png")
    }

    @Test func popoverUpToDate() throws {
        Self.makeDir()
        let state = PreviewData.makeAppState(packages: [])
        let view = PopoverView(
            appState: state,
            scheduler: PreviewData.makeScheduler(),
            badgePreferences: BadgePreferences()
        )
        try Self.snapshot(view, size: Self.popoverSize, to: "\(Self.outputDir)/02-popover-uptodate.png")
    }

    @Test func popoverFreeFunnel() throws {
        Self.makeDir()
        let state = PreviewData.makeAppStateFreeTier()
        let view = PopoverView(
            appState: state,
            scheduler: PreviewData.makeScheduler(),
            badgePreferences: BadgePreferences()
        )
        try Self.snapshot(view, size: Self.popoverSize, to: "\(Self.outputDir)/03-popover-free-funnel.png")
    }

    @Test func installProgressMidRun() throws {
        Self.makeDir()
        var prog = InstallProgress(mode: .all, seeds: ["git", "node", "wget", "ffmpeg"])
        prog.mark("git", stage: .done)
        prog.mark("node", stage: .fetching)
        let view = InstallProgressView(
            progress: prog,
            onClose: {},
            onCancel: {}
        )
        try Self.snapshot(view, size: Self.modalSize, to: "\(Self.outputDir)/04-install-progress.png")
    }

    @Test func installProgressFinished() throws {
        Self.makeDir()
        var prog = InstallProgress(mode: .singlePackage("git"), seeds: ["git"])
        prog.finishSuccess()
        let view = InstallProgressView(
            progress: prog,
            onClose: {}
        )
        try Self.snapshot(view, size: Self.modalSize, to: "\(Self.outputDir)/05-install-progress-done.png")
    }

    @Test func installProgressFailed() throws {
        Self.makeDir()
        var prog = InstallProgress(mode: .singlePackage("ffmpeg"), seeds: ["ffmpeg"])
        prog.finishFailure("brew exited with code 1")
        let view = InstallProgressView(
            progress: prog,
            onClose: {}
        )
        try Self.snapshot(view, size: Self.modalSize, to: "\(Self.outputDir)/06-install-progress-failed.png")
    }
}
