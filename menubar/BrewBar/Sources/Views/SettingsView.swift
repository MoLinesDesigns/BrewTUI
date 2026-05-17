import SwiftUI
import ServiceManagement
import AppKit

struct SettingsView: View {
    private static let isRunningForPreviews = ProcessInfo.processInfo.environment["XCODE_RUNNING_FOR_PREVIEWS"] == "1"

    // Cross-platform funnel: same URL the popover footer uses for `Renew Pro`.
    private static let manageSubscriptionURL = URL(string: "https://buy.polar.sh/polar_cl_yQsiUeDelyyEQznbWffD1j77JAyP24ra7iEVQ22PA4h")!

    let scheduler: SchedulerService
    let appState: AppState
    let badgePreferences: BadgePreferences

    @State private var launchAtLogin: Bool
    @State private var loginError: String?
    @State private var revalidationError: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    init(
        scheduler: SchedulerService,
        appState: AppState,
        badgePreferences: BadgePreferences,
        launchAtLogin: Bool? = nil
    ) {
        self.scheduler = scheduler
        self.appState = appState
        self.badgePreferences = badgePreferences
        let resolvedLaunchAtLogin = launchAtLogin ?? (Self.isRunningForPreviews ? false : SMAppService.mainApp.status == .enabled)
        _launchAtLogin = State(initialValue: resolvedLaunchAtLogin)
    }

    var body: some View {
        VStack(spacing: 12) {
            Text("BrewBar Settings")
                .font(.headline)
                .fontWeight(legibilityWeight == .bold ? .bold : .semibold)
                .accessibilityAddTraits(.isHeader)

            ScrollView {
                Form {
                    generalSection
                    notificationsSection
                    menuBarSection
                    licenseSection
                    advancedSection
                }
                .formStyle(.grouped)
            }

            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal)
            .padding(.bottom, 12)
        }
        .alert(String(localized: "Login Item Error"), isPresented: Binding(
            get: { loginError != nil },
            set: { if !$0 { loginError = nil } }
        )) {
            Button(String(localized: "OK")) { loginError = nil }
        } message: {
            Text(loginError ?? "")
        }
        .alert(String(localized: "Revalidation Error"), isPresented: Binding(
            get: { revalidationError != nil },
            set: { if !$0 { revalidationError = nil } }
        )) {
            Button(String(localized: "OK")) { revalidationError = nil }
        } message: {
            Text(revalidationError ?? "")
        }
        .frame(width: 360, height: 540)
        .task {
            await scheduler.syncNotificationPermission()
        }
    }

    // MARK: - Sections

    private var generalSection: some View {
        Section(String(localized: "General")) {
            Picker("Check interval", selection: Binding(
                get: { scheduler.interval },
                set: { scheduler.interval = $0 }
            )) {
                ForEach(SchedulerService.Interval.allCases, id: \.self) { interval in
                    Text(interval.label).tag(interval)
                }
            }

            Toggle("Launch at login", isOn: $launchAtLogin)
                .accessibilityLabel(String(localized: "Launch at login"))
                .onChange(of: launchAtLogin) { _, newValue in
                    guard !Self.isRunningForPreviews else { return }
                    do {
                        if newValue {
                            try SMAppService.mainApp.register()
                        } else {
                            try SMAppService.mainApp.unregister()
                        }
                    } catch {
                        loginError = error.localizedDescription
                        launchAtLogin = !newValue
                    }
                }
        }
    }

    private var notificationsSection: some View {
        Section(String(localized: "Notifications")) {
            Toggle("Notifications", isOn: Binding(
                get: { scheduler.notificationsEnabled },
                set: { newValue in
                    scheduler.notificationsEnabled = newValue
                    if newValue {
                        Task { await scheduler.syncNotificationPermission() }
                    }
                }
            ))
            .disabled(scheduler.notificationsDenied)
            .accessibilityLabel(String(localized: "Notifications"))

            if scheduler.notificationsDenied {
                Text("Notifications are disabled in System Settings. Enable them in System Settings > Notifications > BrewBar.")
                    .font(.caption)
                    .foregroundStyle(BrewBarTheme.accent(highContrast: colorSchemeContrast == .increased))
            }
        }
    }

    private var menuBarSection: some View {
        Section(String(localized: "Menu Bar Badges")) {
            Toggle("Show outdated count", isOn: Binding(
                get: { badgePreferences.showOutdated },
                set: { badgePreferences.showOutdated = $0 }
            ))
            .accessibilityLabel(String(localized: "Show outdated count"))

            Toggle("Show CVE alerts", isOn: Binding(
                get: { badgePreferences.showCVE },
                set: { badgePreferences.showCVE = $0 }
            ))
            .accessibilityLabel(String(localized: "Show CVE alerts"))

            Toggle("Show sync indicator", isOn: Binding(
                get: { badgePreferences.showSync },
                set: { badgePreferences.showSync = $0 }
            ))
            .accessibilityLabel(String(localized: "Show sync indicator"))

            Text("Toggle the icons that appear next to BrewBar's menu bar icon.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var licenseSection: some View {
        Section(String(localized: "License")) {
            if let summary = appState.licenseSummary {
                LabeledContent(String(localized: "Tier"), value: summary.tierLabel)
                if let email = summary.email, !email.isEmpty {
                    LabeledContent(String(localized: "Email"), value: email)
                }
                if let plan = summary.plan, !plan.isEmpty {
                    LabeledContent(String(localized: "Plan"), value: plan)
                }
                if let validated = summary.lastValidatedAt {
                    LabeledContent(
                        String(localized: "Last validated"),
                        value: validated.formatted(.relative(presentation: .named))
                    )
                }
                if let expires = summary.expiresAt {
                    LabeledContent(
                        String(localized: "Expires"),
                        value: expires.formatted(date: .abbreviated, time: .omitted)
                    )
                }
            } else {
                Text("No license loaded")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button {
                    runRevalidate()
                } label: {
                    Label(String(localized: "Revalidate license"), systemImage: "arrow.triangle.2.circlepath")
                }
                Button {
                    NSWorkspace.shared.open(Self.manageSubscriptionURL)
                } label: {
                    Label(String(localized: "Manage subscription"), systemImage: "creditcard")
                }
            }
        }
    }

    private var advancedSection: some View {
        Section(String(localized: "Advanced")) {
            LabeledContent(String(localized: "BrewBar version"), value: bundleVersion)
            if let cli = appState.brewTuiCliVersion {
                LabeledContent(String(localized: "Brew-TUI CLI"), value: cli)
            }
            HStack {
                Button {
                    openDataDirectory()
                } label: {
                    Label(String(localized: "Open data folder"), systemImage: "folder")
                }
                Button {
                    openLogs()
                } label: {
                    Label(String(localized: "View logs"), systemImage: "doc.text.magnifyingglass")
                }
            }
        }
    }

    // MARK: - Actions

    private var bundleVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
    }

    private func runRevalidate() {
        // Same pattern PopoverView uses for `Open Brew-TUI`: drop a one-shot
        // .command script and hand it to NSWorkspace so the user's default
        // terminal launches `brew-tui revalidate`. We don't shell out
        // in-process — BrewBar is sandbox-adjacent and we'd lose the user's
        // shell config + interactive prompts.
        do {
            let tempDir = FileManager.default.temporaryDirectory
                .appendingPathComponent("brew-tui-revalidate", isDirectory: true)
            try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
            let scriptURL = tempDir.appendingPathComponent("brew-tui-revalidate.command")
            let script = """
            #!/bin/zsh
            exec brew-tui revalidate
            """
            try script.write(to: scriptURL, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o755],
                ofItemAtPath: scriptURL.path
            )
            if !NSWorkspace.shared.open(scriptURL) {
                revalidationError = String(localized: "Could not launch terminal for revalidation.")
            }
        } catch {
            revalidationError = error.localizedDescription
        }
    }

    private func openDataDirectory() {
        let path = NSHomeDirectory() + "/.brew-tui"
        let url = URL(fileURLWithPath: path)
        if FileManager.default.fileExists(atPath: path) {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } else {
            NSWorkspace.shared.open(URL(fileURLWithPath: NSHomeDirectory()))
        }
    }

    private func openLogs() {
        // Console.app filtered for BrewBar's subsystem. NSWorkspace cannot pass
        // a predicate to Console, so we open the app and rely on the user to
        // search for "BrewBar". The bundle id is stable.
        let consoleURL = URL(fileURLWithPath: "/System/Applications/Utilities/Console.app")
        NSWorkspace.shared.open(consoleURL)
    }
}

// MARK: - Previews

#Preview("Settings") {
    SettingsView(
        scheduler: PreviewData.makeScheduler(),
        appState: PreviewData.makeAppState(),
        badgePreferences: BadgePreferences(),
        launchAtLogin: false
    )
}

#Preview("Spanish") {
    SettingsView(
        scheduler: PreviewData.makeScheduler(),
        appState: PreviewData.makeAppState(),
        badgePreferences: BadgePreferences(),
        launchAtLogin: false
    )
    .environment(\.locale, Locale(identifier: "es"))
}
