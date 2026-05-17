# Launch Posts — Brew-TUI v0.5.2 (Power Release)

Ready-to-paste content for each platform.

---

## Hacker News — Show HN

**Title:** Show HN: Brew-TUI v0.5.1 – Visual Homebrew with rollback, sync and CVE alerts

**URL:** https://github.com/MoLinesDesigns/Brew-TUI

**Text (no URL submission — use this if you want a text post instead):**

```
Show HN: Brew-TUI v0.5.1 – Visual Homebrew with rollback, sync and CVE alerts

I shipped v0.5.1 of Brew-TUI, a terminal UI for Homebrew built with React +
Ink. The free tier replaces typing `brew` commands with a navigable
interface (dashboard, search, install, upgrade, services, doctor).
The 0.5 line adds six features I kept missing in my own workflow:

* Smart Rollback — every install/upgrade/uninstall/pin captures a snapshot
  automatically. The rollback view generates plans using bottle / versioned
  / pin strategies. From the security-audit view you press R on a
  vulnerable package and jump straight to the rollback plan that downgrades
  it.

* Cross-machine Sync — iCloud Drive backend, payload encrypted client-side
  with AES-256-GCM (no MoLines server). Each Mac gets a stable identity and
  conflicts are surfaced for interactive resolution rather than auto-merged.
  A couple of caveats worth mentioning, since conflict-resolution code
  is exactly where silent dropping hurts most: I caught two correctness
  bugs (local machine not persisted on first conflict; loop overwriting
  earlier resolutions) in Codex's pre-merge review and shipped them as
  PR #7 before tagging v0.5.0. Then v0.5.1 followed two days later with
  a tighter Pro/Team gating fix — `isTeam()` was returning true for
  Pro users, briefly granting free Compliance access — plus a small
  BrewBar status-item layout fix.

* CVE Real-time — BrewBar (the optional macOS menu bar companion, Swift 6)
  polls OSV.dev hourly. Critical/high CVEs trigger native notifications and
  a badge count next to the icon.

* Declarative Brewfile — YAML desired state, drift score 0–100, interactive
  reconciliation. Closer to a lightweight Nix-flake than to brew bundle.

* Pre-upgrade Impact Analysis — risk panel (low/medium/high) with
  dependency tree and reverse-deps that will be affected, surfaced before
  you confirm an upgrade.

* Team Compliance — admin defines a PolicyFile JSON (required / forbidden
  packages, required taps, severity per rule). Each Mac on the team gets a
  0–100 score, severity-graded violations and an automatic remediation plan.
  Useful for onboarding and security reviews when "every dev should have
  exactly these brews installed" actually matters.

Stack: TypeScript strict + ESM-only, React 18 + Ink 5 (terminal renderer),
Zustand, vitest. BrewBar is Swift 6 / SwiftUI / macOS 14+. 211 tests. Both
apps speak directly to `brew` — no daemon, no extra services.

Pricing: free tier is MIT and stays that way. Pro (rollback, sync, CVE,
Brewfile, impact, profiles, cleanup, history, security-audit) is €9.95/mo
or €82/year. Team (everything in Pro + Compliance) is €8/seat/mo, min 3
seats.

  npm install -g brew-tui
  # or
  brew tap MoLinesDesigns/tap && brew install brew-tui

Honest known limitations:
- macOS only for BrewBar; the TUI itself runs anywhere Homebrew runs but
  is built around macOS workflows.
- Sync requires iCloud Drive enabled (no provider abstraction yet).
- The OSV polling cadence is fixed at 1h to be polite to the API.

Repo: https://github.com/MoLinesDesigns/Brew-TUI
Landing: https://molinesdesigns.com/brewtui/
Changelog: https://github.com/MoLinesDesigns/Brew-TUI/blob/main/CHANGELOG.md

Happy to take feedback on the conflict-resolution model, the YAML drift
scoring, or the Pro/Team split.
```

**Submit at:** https://news.ycombinator.com/submit

**Tactical notes for posting day:**
- Best windows for HN front page: Tue–Thu, 08:00–10:00 PT.
- Comment first within 5 min with one paragraph on motivation (avoids the
  "show HN with zero context" downvote pattern).
- Lead the discussion on the conflict-resolution sync bugs — turning a
  caught bug into a transparency story plays well on HN and is true.
- Do not reply defensively to "is this just `brew bundle`?" — answer with
  the drift score + reconciliation flow.

---

---

## Product Hunt

**Name:** Brew-TUI
**Tagline:** A visual terminal UI for Homebrew package management
**Description:**
```
Brew-TUI brings a full visual interface to Homebrew — right in your terminal.

Instead of memorizing brew commands, navigate with keyboard shortcuts through
a dashboard, package browser, search, upgrade manager, service controller,
and diagnostic tools.

Free features:
• Dashboard — overview of packages, outdated counts, services, system info
• Installed — browse and filter formulae and casks
• Search — find and install packages
• Outdated — upgrade individually or all at once
• Services — start, stop, restart Homebrew services
• Doctor — run brew doctor at a glance
• Package Info — dependencies, caveats, quick actions

Pro features (9.95€/mo or 82€/year — save 31%):
• Smart Rollback — auto-snapshots, revert any install/upgrade/uninstall
• Cross-machine Sync — iCloud Drive, AES-256-GCM encrypted
• CVE Real-time — BrewBar polls OSV.dev hourly, native notifications
• Declarative Brewfile — YAML desired state, drift score 0-100
• Impact Analysis — pre-upgrade risk panel with dependency tree
• Profiles — export/import your full Homebrew setup
• Smart Cleanup — find orphans, reclaim disk space
• Action History — track every install/uninstall/upgrade
• Security Audit — scan packages against CVE database
• BrewBar — macOS menu bar companion app (Swift 6)

Team tier (8€/seat/mo or 81.60€/seat/year — from 3 seats):
• Everything in Pro plus Team Compliance — central PolicyFile, 0-100
  score, severity-graded violations, automatic remediation plans.

Built with React + Ink for a smooth, responsive terminal experience.
English and Spanish supported.
```

**Links:**
- Website: https://github.com/MoLinesDesigns/Brew-TUI
- npm: https://www.npmjs.com/package/brew-tui

**Submit at:** https://www.producthunt.com/posts/new (requires posting access)

---

## Reddit — r/commandline

**Title:** Brew-TUI: A visual terminal UI for Homebrew (React + Ink)

**Body:**
```
I built a TUI for managing Homebrew packages. Instead of typing brew
commands, you get an interactive interface with keyboard navigation.

What it does:
- Dashboard with package stats and system info
- Browse/filter installed formulae and casks
- Search and install directly
- See outdated packages, upgrade one by one or all at once
- Manage services (start/stop/restart)
- Run brew doctor
- Detailed package info with deps and caveats

Install:
  npm install -g brew-tui
  # or
  brew tap MoLinesDesigns/tap && brew install brew-tui

Built with TypeScript, React 18, Ink 5. Keyboard-driven: 1-0 jump
to views, j/k scroll, / to search, Tab cycles views.

GitHub: https://github.com/MoLinesDesigns/Brew-TUI

Feedback welcome!
```

**Also post in:** r/homebrew, r/node, r/terminal, r/macapps

---

## Reddit — r/macapps

**Title:** Brew-TUI + BrewBar: Visual Homebrew management from terminal and menu bar

**Body:**
```
Two tools for managing Homebrew on macOS:

**Brew-TUI** — Terminal UI with dashboard, package browser, search,
upgrade manager, service control, and diagnostics. Keyboard-driven.

**BrewBar** — Menu bar companion app (Swift/SwiftUI) that shows outdated
package counts, sends notifications, and lets you upgrade without
opening a terminal.

Install Brew-TUI:
  npm install -g brew-tui
  # or
  brew tap MoLinesDesigns/tap && brew install brew-tui

BrewBar installs from inside Brew-TUI:
  brew-tui install-brewbar

GitHub: https://github.com/MoLinesDesigns/Brew-TUI
```

---

## Dev.to Article

**Title:** I built a visual TUI for Homebrew with React and Ink

**Tags:** homebrew, terminal, react, typescript

**Body:** Write a short article (~500 words) covering:
1. Why you built it (memorizing commands is tedious)
2. Tech stack (React 18 + Ink 5 + Zustand + TypeScript)
3. Key features with screenshots/GIF
4. How to install
5. Pro features and BrewBar
6. Link to GitHub
