# Changelog

## [1.2.2] - 2026-05-21

### Security
- **Flag injection prevention** in `compliance-remediator`,
  `brewfile-manager` and `rollback-engine`: package names are now validated
  via `validatePackageName` before being streamed to `brew` (SEG-001,
  SEG-002).
- **PII no longer logged** with `privacy: .public` in BrewBar's
  `LicenseChecker`. Email, license key and instance id pass through a
  `summarizeStatus` helper that redacts before reaching the unified log
  (SEG-003).
- **Path traversal hardening**: `assertSafePath` in `policy-io`, iCloud
  directories created with `mode 0o700`, and `BREW_BIN` resolved to its
  absolute path before exec (BK-005, BK-007, SEG-004).
- **`npm audit fix`**: zero vulnerabilities at publish time (SEG-005).
- `machineId` is hashed with SHA-256 before being sent to Polar (BK-009).

### Fixed
- **TUI ⇄ BrewBar IPC**: `writeLastAction` is now invoked after both
  install (`search.tsx`) and uninstall (`installed.tsx`); the menubar app
  no longer goes stale after a TUI operation (BK-001).
- **`SyncMonitor.getKnownMachineCount`** returns `-1` (unknown) instead
  of `0`. The `machines` field lives inside the encrypted envelope
  payload, so a `0` was misleading (BK-002).
- **HTTP resilience**: `promo.ts` uses `fetchWithRetry` and `429` with
  `Retry-After` is now honoured (BK-003, BK-004).
- **Polar endpoints** receive their trailing slash consistently (BK-008).
- **Account view**: the `team` tier is labelled and deactivable in
  `account.tsx`; `account_team` keys added in EN/ES (UI-001, UI-002).

### Performance
- **Granular selectors** in `services`, `doctor` and `outdated` views
  cut unnecessary re-renders (PERF-001).
- **5-minute TTL** added to `impactCache` to bound memory (ARQ-002).

### Quality
- `testTimeout` raised to 15s in `vitest.config` to unblock the pre-push
  gate under CPU contention with ~60 Ink suites (QA-001).
- `merge-union` removed from `ConflictResolution` (unimplemented branch,
  BK-006).
- `async-state.ts` dead module deleted (ARQ-006).
- `BlinkingText` respects `NO_COLOR` and `REDUCE_MOTION` (DS-001).
- `SettingsView.frame` gets `minHeight` for Dynamic Type at AX1+ (DS-002).
- `hint_rollback_executing_no_cancel` shown during the executing phase
  of a rollback (UX-001).
- `release.sh` runs a `notarytool history` preflight (REL-001).

### Governance
- `DesignExploration/` excluded from the notarised BrewBar binary
  (ARQ-005).
- `CODEOWNERS` set to `@MoLinesDesigns` (GOV-001).
- `.playwright-mcp/` removed from the index (198 files, GOV-002).
- Local `homebrew/` folder removed — the canonical tap at
  `MoLinesDesigns/homebrew-tap` is now the only source of truth
  (GOV-003, GOV-004).
- Tuist pinned to `4.39.0` in CI (GOV-005).

## [1.2.1] - 2026-05-18

### Fixed
- **`MaxListenersExceededWarning: 11 resize listeners`** when mounting
  Dashboard. The old `useTerminalSize` registered one `stdout.on('resize')`
  listener per React component call, and every `useContainerSize` /
  `useVisibleRows` transitively added another. With ~6 views, header, footer
  and ~4 StatCards mounting at once, Node's default 10-listener cap kicked
  in. Rewrote the hook around `useSyncExternalStore` with a per-stdout
  `WeakMap` cache: a single shared listener fans out to all subscribers.
  Regression test asserts exactly one listener regardless of component
  count.

## [1.2.0] - 2026-05-18

### Fixed
- **Responsive layout across the TUI**. Tables and rows that used to cut
  words mid-stride, overlap columns at narrow widths, or pad past the
  container have been migrated to the canonical flexbox+truncate pattern Ink
  documents:
  - `<Box width={n} flexShrink={1} minWidth={0}><Text wrap="truncate"|"truncate-middle">…</Text></Box>`.
  - `minWidth={0}` is the load-bearing CSS `min-width: 0` analogue that lets
    a flex item shrink below its content size; without it the cell refused to
    shrink and pushed siblings out of frame.
  - String-based layout (`truncate(name, w).padEnd(w)`) is gone from
    `installed`, `outdated`, `services`, `history`, and `search`. Yoga now
    does the column math.
  - Package names use `wrap="truncate-middle"` so `@version` / `::tap`
    suffixes survive truncation.
- **Services header/row alignment**: header padded to `svcNameWidth` while
  rows padded to `svcNameWidth - 2`, off by two characters at every width.
- **History action column**: the hardcoded `padEnd(12)` clipped Spanish
  labels like `desinstalación`. Now a fixed-width cell with truncate.

### Added
- **`BREAKPOINTS` and `getLayoutMode()`** in `src/utils/spacing.ts` (single
  source of truth for `single | compact | comfortable | wide` decisions).
  Used by `installed` and `services` to decide how many columns to render.
  Below `narrow` (50 cols) the views collapse to single-column rows.
- **`src/test/render-at.tsx`** test harness for responsive snapshots:
  exposes `stdoutHolder` and a `makeStdout` factory so individual tests can
  inject controlled terminal dimensions via the existing `vi.mock('ink')`
  pattern.
- **Responsive coverage for `<InstalledView>`** at 30 / 60 / 100 / 140
  columns: each test asserts which columns (name, version, description) are
  present at that mode.

## [1.1.0] - 2026-05-17

### Added
- **BrewBar popover footer** now shows `BrewBar v<version> · <tier>` so the
  user can see at a glance which version is installed and whether the active
  license is Pro or Basic.
- **BrewBar Settings panel** reorganised into five sections:
  - **General** — check interval, launch at login.
  - **Notifications** — toggle plus System Settings hint when denied.
  - **Menu Bar Badges** — independent toggles for the outdated counter, CVE
    alerts, and sync indicator next to the menu bar icon (`BadgePreferences`,
    persisted in UserDefaults, default on).
  - **License** — tier, email, plan, last validated, expiration, plus
    `Revalidate license` (spawns `brew-tui revalidate` in Terminal) and
    `Manage subscription` (opens Polar).
  - **Advanced** — `BrewBar version`, `Brew-TUI CLI` version, `Open data
    folder` (`~/.brew-tui/` in Finder), and `View logs` (Console.app).
- **`LicenseSummary` model** — flat, Sendable snapshot derived from
  `LicenseStatus` exposed on `AppState`. Built once at launch so the popover
  and Settings can read tier/email/plan/dates without re-decrypting
  `license.json`.

## [1.0.0] - 2026-05-17

### Added
- **Container-driven layouts.** New `ContentSizeContext` plus the
  `useVisibleRows` hook let views derive their visible row count from the real
  content container instead of the global terminal viewport, so each view
  paginates correctly when reparented or when the side menu is open. Applied
  to `installed.tsx`, `outdated.tsx`, `history.tsx`, `services.tsx`, and
  `search.tsx`.

### Changed
- **Search view layout** rewritten around the new container size so result
  columns and pagination match the actual panel width, not the raw terminal
  width.
- **BrewBar Info.plist** declares `LSApplicationCategoryType =
  public.app-category.developer-tools` (set in `menubar/Project.swift`), so
  Xcode's "No App Category" archive warning no longer fires.

### Removed
- **`scripts/publish-all.sh`** — pointed at the old `MoLinesGitHub` org, tried
  to publish to JSR (channel removed in 0.9.2) and referenced a non-existent
  GitHub Action. The canonical pipeline lives in `CLAUDE.md` Publishing and
  in the `release_pipeline.md` auto-memory.
- **`jsr.json`** — JSR has not been published since 0.6.2 and CI does not
  reference it; the file was misleading metadata, not a release target.

### Docs
- **`CLAUDE.md` Publishing section** pins the canonical tap
  (`MoLinesDesigns/homebrew-tap`) and explains the GitHub silent-redirect
  trap: `brew tap molinesgithub/tap` resolves to the same repo but registers
  as a second tap, which triggers `Formulae found in multiple taps` on every
  install. Fix is local and one-shot: `brew untap molinesgithub/tap`.

### Coverage
- 434 tests passing (unchanged from 0.9.2).

## [0.9.2] - 2026-05-17

### Fixed
- **`brew-tui install-brewbar` progress line.** The "Installing BrewBar…" log
  used to print from inside `lib/brewbar-installer.ts`, violating the CLAUDE.md
  rule that `lib/` modules must not use bare `console.*`. The log now lives in
  the CLI subcommand handler (`src/index.tsx`) where stdout is the intended
  user-facing channel, while the installer stays a pure library that any
  caller (TUI view, future plugin) can drive without surprise side-effects.

### Coverage
- 434 tests passing (unchanged from 0.9.1).

## [0.9.1] - 2026-05-14

### Changed (UX)
- **Side menu is active by default on launch.** Arrows `↑` / `↓` and `Enter`
  operate the side menu from the first frame — you no longer need to press
  `m` first. `m` still toggles the menu closed / reopened.
- **`M` indicator blinks in brand orange.** The keyboard hint for the menu
  toggle alternates brightness (same hue) so the shortcut is always visible
  without changing color.

### Added
- **`useTerminalSize()` / `useContainerSize(ref)` hooks** — TUI analogs of CSS
  `100vw` / `100vh` and `100cqi` container queries. Views can measure their
  actual container width instead of the global viewport, so they remain
  correct if reparented into a panel.
- **`<BlinkingText>`** reusable component (brightness pulse, constant hue).
- **`installed.tsx`** derives `nameWidth` / `versionWidth` from the real
  container width via `useContainerSize` instead of `stdout.columns`.
- **`outdated.tsx`** paginates by terminal rows via `useTerminalSize`.

### Coverage
- 434 tests passing (+5 over 0.9.0).

## [0.9.0] - 2026-05-13

### Changed (UX — read this if you upgrade from 0.8.x)
- **Side menu opens with `m`.** Numbers `1`–`0` no longer jump between views
  and `Tab`/`Shift+Tab` no longer cycles them. Press `m` to focus the side
  menu, move with `↑`/`↓`, confirm with `Enter`, and close with `Esc` or `m`
  again. The menu border highlights and a single arrow tracks the cursor.
- **Footer actions are numeric.** Each view exposes its commands as `1`,
  `2`, `3`… instead of mnemonic letters; a one-line hint above the footer
  reads "Choose an option by pressing its number". Globals (`Esc`, `q`, `L`)
  keep their letters and contextual keys (`Enter`, `/`, `j/k`) keep their
  meaning. The old letter shortcuts still work as aliases.
- **Welcome screen** rewritten to teach the new model.

### Added
- **BrewBar live status banner.** After every `brew upgrade`, `install` or
  `uninstall` from Brew-TUI, BrewBar refreshes immediately and shows a
  friendly banner explaining what happened and how many packages are still
  pending — for example *"Just upgraded htop from Brew-TUI. 3 packages still
  pending an update."* or *"No packages left to update — you're all set."*.
  Auto-fades after 30 s, dismissable manually. The handoff goes through
  `~/.brew-tui/last-action.json` (atomic rename), watched by a
  `DispatchSourceFileSystemObject` in BrewBar — same pattern already used
  for iCloud sync, no new IPC.
- **`useViewInput` hook** that suppresses per-view keypresses while the side
  menu owns input, so arrow keys never get double-handled.

### Cross-platform contract
- Brew-TUI 0.9.0 and BrewBar 0.9.0 are released together. Update both halves
  to keep license decryption and the new live banner working. BrewBar
  detects drift on launch and prompts `brew-tui install-brewbar --force`.

## [0.8.1] - 2026-05-08

### Fixed
- **Dashboard refresh:** pressing `r` now refetches Homebrew data from any
  state instead of only from the error screen, so the overview stays current
  without leaving the view. Footer hint added so the shortcut is discoverable.

## [0.7.0] - 2026-05-02

### Fixed
- **BrewBar release channel:** notarization and cask publishing now target the
  active package version instead of a hardcoded release tag.
- **AsyncState lint gate:** preserved the public `AsyncState` helper API while
  avoiding the TypeScript value/type redeclaration that blocked pre-push lint.

### Changed
- **BrewBar:** version bumped to 0.7.0 for the notarized macOS companion app.
- **Homebrew:** formula and cask release metadata prepared for Brew-TUI and
  BrewBar 0.7.0.
- **Release metadata:** npm, JSR, package-lock and Tuist marketing versions now
  move together for the 0.7.0 release.

## [0.6.2] - 2026-05-01

### Fixed
- **Security Audit (Pro):** the TUI mirror of the BrewBar OSV bug. `osv-api.ts`
  was sending `ecosystem: 'Homebrew'` to OSV.dev, which rejects that value with
  HTTP 400, so every Security Audit run silently returned zero CVEs. Switched
  to `Bitnami` (same approach already used by `SecurityMonitor.swift`).
  Packages outside Bitnami's catalog return empty results instead of failing
  the whole batch.
- **`brew-tui install-brewbar`:** the bundled download URL pointed at the old
  `MoLinesGitHub` org. GitHub still serves a 301 redirect, but stricter HTTP
  clients can fail. Updated to `MoLinesDesigns/Brew-TUI/releases/latest/...`.
- **Homebrew Cask:** `brewbar` was stuck at 0.1.0 with the same outdated org
  URL — the cask was effectively unusable. Bumped to 0.6.1 with the SHA256 of
  the published release zip and the corrected URL.

### Changed
- **License portability check is stricter.** Previously, if
  `~/.brew-tui/machine-id` was missing the check silently passed. Now a
  missing machine-id is regenerated and compared against the one stored in
  `license.json` — if they don't match, the license is rejected and the user
  is asked to reactivate. This affects users whose machine-id was wiped
  by a Time Machine restore, a fresh shell init or manual cleanup. Run
  `brew-tui activate <key>` once to re-bind the license.

### Internal
- Repository URLs across `package.json`, `README`, the formula, the cask, the
  issue template and the brewbar installer now point at `MoLinesDesigns/*`.
- `jsr.json` bumped 0.5.2 → 0.6.2 to follow npm.
- Stale 0.4.1 BrewBar artefacts (`BrewBar.app.zip`, `.dSYM`) removed from the
  repo working tree; they were already gitignored but had been committed
  earlier.
- Single canonical `getMachineId()` lives in `data-dir.ts`; the four
  diverging implementations across `polar-api`, `license-manager`, `promo`
  and `sync-engine` were collapsed. The hostname fallback in sync (which
  collided same-named machines on freshly-imaged fleets) is gone.
- BrewBar's `BrewProcess.run` drains brew's stdout incrementally; the
  previous synchronous `readDataToEndOfFile()` deadlocked on outputs over
  ~64 KB.
- `~/.brew-tui/snapshots/` is now capped at 20 auto entries per
  `saveSnapshot`; user-labelled checkpoints are preserved.
- BrewBar's license degradation now mirrors the TUI's 7/14/30-day
  thresholds and exposes the level via `LicenseStatus.pro(_, level)`.
- CI now runs `xcodebuild build` + `xcodebuild test` for BrewBar on
  `macos-latest` in addition to the existing `npm run validate` on Ubuntu.

## [0.6.1] - 2026-05-01

### Fixed
- **BrewBar:** outdated count was always zero on systems with cask updates,
  so notifications never fired. `OutdatedPackage` required `pinned: Bool` but
  casks from `brew outdated --json=v2 --greedy` omit that field, making the
  whole JSON decode throw and the refresh abort silently. The decoder now
  treats `pinned` and `pinned_version` as optional and defaults `pinned` to
  `false`, matching the formula contract.
- **BrewBar:** CVE check spammed `OSV API returned HTTP 400` every hour
  because OSV does not accept `Homebrew` as an ecosystem. Switched to
  `Bitnami`, which covers most common OSS packages and filters by version
  correctly. Packages outside Bitnami's catalog return empty results
  instead of crashing the batch.
- **BrewBar:** consecutive outdated notifications were silently replaced
  in macOS Notification Center because every `UNNotificationRequest` reused
  the same identifier. Notifications now use a per-fire timestamped
  identifier so each one shows as a fresh banner.

### Internal
- `AppState.refresh()` now logs decoding/refresh errors via `os.Logger` so
  silent failures show up in `log show --predicate 'subsystem == "com.molinesdesigns.brewbar"'`.
- `BrewBar` version bumped to 0.6.1.

## [0.5.3] - 2026-04-29

### Fixed
- **BrewBar:** outdated packages now reflect the current Homebrew formula index.
  Previously `brew update` was never run before `brew outdated`, so BrewBar
  could show zero updates while the terminal found packages to upgrade.
  `AppState.refresh()` now runs `brew update --quiet` first (non-fatal, 120s
  timeout) before the parallel outdated + services check.

### Internal
- `BrewChecker.updateIndex()` added — runs `brew update` without
  `HOMEBREW_NO_AUTO_UPDATE` so the local tap index is always fresh.
- `BrewBar` version bumped to 0.4.2.

## [0.5.2] - 2026-04-28

### Fixed
- **Upgrade prompt:** Tier-aware pricing copy. The prompt now branches by
  tier and points to the correct Polar checkout URL:
  - **Pro views** show €9.95/month or €82/year and link to the Pro Yearly
    Polar product.
  - **Team views** (Compliance) show €8/seat/month or €81.60/seat/year (min
    3 seats) and link to the Team Monthly Polar product with `quantity=3`.
- Account view monthly/yearly labels updated to canonical pricing.

### Internal
- New i18n keys `upgrade_teamFeature`, `upgrade_teamPricing`,
  `upgrade_buyUrlTeam`, `upgrade_teamLabel` for tier-aware copy.
- `UpgradePrompt` now consults `isTeamView()` to pick the right tier strings.

## [0.5.1] - 2026-04-28

### Fixed
- **License gating bug:** `isTeam()` returned true for Pro users, granting free access to Team Compliance. Now strict (`status === 'team'` only).
- **Plan persistence:** activate / initialize now propagate `license.plan` ('pro' or 'team') instead of hardcoding 'pro'. Combined with the new `detectPlan()` helper that infers tier from the license-key prefix (`BTUI-T-` → Team, `BTUI-` → Pro).
- **BrewBar menu bar icon:** the status item reserved extra horizontal space because the icon's native size was used and the badge string had a leading whitespace. Icon now forced to 18×18 pt and the badge collapses to truly empty when there is nothing to show.

### Added
- `POLAR_PRODUCT_IDS` and `POLAR_CHECKOUT_URLS` constants for the four live Polar products.
- 4 regression tests for plan detection.

## [0.5.0] - 2026-04-28

### Added — Power Release (Phase 1-6)

- **CVE Real-time monitoring (Pro):** BrewBar polls OSV.dev hourly, shows ⚠N badge in menu bar and sends macOS notifications for new critical/high CVEs in installed packages. Click notification jumps to security-audit view.
- **Impact Analysis (Pro):** pre-upgrade risk panel (low/medium/high) showing dependency tree, breaking changes hint, and reverse-deps that will be affected. Surfaced in `outdated` view before each upgrade.
- **Smart Rollback (Pro):** automatic snapshots after every install/upgrade/uninstall/pin. Rollback view generates plans using bottle/versioned/pin strategies. `R` key in security-audit jumps to rollback for vulnerable packages.
- **Declarative Brewfile (Pro):** YAML-based desired state with drift score 0-100 and interactive reconciliation. High-risk upgrades hint to add the package to Brewfile first.
- **Cross-machine Sync (Pro):** iCloud Drive backend with AES-256-GCM encryption, per-machine identity, interactive conflict resolution, ⟳ drift badge in BrewBar. Post-sync success offers `c` shortcut to Compliance.
- **Team Compliance (Team tier):** PolicyFile JSON, score 0-100, severity-graded violations, automatic remediation plans. New `compliance` view (Team-gated, separate from Pro).
- **Dashboard Pro Status panel:** unified state of the 4 power modules (snapshots, Brewfile drift, sync, compliance).
- **`brew-tui status` CLI:** now shows snapshot count, Brewfile drift, sync state and compliance score.

### Internal
- New shared modules: `state-snapshot/`, `diff-engine/`, `impact/`, `rollback/`, `brewfile/`, `sync/` (with `crypto` + iCloud backend), `compliance/`.
- BrewBar `SyncMonitor.swift` + scheduler hooks for `cveMonitor` and `syncDriftCheck`.
- 205 tests across 20 test files (all passing).

## [0.4.1] - 2026-04-27

### Added
- BrewBar auto-install + auto-launch on every `brew-tui` run for Pro users (macOS only).
- BrewBar auto-registers as a login item the first time it runs as Pro (idempotent; respects later opt-out from Settings).

### Changed
- BrewBar binary now signed with Developer ID + hardened runtime, notarized by Apple, and stapled — installs cleanly without Gatekeeper warnings.
- `LicenseChecker` (Swift) now recognizes built-in PRO accounts so they pass the Pro check in BrewBar.

## [0.2.0] - 2026-04-23

### Security
- Fix: Remove source maps from production bundle
- Fix: Add timeouts to all network requests (15s API, 120s downloads)
- Fix: Verify BrewBar download integrity with SHA-256
- Fix: License deactivation retries before clearing local data
- Fix: Remove anti-debug environment variable bypass
- Add: PrivacyInfo.xcprivacy for Apple compliance

### Fixed
- Navigation: goBack() now properly pops history stack
- Search: errors no longer silenced as "no results"
- Services: action errors now visible to user
- Account: deactivation no longer freezes on network error
- Profiles: importing mode no longer traps user
- Installed: ProgressLog dismissible with Esc after uninstall
- BrewBar: Upgrade All now requires confirmation
- BrewBar: Expired license no longer terminates app
- CLI: `status` now reports expired licenses correctly
- CLI: `install-brewbar` now evaluates the current license before requiring Pro
- Dashboard: partial Homebrew fetch failures now surface explicit warnings instead of misleading stats
- License: revalidation now refreshes degradation state instead of leaving stale warnings
- BrewBar: expired-license guidance now points to `brew-tui revalidate`
- BrewBar: expired licenses now fall back to actual basic mode with upgrades disabled

### Improved
- Dynamic terminal row adaptation (no more hardcoded 20 rows)
- Atomic file writes for license data
- Proper file permissions (0o600) for user data files
- GradientText memoized for better render performance
- fetchAll no longer blocks on brew update
- BrewBar badge timer reduced from 2s to 30s
- Parallel refresh in BrewBar (outdated + services)
- CLI: new `revalidate` command for existing licenses
- Docs and release notes aligned with the current npm-only publish flow

### Added
- Color tokens file (src/utils/colors.ts)
- Fetch timeout utility
- CHANGELOG.md
- Vitest coverage for parsers, `brew-store` concurrency, and `license-store` revalidation

## [0.1.0] - 2026-04-22
- Initial release
