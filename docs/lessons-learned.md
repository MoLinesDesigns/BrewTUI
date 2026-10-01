# Lessons Learned — BrewTUI-Bar

Procedimientos movidos desde `CLAUDE.md` (2026-08-04) para dejar ahí solo lo que debe estar presente en cada turno. **Abrir este fichero ANTES de una release** o al tocar el installer del menubar: contiene el pipeline de publicación completo, los guards del cask y los gotchas de npm/notarización.

## Publicación — pipeline completo de release

**Canonical tap:** `MoLinesDesigns/homebrew-tap` (tapped as `molinesdesigns/tap`). The org was renamed from `MoLinesGitHub` to `MoLinesDesigns`, and GitHub silently redirects the old URL — so `brew tap molinesgithub/tap` resolves to the **same repo** but registers as a second tap locally. The result is a `Formulae found in multiple taps` error on every install of `brewtui-bar` or its cask. Never re-add the legacy tap; if it shows up (Time Machine restore, fresh shell, copied dotfiles), run `brew untap molinesgithub/tap`. Do not script around this — the fix is local and one-shot.

All three channels must be updated on each release, in this order (auto-memory `release_pipeline.md` has the full step list):
1. `npm version <x.y.z> --no-git-tag-version` → `(cd menubar && tuist clean && tuist generate --no-open)` → commit + tag + push (pre-push runs validate). **`tuist clean` is load-bearing**: Tuist caches the compiled manifest, so `readMarketingVersion()` does NOT re-run when `package.json` changes. Without the clean you ship the previous version inside the .app while npm advances. `release.sh` already enforces this; manual runs must too.
2. `NOTARY_PROFILE=brewbar-notary bash menubar/scripts/release.sh` — produces notarized `menubar/build/BrewTUI-Bar.app.zip` + `.sha256`. Must run BEFORE the GH Release so the zip is available as an asset.
3. `gh release create vX.Y.Z` on MoLinesDesigns/BrewTUI-Bar, attaching `BrewTUI-Bar.app.zip` and `BrewTUI-Bar.app.zip.sha256`.
4. `npm publish` (prepublishOnly runs typecheck + build + lint + asset guard).
   - **`prepublishOnly` también ejecuta `scripts/check-brewtuibar-release.mjs`** que aborta si la release `vX.Y.Z` no tiene `BrewTUI-Bar.app.zip` + `.sha256` adjuntos. Bypass de emergencia: `SKIP_BREWTUIBAR_CHECK=1 npm publish`. Este guard apareció tras 1.2.2 (release publicada sin assets → `install-brewtui-bar` 404).
   - **npm token**: el paquete tiene 2FA estricto. Los Automation tokens dan `HTTP 403: automation token was specified`. Usar **Granular Access Token sin "Bypass 2FA"**; `npm publish` disparará `npm login --auth-type=web` (passkey/Touch ID).
   - **Crash libuv en Node 22**: durante `prepublishOnly` vitest puede abortar con `Assertion failed: (r == 1), function uv__stream_osx_interrupt_select`. Workaround: ejecutar a mano `npm run validate && npm run check:brewtuibar-release` y luego `npm publish --ignore-scripts`. La URL de auth web aparece censurada (`***`) si se ejecuta dentro de Claude Code; lanzar desde terminal nativa.
   - **`--ignore-scripts` salta el rebuild de `prepublishOnly`** → `build/index.js` queda con el `APP_VERSION` viejo embebido aunque `package.json` sea nuevo (sufrido en 2.1.0: bundle publicado con `"2.0.1"` y package con `"2.1.0"`). Antes de publish con `--ignore-scripts`, verificar `grep -oE '"[0-9.]+"' build/index.js | sort -u | head -1` coincide con `package.json`. Si no, `npm run build` manual antes de publicar.
5. Bump `MoLinesDesigns/homebrew-tap`: **dos** archivos: `Formula/brewtui-bar.rb` (npm tarball SHA via `shasum -a 256` on the published `.tgz`) y `Casks/brewtui-bar.rb` (BrewTUI-Bar.app.zip SHA). **El cask transicional `Casks/brewbar.rb` se eliminó del tap en 4.1.1** (estuvo `disable!` desde 3.0.0; migración completa) — ya no se bumpea. Los rezagados que aún lo tengan instalado pueden desinstalarlo con `brew uninstall --cask brewbar` (lee del Caskroom local). El cask `brewtui-bar` trae stanzas `uninstall_preflight` + `preflight` + `postflight` que cierran BrewTUI-Bar viva y la relanzan tras `brew upgrade --cask brewtui-bar` / `brew reinstall --cask brewtui-bar` — **no tocar a la ligera**:
   - Usar **flag file** (`/tmp/.brewtui-bar-was-running.flag`) para pasar estado entre uninstall e install — `brew reinstall` los ejecuta en transacciones separadas y las variables de instancia del cask NO sobreviven.
   - La fase uninstall usa el cask del **Caskroom** (versión instalada previamente), la fase install usa el cask del **tap**. Cambios al `uninstall_preflight` solo cobran efecto completo en el upgrade SIGUIENTE al que los introduce. `preflight` cubre el gap (idempotente con el flag check).
   - `system_command` por defecto trae `must_succeed: true`. Para `pgrep`/`pkill` (que pueden retornar exit 1 legítimamente) usar **`must_succeed: false`** o la stanza falla con `Failure while executing` y deja el cask roto a medias.
   - **`brew style --fix` reordena stanzas** (preflight/postflight/uninstall_preflight en ese orden) y puede mover `flag_path = ...` debajo de los bloques que lo usan — verificar la posición a mano tras el fix. `break unless x || y` es violación rubocop (`Style/UnlessLogicalOperators`); usar `break if !x && !y`. `Cask/Desc` rechaza el platform en la descripción ("Menu bar companion…", no "macOS menu bar companion…").
- **Local tap clone:** `brew tap` already keeps it at `/opt/homebrew/Library/Taps/molinesdesigns/homebrew-tap`. Edit there and `git push origin main` — no need to clone elsewhere.
- **npm token:** Stored at `/Users/molinesmac/Documents/Secrets/npm token.md` — update `~/.npmrc` if expired.
- **Notary health check:** before step 2, run `xcrun notarytool history --keychain-profile brewbar-notary` — a 401 means the keychain profile is gone and `release.sh` will fail.
- **`release.sh` step 6 (LaunchServices cleanup)** deregisters intermediate `.app` bundles (xcarchive, DerivedData ArchiveIntermediates, build/export) so Spotlight doesn't grow a duplicate every release. The DerivedData glob uses `shopt -s nullglob` — load-bearing for `set -e` to survive a fresh checkout where DerivedData doesn't exist yet.
- **Parallelising tap bump while npm publish is blocked by 2FA**: `npm pack` (no `--dry-run`) produces a tarball whose SHA-256 is identical to what the npm registry serves after publish. Bump `Formula/brewtui-bar.rb` with that SHA while the publish web-auth completes; verify after with `curl -sL https://registry.npmjs.org/brewtui-bar/-/brewtui-bar-X.Y.Z.tgz | shasum -a 256`.
- **Testing endpoints behind a new Cloudflare Tunnel hostname before DNS A propagates**: CF publishes AAAA first; IPv4 can lag minutes. Bypass with `curl --resolve <host>:443:104.21.88.226 https://<host>/...` using any active CF edge IP from a sibling subdomain.

## Menubar — installer, migración de bundle ID y guards

- `installBrewTUIBar()` detecta si BrewTUI-Bar está corriendo (`pgrep -x BrewTUI-Bar`), la cierra con `osascript … quit` (graceful, fallback `pkill` tras 3 s) **antes** de `ditto -xk`, y la relanza con `open -g -a` después. Sin esto el bundle se sustituye bajo un proceso vivo y queda en estado degradado. Aplica al subcomando `install-brewtui-bar --force` y al auto-update del cold-start.
- **Bundle ID guard en `installBrewTUIBar()`**: rechaza tocar `/Applications/BrewTUI-Bar.app` si su `CFBundleIdentifier` no es `com.molinesdesigns.brewtuibar`. Defensa contra un futuro tercer cask con el mismo nombre — la app foreign se deja intacta y el comando devuelve `cli_brewtuibarForeignBundle` con el bundle ID ofensor.
- **Bundle ID change pattern (`LegacyMigrator.swift`)**: cambiar el bundle ID detacha UserDefaults, Login Item (`SMAppService`) y notification authorization. UserDefaults se rescata con `UserDefaults(suiteName: legacyBundleId)`; el Login Item requiere `register()` programático tras NSApp inicializado (NO en stored-property init). El migrador está dividido en `migrateUserDefaultsIfNeeded()` (llamada desde el init de `BadgePreferences` para que corra antes que ningún lector de `UserDefaults.standard`) y `completePendingLoginItemMigration()` (llamada desde `applicationDidFinishLaunching`). Notification auth se vuelve a pedir solo cuando algo dispare `requestAuthorization` — no se puede migrar.
- **Auto-install del cask vía npm postinstall**: `src/postinstall.ts` (build/postinstall.js, gateado por `process.env.npm_config_global === 'true'` y `process.platform === 'darwin'`) llama a `syncAndLaunchBrewTUIBar()` para instalar o actualizar `BrewTUI-Bar.app` y lanzarla. **La formula NO lo ejecuta**: desde Homebrew 2025-11-27, `std_npm_args` pasa `--ignore-scripts` por defecto, así que con Homebrew la app llega por el cask (que hace `depends_on` de la formula) y, si falta, por `ensureBrewTUIBarRunning()` en el primer arranque de la CLI. Con npm 12, `npm install -g brewtui-bar` también se lo salta salvo con `--allow-scripts=brewtui-bar` (el README lo indica). No-op en dev local (`npm install` sin `-g`) para no tocar `/Applications` al clonar el repo. Falla siempre non-fatal: cualquier error solo logguea un warning y exit 0.
- **`syncAndLaunchBrewTUIBar()`** en `src/lib/brewtui-bar-installer.ts` es el helper compartido entre `ensureBrewTUIBarRunning()` (cold-start del CLI) y el postinstall. Si añades un tercer caller, reutiliza este helper en lugar de duplicar la lógica de install/update/launch.
- **`BrewChecker.selfCaskNames`** (`menubar/BrewTUI-Bar/Sources/Services/BrewChecker.swift`) filtra los casks `brewtui-bar` y `brewbar` del outdated list. Sin esto, una release nueva en el tap aparece como "1 update available" en el badge confundiendo al usuario ("¿qué paquete?"). El postinstall + cold-start ya mantienen el bundle al día. Si publicas un cask adicional propio en el tap, añádelo aquí.
- **Free vs Expired discrimination en PopoverView**: `LicenseSummary.wasEverActive` distingue `.notFound` (Free, nunca activó) → `false`, de `.expired` (Pro expirado) → `true`. `PopoverView.showsFreeFunnel` muestra la vista upgrade completa cuando `tier == .basic && !wasEverActive`; los expirados ven la UI normal con el banner pequeño `basicModeView` ("Pro license expired") al fondo. Mantener este split si se añade un tercer tier (e.g. trial) — sin él la UI de Free aparecería para todos los no-Pro.
- **`installBrewTUIBar(_isPro, force)` ignora `_isPro`** (subrayado prefix). 2.1.0 quitó el gate Pro; el parámetro queda por back-compat con call sites externos. No volver a gatear aquí: el gate Pro vive dentro de la app (popover Free funnel), no en el installer del CLI.

## Backend `brewtui-api` — detalle de rutas y normalización de Polar

- **`/api/license/{activate,validate,deactivate,pubkey}`** — proxies Polar customer-portal (no auth required) and Ed25519-signs the response. Private key in NAS env `LICENSE_SIGNING_PRIVATE_KEY`. Public key constant must match in three places: TUI `LICENSE_PUBLIC_KEY_B64`, Swift `licensePublicKeyB64`, and the test vectors in `signature-cross-check.test.ts` (Node) + `LicenseCheckerTests.swift` (Swift). Rotating the key → update all three + regenerate vectors in the same release.
- **`/api/promo/{validate,redeem,admin/*}`** — promo code redemption (`src/lib/license/promo.ts`).
- Conventions: `jsonOk`/`jsonError`/`asyncHandler` from `utils/response.js`, Zod validation per route, `rateLimit({windowMs, max, prefix, identity})` per-IP + per-identity. No test framework — verification is end-to-end with curl post-deploy. `.env` on NAS is rsync-excluded; secrets configured in-place via SSH.
- Polar `status` (`granted/revoked/disabled`) is normalised to the TUI's union (`active/expired/inactive`) backend-side in `routes/license.js`; the `plan` is inferred from the key prefix (`BTUI-T-` → team, else pro). Sending raw Polar shapes breaks `isLicenseData` silently.

## Gotchas de la API de Polar

- Polar API endpoints require a trailing slash (e.g. `/v1/products/`); without it the API returns 307, and `curl -L` drops `Authorization` on the redirect so you get 405. Use the slash from the start.
- Polar OpenAPI spec is public at `https://api.polar.sh/openapi.json` — quicker than docs for resolving request schemas.

## Fragmentos comprimidos en `CLAUDE.md` — texto original completo

- (L16 del CLAUDE.md previo) After build: `node bin/brewtui-bar.js` or `./bin/brewtui-bar.js` launches the TUI.

- (L62 del CLAUDE.md previo) - **Pro feature stores:** `cleanup-store.ts`, `history-store.ts`, `security-store.ts`, `profile-store.ts` — each wraps its feature's lib module and manages loading/error state.

- (L72 del CLAUDE.md previo) **BrewTUI-Bar handoff** (`src/lib/data-dir.ts:writeLastAction`): after every `brew upgrade`/`install`/`uninstall` from the TUI, call this with `{ timestamp, action, packages, remainingOutdated, source: 'brewtui-bar' }`. It writes `~/.brewtui-bar/last-action.json` atomically (tmp + rename) so BrewTUI-Bar's `LastActionMonitor` (`menubar/BrewTUI-Bar/Sources/Services/LastActionMonitor.swift`) picks it up via `DispatchSourceFileSystemObject` and fires `AppState.applyLastAction`. The watcher targets the parent directory (not the file) because rename invalidates a file-level descriptor.

- (L76 del CLAUDE.md previo) 16 views routed via `<ViewRouter>` in `src/app.tsx` (switch on `currentView`); `<WelcomeView>` is rendered outside the router on first launch. License initialization is handled by `<LicenseInitializer>`. Each view manages its own `useInput` handler and fetches data on mount via the brew store or direct API calls. Pro views (profiles, smart-cleanup, history, security-audit) are gated — if not Pro, `UpgradePrompt` renders instead. ProfilesView is decomposed into subcomponents in `src/views/profiles/` (list, detail, create, edit modes).

- (L92 del CLAUDE.md previo) - **Logging**: Use `logger` from `src/utils/logger.ts` (levels: debug/info/warn/error, controlled by `LOG_LEVEL` env). Never use bare `console.*` — exception: CLI subcommand handlers in `src/index.tsx` (activate/status/etc.) write directly to stdout/stderr, where `console.log`/`console.error` is the intended user-facing channel

- (L93 del CLAUDE.md previo) - **lib/ modules must not import from stores** — receive `isPro: boolean` as parameter instead of importing `useLicenseStore`. Callers in views/stores pass the value

- (L103 del CLAUDE.md previo) - **Pro features:** Profiles (`src/lib/profiles/`), Smart Cleanup (`src/lib/cleanup/`), History (`src/lib/history/`), Security Audit (`src/lib/security/` via OSV.dev API, 30min cache), Smart Rollback (`src/lib/rollback/` + `src/lib/state-snapshot/`), Declarative Brewfile (`src/lib/brewfile/`, YAML), Cross-machine Sync (`src/lib/sync/` via iCloud + AES-256-GCM), Impact Analysis (`src/lib/impact/`).

- (L110 del CLAUDE.md previo) - **Owner Pro accounts** are instead provisioned via a private free recurring "comp" product in Polar carrying the same `license_keys` benefit (see auto-memory `polar_perpetual_pro.md` for IDs).

- (L121 del CLAUDE.md previo) - `menubar/Project.swift` — Tuist manifest. `LSUIElement: true` (no Dock icon).

- (L122 del CLAUDE.md previo) - `Tuist.swift` goes at `menubar/Tuist.swift` (root, not `Tuist/Config.swift` — deprecated).

- (L125 del CLAUDE.md previo) - **`PRODUCT_NAME` con hyphens en Xcode** se sanitiza a underscores automáticamente. `menubar/Project.swift` fuerza `PRODUCT_NAME` + `EXECUTABLE_NAME` a `"BrewTUI-Bar"` (con hyphens) y mantiene `PRODUCT_MODULE_NAME` como `"BrewTUI_Bar"` (Swift identifier-safe). El test target overrides `TEST_HOST` por la misma razón — Tuist deriva la ruta sanitizada. No quitar estos overrides sin entender que el cask + scripts buscan `BrewTUI-Bar.app` con hyphens.

- (L138 del CLAUDE.md previo) Express 5 ESM backend at `/Volumes/SSD/Projects/Backends/brewtui`, deployed to NAS via `bash brewdeploy.sh` (NOT zsh). Public API at `https://api.molinesdesigns.com/api/...` via Cloudflare Tunnel (UUID `f9ae10c1-8ede-4251-99c4-665e24e6dde8`). Add new public hostnames via CF Zero Trust → Tunnels → that tunnel → Public Hostnames; auto-creates the proxied CNAME.

- (L149 del CLAUDE.md previo) - **Canonical JSON**: object keys sorted alphabetically recursive, no whitespace, `JSON.stringify` for primitives. Three implementations must agree byte-for-byte: backend `lib/signer.js`, TUI `license-manager.ts`, Swift `LicenseChecker.swift`. The cross-check tests pin a vector signed with the production key.

- (L190 del CLAUDE.md previo) - **String Catalog:** `menubar/BrewTUI-Bar/Resources/Localizable.xcstrings` (en + es)

- (L191 del CLAUDE.md previo) - SwiftUI views (`Text`, `Button`, `Label`, etc.) are auto-extracted — no code changes needed

- (L201 del CLAUDE.md previo) `npm install` runs `husky` (via the `prepare` script) and installs a `pre-push` hook at `.husky/pre-push` that runs `npm run validate` (typecheck + test + build + lint). A failing validate aborts the push. Bypass with `git push --no-verify` only when you have a deliberate reason — never as a shortcut around a real failure.

- (L210 del CLAUDE.md previo) - **BrewTUI-Bar:** Test target `BrewTUI-BarTests` defined in `Project.swift`. 30 tests across 8 suites (Swift Testing `@Suite` / `@Test`) in `menubar/BrewTUI-BarTests/Sources/{BrewTUIBarTests,ServiceTests}.swift`. Run with the `xcodebuild test` command in the Commands section.

- (L217 del CLAUDE.md previo) - `__TEST_MODE__` and `process.env.APP_VERSION` are replaced at compile time by tsup (`tsup.config.ts` defines) — in dev mode (tsx), use `typeof __TEST_MODE__ !== 'undefined'` guard

