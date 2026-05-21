# 1. Inventario maestro de cobertura

> Auditor: project-scanner | Fecha: 2026-05-21

## Resumen ejecutivo

Brew-TUI es un producto dual: una TUI Node.js (TypeScript/React/Ink) con modelo freemium (tiers Free, Pro y Team) y una companion app macOS menubar (Swift 6/SwiftUI) llamada BrewBar. El codebase TypeScript contiene 178 archivos `.ts`/`.tsx` (118 fuente + 60 test) con 19.951 LOC; el codebase Swift tiene 27 archivos de produccion mas 2 de test con 4.918 LOC totales incluyendo el target `BrewBarTests`. Se identifican 16 vistas TUI, 13 modulos de libreria Pro/Team, 8 stores Zustand y carpetas de artefactos legacy con impacto en la higiene del repositorio.

---

## 1.1 Inventario de plataformas y targets

> Este proyecto no sigue la arquitectura iOS tipica. Los marcadores se adaptan a la realidad del producto.

* [x] CLI binary macOS — `bin/brew-tui.js` (Node ≥22, ESM, entry `src/index.tsx`)
* [x] App macOS menubar — BrewBar, `com.molinesdesigns.brewbar`, macOS 14+, `LSUIElement: true`
* [ ] App iPhone — No aplica
* [ ] App iPad — No aplica
* [ ] watchOS — No aplica
* [ ] visionOS — No aplica
* [ ] Widgets — No aplica
* [ ] App Clips — No aplica
* [ ] Extensions — No aplica
* [ ] Backend API — No aplica (licencias via Polar API externa; no hay backend propio en este repo)
* [ ] Jobs / workers — No aplica
* [ ] Admin panel / dashboard — No aplica
* [ ] Servicios auxiliares — No aplica (Docker ausente; IPC local via `~/.brew-tui/last-action.json`)

### Detalle de targets

| Target | Plataforma | Bundle ID | Deployment Target | Tipo |
|--------|------------|-----------|-------------------|------|
| `brew-tui` (npm bin) | macOS (Node ≥22) | `brew-tui` (npm package) | Node 22 | CLI / TUI binario |
| `BrewBar` | macOS | `com.molinesdesigns.brewbar` | macOS 14.0 | App menubar (LSUIElement) |
| `BrewBarTests` | macOS | `com.molinesdesigns.brewbar.tests` | macOS 14.0 | Unit test target (XCTest) |

---

## 1.2 Inventario de modulos

### TypeScript / Node — `src/`

| Modulo | Ruta | Archivos fuente | LOC | Responsabilidad |
|--------|------|----------------|-----|-----------------|
| Entry / CLI | `src/index.tsx` + `src/app.tsx` + `src/app.test.tsx` | 3 | 536 | Punto de entrada, router de vistas, inicializacion de licencia |
| stores | `src/stores/` | 16 (12 source + 4 test) | 1.400 | Estado global Zustand: brew, navigation, modal, license, profile, cleanup, history, security, rollback, sync, brewfile, compliance |
| views | `src/views/` | 38 (17 source + 1 profiles/ subdir + 20 test) | 5.169 | 16 vistas TUI + subcomponentes de ProfilesView |
| lib/license | `src/lib/license/` | 20 (11 source + 9 test) | — | Activacion Polar, AES-256-GCM, machine-binding, canaries, integridad del bundle, watermark, promo codes |
| lib/parsers | `src/lib/parsers/` | 4 (2 source + 2 test) | — | JSON parser (`brew info/outdated/services`), text parser (`brew search/doctor/config`) |
| lib/profiles | `src/lib/profiles/` | 3 (2 source + 1 test) | — | Gestion de perfiles declarativos (Pro) |
| lib/cleanup | `src/lib/cleanup/` | 3 (2 source + 1 test) | — | Smart Cleanup analyzer (Pro) |
| lib/history | `src/lib/history/` | 3 (2 source + 1 test) | — | Historial de operaciones brew (Pro) |
| lib/security | `src/lib/security/` | 5 (3 source + 2 test) | — | Security audit via OSV.dev API, cache 30min (Pro) |
| lib/rollback | `src/lib/rollback/` | 3 (2 source + 1 test) | — | Smart Rollback engine (Pro) |
| lib/brewfile | `src/lib/brewfile/` | 5 (3 source + 2 test) | — | Brewfile declarativo YAML (Pro) |
| lib/sync | `src/lib/sync/` | 5 (4 source + 2 test) + `backends/icloud-backend.ts` | — | Cross-machine sync via iCloud, AES-256-GCM (Pro) |
| lib/impact | `src/lib/impact/` | 3 (2 source + 1 test) | — | Impact Analysis de dependencias (Pro) |
| lib/diff-engine | `src/lib/diff-engine/` | 2 (1 source + 1 test) | — | Diff de listas de paquetes |
| lib/state-snapshot | `src/lib/state-snapshot/` | 2 (1 source + 1 test) | — | Snapshot del estado Homebrew previo a operacion |
| lib/compliance | `src/lib/compliance/` | 7 (4 source + 3 test) | — | Policy enforcement (Team tier) |
| lib (root) | `src/lib/*.ts` | 11 archivos source (sin contar tests) | — | brew-cli, brew-api, types, data-dir, analytics, crash-reporter, fetch-timeout, version-check, onboarding, brewbar-installer, async-state |
| components | `src/components/` | 19 (layout: 4, common: 15) | 868 | AppLayout, Header, Footer, componentes reutilizables (StatusBadge, StatCard, ProgressLog, ConfirmDialog, Loading, ResultBanner, SelectableRow, SearchInput, SectionHeader, ProBadge, UpgradePrompt, VersionArrow, BlinkingText, gradient) |
| hooks | `src/hooks/` | 7 source + 2 test | 489 | useKeyboard, useViewInput, useBrewStream, useDebounce, useContainerSize, useTerminalSize, useVisibleRows |
| utils | `src/utils/` | 7 (5 source + 2 test) | 368 | colors (COLORS), spacing, logger, format, gradient |
| i18n | `src/i18n/` | 3 | 1.205 | en.ts (source of truth), es.ts, index.ts |
| test helpers | `src/test/` | 1 | — | `render-at.tsx` (utilidad para ink-testing-library) |

### Swift / BrewBar — `menubar/`

| Modulo | Ruta | Archivos Swift | LOC | Responsabilidad |
|--------|------|---------------|-----|-----------------|
| App | `menubar/BrewBar/Sources/App/` | 2 | 321 | `BrewBarApp.swift` (entry SwiftUI), `AppDelegate.swift` |
| Models | `menubar/BrewBar/Sources/Models/` | 5 | 427 | `AppState`, `BadgePreferences`, `BrewService`, `CVEAlert`, `OutdatedPackage`, `PreviewData` |
| Services | `menubar/BrewBar/Sources/Services/` | 11 | 1.735 | `BrewChecker`, `BrewChecking` (protocol), `BrewProcess`, `CrashReporter`, `LastActionMonitor`, `LicenseChecker`, `NotificationSender`, `SchedulerService`, `SecurityChecking` (protocol), `SecurityMonitor`, `SyncMonitor`, `VersionChecker` |
| Views | `menubar/BrewBar/Sources/Views/` | 4 | 888 | `PopoverView`, `OutdatedListView`, `SettingsView`, `Theme` |
| DesignExploration | `menubar/BrewBar/Sources/DesignExploration/` | 1 | 991 | `BrewBarDesignVariants.swift` — variantes de diseno (no productivo) |
| BrewBarTests | `menubar/BrewBarTests/Sources/` | 2 | 556 | `BrewBarTests.swift`, `ServiceTests.swift` |
| Manifests Tuist | `menubar/` | 2 | — | `Project.swift`, `Tuist.swift` |
| Resources | `menubar/BrewBar/Resources/` | — | — | `Localizable.xcstrings` (en+es), `Assets.xcassets`, `PrivacyInfo.xcprivacy` |

---

## 1.3 Inventario de features

### Dashboard

* **Nombre:** Dashboard
* **Modulo:** `src/views/dashboard.tsx` + `src/stores/brew-store.ts`
* **Pantallas involucradas:** `DashboardView`
* **Casos de uso:** Vista resumen del estado general de Homebrew (formulae instaladas, casks, outdated, servicios)
* **APIs asociadas:** `brew-api.ts` — `getInstalled()`, `getOutdated()`, `getServices()`
* **Persistencia asociada:** Ninguna (solo memoria Zustand)
* **Estados criticos:** Estado de carga paralela via `fetchAll()`; errores por clave en `brew-store.errors`
* **Riesgo funcional:** Bajo — vista de solo lectura, sin mutacion de estado

### Installed

* **Nombre:** Installed
* **Modulo:** `src/views/installed.tsx`
* **Pantallas involucradas:** `InstalledView`
* **Casos de uso:** Listar formulae y casks instalados; filtrado local; acceso a detalle de paquete
* **APIs asociadas:** `brew-api.ts` — `getInstalled()`, `getCaskInfo()`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Filtrado con debounce; navegacion a `package-info`
* **Riesgo funcional:** Bajo

### Outdated

* **Nombre:** Outdated
* **Modulo:** `src/views/outdated.tsx`
* **Pantallas involucradas:** `OutdatedView`
* **Casos de uso:** Listar paquetes desactualizados; actualizar individualmente o todos
* **APIs asociadas:** `brew upgrade <pkg>` via `streamBrew()`, `getOutdated()`
* **Persistencia asociada:** `writeLastAction()` en `data-dir.ts` tras upgrade exitoso (IPC → BrewBar)
* **Estados criticos:** Streaming de upgrade; rollback si falla; actualizar `last-action.json` atomicamente
* **Riesgo funcional:** Alto — operaciones destructivas de upgrade; IPC con BrewBar

### Search

* **Nombre:** Search
* **Modulo:** `src/views/search.tsx`
* **Pantallas involucradas:** `SearchView`
* **Casos de uso:** Busqueda de formulae/casks por nombre; instalar desde resultado
* **APIs asociadas:** `brew-api.ts` — `searchPackages()` (text parser, sin JSON); `brew install` via `streamBrew()`
* **Persistencia asociada:** `writeLastAction()` tras install exitoso
* **Estados criticos:** Debounce de busqueda; validacion de `PKG_PATTERN` antes de pasar al CLI
* **Riesgo funcional:** Medio — instalacion de paquetes arbitrarios

### Package Info

* **Nombre:** Package Info
* **Modulo:** `src/views/package-info.tsx`
* **Pantallas involucradas:** `PackageInfoView`
* **Casos de uso:** Detalle de paquete; instalar/desinstalar/pinear/despinear
* **APIs asociadas:** `brew info --json`, `brew install`, `brew uninstall`, `pinPackage()`, `unpinPackage()`
* **Persistencia asociada:** `writeLastAction()` tras install/uninstall
* **Estados criticos:** Estado de paquete instalado/no instalado/pinneado; streaming de operacion
* **Riesgo funcional:** Alto — desinstalacion y pin afectan el entorno Homebrew

### Doctor

* **Nombre:** Doctor
* **Modulo:** `src/views/doctor.tsx`
* **Pantallas involucradas:** `DoctorView`
* **Casos de uso:** Ejecutar `brew doctor` y mostrar salida; limpiar cache
* **APIs asociadas:** `brew doctor`, `brew cleanup` via `execBrew()`/`streamBrew()`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Salida de texto largo; parsing de advertencias
* **Riesgo funcional:** Bajo

### Services

* **Nombre:** Services
* **Modulo:** `src/views/services.tsx`
* **Pantallas involucradas:** `ServicesView`
* **Casos de uso:** Listar servicios Homebrew; iniciar/detener/reiniciar
* **APIs asociadas:** `brew services --json`, `brew services start/stop/restart`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Estado running/stopped por servicio; operaciones de control
* **Riesgo funcional:** Medio — control de procesos del sistema

### History (Pro)

* **Nombre:** History
* **Modulo:** `src/views/history.tsx` + `src/lib/history/` + `src/stores/history-store.ts`
* **Pantallas involucradas:** `HistoryView`
* **Casos de uso:** Ver historial de operaciones brew; rollback a punto anterior
* **APIs asociadas:** Lee `~/.brew-tui/history.json`
* **Persistencia asociada:** `history-logger.ts` — escribe en `~/.brew-tui/history.json`
* **Estados criticos:** Gating Pro; integridad del historial entre sesiones
* **Riesgo funcional:** Alto — historial incorrecto puede llevar a rollbacks erroneos

### Security Audit (Pro)

* **Nombre:** Security Audit
* **Modulo:** `src/views/security-audit.tsx` + `src/lib/security/` + `src/stores/security-store.ts`
* **Pantallas involucradas:** `SecurityAuditView`
* **Casos de uso:** Analizar CVEs en paquetes instalados via OSV.dev API; mostrar alertas
* **APIs asociadas:** OSV.dev API externa, cache 30min en memoria
* **Persistencia asociada:** Cache en memoria (no persiste entre sesiones)
* **Estados criticos:** Gating Pro; timeout de red; rate limiting de OSV.dev; validacion de respuesta API
* **Riesgo funcional:** Medio — false negatives si la API falla o el cache esta corrupto

### Smart Cleanup (Pro)

* **Nombre:** Smart Cleanup
* **Modulo:** `src/views/smart-cleanup.tsx` + `src/lib/cleanup/` + `src/stores/cleanup-store.ts`
* **Pantallas involucradas:** `SmartCleanupView`
* **Casos de uso:** Identificar paquetes huerfanos, versiones antiguas; limpiar con confirmacion
* **APIs asociadas:** `brew list`, `brew deps`, `brew cleanup --dry-run`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Gating Pro; falsos positivos en deteccion de huerfanos pueden borrar dependencias activas
* **Riesgo funcional:** Alto — operaciones de borrado irreversibles

### Profiles (Pro)

* **Nombre:** Profiles
* **Modulo:** `src/views/profiles.tsx` + `src/views/profiles/` (4 subcomponentes) + `src/lib/profiles/` + `src/stores/profile-store.ts`
* **Pantallas involucradas:** `ProfilesView`, `ProfileListMode`, `ProfileDetailMode`, `ProfileCreateFlow`, `ProfileEditFlow`
* **Casos de uso:** Crear, editar, exportar e importar perfiles de paquetes; watermark en exportacion
* **APIs asociadas:** Lee/escribe `~/.brew-tui/profiles/`
* **Persistencia asociada:** Sistema de archivos local (`profiles/` en data dir)
* **Estados criticos:** Gating Pro; 4 modos de subvista; watermark zero-width Unicode requiere `consent` explicito
* **Riesgo funcional:** Medio

### Rollback (Pro)

* **Nombre:** Rollback
* **Modulo:** `src/views/rollback.tsx` + `src/lib/rollback/` + `src/lib/state-snapshot/` + `src/stores/rollback-store.ts`
* **Pantallas involucradas:** `RollbackView`
* **Casos de uso:** Revertir una operacion brew a un estado anterior usando snapshots
* **APIs asociadas:** `brew install <pkg>@<version>`, `brew uninstall`; lee snapshots de `state-snapshot/`
* **Persistencia asociada:** Snapshots en `~/.brew-tui/` (gestionados por `snapshot.ts`)
* **Estados criticos:** Gating Pro; consistencia snapshot↔estado real; operacion destructiva
* **Riesgo funcional:** Alta — un rollback mal ejecutado puede dejar el entorno Homebrew inconsistente

### Brewfile (Pro)

* **Nombre:** Brewfile
* **Modulo:** `src/views/brewfile.tsx` + `src/lib/brewfile/` + `src/stores/brewfile-store.ts`
* **Pantallas involucradas:** `BrewfileView`
* **Casos de uso:** Generar y aplicar Brewfile declarativo en formato YAML
* **APIs asociadas:** `brew bundle`, lee/escribe archivos YAML locales
* **Persistencia asociada:** Archivos YAML en disco
* **Estados criticos:** Gating Pro; diferencia entre Brewfile de Homebrew (Ruby DSL) y el formato YAML propio
* **Riesgo funcional:** Medio

### Sync (Pro)

* **Nombre:** Sync
* **Modulo:** `src/views/sync.tsx` + `src/lib/sync/` + `src/stores/sync-store.ts`
* **Pantallas involucradas:** `SyncView`
* **Casos de uso:** Sincronizar perfiles/configuracion entre maquinas via iCloud Drive
* **APIs asociadas:** `icloud-backend.ts` — lee/escribe en iCloud Drive path
* **Persistencia asociada:** iCloud Drive + AES-256-GCM cifrado
* **Estados criticos:** Gating Pro; conflictos de sync; disponibilidad de iCloud; clave de cifrado derivada
* **Riesgo funcional:** Alta — perdida o corrupcion de datos de configuracion entre maquinas

### Compliance (Team)

* **Nombre:** Compliance
* **Modulo:** `src/views/compliance.tsx` + `src/lib/compliance/` + `src/stores/compliance-store.ts`
* **Pantallas involucradas:** `ComplianceView`
* **Casos de uso:** Aplicar PolicyFile JSON; verificar y remediar paquetes no conformes
* **APIs asociadas:** `brew list`, `brew install/uninstall` para remediacion
* **Persistencia asociada:** PolicyFile JSON en disco
* **Estados criticos:** Gating Team (tier separado de Pro); remediacion automatica puede instalar/borrar paquetes
* **Riesgo funcional:** Alta — remediacion automatica no supervisada

### Account

* **Nombre:** Account
* **Modulo:** `src/views/account.tsx` + `src/stores/license-store.ts` + `src/lib/license/`
* **Pantallas involucradas:** `AccountView`
* **Casos de uso:** Activar/revalidar/desactivar licencia; mostrar estado de tier; acceso a `install-brewbar`
* **APIs asociadas:** Polar API (`polar-api.ts`), subcommands CLI `activate`/`revalidate`/`deactivate`/`status`
* **Persistencia asociada:** `~/.brew-tui/license.json` (AES-256-GCM, machine-bound) + `~/.brew-tui/machine-id`
* **Estados criticos:** Rate limiting (30s cooldown, lockout 15min tras 5 fallos); offline grace period 7 dias; integridad del bundle
* **Riesgo funcional:** Critica — fallo aqui bloquea acceso a todas las features Pro/Team

### Welcome

* **Nombre:** Welcome
* **Modulo:** `src/views/welcome.tsx`
* **Pantallas involucradas:** `WelcomeView` (fuera del router, primer lanzamiento)
* **Casos de uso:** Onboarding inicial; mostrar instrucciones de navegacion
* **APIs asociadas:** Ninguna
* **Persistencia asociada:** Flag de primer lanzamiento via `onboarding.ts`
* **Estados criticos:** Se renderiza una sola vez; no tiene test unitario
* **Riesgo funcional:** Bajo

---

## 1.4 Dependencias externas

### Produccion (TUI)

| Dependencia | Tipo | Version declarada | Version resuelta | Proposito |
|-------------|------|-------------------|-----------------|-----------|
| `ink` | `dependencies` | `^7.0.1` | `7.0.1` | Renderer React para terminal (Ink) |
| `react` | `dependencies` | `^19.2.5` | `19.2.5` | Motor de componentes UI |
| `@inkjs/ui` | `dependencies` | `^2.0.0` | `2.0.0` | Componentes Ink: TextInput, Spinner |
| `zustand` | `dependencies` | `^5.0.0` | `5.0.12` | Estado global sin Context |

> **Nota SemVer:** Las cuatro dependencias de produccion usan rango abierto con caret (`^`). Cualquier minor/patch de `ink`, `react`, `@inkjs/ui` o `zustand` puede instalarse automaticamente en CI o en instalacion limpia, lo que puede introducir breaking changes sin aviso (riesgo especialmente relevante para `ink` y `react` que tienen historial de cambios de API entre minors).

### Desarrollo (TUI)

| Dependencia | Tipo | Version declarada | Version resuelta | Proposito |
|-------------|------|-------------------|-----------------|-----------|
| `typescript` | `devDependencies` | `~6.0.3` | `6.0.3` | Compilador TypeScript |
| `tsup` | `devDependencies` | `^8.4.0` | `8.5.1` | Bundler (esbuild + rollup) |
| `tsx` | `devDependencies` | `^4.19.0` | `4.21.0` | Dev runner sin build |
| `vitest` | `devDependencies` | `^4.1.5` | `4.1.5` | Framework de tests |
| `eslint` | `devDependencies` | `^10.2.1` | `10.2.1` | Linter |
| `@typescript-eslint/eslint-plugin` | `devDependencies` | `^8.58.0` | `8.59.1` | Reglas ESLint para TS |
| `@typescript-eslint/parser` | `devDependencies` | `^8.58.0` | `8.59.1` | Parser ESLint para TS |
| `@eslint/js` | `devDependencies` | `10.0.1` | `10.0.1` | Reglas ESLint JS base (pinado exacto) |
| `husky` | `devDependencies` | `9.1.7` | `9.1.7` | Git hooks (pre-push) (pinado exacto) |
| `ink-testing-library` | `devDependencies` | `^4.0.0` | `4.0.0` | Render de componentes Ink en tests |
| `prettier` | `devDependencies` | `^3.4.0` | `3.8.3` | Formateador (instalado pero sin config ni script dedicado) |
| `@rollup/rollup-darwin-arm64` | `devDependencies` | `^4.60.1` | `4.60.2` | Binario rollup Apple Silicon para tsup |
| `@types/node` | `devDependencies` | `^25.6.0` | `25.6.0` | Tipos Node |
| `@types/react` | `devDependencies` | `^19.2.14` | `19.2.14` | Tipos React |

### BrewBar (Swift / Tuist — sin SPM packages externos declarados)

| Dependencia | Tipo | Version | Proposito |
|-------------|------|---------|-----------|
| SwiftUI | Framework Apple | macOS 14+ | UI declarativa menubar |
| Foundation | Framework Apple | macOS 14+ | FileManager, UserDefaults, Codable |
| UserNotifications | Framework Apple | macOS 14+ | Notificaciones del sistema |
| ServiceManagement | Framework Apple | macOS 14+ | Launch agents (implícito en SchedulerService) |

> BrewBar no tiene dependencias SPM de terceros. Todas las dependencias son frameworks del sistema Apple.

---

## 1.5 Metricas generales

* **Total archivos `.ts`/`.tsx` en `src/`:** 178 (118 fuente + 60 test)
* **Total LOC TypeScript (`src/`):** 19.951
* **Total archivos Swift en `menubar/BrewBar/Sources/`:** 25 (produccion) + 2 test en `BrewBarTests/Sources/` = 27 archivos de codigo; 2 manifests Tuist adicionales
* **Total LOC Swift (produccion + tests):** 4.362 (`menubar/BrewBar/Sources/`) + 556 (`menubar/BrewBarTests/Sources/`) = 4.918 totales
* **Total targets:** 3 (CLI binary, BrewBar app, BrewBarTests)
* **Total features / vistas TUI:** 16 (Dashboard, Installed, Outdated, Search, PackageInfo, Doctor, Services, History, SecurityAudit, SmartCleanup, Profiles, Rollback, Brewfile, Sync, Compliance, Account) + WelcomeView (onboarding)
* **Total modulos TypeScript:** 22 (ver tabla 1.2)
* **Total modulos Swift:** 5 (App, Models, Services, Views, DesignExploration) + BrewBarTests
* **Total dependencias de produccion:** 4 (todas con rango `^`)
* **Total dependencias de desarrollo:** 14

### LOC por dominio TypeScript

| Dominio | LOC |
|---------|-----|
| `src/lib/` (todos los subdirectorios + root) | 9.852 |
| `src/views/` | 5.169 |
| `src/i18n/` | 1.205 |
| `src/stores/` | 1.400 |
| `src/components/` | 868 |
| `src/hooks/` | 489 |
| `src/utils/` | 368 |
| `src/index.tsx` + `src/app.tsx` + `src/app.test.tsx` | 536 |

### LOC por modulo Swift (produccion)

| Modulo Swift | LOC |
|-------------|-----|
| Services | 1.735 |
| DesignExploration | 991 |
| Views | 888 |
| Models | 427 |
| App | 321 |

---

## 1.6 Cobertura de tests por dominio

### TypeScript

| Dominio | Archivos fuente | Con test | Sin test | Cobertura de archivos |
|---------|----------------|----------|----------|-----------------------|
| `src/views/` (raiz) | 17 | 16 | 1 (`welcome.tsx`) | 94% |
| `src/lib/license/` | 11 | 8 | 3 (`anti-debug.ts`, `anti-tamper.ts`, `pro-guard.ts`) | 73% |
| `src/lib/compliance/` | 4 | 3 | 1 (`types.ts` — solo tipos) | 100% efectivo |
| `src/lib/brewfile/` | 3 | 2 | 1 (`types.ts`) | 100% efectivo |
| `src/lib/cleanup/` | 2 | 1 | 1 (`types.ts`) | 100% efectivo |
| `src/lib/history/` | 2 | 1 | 1 (`types.ts`) | 100% efectivo |
| `src/lib/security/` | 3 | 2 | 1 (`types.ts`) | 100% efectivo |
| `src/lib/profiles/` | 2 | 1 | 1 (`types.ts`) | 100% efectivo |
| `src/lib/rollback/` | 2 | 1 | 1 (`types.ts`) | 100% efectivo |
| `src/lib/sync/` | 4 | 2 | 2 (`types.ts`, `backends/icloud-backend.ts`) | 67% |
| `src/lib/parsers/` | 2 | 2 | 0 | 100% |
| `src/lib/diff-engine/` | 1 | 1 | 0 | 100% |
| `src/lib/state-snapshot/` | 1 | 1 | 0 | 100% |
| `src/lib/` (root, sin types) | 10 | 5 (`brew-api`, `brew-cli`, `brewbar-installer`, `async-state`, `version-check`) | 5 (`analytics.ts`, `crash-reporter.ts`, `data-dir.ts`, `fetch-timeout.ts`, `onboarding.ts`) | 50% |
| `src/stores/` | 12 source stores | 4 (`brew-store`, `license-store`, `modal-store`, `navigation-store`) | 8 (`brewfile-store`, `cleanup-store`, `compliance-store`, `history-store`, `profile-store`, `rollback-store`, `security-store`, `sync-store`) | 33% |
| `src/hooks/` | 7 | 2 (`use-container-size`, `use-terminal-size`) | 5 (`use-brew-stream`, `use-debounce`, `use-keyboard`, `use-view-input`, `use-visible-rows`) | 29% |
| `src/components/common/` | 13 | 3 (`confirm-dialog`, `result-banner`, `upgrade-prompt`) | 10 restantes | 23% |
| `src/utils/` | 5 | 2 (`colors`, `spacing`) | 3 (`format.ts`, `gradient.tsx`, `logger.ts`) | 40% |
| `src/` (root: app.tsx) | 1 | 1 | 0 | 100% |

> **Gaps criticos sin cobertura:**
> - `src/lib/data-dir.ts` — gestiona el directorio `~/.brew-tui/` y la escritura atomica de `last-action.json` (IPC con BrewBar); sin test
> - `src/lib/analytics.ts` — sin test
> - `src/lib/crash-reporter.ts` — sin test
> - `src/lib/sync/backends/icloud-backend.ts` — backend de sync iCloud; sin test
> - `src/lib/license/anti-debug.ts`, `anti-tamper.ts` y `pro-guard.ts` — mecanismos de seguridad sin cobertura de test
> - `src/hooks/use-brew-stream.ts` — hook critico para todas las operaciones streaming (install/upgrade); sin test
> - `src/hooks/use-keyboard.ts` — navegacion global; sin test
> - 8 stores sin test: `brewfile-store`, `cleanup-store`, `compliance-store`, `history-store`, `profile-store`, `rollback-store`, `security-store`, `sync-store`

### Swift / BrewBar

| Modulo | Archivos | Cobertura |
|--------|----------|-----------|
| BrewBarTests | 2 archivos, 556 LOC | Existente pero superficial (2 archivos para 25 fuentes) |
| App | 2 archivos | Sin test unitario especifico |
| Models | 5 archivos | Sin test unitario especifico |
| Services | 11 archivos | Parcialmente cubierto por `ServiceTests.swift` |
| Views | 4 archivos | Sin test (tipico en SwiftUI preview-based) |
| DesignExploration | 1 archivo | No productivo, sin test |

---

## 1.7 Recursos, artefactos y carpetas notables

### Imagenes en raiz del repositorio

| Ubicacion | Cantidad | Tamano aproximado | Estado git | Nota |
|-----------|----------|-------------------|------------|------|
| PNGs en `/` (raiz) | 53 archivos | ~21 MB | No trackeados (`.gitignore: *.png` con whitelist) | Clutter en worktree: screenshots de Reddit, marketing, variantes de diseno. Deben moverse a `assets/` o eliminarse |
| `assets/` | Varios | 1,4 MB | Trackeados (whitelisted) | Demo gif, screenshots de producto, README images |
| `screenshots/` | 5 archivos | 2,4 MB | Trackeados (whitelisted) | Screenshots de producto para documentacion |

### Carpetas legacy y artefactos de desarrollo

| Carpeta | Tamano | Trackeada en git | Naturaleza |
|---------|--------|-----------------|-----------|
| `dist-standalone/` | 62 MB | No (0 archivos trackeados) | Binario Bun standalone legacy; gigantesco; solo clutter local |
| `build/` | 1,2 MB | No (en `.gitignore`) | Output de `npm run build`; regenerable |
| `superaudit-report.2026-05-01/` | 548 KB | No (0 archivos trackeados) | Auditoria anterior completa (10 secciones); no versionada |
| `.playwright-mcp/` | No medido | **198 archivos TRACKEADOS** | Artefactos de sesiones MCP (logs `.log`, snapshots `.yml`, screenshots `.png`). El `.gitignore` tiene la regla `.playwright-mcp/` pero los archivos fueron commiteados ANTES de agregar la regla — siguen trackeados. Requiere `git rm -r --cached .playwright-mcp/` |
| `menubar/Derived/` | No medido | No (en `.gitignore`) | Artefactos de build Tuist/Xcode |
| `menubar/build/` | No medido | No (en `.gitignore`) | Output de `release.sh` |

> **Hallazgo critico de gobierno:** `.playwright-mcp/` contiene 198 archivos trackeados en git (logs de consola, snapshots YAML de paginas web, screenshots PNG de sesiones Playwright) a pesar de estar listado en `.gitignore`. Esto ocurre porque los archivos fueron añadidos al indice antes de que se creara la regla de ignore. No aumentan el tamano del repo publicado (`.npmignore` los excluye), pero inflan el historial de git y el tamano del clone.

---

## 1.8 Configuracion y gobierno

### Manifests de proyecto

| Archivo | Proposito |
|---------|-----------|
| `package.json` | Fuente de verdad de version (leida por `Project.swift`), scripts npm, dependencias |
| `tsconfig.json` | TypeScript strict, NodeNext modules, ES2022 target |
| `tsup.config.ts` | Bundle ESM, tree-shaking, inyeccion de `APP_VERSION`, `NODE_ENV`, `__TEST_MODE__` |
| `vitest.config.ts` | `passWithNoTests: false`; umbrales de cobertura (lines/functions/branches/statements 50-60%); provider v8 opcional |
| `eslint.config.js` | ESLint con `@typescript-eslint` |
| `menubar/Project.swift` | Tuist manifest; lee version de `package.json`; 2 targets (BrewBar + BrewBarTests); `SWIFT_STRICT_CONCURRENCY=complete`; `SWIFT_VERSION=6.0` |
| `menubar/Tuist.swift` | Config Tuist minima (`Config()` por defecto) |

### CI/CD y hooks

| Componente | Archivo | Contenido |
|------------|---------|-----------|
| GitHub Actions — CI | `.github/workflows/ci.yml` | Job `validate` (ubuntu-latest, Node 22): `npm ci && npm run validate` (typecheck+test+build+lint). Job `brewbar` (macos-latest): Tuist generate + `xcodebuild build` + `xcodebuild test` |
| Husky pre-push | `.husky/pre-push` | `npm run validate` — bloquea push si typecheck, test, build o lint fallan |
| CODEOWNERS | `.github/CODEOWNERS` | Presente |
| Dependabot | `.github/dependabot.yml` | Presente |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` | Presente |
| Issue templates | `.github/ISSUE_TEMPLATE/` | Presente |

### Canales de publicacion

| Canal | Detalle |
|-------|---------|
| npm | Paquete `brew-tui` en registro publico; `prepublishOnly` corre `validate` completo |
| Homebrew tap | `MoLinesDesigns/homebrew-tap` — `Formula/brew-tui.rb` + `Casks/brewbar.rb` (en `homebrew/` del repo) |
| GitHub Releases | `vX.Y.Z` con assets `BrewBar.app.zip` + `.sha256` |
| MacPorts | `homebrew/macports/brew-tui.tcl` (presente en repo, estado de mantenimiento no verificado) |
| Notarizacion | `brewbar-notary` keychain profile; `menubar/scripts/release.sh`; `menubar/exportOptions.plist` |
