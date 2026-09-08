# AGENTS.md

Guidance for Codex in this repository. **Only rules that must be present every turn.** Task-specific procedures — the full release pipeline, cask guards, menubar installer internals — live in `docs/lessons-learned.md`. Open it before a release, not after something breaks.

## Commands

```bash
npm run dev          # Run with tsx (requires interactive terminal)
npm run build        # Build ESM bundle to ./build via tsup
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run test:watch   # vitest watch mode
npm run lint         # eslint src/
npm run validate     # typecheck + test + build + lint (what pre-push runs)
```

After build: `node bin/brewtui-bar.js` launches the TUI.

CLI subcommands (run without launching the TUI): `activate <key>`, `revalidate`, `deactivate`, `status`, `install-brewtui-bar [--force]`, `uninstall-brewtui-bar`, `delete-account`. Legacy aliases `install-brewbar`/`uninstall-brewbar` still work with a deprecation warning; removal planned for 3.0.0.

> **The menubar app is NOT in this repo.** It lives standalone at `/Volumes/SSD/xCode_Projects/BrewTUI-Bar` (`MoLinesDesigns/BrewTUI-Bar`) with its own `AGENTS.md`; only `menubar.zip` remains here as a snapshot. Every `menubar/…` path below refers to that repo — run `tuist generate`, `scripts/release.sh` and the Swift tests **there**.

## Architecture

Visual TUI for Homebrew built with React 18 + Ink 5.x (terminal renderer). ESM-only (`"type": "module"`), TypeScript strict mode, Node ≥ 22.

```
Views (React) → Stores (Zustand) → brew-api → Parsers → brew-cli (spawn)
```

- **`src/lib/brew-cli.ts`** — two primitives: `execBrew()` (30 s timeout) for instant commands, `streamBrew()` (5 min idle timeout) as an AsyncGenerator yielding lines for install/upgrade. Both set `HOMEBREW_NO_AUTO_UPDATE=1`.
- **`src/lib/parsers/`** — `json-parser.ts` for `brew info/outdated/services --json`, `text-parser.ts` for `brew search/doctor/config`.
- **`src/lib/brew-api.ts`** — typed high-level API combining CLI + parsers. Validates package names via `PKG_PATTERN` before passing to the CLI.
- **`src/stores/brew-store.ts`** — Zustand store with per-key `loading`/`errors` maps; `fetchAll()` runs parallel fetches on startup.
- **`src/stores/navigation-store.ts`** — current view, history stack, selected package, plus `menuMode`/`menuCursor`. `VIEWS` is the canonical order; `MENU_VIEWS` is what the side menu renders and `menuCursor` indexes into.
- **`src/stores/modal-store.ts`** — global modal state using a **reference counter, not a boolean**, so nested suppressors work.
- Pro feature stores (`cleanup-`, `history-`, `security-`, `profile-store.ts`) each wrap their lib module.

16 views routed via `<ViewRouter>` in `src/app.tsx`; `<WelcomeView>` renders outside the router on first launch, license init via `<LicenseInitializer>`. Pro views are gated — non-Pro renders `UpgradePrompt`.

All rendering via Ink's `<Box>`/`<Text>`. `@inkjs/ui` provides `TextInput` (**uncontrolled**: `defaultValue`, not `value`) and `Spinner`. Layout in `src/components/layout/`, shared pieces in `src/components/common/`.

### Navigation & keyboard

Global keys in `src/hooks/use-keyboard.ts` via Ink's `useInput`. The side menu is **active by default on launch**: `↑`/`↓` move its cursor, `Enter` navigates from the first frame. `m` toggles it, `Esc` inside it closes it. Numbers `1`–`0` and `Tab`/`Shift+Tab` no longer change view. Always-global: `q` quit, `Esc` back, `S` search, `L` toggle locale.

Per-view keys add their own handler for `j`/`k`, `Enter`, `/` and actions. **Footer-numbered actions** (`1`, `2`, `3`…) trigger those shortcuts, with the original letters kept as aliases so muscle memory survives; numbering lives in `footer.tsx` (`VIEW_HINT_DEFS`).

**Critical seam — `useViewInput`** (`src/hooks/use-view-input.ts`): every view-level input handler MUST go through this wrapper. It suppresses the handler while `menuMode === true` so the side menu owns the arrow keys without each view re-implementing the gate. New view? Use `useViewInput`, never bare `useInput`.

**Menubar handoff** (`src/lib/data-dir.ts:writeLastAction`): after every `brew upgrade`/`install`/`uninstall` from the TUI, call it with `{ timestamp, action, packages, remainingOutdated, source: 'brewtui-bar' }`. It writes `~/.brewtui-bar/last-action.json` atomically (tmp + rename) so the menubar's `LastActionMonitor` picks it up. Its watcher targets the parent **directory**, not the file, because rename invalidates a file-level descriptor.

## Key Conventions

- All imports use `.js` extensions (ESM requirement with NodeNext resolution)
- `@inkjs/ui` `TextInput` is **uncontrolled** — `defaultValue` + `onChange`/`onSubmit`, never `value`
- Zustand stores accessed directly via `useXxxStore()` hooks, no React Context
- Streaming operations use the `useBrewStream` hook wrapping the AsyncGenerator; debounced values use `useDebounce`
- Homebrew JSON response types in `src/lib/types.ts`, verified against real Homebrew 5.1.6 output. Each Pro feature keeps its own `src/lib/<feature>/types.ts`
- **Colors**: use `COLORS` from `src/utils/colors.ts` — never hardcode hex. Spacing tokens in `src/utils/spacing.ts`
- **Logging**: use `logger` from `src/utils/logger.ts` (`LOG_LEVEL` env). Never bare `console.*` — the one exception is the CLI subcommand handlers in `src/index.tsx`, where stdout/stderr IS the user-facing channel
- **`lib/` modules must not import from stores** — receive `isPro: boolean` as a parameter; callers in views/stores pass it
- **Always validate external API responses at runtime** (Polar, OSV) — never trust `as Type` casts alone
- Reusable UI: `<ResultBanner>` for success/error, `<SelectableRow>` for cursor-highlighted rows
- **Responsive layout**: prefer `useContainerSize(ref)` over `useStdout().columns` for new views — it measures the actual container (CSS `cqi` analog) so views survive being reparented. `useTerminalSize()` is the viewport equivalent

## Freemium Model

- **Licensing (4.0.0+)**: `~/.brewtui-bar/license.json` carries an Ed25519-signed envelope `{version:2, license, sig}` issued by `brewtui-api` (NAS). Clients verify offline with the embedded public key. Pre-4.0.0 AES-GCM envelopes (v1) are rejected — the user runs `brewtui-bar revalidate` once to migrate. Revalidates every 24 h with 7-day offline grace.
- **Machine binding**: the envelope includes `machineId` from `~/.brewtui-bar/machine-id`, preventing license portability between devices.
- **Feature gating**: `src/lib/license/feature-gate.ts` defines which ViewIds are Pro (`PRO_VIEWS`) and which are Team (`TEAM_VIEWS` — a separate tier). `app.tsx` checks `isPro()` before rendering.
- **Pro features**: Profiles, Smart Cleanup, History, Security Audit (OSV.dev, 30 min cache), Smart Rollback, Declarative Brewfile, Cross-machine Sync (iCloud + AES-256-GCM), Impact Analysis. **Team**: Compliance (`src/lib/compliance/`).
- **Data directory**: `~/.brewtui-bar/` managed by `src/lib/data-dir.ts`.
- **Rate limiting**: 30 s cooldown between activation attempts, 15 min lockout after 5 consecutive failures.
- **Integrity**: bundle SHA-256 verified at startup (`checkBundleIntegrity()`, fail-closed). Canary functions always return `false`. `getBuiltinAccountType()` returns `null` **unconditionally** — SEG-009 was closed in 4.0.0 by moving to Ed25519; the regression test pins owner emails among the candidates that must stay `null`. Owner Pro accounts are provisioned via a private free recurring "comp" product in Polar instead.
- **Watermark**: profile exports can embed the user email via zero-width Unicode, and require an explicit `consent` parameter.

## Ed25519 signing contract

- **SPKI wrapper** for raw public keys: 12-byte prefix `302a300506032b6570032100` + 32 raw bytes = 44 bytes. Same prefix in Node `createPublicKey({format:'der', type:'spki'})` and Swift `Curve25519.Signing.PublicKey(rawRepresentation:)`. Strip the prefix to export raw.
- **PKCS8 wrapper** for raw private keys: 16-byte prefix `302e020100300506032b657004220420` + 32 raw bytes.
- **Canonical JSON**: object keys sorted alphabetically, recursive, no whitespace. **Three implementations must agree byte-for-byte**: backend `lib/signer.js`, TUI `license-manager.ts`, Swift `LicenseChecker.swift`.
- The public key constant lives in **three places** — TUI `LICENSE_PUBLIC_KEY_B64`, Swift `licensePublicKeyB64`, and the test vectors in `signature-cross-check.test.ts` + `LicenseCheckerTests.swift`. Rotating `LICENSE_SIGNING_PRIVATE_KEY` on the NAS means updating all three and regenerating the vectors **in the same release**.

## Cross-stack backend (`brewtui-api`)

Express 5 ESM backend at `/Volumes/SSD/Projects/Backends/brewtui-bar`, deployed to the NAS via `bash brewdeploy.sh` (**bash, not zsh**). Public API at `https://api.molinesdesigns.com/api/...` via Cloudflare Tunnel.

- `/api/license/{activate,validate,deactivate,pubkey}` proxies the Polar customer-portal and Ed25519-signs the response. `/api/promo/{validate,redeem,admin/*}` handles promo codes.
- Conventions: `jsonOk`/`jsonError`/`asyncHandler` from `utils/response.js`, Zod per route, `rateLimit(...)` per-IP and per-identity. No test framework — verification is end-to-end with curl post-deploy. `.env` on the NAS is rsync-excluded.
- Polar `status` is normalised backend-side to the TUI's union; sending raw Polar shapes breaks `isLicenseData` **silently**. Detail: `docs/lessons-learned.md` § «Backend brewtui-api».

## Naming

- **BrewTUI** — commercial branding in UI, user-facing text and docs (no hyphen)
- **BrewTUI-Bar** — menubar app branding, `CFBundleDisplayName`, marketing copy
- **brewtui-bar** — CLI command, npm package, filesystem paths (`~/.brewtui-bar/`), cask name in the tap, `install-brewtui-bar` subcommand
- **BrewTUI-Bar.app** / **BrewTUI-Bar** process name — on-disk bundle and `pgrep` target. Legacy hyphenation kept for compatibility; **do not rename without a migration release**
- **`com.molinesdesigns.brewtuibar`** — `CFBundleIdentifier` (no hyphens, Apple convention). The legacy `com.molinesdesigns.brewbar` survives only as a string literal in `CrashReporter.keychainService` to preserve existing keychain entries
- **Why BrewTUI-Bar and not BrewBar**: the 2.0.0 rename was defensive — `omkarkirpan/tap/brewbar` (third-party, same short name and category) shipped three months before ours. The transitional `brewbar` cask was removed from the tap in 4.1.1. **Do not go back to "BrewBar"** without confirming the other project is dead.

## Menubar app invariants (repo `xCode_Projects/BrewTUI-Bar`)

Swift 6 / macOS 14+ / Tuist. Fully independent from this TypeScript codebase — both call `brew` directly.

- `Tuist.swift` goes at the repo root, not `Tuist/Config.swift` (deprecated). SourceKit errors are false positives until `tuist generate` creates the `.xcworkspace`. After editing `Project.swift` (e.g. bumping `MARKETING_VERSION`), **re-run `tuist generate` before building** or `xcodebuild` reports the previous version.
- **`PRODUCT_NAME` with hyphens is sanitised to underscores by Xcode.** `Project.swift` forces `PRODUCT_NAME` + `EXECUTABLE_NAME` to `"BrewTUI-Bar"` and keeps `PRODUCT_MODULE_NAME` as `"BrewTUI_Bar"`; the test target overrides `TEST_HOST` for the same reason. Do not remove these overrides — the cask and scripts look for `BrewTUI-Bar.app` with hyphens.
- **`syncAndLaunchBrewTUIBar()`** (`src/lib/brewtui-bar-installer.ts`) is the shared helper between `ensureBrewTUIBarRunning()` (CLI cold-start) and the npm postinstall. A third caller must reuse it, not duplicate the install/update/launch logic.
- **`installBrewTUIBar(_isPro, force)` ignores `_isPro`** — 2.1.0 removed the Pro gate; the parameter stays for back-compat. Do not re-gate here: the Pro gate lives inside the app (Free funnel in the popover).
- Installer internals (quit-before-replace, bundle ID guard, `LegacyMigrator`, npm postinstall gating, `BrewChecker.selfCaskNames`, Free-vs-Expired discrimination): `docs/lessons-learned.md` § «Menubar».

## Adding a New View

1. Add the ViewId to the union in `src/lib/types.ts`
2. Add it to both `VIEWS` and `MENU_VIEWS` in `src/stores/navigation-store.ts` (exclude from `MENU_VIEWS` only if contextual, like `search`)
3. Create the component in `src/views/` using **`useViewInput`, not `useInput`**
4. Add the route case in `src/app.tsx`'s switch
5. Add keybinding hints in `src/components/layout/footer.tsx` using **numeric keys**; keep `enter`/`esc`/`/` literal when contextual. `hint_chooseNumber` renders automatically when a numeric hint is present
6. In the handler, accept both the number and the legacy letter (e.g. `if (input === 'r' || input === '1')`)
7. Add the label in `src/components/layout/header.tsx`
8. If Pro-only, add the ViewId to `PRO_VIEWS`; if Team-only, to `TEAM_VIEWS`
9. Add all user-facing strings to `src/i18n/en.ts` and `src/i18n/es.ts`
10. If it triggers `brew upgrade`/`install`/`uninstall`, call `writeLastAction()` after the stream succeeds

## Internationalization (i18n)

Both the TUI and the menubar app support English (en) and Spanish (es).

- **TUI**: custom lightweight module in `src/i18n/` — `t(key, values?)` with `{{var}}` interpolation, `tp(baseKey, count)` for plurals via `_one`/`_other` suffixes. **`en.ts` is the source of truth and defines the `Translations` type, so adding a key there without adding it to `es.ts` is a compile error.** Locale detection: `--lang=es` > `LANG`/`LC_ALL`/`LC_MESSAGES` > fallback `en`. Test with `LANG=es_ES.UTF-8 npm run dev`.
- **Homebrew terms** (Formulae, Casks, keg-only, tap) stay in English in both locales. The confirm dialog accepts `y`/`Y` and `s`/`S`.
- **Menubar**: String Catalog `Localizable.xcstrings` (en + es). SwiftUI views auto-extract — just write `Text("New string")`. Non-SwiftUI strings (NSAlert, notifications) use `String(localized:)`. Plurals use String Catalog variations, never a manual ternary.

## Testing and pre-push gate

- **Vitest** (`vitest.config.ts` with `passWithNoTests: false` — the CI gate blocks empty suites). Tests co-located as `*.test.ts(x)`. Mocking with `vi.mock()`/`vi.fn()`/`vi.useFakeTimers()`. `ink-testing-library` is available but not yet used.
- **`vitest.config.ts` uses `pool: 'threads'` deliberately.** The default `forks` fails intermittently when vitest runs inside `git push` (husky pre-push): the git process's stdio breaks the forks' IPC handshake and a random test reports "Failed to start forks worker". `threads` is unaffected and runs ~25× faster. **Do not revert without understanding this.**
- **Pre-push (Husky)**: `npm install` installs `.husky/pre-push`, which runs `npm run validate`. A failing validate aborts the push. `--no-verify` only with a deliberate reason, never as a shortcut around a real failure.
- Menubar: target `BrewTUI-BarTests`, 30 tests in 8 suites (Swift Testing), run with `xcodebuild test` in that repo.

## Gotchas

- **Do NOT upgrade to TypeScript 7** (tried and reverted 2026-08-04). `@typescript-eslint/parser` refuses to load under it with an explicit guard — `Error: typescript-eslint does not support TS 7.0` — so `npm run lint` and the husky pre-push gate fail outright. Worse, plain `npm install` stops resolving (`ERESOLVE`), because even the latest `@typescript-eslint/eslint-plugin` (8.65.0) declares `typescript: ">=4.8.4 <6.1.0"`; only `8.65.1-alpha.*` prereleases exist beyond it. The typecheck output is identical on 6.0.3, so there is nothing to gain. Revisit only when [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) ships stable support (targets TS >= 7.1), and re-verify by running `npx eslint src/` directly — `npm run validate` can pass on a half-resolved tree and hide the failure.
- `npm run dev` requires an interactive TTY — Ink's raw mode fails in pipes/scripts
- On Apple Silicon, `@rollup/rollup-darwin-arm64` may need a manual `npm install` if tsup fails
- `brew search` has no `--json` flag — parsed as text in `text-parser.ts`
- `__TEST_MODE__` and `process.env.APP_VERSION` are replaced at compile time by tsup; in dev (tsx) guard with `typeof __TEST_MODE__ !== 'undefined'`
- Build produces hidden sourcemaps (`.map` files, not referenced in the output bundle)
- The TUI clears the entire terminal (including scrollback) on startup
- Polar API endpoints require a trailing slash, and its OpenAPI spec is public — details in `docs/lessons-learned.md` § «Polar»

## Commit hygiene

Never put specific prices, percentages or old→new price comparisons in commit messages or PR titles — git history is public and immutable. Use generic descriptions like `fix: align upgrade prompt with current pricing`.

## Publishing

**Canonical tap:** `MoLinesDesigns/homebrew-tap` (tapped as `molinesdesigns/tap`). The org was renamed from `MoLinesGitHub` and GitHub silently redirects, so `brew tap molinesgithub/tap` resolves to the **same repo** but registers as a second tap — producing `Formulae found in multiple taps` on every install. **Never re-add the legacy tap**; if it reappears, `brew untap molinesgithub/tap`. Do not script around it.

All three channels must be updated on each release, in this order:

1. `npm version <x.y.z> --no-git-tag-version` → `tuist clean && tuist generate --no-open` in the menubar repo → commit + tag + push. **`tuist clean` is load-bearing**: Tuist caches the compiled manifest, so without it you ship the previous version inside the `.app` while npm advances.
2. `NOTARY_PROFILE=brewbar-notary bash scripts/release.sh` — produces the notarized `BrewTUI-Bar.app.zip` + `.sha256`. Must run BEFORE the GH Release.
3. `gh release create vX.Y.Z` on `MoLinesDesigns/BrewTUI-Bar`, attaching both assets.
4. `npm publish` (`prepublishOnly` runs typecheck + build + lint + the release-asset guard).
5. Bump **two** files in the tap: `Formula/brewtui-bar.rb` (npm tarball SHA) and `Casks/brewtui-bar.rb` (app zip SHA).

Every step has traps that have bitten before — npm 2FA tokens, a libuv crash on Node 22, `--ignore-scripts` shipping a stale `APP_VERSION`, the cask's flag-file dance across `brew reinstall` transactions, `brew style --fix` reordering stanzas. **Read `docs/lessons-learned.md` § «Publicación» before starting a release**, plus auto-memory `release_pipeline.md` for the full step list.
