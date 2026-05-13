# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Run with tsx (requires interactive terminal)
npm run build        # Build ESM bundle to ./build via tsup
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:watch   # vitest watch mode
npm run lint         # eslint src/
```

After build: `node bin/brew-tui.js` or `./bin/brew-tui.js` launches the TUI.

**BrewBar (menubar/):**
```bash
cd menubar && tuist generate   # Generate Xcode project
xcodebuild -workspace BrewBar.xcworkspace -scheme BrewBar build  # CLI build
```

CLI subcommands (run without launching TUI):
```bash
brew-tui activate <key>    # Activate Pro license via Polar
brew-tui revalidate        # Revalidate the current Pro license
brew-tui deactivate        # Deactivate license on this machine
brew-tui status            # Show evaluated license status
brew-tui install-brewbar       # Download & install BrewBar menubar app (Pro only)
brew-tui install-brewbar --force  # Reinstall BrewBar
brew-tui uninstall-brewbar     # Remove BrewBar from /Applications
brew-tui delete-account        # Remove all local data (~/.brew-tui/)
```

## Architecture

**Brew-TUI** is a visual TUI for Homebrew built with React 18 + Ink 5.x (terminal renderer). ESM-only (`"type": "module"`), TypeScript strict mode. Requires Node ≥ 22.

### Data Flow

```
Views (React) → Stores (Zustand) → brew-api → Parsers → brew-cli (spawn)
```

- **`src/lib/brew-cli.ts`** — Two primitives: `execBrew()` (30s timeout) for instant commands returning stdout, `streamBrew()` (5min idle timeout) as an AsyncGenerator yielding lines for long-running operations (install/upgrade). Both set `HOMEBREW_NO_AUTO_UPDATE=1`.
- **`src/lib/parsers/`** — `json-parser.ts` handles `brew info/outdated/services --json`, `text-parser.ts` handles `brew search/doctor/config` text output.
- **`src/lib/brew-api.ts`** — Typed high-level API combining CLI + parsers. Validates package names via `PKG_PATTERN` before passing to CLI. Also has `formulaeToListItems()`/`casksToListItems()` converters, `pinPackage()`/`unpinPackage()`, and `getCaskInfo()`.
- **`src/stores/brew-store.ts`** — Zustand store holding all Homebrew data with per-key `loading`/`errors` maps. `fetchAll()` runs parallel fetches on startup.
- **`src/stores/navigation-store.ts`** — Current view, history stack, selected package, plus `menuMode` / `menuCursor` for the side-menu focus model added in 0.9.0. `VIEWS` keeps the canonical view order; `MENU_VIEWS` is what the side menu renders and `menuCursor` indexes into.
- **`src/stores/modal-store.ts`** — Global modal state using a reference counter (not boolean) to handle nested suppressors correctly.
- **Pro feature stores:** `cleanup-store.ts`, `history-store.ts`, `security-store.ts`, `profile-store.ts` — each wraps its feature's lib module and manages loading/error state.

### Navigation & Keyboard

Global keys live in `src/hooks/use-keyboard.ts` via Ink's `useInput`. **As of 0.9.0**: `m` opens the side menu (focus moves to the menu — `↑`/`↓` move the cursor, `Enter` navigates, `Esc`/`m` close); numbers `1`–`0` and `Tab`/`Shift+Tab` no longer change view. Always-globals: `q` quit, `Esc` back, `S` open Search view, `L` toggle locale.

Per-view keys: each view adds its own `useInput` for `j`/`k` scroll, `Enter` select, `/` filter, and action-specific shortcuts. **Numbered actions in the footer** (`1`, `2`, `3`…) trigger those shortcuts directly, while the original letter shortcuts stay as aliases so muscle memory survives. Footer numbering lives in `src/components/layout/footer.tsx` (`VIEW_HINT_DEFS`); each view's `useInput` accepts both the number and the legacy letter (e.g. `if (input === 'A' || input === '1')`).

**Critical seam — `useViewInput`** (`src/hooks/use-view-input.ts`): every view-level `useInput` MUST go through this wrapper. It suppresses the handler while `menuMode === true` so the side menu owns arrow keys without each view re-implementing the gate. Adding a new view? Use `useViewInput`, not bare `useInput`.

**BrewBar handoff** (`src/lib/data-dir.ts:writeLastAction`): after every `brew upgrade`/`install`/`uninstall` from the TUI, call this with `{ timestamp, action, packages, remainingOutdated, source: 'brew-tui' }`. It writes `~/.brew-tui/last-action.json` atomically (tmp + rename) so BrewBar's `LastActionMonitor` (`menubar/BrewBar/Sources/Services/LastActionMonitor.swift`) picks it up via `DispatchSourceFileSystemObject` and fires `AppState.applyLastAction`. The watcher targets the parent directory (not the file) because rename invalidates a file-level descriptor.

### Views

12 views routed via `<ViewRouter>` in `src/app.tsx` (switch on `currentView`). License initialization is handled by `<LicenseInitializer>`. Each view manages its own `useInput` handler and fetches data on mount via the brew store or direct API calls. Pro views (profiles, smart-cleanup, history, security-audit) are gated — if not Pro, `UpgradePrompt` renders instead. ProfilesView is decomposed into subcomponents in `src/views/profiles/` (list, detail, create, edit modes).

### UI Components

All rendering via Ink's `<Box>` (flexbox) and `<Text>`. `@inkjs/ui` provides `TextInput` (uncontrolled: uses `defaultValue`, not `value`) and `Spinner`. Layout components in `src/components/layout/` (AppLayout, Header, Footer). Shared components in `src/components/common/` (StatusBadge, StatCard, ProgressLog, ConfirmDialog, Loading, ResultBanner, SelectableRow, SearchInput, SectionHeader, ProBadge, UpgradePrompt, VersionArrow).

## Key Conventions

- All imports use `.js` extensions (ESM requirement with NodeNext resolution)
- `@inkjs/ui` `TextInput` is **uncontrolled** — use `defaultValue` + `onChange`/`onSubmit`, not `value`
- Zustand stores accessed directly via `useXxxStore()` hooks, no React Context
- Streaming operations (install, upgrade) use `useBrewStream` hook wrapping the AsyncGenerator
- Debounced values use `useDebounce` hook (e.g. search input)
- Types for Homebrew JSON responses are in `src/lib/types.ts`, verified against real Homebrew 5.1.6 output
- Each Pro feature has its own `src/lib/<feature>/types.ts` — avoid putting feature-specific types in main types.ts
- **Colors**: Use `COLORS` from `src/utils/colors.ts` — never hardcode hex values. Spacing tokens in `src/utils/spacing.ts`
- **Logging**: Use `logger` from `src/utils/logger.ts` (levels: debug/info/warn/error, controlled by `LOG_LEVEL` env). Never use bare `console.*` — exception: CLI subcommand handlers in `src/index.tsx` (activate/status/etc.) write directly to stdout/stderr, where `console.log`/`console.error` is the intended user-facing channel
- **lib/ modules must not import from stores** — receive `isPro: boolean` as parameter instead of importing `useLicenseStore`. Callers in views/stores pass the value
- **API response validation**: Always validate external API responses at runtime (Polar, OSV) — never trust `as Type` casts alone
- **Reusable UI patterns**: Use `<ResultBanner>` for success/error banners, `<SelectableRow>` for cursor-highlighted rows

## Freemium Model

- **Licensing:** Polar API (`src/lib/license/`). License stored at `~/.brew-tui/license.json` (AES-256-GCM encrypted, machine-bound). Revalidates every 24h with 7-day offline grace period.
- **Machine binding:** License envelope includes `machineId` from `~/.brew-tui/machine-id` (UUID generated on first activation). Prevents license portability between devices.
- **Feature gating:** `src/lib/license/feature-gate.ts` defines which ViewIds are Pro. `app.tsx` checks `isPro()` before rendering Pro views.
- **Pro features:** Profiles (`src/lib/profiles/`), Smart Cleanup (`src/lib/cleanup/`), History (`src/lib/history/`), Security Audit (`src/lib/security/` via OSV.dev API, 30min cache), Smart Rollback (`src/lib/rollback/` + `src/lib/state-snapshot/`), Declarative Brewfile (`src/lib/brewfile/`, YAML), Cross-machine Sync (`src/lib/sync/` via iCloud + AES-256-GCM), Impact Analysis (`src/lib/impact/`).
- **Team tier (separate from Pro):** Compliance (`src/lib/compliance/`, PolicyFile JSON, gated via `TEAM_VIEWS` in `feature-gate.ts`).
- **Data directory:** `~/.brew-tui/` managed by `src/lib/data-dir.ts` (license.json, machine-id, profiles/, history.json)
- **Rate limiting:** 30s cooldown between activation attempts, 15min lockout after 5 consecutive failures
- **Watermark:** Profile exports can embed user email via zero-width Unicode (requires explicit `consent` parameter)
- **Integrity:** Bundle SHA-256 verified at startup (`checkBundleIntegrity()`, fail-closed). Canary functions always return `false`
- **Built-in accounts:** `getBuiltinAccountType()` in `license-manager.ts` returns `null` unconditionally (SEG-009: hardcoded map removed because the AES key is bundle-derivable, so any user could forge perpetual licenses). The regression test `license-manager.test.ts:505-525` pins owner emails (artax, admin@molinesdesigns) among the candidates that must stay `null` — do not reintroduce a hardcoded entry.
- **Owner Pro accounts** are instead provisioned via a private free recurring "comp" product in Polar carrying the same `license_keys` benefit (see auto-memory `polar_perpetual_pro.md` for IDs).
- **Promo codes:** `src/lib/license/promo.ts` — promotional code redemption via brewtui-api backend

## BrewBar (menubar/)

macOS menu bar companion app (Swift 6 / macOS 14+ / Tuist). Fully independent from the TypeScript codebase — both call `brew` directly.
- `menubar/Project.swift` — Tuist manifest. `LSUIElement: true` (no Dock icon).
- `Tuist.swift` goes at `menubar/Tuist.swift` (root, not `Tuist/Config.swift` — deprecated).
- SourceKit errors in menubar/ are false positives until `tuist generate` creates the .xcworkspace.
- After editing `Project.swift` (e.g. bumping `MARKETING_VERSION`), re-run `tuist generate` before building or releasing — the workspace caches build settings and `xcodebuild` will report the previous version otherwise.
- BrewBar requires Brew-TUI installed; checked on launch via `which brew-tui` and known paths.

## Naming

- **Brew-TUI** — branding in UI, user-facing text, docs
- **brew-tui** — CLI command, npm package name, filesystem paths (`~/.brew-tui/`)

## Adding a New View

1. Add the ViewId to the union in `src/lib/types.ts`
2. Add it to both `VIEWS` and `MENU_VIEWS` in `src/stores/navigation-store.ts` (`VIEWS` is canonical; `MENU_VIEWS` is the side-menu render order — exclude it only if the view is contextual like `search`)
3. Create the view component in `src/views/`. Use `useViewInput` (NOT `useInput`) so the side menu can suppress it while in menu mode.
4. Add the route case in `src/app.tsx`'s switch
5. Add keybinding hints in `src/components/layout/footer.tsx` using **numeric keys** (`'1'`, `'2'`…) for view-specific actions; keep `enter`/`esc`/`/` literal when contextual. The `hint_chooseNumber` line renders automatically when at least one numeric hint is present.
6. In your `useViewInput`, accept both the new number and the legacy letter (e.g. `if (input === 'r' || input === '1')`) so muscle memory survives.
7. Add the label in `src/components/layout/header.tsx`
8. If Pro-only: add the ViewId to `PRO_VIEWS` set in `src/lib/license/feature-gate.ts`. If Team-only: add to `TEAM_VIEWS` instead (separate tier from Pro)
9. Add all user-facing strings to `src/i18n/en.ts` and `src/i18n/es.ts`
10. If the view triggers a `brew upgrade`/`install`/`uninstall`, call `writeLastAction()` from `src/lib/data-dir.ts` after the stream succeeds so BrewBar's banner reflects it.

## Internationalization (i18n)

Both Brew-TUI and BrewBar support English (en) and Spanish (es).

### TypeScript TUI
- **Module:** `src/i18n/` — custom lightweight i18n (no external library)
- **`t(key, values?)`** — translation with `{{var}}` interpolation
- **`tp(baseKey, count)`** — plurals via `_one`/`_other` suffixed keys
- **`en.ts`** — source of truth, defines `Translations` type. Adding a key here without adding to `es.ts` is a compile error.
- **`es.ts`** — typed as `Translations`, must have all keys from `en.ts`
- **Locale detection:** `--lang=es` CLI flag > `LANG`/`LC_ALL`/`LC_MESSAGES` env > fallback `en`
- **Homebrew terms** (Formulae, Casks, keg-only, tap) stay in English in both locales
- **Confirm dialog** accepts `y`/`Y` in English and `s`/`S` in Spanish for "yes"
- Test locale: `LANG=es_ES.UTF-8 npm run dev`

### Swift BrewBar
- **String Catalog:** `menubar/BrewBar/Resources/Localizable.xcstrings` (en + es)
- SwiftUI views (`Text`, `Button`, `Label`, etc.) are auto-extracted — no code changes needed
- Non-SwiftUI strings (NSAlert, notifications, error messages) use `String(localized:)`
- Plurals use String Catalog plural variations (not manual ternary)

### Adding a new string
1. **TUI:** Add key to `en.ts`, add translation to `es.ts`, use `t('key')` in code. `npm run typecheck` catches missing keys.
2. **BrewBar:** For SwiftUI views, just write `Text("New string")`. For non-SwiftUI, use `String(localized: "New string")`. Add Spanish translation in `.xcstrings`.

## Pre-push gate (Husky)

`npm install` runs `husky` (via the `prepare` script) and installs a `pre-push` hook at `.husky/pre-push` that runs `npm run validate` (typecheck + test + build + lint). A failing validate aborts the push. Bypass with `git push --no-verify` only when you have a deliberate reason — never as a shortcut around a real failure.

## Testing

- **Framework:** Vitest (`vitest.config.ts` with `passWithNoTests: false` — CI gate blocks empty suites)
- **Test files:** Co-located with source (`*.test.ts` / `*.test.tsx`)
- **Coverage:** parsers, license manager (degradation, AES round-trip, rate limiting, built-in accounts), canary functions, profile validation, Polar API (mocked), OSV API (mocked), brew-api validation, stores
- **Mocking:** `vi.mock()` for modules, `vi.fn()` for functions, `vi.useFakeTimers()` for time-dependent tests
- **UI tests:** `ink-testing-library` available but not yet in use for component rendering tests
- **BrewBar:** Test target `BrewBarTests` defined in `Project.swift` — no tests written yet

## Gotchas

- `npm run dev` requires an interactive TTY — Ink's raw mode fails in pipes/scripts
- On Apple Silicon, `@rollup/rollup-darwin-arm64` may need manual `npm install` if tsup fails
- `brew search` has no `--json` flag — parsed as text in `text-parser.ts`
- `__TEST_MODE__` and `process.env.APP_VERSION` are replaced at compile time by tsup (`tsup.config.ts` defines) — in dev mode (tsx), use `typeof __TEST_MODE__ !== 'undefined'` guard
- Build produces hidden sourcemaps (`.map` files for debugging, not referenced in output bundle)
- TUI clears the entire terminal (including scrollback) on startup for a clean display
- Polar API endpoints require a trailing slash (e.g. `/v1/products/`); without it the API returns 307, and `curl -L` drops `Authorization` on the redirect so you get 405. Use the slash from the start.
- Polar OpenAPI spec is public at `https://api.polar.sh/openapi.json` — quicker than docs for resolving request schemas.

## Commit hygiene
- Never put specific prices, percentages or old→new price comparisons in commit messages or PR titles — git history is public and immutable. Use generic descriptions like `fix: align upgrade prompt with current pricing`.

## Publishing

All three channels must be updated on each release:
- **npm:** `npm publish` (prepublishOnly runs typecheck + build automatically)
- **GitHub Releases:** `gh release create vX.Y.Z` on MoLinesDesigns/Brew-TUI
- **Homebrew Tap:** Update `Formula/brew-tui.rb` in MoLinesDesigns/homebrew-tap with new tarball URL and SHA256
- **npm token:** Stored at `/Users/molinesmac/Documents/Secrets/npm token.md` — update `~/.npmrc` if expired
