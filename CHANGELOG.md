# Changelog

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
