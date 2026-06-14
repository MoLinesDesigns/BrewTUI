# Changelog

## [4.1.1] - 2026-06-14

### Brew-TUI-Bar

- **One-click upgrades with an 8s countdown.** Tapping a package's upgrade
  button no longer opens a confirmation dialog — it starts an 8-second
  countdown that you can cancel inline. If it isn't cancelled, the upgrade
  begins automatically.
- **Launch at login fixes.** The "Launch at login" toggle now handles the
  `requiresApproval` state (opens System Settings › Login Items) and surfaces a
  clear error instead of silently reverting, re-syncing the toggle with the
  real `SMAppService` status.
- New menu bar icon assets and assorted popover refinements.

### Both

- Version aligned across npm and the menu bar app at 4.1.1.

## [3.3.1] - 2026-05-31

### Fixed

- **Stale outdated list.** Brew-TUI and Brew-TUI-Bar ran `brew outdated` in
  parallel with `brew update`, so the index was often still stale and the UI
  showed "up to date" while the terminal listed real updates. Both apps now
  finish `brew update` before querying outdated (manual refresh included).

## [3.3.0] - 2026-05-29

### Brew-TUI-Bar — Crystal Glass redesign + install progress modal

- **Visual overhaul (Apple Liquid Glass).** New `CrystalGlass.swift` design
  system: `.ultraThinMaterial` panels with cyan/coral gradient overlays,
  hairline gradient borders, ambient shadows. Replaces all solid backgrounds
  in the popover. Spacing scale + radius tokens applied across views.
- **Round transparent buttons.** Purple subscription pills (`yearlyTint`,
  `monthlyTint`) and `.borderedProminent` "Upgrade All" / "Renew Pro" removed.
  Two new SwiftUI button styles: `.glassPill` (capsule, content-sized,
  transparent) and `.glassIcon` (28pt circular, used for refresh / settings /
  quit / dismiss / per-package upgrade arrows).
- **Live install progress modal.** New `InstallProgressView` sheet opens on
  every `brew upgrade` / `upgradeAll`. Per-package rows show stage icons
  (pending → fetching → installing → pouring → linking → done / failed),
  a cyan `CrystalProgressBar` with overall fraction, and Cancel / Done
  buttons. `BrewUpgradeStream` consumes `brew`'s `==>` markers as the
  process emits them and drives the modal in real time.
- **Cancel support.** Tracking `installTask` lets the modal abort an
  in-flight upgrade — cancellation flows through `AsyncStream.onTermination`
  which terminates the brew process.

### Hardening

- **Parser pinned by tests.** `BrewUpgradeStream.packageName` now rejects
  URLs (`https://…`, `file:…`), absolute paths and tokens that don't start
  with a letter, fixing a bug where cask `==> Downloading <url>` lines would
  pollute the modal list. Seven new `@Test`s in
  `BrewUpgradeStreamParserTests` anchor the recognised markers (Upgrading,
  Fetching, Pouring, Caveats, ANSI-coloured lines, etc.) so future brew
  version changes surface as test failures, not blank modals.
- **`BrewChecking.streamUpgrade` with default fallback.** Production
  `BrewChecker` overrides with the real stream; test mocks inherit the
  default that routes through legacy `upgradePackage` / `upgradeAll` so
  existing tests keep working without code changes.

### Localization

- 22 new Spanish translations for install-progress UI and Free funnel pills
  (`Descargando…`, `Instalando…`, `Trabajando…`, `Mensual`, `Anual`,
  `ahorra 27%`, etc.) — see `Localizable.xcstrings`.

### Notes

- Tests: 45 → 52 passing (45 functional + 7 parser + an opt-in screenshot
  generation suite gated by `RUN_SCREENSHOTS=1`).
- No CLI / npm changes. Brew-TUI (TUI) untouched in this release.

## [3.1.0] - 2026-05-26

### Security
- **SEC-M1 — Polar API host validation tightened.** `validateApiUrl()` en
  `src/lib/license/polar-api.ts` rechaza ahora hosts que terminen en
  `polar.sh` sin ser apex o subdominio real. Antes, `evilpolar.sh`
  pasaba el `endsWith('polar.sh')`; ahora se exige `=== 'polar.sh'`
  o `endsWith('.polar.sh')`.
- **SEC-L1 — Fail-closed ante clock skew.** `getDegradationLevel()`
  devuelve `'expired'` cuando `lastValidatedAt` está en el futuro
  (reloj atrasado o manipulado), en lugar de tratarlo como sesión
  válida. Mismo cambio aplicado en `LicenseChecker.swift` para que
  Brew-TUI-Bar mantenga el mismo contrato.
- **SEC-L2 — Machine-id comparison case-insensitive.** La verificación
  de binding compara `machineId.toLowerCase()` en ambos lados para
  evitar falsos positivos cuando UUID se persistió con casing
  distinto entre versiones.
- **SEC-M2 — Legacy AES bundle-only key retirado en Swift.**
  `LicenseChecker.derivedEncryptionKey` deja de tener fallback al
  `legacyEncryptionKey` derivado solo del bundle. La función ahora
  exige machine-id no vacío; sin él, `decrypt()` retorna `nil` con
  log explícito. La `Data.init?(hexString:)` extension y sus tests
  se eliminan (dead code).
- **SEC-M3 — Legacy scrypt fallback retirado en TS.**
  `src/lib/license/license-manager.ts` y `src/lib/sync/crypto.ts`
  ya no derivan ni intentan la key scrypt bundle-only. Solo se
  acepta el HKDF derivado del machine-id (license) o de la license
  key (sync). Cualquier envelope cifrado con la key legacy
  (0.6.2 y anteriores en license, snapshots previos en sync) deja
  de descifrarse — el usuario debe re-activar/re-sincronizar.

### Internal
- `Data.init?(hexString:)` y el suite `DataHexTests` retirados del
  target Swift al quedar sin callers tras SEC-M2.

## [3.0.0] - 2026-05-26

### Breaking
- **Cask `brewbar` disabled.** El cask transicional que envolvía la migración
  desde el rename de 2.0.0 (BrewBar → Brew-TUI-Bar) pasa de `deprecate!` a
  `disable!`. Instalaciones existentes siguen funcionales hasta que el
  usuario ejecute `brew uninstall --cask brewbar`; nuevos `brew install
  --cask brewbar` quedan bloqueados con un mensaje que dirige al cask
  canónico (`molinesdesigns/tap/brew-tui-bar`).
- **Subcomandos CLI legacy retirados.** `brew-tui install-brewbar` y
  `brew-tui uninstall-brewbar` (alias deprecados que llevaban un warning
  desde 2.0.0) ya no se aceptan. La key i18n `cli_brewtuibarLegacyAlias`
  y el branching `command === 'install-brewbar'` se han eliminado. Usa
  `install-brew-tui-bar` / `uninstall-brew-tui-bar`.
- **Auto-cleanup de `/Applications/BrewBar.app` retirado.** La función
  `removeLegacyBundleIfOurs()` del instalador y los `LEGACY_APP_PATH /
  LEGACY_BUNDLE_ID / LEGACY_PROCESS_NAME` se han eliminado. Cualquier
  usuario que aún tenga `/Applications/BrewBar.app` lo verá listado por
  `brew-tui doctor` con la instrucción `rm -rf /Applications/BrewBar.app`
  para limpiarlo a mano; el TUI ya no la toca en cada install.

### Added
- **Deep-link `#pricing`** en el botón "See all plans" del popover Free
  de Brew-TUI-Bar. El usuario aterriza directamente en los badges de
  precios (Pro + Team) en lugar de tener que recorrer la cuadrícula de
  features primero. Anchor añadido al article del Pro card en el repo
  Website.
- **Script de maintainer `scripts/polar-set-regional-prices.mjs`** para
  alinear los prices regionales (USD/GBP/CAD/AUD) en Polar dashboard
  via API. Tres modos: `list`, `plan` (dry-run), `apply`. Requiere
  `POLAR_ACCESS_TOKEN` con permisos `products:read,write`. Reemplaza
  el flujo manual click-a-click del dashboard.

### Internal
- `doctor` actualizado: la sección "Legacy BrewBar.app" sigue listando
  el bundle viejo si existe pero la nota dice "remove manually:
  rm -rf /Applications/BrewBar.app" en lugar de "will be cleaned up on
  next install" (que ya no es cierto en 3.0.0).
- `LegacyMigrator.swift` permanece intacto: la migración one-shot de
  UserDefaults + Login Item del bundle ID viejo al nuevo sigue siendo
  útil para cualquier usuario que llegue desde una versión 1.x sin
  haber abierto Brew-TUI-Bar desde 2.0.0.

## [2.3.2] - 2026-05-26

### Changed
- **Popover Free funnel — iteración visual.** El botón mensual pasa
  arriba (era el secundario abajo); ambos comparten ahora forma, tamaño
  y familia de color (variantes lila saturada / clara) en lugar del par
  prominente + outlined del flow anterior. Corner radius 30. El layout
  vertical se compacta para entrar en el popover de 340×420 sin scroll:
  fuera el `ScrollView`, el header "Already have a license?" como bloque
  separado, y el divider entre el comando y el "See all plans" link.
- **Precios de Pro alineados con los productos vigentes en Polar.** La
  copy del TUI (`upgrade_pricing`, `upgrade_proLabel`, account label) y
  la del popover de Brew-TUI-Bar (CTA mensual + CTA anual + savings tag
  + accessibility labels) ahora reflejan el pricing actual. Polar
  checkout URLs intactas (apuntan a los mismos product IDs); el
  maintainer mantiene los valores dentro de Polar.

## [2.3.1] - 2026-05-25

### Performance
- **Cold-start del TUI ~4 s más rápido.** `fetchAll()` arrancaba `brew doctor`
  (~4 s) y `brew leaves` (~1 s) en paralelo con el resto, aunque la pantalla
  inicial (Dashboard) no leía ninguno de los dos del store. Ahora solo se
  lanzan los cuatro que Dashboard renderiza (`installed`, `outdated`,
  `services`, `config`); `doctor.tsx` ya hacía su propio `useEffect →
  fetchDoctor()` al montar, así que no hay regresión funcional. `leaves`
  no tenía consumidor del store — sigue disponible vía `fetchLeaves()` si
  algún futuro view lo necesita.

### Accessibility
- **Free funnel del popover Brew-TUI-Bar** auditado y refinado:
  - El comando `brew-tui activate <your-license-key>` ya no se trunca a
    `brew-tui activ…` con Dynamic Type grande (`lineLimit(2)` +
    `minimumScaleFactor(0.85)`).
  - El background del bloque del comando dobla su opacidad bajo "Increase
    Contrast" para seguir siendo visible.
  - Botones secundarios (Copy command, See all plans) ganan `frame(min: 22)`
    + `contentShape(Rectangle())` para llegar al 22 pt mínimo que Apple HIG
    recomienda en macOS.
  - Nuevo preview en Xcode Canvas a `dynamicTypeSize(.accessibility3)` como
    regression catch visual.

## [2.3.0] - 2026-05-25

### Added
- **Subcomando `brew-tui doctor`**: dump diagnóstico plano para soporte y
  troubleshooting. Reporta versión del CLI, plataforma + Node, estado de
  Brew-TUI-Bar (instalada, versión, sync vs CLI, bundle ID match, proceso
  corriendo), legacy BrewBar.app si sigue ahí, estado de licencia (tier,
  email, fechas, degradación), brew binary en PATH, presencia de machine-id.
- **`brew-tui --version` ahora detecta mismatch** con Brew-TUI-Bar.app y emite
  un warning a **stderr** (stdout sigue siendo solo la versión limpia, así
  los scripts que parsean `$(brew-tui --version)` no se rompen).
- **Progress bar durante el download de Brew-TUI-Bar.app.zip.** En TTYs
  interactivos sobreescribe la línea con `\r` (`1.4 MB / 3.0 MB (47%)`);
  en non-TTY (e.g. `brew install` capturando stdout) emite una línea
  cada 25%. Antes el usuario veía "Downloading Brew-TUI-Bar..." y
  silencio durante 3-15 segundos.
- **Indicador `↑` de self-update en el popover de Brew-TUI-Bar.** Cuando
  `brew outdated` reporta una versión nueva del propio cask (que se filtra
  del badge para no confundir al usuario), el versionFooter del popover
  muestra un icono pequeño junto a la versión actual. Click → abre Terminal
  con `brew upgrade --cask brew-tui-bar`. Patrón mismo que "Open Brew-TUI".

### Changed
- **`LegacyMigrator` refactorizado para testabilidad.** `migrateUserDefaultsIfNeeded`
  y `completePendingLoginItemMigration` aceptan dependencias inyectables
  (UserDefaults, login-item closures) con defaults idénticos al comportamiento
  de producción. Las constantes `migratedFlagKey` / `pendingLoginItemFlagKey` /
  `legacyBundleId` / `migratedKeys` ahora son `nonisolated static let` para
  poder usarse en default args sin Swift 6 isolation warnings.
- **`OutdatedResponse.selfUpdateVersion`**: nuevo campo opcional poblado en
  proceso por `BrewChecker.checkOutdated()` con la versión más alta de los
  self-casks detectados (`brew-tui-bar` o el transicional `brewbar`).
  Excluido del decoder JSON vía `CodingKeys`; AppState lo expone para el
  indicador del popover.

### Internal
- **Tests del `LegacyMigrator`** (Swift Testing): 10 tests cubriendo legacy
  plist presente/ausente, ya migrado, partial recovery sin clobber, flag
  de login item set/unset, register success / already-enabled / throws.
  Todos usan suite-name UUIDs aislados con teardown de
  `removePersistentDomain` — no tocan los defaults reales del maintainer.
- **Tests del `postinstall.ts`** (vitest): 6 tests cubriendo el gate
  `npm_config_global`, el guard non-darwin, ejecución correcta, fallo
  non-fatal con coerción de Error/string.
- `src/postinstall.ts` refactorizado para exportar `runPostinstall()`
  (testeable) con guard `import.meta.url === argv[1]` para invocación
  como entry point.
- `bundleIdAt(path)` ahora es exported desde `src/lib/brew-tui-bar-installer.ts`
  para que `doctor` pueda reutilizarlo sin duplicar la lógica de
  `defaults read … CFBundleIdentifier`.
- Nuevo módulo `src/lib/doctor.ts` con la lógica del subcomando.

## [2.2.2] - 2026-05-25

### Fixed
- **Notification IDs internos del rename completados.** `NotificationSender`
  todavía emitía notificaciones con prefixes `brewbar-outdated`,
  `brewbar-sync` y `brewbar-cve` — residuo del rename de 2.0.0. Funcionalmente
  equivalentes, pero los IDs aparecían como huellas legacy en cualquier
  inspección del UNUserNotificationCenter. Ahora son `brew-tui-bar-*`.

### Docs
- Auditoría completa de `CLAUDE.md`: corregidos datos contradichos por el
  código (instalación gratuita ya no exige Pro, 30 tests Swift escritos
  donde el doc decía 0, `tuist clean` añadido como paso explícito del
  release runbook), y añadidos los huecos de cobertura detectados
  (aliases CLI deprecados, comando para ejecutar tests Swift, sección
  Naming ampliada con Brew-TUI-Bar / brew-tui-bar / bundle ID, lógica
  `wasEverActive` que discrimina Free vs Expired en el popover, y la
  semántica de `_isPro` ignorado en `installBrewTUIBar`).

## [2.2.1] - 2026-05-25

### Fixed
- **Postinstall ahora actualiza Brew-TUI-Bar.app cuando está desactualizada,
  no solo cuando falta.** En 2.2.0 el postinstall solo bajaba el bundle si
  `/Applications/Brew-TUI-Bar.app` no existía; si el usuario tenía una
  versión vieja se quedaba ahí, y `brew upgrade brew-tui` no actualizaba la
  app. Ahora invoca el mismo helper `syncAndLaunchBrewTUIBar()` que la ruta
  cold-start del TUI: install si falta, reinstall si outdated, launch.
- **Brew-TUI-Bar ya no se cuenta a sí misma como paquete outdated en el
  badge de la barra.** `brew outdated --json=v2` lista todos los casks con
  versión nueva en el tap; cuando se publicaba una release de Brew-TUI-Bar,
  la propia app aparecía como "1 update available", confundiendo al usuario
  ("¿qué paquete?"). `BrewChecker.checkOutdated()` filtra los casks
  `brew-tui-bar` y `brewbar` antes de retornar al popover. El postinstall +
  cold-start ya mantienen el bundle al día sin intervención.

### Internal
- `syncAndLaunchBrewTUIBar()` nuevo helper exportado desde
  `src/lib/brew-tui-bar-installer.ts`. Centraliza la lógica antes duplicada
  entre `ensureBrewTUIBarRunning()` (cold-start) y el `postinstall.ts`
- `BrewChecker.selfCaskNames` set con los nombres de los casks propios

## [2.2.0] - 2026-05-25

### Added
- **Instalación + lanzamiento automático de Brew-TUI-Bar en macOS al instalar
  el CLI globalmente.** Ahora `brew install brew-tui` (que internamente hace
  `npm install --global`) o `npm install -g brew-tui` ejecutan un script
  `postinstall` que descarga `/Applications/Brew-TUI-Bar.app` desde la GH
  Release y lo lanza con `open -g -a`. El usuario ve el icono en la barra
  de menú sin pasos extras.
  - No-op fuera de macOS (`process.platform !== 'darwin'` → return)
  - No-op en instalaciones locales (`npm_config_global !== 'true'` → return),
    así que clonar el repo para desarrollo no toca `/Applications`
  - Non-fatal por diseño: cualquier fallo de red, permisos o disco solo
    imprime un warning con el comando `brew-tui install-brew-tui-bar` como
    fallback, nunca rompe el install
  - Se ejecuta para usuarios Free y Pro (2.1.0 quitó el gate Pro en el
    installer); Free users ven la vista de upgrade en el popover

### Internal
- Nuevo entry `src/postinstall.ts` añadido a `tsup.config.ts`. tsup genera
  `build/postinstall.js` separado del `build/index.js` del CLI
- `package.json` declara `"postinstall": "node build/postinstall.js"`
- Dos nuevas i18n keys (en + es): `postinstall_skipped`, `postinstall_manualHint`

## [2.1.1] - 2026-05-25

### Fixed
- **CLI `--version` reportaba `2.0.1` en 2.1.0.** El `npm publish` previo se
  ejecutó con `--ignore-scripts` (para esquivar el crash libuv de Node 22
  durante `prepublishOnly`), lo que también saltó el rebuild de `build/`.
  Resultado: el tarball publicado tenía `package.json` v2.1.0 pero
  `build/index.js` con `APP_VERSION="2.0.1"` hardcoded por `tsup` desde una
  build anterior. 2.1.1 rebuilda manualmente antes del publish para
  asegurar que el version string embebido coincide con el del paquete.

### Internal
- Sin cambios de código. Solo regenerar artefacto.

## [2.1.0] - 2026-05-25

### Changed
- **Brew-TUI-Bar ahora se instala y ejecuta para usuarios Free.** Antes la
  app exigía Pro y se cerraba al abrirla sin licencia. Ahora cualquier
  usuario macOS la recibe automáticamente al primer `brew-tui` o
  `brew-tui activate`, vive en la barra de menú igual que para Pro, y al
  hacer click muestra un funnel de upgrade dentro del popover con la
  lista de features Pro (Brew-TUI-Bar, Profiles, Smart Cleanup, History,
  Security Audit), CTA destacado "Subscribe Yearly — €82 (save 31%)",
  opción secundaria "Subscribe Monthly — €9.95", caja con el comando
  `brew-tui activate <your-license-key>` y botón de copia, y enlace
  "See all plans".
- **Eliminados los gates Pro del CLI installer.** `installBrewTUIBar()` y
  `ensureBrewTUIBarRunning()` ya no rechazan a Free users. El gate vive
  exclusivamente dentro de la app, que ahora arranca en modo upgrade en
  lugar de terminar con `NSApp.terminate(nil)`.
- **`LicenseSummary` discrimina never-Pro vs expired** vía nuevo campo
  `wasEverActive`. Free user (`.notFound`) ve el funnel completo;
  Pro user con licencia caducada (`.expired`) sigue viendo la UI normal
  con el banner pequeño de renovación al fondo.

### Internal
- 18 nuevas entradas en `Localizable.xcstrings` con traducciones EN+ES
- `cli_brewtuibarProRequired` retirado de i18n (gate eliminado)
- 2 previews Xcode nuevos para la vista Free (EN y ES)
- `PreviewData.makeAppStateFreeTier()` helper para tests visuales

## [2.0.1] - 2026-05-25

### Changed
- **`brew-tui activate` ahora instala y lanza Brew-TUI-Bar inmediatamente.**
  Tras una activación exitosa se dispara la misma ruta de auto-install y
  auto-launch que antes solo se ejecutaba en el siguiente arranque del TUI.
  En macOS + Pro, el bundle aparece en `/Applications/Brew-TUI-Bar.app` y se
  lanza en la barra de menú sin necesidad de re-invocar `brew-tui`. No-op
  en Linux/Windows y libre de fallos (la ruta de cold-start del siguiente
  run sigue cubriendo cualquier error transitorio).

## [2.0.0] - 2026-05-25

### Changed
- **Renombrado: BrewBar → Brew-TUI-Bar.** El nombre `BrewBar` colisionaba con
  un cask de terceros (`omkarkirpan/tap/brewbar`), publicado tres meses antes
  que el nuestro. Reescritura completa del branding interno y externo:
  - Bundle ID: `com.molinesdesigns.brewbar` → `com.molinesdesigns.brewtuibar`
  - Filename: `BrewBar.app` → `Brew-TUI-Bar.app`
  - Subcomandos CLI: `install-brewbar` / `uninstall-brewbar` →
    `install-brew-tui-bar` / `uninstall-brew-tui-bar`. Los aliases viejos
    siguen funcionando con warning de deprecación; se eliminan en 2.1.0.
  - Cask: nuevo `molinesdesigns/tap/brew-tui-bar`; `brewbar` queda como
    cask transicional `deprecate!` que distribuye el mismo binario nuevo.
- **Migrador automático en primer launch** (`LegacyMigrator.swift`): copia
  todos los UserDefaults bajo el bundle ID viejo al nuevo (preferencias de
  badges, intervalos del scheduler, último error, etc.), re-registra el
  Login Item con `SMAppService`, y deja un flag idempotente para no repetir.
  El permiso de notificaciones se vuelve a pedir cuando el usuario active
  notificaciones (limitación de macOS al cambiar bundle ID).
- **Guard de bundle ID en `install-brew-tui-bar`**: antes de tocar
  `/Applications/Brew-TUI-Bar.app` se verifica que el bundle ID coincida con
  `com.molinesdesigns.brewtuibar`. Si encuentra una app de otro autor con el
  mismo nombre, aborta sin sobreescribir.
- **Asset de release renombrado**: `BrewBar.app.zip` →
  `Brew-TUI-Bar.app.zip` (más `.sha256`). El guard prepublish ahora se llama
  `scripts/check-brewtuibar-release.mjs` y la variable de bypass es
  `SKIP_BREWTUIBAR_CHECK` (la antigua sigue aceptada por compatibilidad).
- **Keychain profile de notarización**: `brewbar-notary` se conserva tal cual
  por compatibilidad con los keychains de mantenedores existentes; es un
  alias de credencial, no branding.

### Migration notes
Los usuarios con `brewbar` cask instalado reciben el binario renombrado
automáticamente al hacer `brew upgrade --cask brewbar` (la versión
transicional 2.0.0 instala `Brew-TUI-Bar.app` y limpia `BrewBar.app`).
Para migrar al nombre de cask nuevo:

```
brew uninstall --cask brewbar
brew install --cask molinesdesigns/tap/brew-tui-bar
```

Settings y Login Item se transfieren automáticamente en el primer arranque
de `Brew-TUI-Bar.app`.

## [1.3.0] - 2026-05-21

### Added
- **Brew-TUI-Bar: intervalos de verificación más finos** en Ajustes. Ahora ofrece
  30 minutos y 2 horas además del set previo (1 h / 4 h / 8 h). Los
  rawValues anteriores se conservan, así las preferencias guardadas siguen
  mapeando sin migración.

### Fixed
- **Brew-TUI-Bar: el popover se cierra al hacer click fuera** sin abortar
  procesos en curso. Se añadió un `NSEvent.addGlobalMonitorForEvents`
  (`.leftMouseDown` + `.rightMouseDown`) como red de seguridad sobre el
  `behavior = .transient` existente, que en ocasiones no disparaba el
  cierre por foco residual de la sheet de Settings o por `makeKey()`.
- **Brew-TUI-Bar: refresh y upgrade ya no se cancelan al ocultarse el popover.**
  Se retiraron los `@State Task<Void, Never>?` que se cancelaban en
  `onDisappear` de `PopoverView` y `OutdatedListView`; ahora las
  operaciones viven exclusivamente en `AppState` y completan en
  background. El guard `!isLoading` previene reentradas.

## [1.2.3] - 2026-05-21

### Added
- **Auto-restart de Brew-TUI-Bar al actualizarse**: si Brew-TUI-Bar está corriendo
  cuando `brew-tui install-brew-tui-bar` (o el auto-update del cold-start)
  reemplaza el bundle, ahora se cierra de forma controlada con
  AppleScript (`tell application "Brew-TUI-Bar" to quit`), se sustituye
  `/Applications/Brew-TUI-Bar.app` y se relanza automáticamente. Sin esto el
  proceso vivo quedaba apuntando a un bundle huérfano hasta el siguiente
  arranque manual.

### Changed
- **Guard `prepublishOnly`**: nuevo `scripts/check-brewbar-release.mjs`
  consulta la GitHub API y aborta `npm publish` si la release `vX.Y.Z`
  no contiene `Brew-TUI-Bar.app.zip` + `.sha256`. Previene el escenario que
  rompió 1.2.2 (release publicada sin assets → `install-brew-tui-bar` 404).
  Bypass de emergencia: `SKIP_BREWBAR_CHECK=1 npm publish`.

## [1.2.2] - 2026-05-21

### Security
- **Flag injection prevention** in `compliance-remediator`,
  `brewfile-manager` and `rollback-engine`: package names are now validated
  via `validatePackageName` before being streamed to `brew` (SEG-001,
  SEG-002).
- **PII no longer logged** with `privacy: .public` in Brew-TUI-Bar's
  `LicenseChecker`. Email, license key and instance id pass through a
  `summarizeStatus` helper that redacts before reaching the unified log
  (SEG-003).
- **Path traversal hardening**: `assertSafePath` in `policy-io`, iCloud
  directories created with `mode 0o700`, and `BREW_BIN` resolved to its
  absolute path before exec (BK-005, BK-007, SEG-004).
- **`npm audit fix`**: zero vulnerabilities at publish time (SEG-005).
- `machineId` is hashed with SHA-256 before being sent to Polar (BK-009).

### Fixed
- **TUI ⇄ Brew-TUI-Bar IPC**: `writeLastAction` is now invoked after both
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
- `DesignExploration/` excluded from the notarised Brew-TUI-Bar binary
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
- **Brew-TUI-Bar popover footer** now shows `Brew-TUI-Bar v<version> · <tier>` so the
  user can see at a glance which version is installed and whether the active
  license is Pro or Basic.
- **Brew-TUI-Bar Settings panel** reorganised into five sections:
  - **General** — check interval, launch at login.
  - **Notifications** — toggle plus System Settings hint when denied.
  - **Menu Bar Badges** — independent toggles for the outdated counter, CVE
    alerts, and sync indicator next to the menu bar icon (`BadgePreferences`,
    persisted in UserDefaults, default on).
  - **License** — tier, email, plan, last validated, expiration, plus
    `Revalidate license` (spawns `brew-tui revalidate` in Terminal) and
    `Manage subscription` (opens Polar).
  - **Advanced** — `Brew-TUI-Bar version`, `Brew-TUI CLI` version, `Open data
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
- **Brew-TUI-Bar Info.plist** declares `LSApplicationCategoryType =
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
- **`brew-tui install-brew-tui-bar` progress line.** The "Installing Brew-TUI-Bar…" log
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
- **Brew-TUI-Bar live status banner.** After every `brew upgrade`, `install` or
  `uninstall` from Brew-TUI, Brew-TUI-Bar refreshes immediately and shows a
  friendly banner explaining what happened and how many packages are still
  pending — for example *"Just upgraded htop from Brew-TUI. 3 packages still
  pending an update."* or *"No packages left to update — you're all set."*.
  Auto-fades after 30 s, dismissable manually. The handoff goes through
  `~/.brew-tui/last-action.json` (atomic rename), watched by a
  `DispatchSourceFileSystemObject` in Brew-TUI-Bar — same pattern already used
  for iCloud sync, no new IPC.
- **`useViewInput` hook** that suppresses per-view keypresses while the side
  menu owns input, so arrow keys never get double-handled.

### Cross-platform contract
- Brew-TUI 0.9.0 and Brew-TUI-Bar 0.9.0 are released together. Update both halves
  to keep license decryption and the new live banner working. Brew-TUI-Bar
  detects drift on launch and prompts `brew-tui install-brew-tui-bar --force`.

## [0.8.1] - 2026-05-08

### Fixed
- **Dashboard refresh:** pressing `r` now refetches Homebrew data from any
  state instead of only from the error screen, so the overview stays current
  without leaving the view. Footer hint added so the shortcut is discoverable.

## [0.7.0] - 2026-05-02

### Fixed
- **Brew-TUI-Bar release channel:** notarization and cask publishing now target the
  active package version instead of a hardcoded release tag.
- **AsyncState lint gate:** preserved the public `AsyncState` helper API while
  avoiding the TypeScript value/type redeclaration that blocked pre-push lint.

### Changed
- **Brew-TUI-Bar:** version bumped to 0.7.0 for the notarized macOS companion app.
- **Homebrew:** formula and cask release metadata prepared for Brew-TUI and
  Brew-TUI-Bar 0.7.0.
- **Release metadata:** npm, JSR, package-lock and Tuist marketing versions now
  move together for the 0.7.0 release.

## [0.6.2] - 2026-05-01

### Fixed
- **Security Audit (Pro):** the TUI mirror of the Brew-TUI-Bar OSV bug. `osv-api.ts`
  was sending `ecosystem: 'Homebrew'` to OSV.dev, which rejects that value with
  HTTP 400, so every Security Audit run silently returned zero CVEs. Switched
  to `Bitnami` (same approach already used by `SecurityMonitor.swift`).
  Packages outside Bitnami's catalog return empty results instead of failing
  the whole batch.
- **`brew-tui install-brew-tui-bar`:** the bundled download URL pointed at the old
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
- Stale 0.4.1 Brew-TUI-Bar artefacts (`Brew-TUI-Bar.app.zip`, `.dSYM`) removed from the
  repo working tree; they were already gitignored but had been committed
  earlier.
- Single canonical `getMachineId()` lives in `data-dir.ts`; the four
  diverging implementations across `polar-api`, `license-manager`, `promo`
  and `sync-engine` were collapsed. The hostname fallback in sync (which
  collided same-named machines on freshly-imaged fleets) is gone.
- Brew-TUI-Bar's `BrewProcess.run` drains brew's stdout incrementally; the
  previous synchronous `readDataToEndOfFile()` deadlocked on outputs over
  ~64 KB.
- `~/.brew-tui/snapshots/` is now capped at 20 auto entries per
  `saveSnapshot`; user-labelled checkpoints are preserved.
- Brew-TUI-Bar's license degradation now mirrors the TUI's 7/14/30-day
  thresholds and exposes the level via `LicenseStatus.pro(_, level)`.
- CI now runs `xcodebuild build` + `xcodebuild test` for Brew-TUI-Bar on
  `macos-latest` in addition to the existing `npm run validate` on Ubuntu.

## [0.6.1] - 2026-05-01

### Fixed
- **Brew-TUI-Bar:** outdated count was always zero on systems with cask updates,
  so notifications never fired. `OutdatedPackage` required `pinned: Bool` but
  casks from `brew outdated --json=v2 --greedy` omit that field, making the
  whole JSON decode throw and the refresh abort silently. The decoder now
  treats `pinned` and `pinned_version` as optional and defaults `pinned` to
  `false`, matching the formula contract.
- **Brew-TUI-Bar:** CVE check spammed `OSV API returned HTTP 400` every hour
  because OSV does not accept `Homebrew` as an ecosystem. Switched to
  `Bitnami`, which covers most common OSS packages and filters by version
  correctly. Packages outside Bitnami's catalog return empty results
  instead of crashing the batch.
- **Brew-TUI-Bar:** consecutive outdated notifications were silently replaced
  in macOS Notification Center because every `UNNotificationRequest` reused
  the same identifier. Notifications now use a per-fire timestamped
  identifier so each one shows as a fresh banner.

### Internal
- `AppState.refresh()` now logs decoding/refresh errors via `os.Logger` so
  silent failures show up in `log show --predicate 'subsystem == "com.molinesdesigns.brewtuibar"'`.
- `Brew-TUI-Bar` version bumped to 0.6.1.

## [0.5.3] - 2026-04-29

### Fixed
- **Brew-TUI-Bar:** outdated packages now reflect the current Homebrew formula index.
  Previously `brew update` was never run before `brew outdated`, so Brew-TUI-Bar
  could show zero updates while the terminal found packages to upgrade.
  `AppState.refresh()` now runs `brew update --quiet` first (non-fatal, 120s
  timeout) before the parallel outdated + services check.

### Internal
- `BrewChecker.updateIndex()` added — runs `brew update` without
  `HOMEBREW_NO_AUTO_UPDATE` so the local tap index is always fresh.
- `Brew-TUI-Bar` version bumped to 0.4.2.

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
- **Brew-TUI-Bar menu bar icon:** the status item reserved extra horizontal space because the icon's native size was used and the badge string had a leading whitespace. Icon now forced to 18×18 pt and the badge collapses to truly empty when there is nothing to show.

### Added
- `POLAR_PRODUCT_IDS` and `POLAR_CHECKOUT_URLS` constants for the four live Polar products.
- 4 regression tests for plan detection.

## [0.5.0] - 2026-04-28

### Added — Power Release (Phase 1-6)

- **CVE Real-time monitoring (Pro):** Brew-TUI-Bar polls OSV.dev hourly, shows ⚠N badge in menu bar and sends macOS notifications for new critical/high CVEs in installed packages. Click notification jumps to security-audit view.
- **Impact Analysis (Pro):** pre-upgrade risk panel (low/medium/high) showing dependency tree, breaking changes hint, and reverse-deps that will be affected. Surfaced in `outdated` view before each upgrade.
- **Smart Rollback (Pro):** automatic snapshots after every install/upgrade/uninstall/pin. Rollback view generates plans using bottle/versioned/pin strategies. `R` key in security-audit jumps to rollback for vulnerable packages.
- **Declarative Brewfile (Pro):** YAML-based desired state with drift score 0-100 and interactive reconciliation. High-risk upgrades hint to add the package to Brewfile first.
- **Cross-machine Sync (Pro):** iCloud Drive backend with AES-256-GCM encryption, per-machine identity, interactive conflict resolution, ⟳ drift badge in Brew-TUI-Bar. Post-sync success offers `c` shortcut to Compliance.
- **Team Compliance (Team tier):** PolicyFile JSON, score 0-100, severity-graded violations, automatic remediation plans. New `compliance` view (Team-gated, separate from Pro).
- **Dashboard Pro Status panel:** unified state of the 4 power modules (snapshots, Brewfile drift, sync, compliance).
- **`brew-tui status` CLI:** now shows snapshot count, Brewfile drift, sync state and compliance score.

### Internal
- New shared modules: `state-snapshot/`, `diff-engine/`, `impact/`, `rollback/`, `brewfile/`, `sync/` (with `crypto` + iCloud backend), `compliance/`.
- Brew-TUI-Bar `SyncMonitor.swift` + scheduler hooks for `cveMonitor` and `syncDriftCheck`.
- 205 tests across 20 test files (all passing).

## [0.4.1] - 2026-04-27

### Added
- Brew-TUI-Bar auto-install + auto-launch on every `brew-tui` run for Pro users (macOS only).
- Brew-TUI-Bar auto-registers as a login item the first time it runs as Pro (idempotent; respects later opt-out from Settings).

### Changed
- Brew-TUI-Bar binary now signed with Developer ID + hardened runtime, notarized by Apple, and stapled — installs cleanly without Gatekeeper warnings.
- `LicenseChecker` (Swift) now recognizes built-in PRO accounts so they pass the Pro check in Brew-TUI-Bar.

## [0.2.0] - 2026-04-23

### Security
- Fix: Remove source maps from production bundle
- Fix: Add timeouts to all network requests (15s API, 120s downloads)
- Fix: Verify Brew-TUI-Bar download integrity with SHA-256
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
- Brew-TUI-Bar: Upgrade All now requires confirmation
- Brew-TUI-Bar: Expired license no longer terminates app
- CLI: `status` now reports expired licenses correctly
- CLI: `install-brew-tui-bar` now evaluates the current license before requiring Pro
- Dashboard: partial Homebrew fetch failures now surface explicit warnings instead of misleading stats
- License: revalidation now refreshes degradation state instead of leaving stale warnings
- Brew-TUI-Bar: expired-license guidance now points to `brew-tui revalidate`
- Brew-TUI-Bar: expired licenses now fall back to actual basic mode with upgrades disabled

### Improved
- Dynamic terminal row adaptation (no more hardcoded 20 rows)
- Atomic file writes for license data
- Proper file permissions (0o600) for user data files
- GradientText memoized for better render performance
- fetchAll no longer blocks on brew update
- Brew-TUI-Bar badge timer reduced from 2s to 30s
- Parallel refresh in Brew-TUI-Bar (outdated + services)
- CLI: new `revalidate` command for existing licenses
- Docs and release notes aligned with the current npm-only publish flow

### Added
- Color tokens file (src/utils/colors.ts)
- Fetch timeout utility
- CHANGELOG.md
- Vitest coverage for parsers, `brew-store` concurrency, and `license-store` revalidation

## [0.1.0] - 2026-04-22
- Initial release
