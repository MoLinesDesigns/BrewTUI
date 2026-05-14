# Brew-TUI

### Your Homebrew, finally visible.

[![npm](https://img.shields.io/npm/v/brew-tui)](https://www.npmjs.com/package/brew-tui)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Homebrew](https://img.shields.io/badge/homebrew-tap-orange)](https://github.com/MoLinesDesigns/homebrew-tap)
[![Tests](https://img.shields.io/badge/tests-211%20passing-brightgreen)]()

A keyboard-driven terminal UI for Homebrew, with a native macOS menu bar companion that watches updates in the background. No daemons, no middleware — both tools call `brew` directly.

![Brew-TUI demo](assets/demo.gif)

```bash
brew tap MoLinesDesigns/tap
brew install brew-tui      # then just type:  brew-tui
```

---

## Why Brew-TUI?

You don't memorize `brew outdated && brew upgrade && brew services list && brew leaves`. You forget half of them. Brew-TUI puts every command behind one keystroke and shows you what `brew` never tells you until something breaks: orphans, vulnerabilities, services that died last Tuesday.

| Without Brew-TUI | With Brew-TUI |
|---|---|
| `brew outdated` → wall of text → grep | Press **3** → list with version arrows → `Enter` to upgrade |
| `brew services list` → restart by hand | Press **4** → toggle services with one key |
| Vulnerable packages? | Press **9** → cross-checked against [OSV.dev](https://osv.dev) (Pro) |
| Forgot to update? | **BrewBar** lives in your menu bar and tells you (Pro) |

---

## Install

```bash
# Homebrew (recommended)
brew tap MoLinesDesigns/tap
brew install brew-tui

# npm
npm install -g brew-tui

# Run without installing
npx brew-tui
```

**Requirements:** Homebrew, macOS. The Homebrew formula installs the required Node.js runtime dependency.

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Overview of installed packages, outdated counts, services, and system info |
| **Installed** | Browse and filter formulae and casks with version info and status badges |
| **Search** | Find and install packages directly from the TUI |
| **Outdated** | Version comparison arrows, upgrade individually or all at once |
| **Services** | Start, stop, and restart Homebrew services |
| **Doctor** | Run `brew doctor` and see warnings at a glance |
| **Package Info** | Detailed view with dependencies, caveats, and quick actions |

### Pro Features — €9,95/mo or €82/year (-31%)

| Feature | What it solves |
|---------|----------------|
| **Smart Rollback** | Auto-snapshots after every install/upgrade/uninstall/pin; revert with bottle/versioned/pin strategies. Press `R` from a flagged CVE to jump straight to the rollback plan |
| **Cross-machine Sync** | iCloud Drive backend, AES-256-GCM encrypted client-side. Brewfile and snapshots stay aligned across all your Macs with interactive conflict resolution |
| **CVE Real-time** | BrewBar polls [OSV.dev](https://osv.dev) hourly. Critical/high CVEs trigger native macOS notifications and a badge count |
| **Declarative Brewfile** | YAML desired state, drift score 0-100, interactive reconciliation. Closer to a lightweight Nix-flake than `brew bundle` |
| **Impact Analysis** | Pre-upgrade risk panel (low/medium/high) with dependency tree and reverse-deps that will be affected, surfaced before each upgrade |
| **Profiles** | Replicate your exact setup on a new Mac in one command |
| **Smart Cleanup** | Reclaim gigabytes by listing orphans ranked by size |
| **Action History** | "What did I install last week?" — answered |
| **Security Audit** | Cross-checks every installed package against [OSV.dev](https://osv.dev) live |
| **BrewBar** | A menu bar app that watches your packages while you sleep — auto-installs and auto-launches the moment you go Pro |

### Team Tier — €8/seat/mo or €81,60/seat/year (-15%, min 3 seats)

Everything in Pro plus **Team Compliance** — admin defines a central PolicyFile (JSON) listing required and forbidden packages and required taps. Each Mac on the team gets a 0-100 compliance score, severity-graded violations and an automatic remediation plan. Useful for onboarding, security audits and keeping every developer's environment aligned.

[See pricing →](https://molinesdesigns.com/brewtui/)

---

## Screenshots

| Dashboard | Outdated |
|---|---|
| ![Dashboard](assets/screenshots/dashboard.png) | ![Outdated](assets/screenshots/outdated.png) |
| **Services** | **Doctor** |
| ![Services](assets/screenshots/services.png) | ![Doctor](assets/screenshots/doctor.png) |
| **Smart Cleanup (Pro)** | **Security Audit (Pro)** |
| ![Smart Cleanup](assets/screenshots/smart-cleanup.png) | ![Security Audit](assets/screenshots/security-audit.png) |

> Smart Cleanup ranks orphans by size — find your 34 MB unused `jpeg-xl` in 2 seconds. Security Audit cross-checks every installed package against [OSV.dev](https://osv.dev) live.

---

## Usage

```bash
brew-tui                   # Launch the TUI
brew-tui status            # Show license status
brew-tui activate <key>    # Activate Pro license
brew-tui revalidate        # Revalidate Pro license
brew-tui deactivate        # Deactivate license on this machine
brew-tui delete-account    # Remove all local data (~/.brew-tui/)
```

### Keyboard Navigation

> **Heads up — keyboard model changed in 0.9.0 / 0.9.1.** Numbers `1`–`0` no
> longer jump between views; they now run the numbered actions in the footer
> of the current view. The side menu opens automatically on launch (0.9.1) so
> arrows operate it from the first frame; press `m` to close or reopen it.
> The blinking orange `M` in the menu indicator marks the toggle. Old per-view
> letter shortcuts (`i`, `u`, `r`, …) still work as aliases.

| Key | Action |
|-----|--------|
| `↑` / `↓` + `Enter` | Operate the side menu (active by default on launch) |
| `m` | Toggle the side menu (close / reopen) |
| `1`-`9` | Run the matching numbered action in the current view's footer |
| `↑` / `↓` (or `j` / `k`) | Move within a list |
| `Enter` | Open / confirm the highlighted item |
| `/` | Filter the current list |
| `S` | Open the Search view |
| `Escape` | Go back |
| `L` | Toggle language (en/es) |
| `q` | Quit |

### Language

Brew-TUI supports **English** and **Spanish**. Language is detected from your system locale (`LANG`), or you can:

- Pass `--lang=es` or `--lang=en` as a CLI flag
- Press `L` inside the TUI to toggle

---

## BrewBar (Pro)

BrewBar is a native macOS menu bar companion app (Swift 6 / SwiftUI) that:

- Shows a badge with outdated package count
- Sends push notifications when updates are available
- Lets you upgrade packages without opening a terminal
- Displays Homebrew service status
- Configurable check interval (1h / 4h / 8h)
- Supports Launch at Login

### Install BrewBar

```bash
# Via Brew-TUI CLI (Pro license required)
brew-tui install-brewbar
brew-tui install-brewbar --force   # Reinstall / update
brew-tui uninstall-brewbar         # Remove

# Via Homebrew Cask
brew install --cask MoLinesDesigns/tap/brewbar
```

### Build from Source

```bash
cd menubar
tuist generate
xcodebuild -workspace BrewBar.xcworkspace -scheme BrewBar build
```

Requires [Tuist](https://tuist.io), Xcode, and macOS 14+.

---

## Architecture

```
Views (React/Ink) --> Stores (Zustand) --> brew-api --> Parsers --> brew CLI (spawn)
```

| Layer | Tech | Role |
|-------|------|------|
| **UI** | React 18 + Ink 5 | Terminal rendering via ANSI escape codes |
| **State** | Zustand 5 | Global stores with per-key loading/error maps |
| **API** | brew-api.ts | Typed wrapper over `brew` CLI with input validation |
| **Parsers** | json-parser / text-parser | Parse `brew info --json`, `brew search`, `brew doctor` |
| **CLI** | brew-cli.ts | `execBrew()` (30s timeout) and `streamBrew()` (async generator, 5min idle timeout) |

- ESM-only, TypeScript strict mode, built with [tsup](https://github.com/egoist/tsup)
- All streaming operations (install, upgrade) use AsyncGenerators yielding lines in real time
- Package names validated via regex before passing to `spawn` (no shell injection)
- 211 tests across 20 suites (Vitest)

---

## Security

- License data encrypted with AES-256-GCM, machine-bound via UUID
- SHA-256 verification on BrewBar binary downloads
- Bundle integrity check at startup (fail-closed)
- Runtime validation of all external API responses (Polar, OSV)
- Rate limiting on license activation (5 attempts / 15min lockout)
- No secrets in logs, no PII transmitted without consent

---

## Project Structure

```
src/
  views/           # 16 React/Ink views (incl. rollback, brewfile, sync, compliance)
  stores/          # Zustand stores (brew, navigation, license, modal, rollback, sync, compliance, ...)
  components/      # Shared UI (StatusBadge, ResultBanner, SelectableRow, ...)
  hooks/           # useKeyboard, useBrewStream, useDebounce
  lib/
    license/       # Polar API, AES encryption, anti-tamper, canary
    security/      # OSV vulnerability scanning (Pro)
    profiles/      # Profile export/import (Pro)
    cleanup/       # Orphan detection (Pro)
    history/       # Action logging (Pro)
    rollback/      # Snapshot-based rollback engine (Pro)
    state-snapshot/# Periodic Brew state snapshots (Pro)
    diff-engine/   # Snapshot diff for rollback and sync (Pro)
    impact/        # Pre-upgrade impact analysis (Pro)
    brewfile/      # Declarative YAML Brewfile + drift score (Pro)
    sync/          # iCloud-backed cross-machine sync, AES-256-GCM (Pro)
    compliance/    # Team policy enforcement (Team)
    parsers/       # JSON and text parsers for brew output
  i18n/            # English + Spanish translations
  utils/           # Colors, spacing, logger, formatting
menubar/           # BrewBar (Swift 6 / SwiftUI / Tuist)
```

---

## Contributing

```bash
git clone https://github.com/MoLinesDesigns/Brew-TUI.git
cd Brew-TUI
npm install
npm run dev          # Run with tsx (requires interactive TTY)
npm run typecheck    # tsc --noEmit
npm run test         # vitest (211 tests)
npm run lint         # eslint
npm run build        # Production bundle via tsup
```

---

## License

[MIT](LICENSE) -- [MoLines Designs](https://molinesdesigns.com)
