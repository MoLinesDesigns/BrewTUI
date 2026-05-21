# 1. Inventario maestro de cobertura

> Auditor: project-scanner | Fecha: 2026-05-01

## Resumen ejecutivo

Brew-TUI es un proyecto hibrido con dos codebases independientes que comparten solo el repositorio git: un TUI de terminal en TypeScript/React/Ink (141 archivos, 16.596 lineas) y BrewBar, una app nativa de macOS en Swift 6/SwiftUI (22 archivos, 3.837 lineas incluyendo tests). Ambas herramientas invocan `brew` directamente sin compartir codigo ni IPC. El proyecto implementa un modelo freemium con dos tiers (Pro / Team) sobre Polar API, cifrado AES-256-GCM, machine-binding y un conjunto de 11 features Pro/Team gateadas. La suite de tests TypeScript cuenta con 35 archivos de test (4.923 lineas); BrewBar tiene 2 archivos de test Swift (519 lineas). La version actual publicada es 0.6.1 en npm y GitHub Releases; la formula Homebrew tap permanece en 0.5.3.

---

## 1.1 Inventario de plataformas y targets

* [x] CLI/TUI macOS — `brew-tui` (Node ≥ 22, ESM, npm package)
* [x] App macOS menu bar — `BrewBar` (Swift 6, macOS 14+, Sonoma+)
* [ ] App iPhone — No aplica (no hay target iOS)
* [ ] App iPad — No aplica
* [ ] App watchOS — No aplica
* [ ] visionOS — No aplica
* [ ] Widgets — No aplica
* [ ] App Clips — No aplica
* [ ] Extensions (Notification, Share, Intent) — No aplica
* [x] Backend API (externo) — Polar API (`api.polar.sh/v1`), OSV.dev API (`api.osv.dev/v1`), Promo API (`api.molinesdesigns.com/api/promo`)
* [ ] Jobs / workers dedicados — No aplica (el scheduler de BrewBar es interno a la app, no un job independiente)
* [ ] Admin panel / dashboard — No aplica
* [x] Servicios auxiliares — GitHub Actions CI, Husky pre-push hook, iCloud Drive (backend de sync), Homebrew tap (canal de distribucion)

### Detalle de targets

| Target | Plataforma | Bundle ID / Package | Deployment Target | Tipo |
|--------|------------|---------------------|-------------------|------|
| `brew-tui` (bin) | Node.js / macOS (CLI) | `brew-tui` (npm) | Node ≥ 22 | CLI + TUI (Ink/React) |
| `BrewBar` | macOS | `com.molinesdesigns.brewbar` | macOS 14.0 (Sonoma) | App nativa (.app, LSUIElement, no Dock icon) |
| `BrewBarTests` | macOS | `com.molinesdesigns.brewbar.tests` | macOS 14.0 | Unit tests target (Swift Testing framework) |
| `brew-tui` (Homebrew Formula) | macOS | — | Node ≥ 22 via `node@22` dep | Distribucion via tap |
| `brewbar` (Homebrew Cask) | macOS | — | macOS ≥ Sonoma | Distribucion via tap |

**Notas de configuracion BrewBar:**
- Swift version: 6.0 (`SWIFT_STRICT_CONCURRENCY: complete`)
- Firma Release: Developer ID Application, Hardened Runtime activado, timestamp
- Firma Debug: Automatic / Apple Development, Hardened Runtime desactivado (para Xcode Previews)
- `LSUIElement: true` — sin icono en el Dock, solo menu bar
- `DEAD_CODE_STRIPPING: YES`, `ENABLE_USER_SCRIPT_SANDBOXING: YES`

**Notas de configuracion TUI:**
- `"type": "module"` (ESM puro), `tsconfig` module: NodeNext
- `tsup.config.ts` target: `node18` — **desincronizacion**: engines declara `>=22`
- Build output: `./build/index.js` (ESM, hidden sourcemaps)
- Shim de entrada: `bin/brew-tui.js` (una linea: `import '../build/index.js'`)
- Compile-time defines: `process.env.APP_VERSION`, `process.env.NODE_ENV = "production"`, `__TEST_MODE__ = false`

---

## 1.2 Inventario de modulos

### TypeScript / TUI (`src/`)

| Modulo | Ruta | Archivos (.ts/.tsx) | Lineas (aprox) | Responsabilidad |
|--------|------|---------------------|----------------|-----------------|
| Entry point | `src/index.tsx` | 1 | 250 | CLI subcommands (activate, deactivate, revalidate, status, install-brewbar, delete-account) + render TUI |
| App root | `src/app.tsx` | 1 | 81 | Composition root React; `LicenseInitializer`, `ViewRouter`, gate Pro/Team views |
| Views | `src/views/` | 20 | 3.717 | 16 vistas routables (15 en `VIEWS` de navigation-store + `search`, accesible por shortcut) (dashboard hasta account); `profiles/` descompuesto en 4 subcomponentes |
| Components — layout | `src/components/layout/` | 3 | ~280 | `AppLayout`, `Header`, `Footer` |
| Components — common | `src/components/common/` | 15 (12 src + 3 test) | ~412 | `StatusBadge`, `StatCard`, `ProgressLog`, `ConfirmDialog`, `Loading`, `ResultBanner`, `SearchInput`, `SectionHeader`, `SelectableRow`, `ProBadge`, `UpgradePrompt`, `VersionArrow` + 3 test files |
| Hooks | `src/hooks/` | 3 | 186 | `use-keyboard`, `use-brew-stream`, `use-debounce` |
| i18n | `src/i18n/` | 3 | 1.123 | Traduccion en/es; `t()`, `tp()` (plurales); 532 lineas por locale |
| Utils | `src/utils/` | 5 | 196 | `colors.ts` (tokens), `spacing.ts` (tokens), `logger.ts`, `format.ts`, `gradient.tsx` |
| Stores | `src/stores/` | 16 | 1.268 | Zustand: `brew-store`, `navigation-store`, `modal-store`, `license-store`, `profile-store`, `cleanup-store`, `history-store`, `security-store`, `rollback-store`, `brewfile-store`, `sync-store`, `compliance-store` + 4 test files |
| lib — core | `src/lib/` (raiz) | 7 | 1.200 | `brew-cli.ts`, `brew-api.ts`, `types.ts`, `data-dir.ts`, `crash-reporter.ts`, `fetch-timeout.ts`, `brewbar-installer.ts` |
| lib — parsers | `src/lib/parsers/` | 4 | 312 | `json-parser.ts` (brew info/outdated/services JSON), `text-parser.ts` (brew search/doctor/config texto) |
| lib — license | `src/lib/license/` | 18 | 2.268 | `license-manager.ts`, `polar-api.ts`, `feature-gate.ts`, `canary.ts`, `integrity.ts`, `anti-debug.ts`, `anti-tamper.ts`, `watermark.ts`, `promo.ts`, `pro-guard.ts`, `types.ts` |
| lib — profiles (Pro) | `src/lib/profiles/` | 3 | 300 | `profile-manager.ts`, `types.ts` |
| lib — cleanup (Pro) | `src/lib/cleanup/` | 3 | 257 | `cleanup-analyzer.ts`, `types.ts` |
| lib — history (Pro) | `src/lib/history/` | 3 | 288 | `history-logger.ts`, `types.ts` |
| lib — security (Pro) | `src/lib/security/` | 5 | 618 | `audit-runner.ts`, `osv-api.ts`, `types.ts` |
| lib — rollback (Pro) | `src/lib/rollback/` | 3 | 393 | `rollback-engine.ts`, `types.ts` |
| lib — brewfile (Pro) | `src/lib/brewfile/` | 5 | 797 | `brewfile-manager.ts`, `yaml-serializer.ts`, `types.ts` |
| lib — sync (Pro) | `src/lib/sync/` | 6 | 885 | `sync-engine.ts`, `crypto.ts`, `backends/icloud-backend.ts`, `types.ts` |
| lib — compliance (Team) | `src/lib/compliance/` | 7 | 735 | `compliance-checker.ts`, `compliance-remediator.ts`, `policy-io.ts`, `types.ts` |
| lib — impact (Pro) | `src/lib/impact/` | 3 | 247 | `impact-analyzer.ts`, `types.ts` |
| lib — diff-engine | `src/lib/diff-engine/` | 2 | 376 | `diff.ts` — comparacion de snapshots Homebrew |
| lib — state-snapshot | `src/lib/state-snapshot/` | 2 | 407 | `snapshot.ts` — captura de estado Homebrew en disco (`~/.brew-tui/snapshots/`) |

**Total TypeScript/TSX:** 141 archivos, 16.596 lineas (prod + test)
**Solo tests TypeScript:** 35 archivos, 4.923 lineas

### Swift / BrewBar (`menubar/BrewBar/`)

| Modulo | Ruta | Archivos (.swift) | Lineas (aprox) | Responsabilidad |
|--------|------|-------------------|----------------|-----------------|
| App | `Sources/App/` | 2 | 267 | `BrewBarApp.swift` (entry point SwiftUI), `AppDelegate.swift` |
| Models | `Sources/Models/` | 5 | 303 | `AppState.swift` (@Observable, @MainActor), `OutdatedPackage.swift`, `BrewService.swift`, `CVEAlert.swift`, `PreviewData.swift` |
| Services | `Sources/Services/` | 8 | 1.194 | `BrewChecker.swift`, `BrewChecking.swift` (protocol), `BrewProcess.swift`, `LicenseChecker.swift`, `SchedulerService.swift` (@Observable), `SecurityChecking.swift` (protocol), `SecurityMonitor.swift` (actor), `SyncMonitor.swift` (actor) |
| Views | `Sources/Views/` | 3 | 563 | `PopoverView.swift`, `OutdatedListView.swift`, `SettingsView.swift` |
| DesignExploration | `Sources/DesignExploration/` | 1 | 991 | `BrewBarDesignVariants.swift` — archivo de iteracion visual (Xcode Previews) |
| Tests | `../../BrewBarTests/Sources/` | 2 | 519 | `BrewBarTests.swift` (modelo OutdatedPackage), `ServiceTests.swift` |
| Resources | `Resources/` | 3 archivos | — | `Assets.xcassets`, `Localizable.xcstrings` (en/es, String Catalog), `PrivacyInfo.xcprivacy` |

**Total Swift:** 20 archivos fuente, 3.318 lineas + 2 archivos test, 519 lineas = 3.837 lineas totales

### Distribucion y CI

| Modulo | Ruta | Descripcion |
|--------|------|-------------|
| Homebrew Formula | `homebrew/Formula/brew-tui.rb` | Formula para la CLI (version 0.5.3 — desactualizada) |
| Homebrew Cask | `homebrew/Casks/brewbar.rb` | Cask para BrewBar.app (version 0.1.0 — desactualizada) |
| MacPorts | `homebrew/macports/brew-tui.tcl` | Portfile MacPorts (no auditado en profundidad) |
| Standalone Bun | `dist-standalone/brew-tui-bun` | Binario standalone compilado con Bun (distribucion alternativa) |
| GitHub Actions CI | `.github/workflows/ci.yml` | ubuntu-latest, Node 22, `npm ci && npm run validate` |
| Scripts | `scripts/` | `publish-all.sh`, `generate-promos.ts`, `record-demo.sh`, `test-pro.js`, vhx tapes para demo |

---

## 1.3 Inventario de features

Las features del TUI se identifican por el `ViewId` en `src/lib/types.ts`. La lista canonicа proviene de `VIEWS` en `navigation-store.ts`. Las vistas Pro y Team estan gateadas en `src/lib/license/feature-gate.ts`.

### Dashboard

* **Nombre:** Dashboard
* **ViewId:** `dashboard`
* **Modulo:** `src/views/dashboard.tsx`
* **Pantallas involucradas:** Vista unica con StatCards (formulae, casks, outdated, services), panel Pro Status (snapshots, Brewfile drift, sync, compliance score)
* **Casos de uso:** Resumen ejecutivo del estado de Homebrew; punto de entrada principal
* **APIs asociadas:** `brew-store` (`fetchAll()` en paralelo: getInstalled, getOutdated, getServices); stores Pro (cleanup, brewfile, sync, compliance) para panel Pro
* **Persistencia asociada:** Ninguna propia; lee de stores en memoria
* **Estados criticos:** Loading paralelo inicial, errores por store con degradacion independiente
* **Tier:** Free
* **Riesgo funcional:** Bajo — pantalla de lectura

### Installed

* **Nombre:** Paquetes instalados
* **ViewId:** `installed`
* **Modulo:** `src/views/installed.tsx`
* **Pantallas involucradas:** Lista de formulae y casks instalados con busqueda en tiempo real, seleccion de tipo (formula/cask), navegacion a PackageInfo
* **Casos de uso:** Ver todos los paquetes instalados, buscar por nombre, ver detalle de paquete
* **APIs asociadas:** `brew-store` (formulae/casks instalados); navegacion a `package-info`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Debounce en busqueda, seleccion de tipo de paquete
* **Tier:** Free
* **Riesgo funcional:** Bajo

### Search

* **Nombre:** Busqueda de paquetes
* **ViewId:** `search`
* **Modulo:** `src/views/search.tsx`
* **Pantallas involucradas:** Campo de busqueda, lista de resultados, navegacion a PackageInfo
* **Casos de uso:** Buscar formulae/casks en el indice Homebrew, instalar paquetes nuevos
* **APIs asociadas:** `brew-api.searchPackages()` → `execBrew(['search', query])` → `text-parser.parseSearchResults()`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** `brew search` no tiene flag `--json` (texto puro); debounce; streaming de instalacion via `useBrewStream`
* **Tier:** Free
* **Riesgo funcional:** Medio — instalacion es operacion destructiva sin rollback automatico en tier free

### Outdated

* **Nombre:** Paquetes desactualizados
* **ViewId:** `outdated`
* **Modulo:** `src/views/outdated.tsx`
* **Pantallas involucradas:** Lista de paquetes con actualizacion disponible; panel de Impact Analysis (Pro) antes de cada upgrade; `ProgressLog` durante streaming
* **Casos de uso:** Ver outdated, hacer upgrade individual o masivo, analizar impacto antes de actualizar (Pro)
* **APIs asociadas:** `brew-store.getOutdated()` → `execBrew(['outdated', '--json=v2', '--greedy'])`; `analyzeUpgradeImpact()` (Pro) via OSV deps; `streamBrew(['upgrade', name])`
* **Persistencia asociada:** Snapshots post-upgrade via `state-snapshot` (Pro)
* **Estados criticos:** Streaming de larga duracion (5 min idle timeout), Impact Analysis como gate visual, pin/unpin de paquetes
* **Tier:** Free (Impact Analysis es Pro)
* **Riesgo funcional:** Alto — upgrade de paquetes puede romper dependencias

### Package Info

* **Nombre:** Informacion de paquete
* **ViewId:** `package-info`
* **Modulo:** `src/views/package-info.tsx`
* **Pantallas involucradas:** Detalle de formula o cask: version, dependencias, caveats, descripcion, acciones (install/upgrade/uninstall/pin)
* **Casos de uso:** Ver detalle completo, ejecutar acciones sobre el paquete
* **APIs asociadas:** `getFormulaInfo()` / `getCaskInfo()` via `execBrew(['info', '--json=v2', name/--cask])` con validacion `PKG_PATTERN`
* **Persistencia asociada:** Ninguna propia
* **Estados criticos:** Validacion del nombre de paquete antes de pasar a CLI; streaming de install/uninstall
* **Tier:** Free
* **Riesgo funcional:** Medio — operaciones destructivas (uninstall)

### Services

* **Nombre:** Servicios Homebrew
* **ViewId:** `services`
* **Modulo:** `src/views/services.tsx`
* **Pantallas involucradas:** Lista de servicios con estado (started/stopped/error), start/stop/restart
* **Casos de uso:** Gestionar daemons de Homebrew services (postgresql, redis, nginx, etc.)
* **APIs asociadas:** `brew-store.getServices()` → `execBrew(['services', 'list', '--json'])`; `execBrew(['services', action, name])`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Servicios en estado error; permisos de root en algunos servicios
* **Tier:** Free
* **Riesgo funcional:** Medio — detener servicios puede afectar entorno de desarrollo local

### Doctor

* **Nombre:** Diagnostico del sistema
* **ViewId:** `doctor`
* **Modulo:** `src/views/doctor.tsx`
* **Pantallas involucradas:** Output de `brew doctor` con parsing de texto libre
* **Casos de uso:** Detectar problemas en la instalacion de Homebrew
* **APIs asociadas:** `execBrew(['doctor'])` + `text-parser.parseDoctorOutput()`
* **Persistencia asociada:** Ninguna
* **Estados criticos:** Output variable segun estado del sistema; sin JSON estructurado
* **Tier:** Free
* **Riesgo funcional:** Bajo — solo lectura

### Profiles (Pro)

* **Nombre:** Perfiles de paquetes
* **ViewId:** `profiles`
* **Modulo:** `src/views/profiles.tsx` + `src/views/profiles/` (4 subcomponentes)
* **Pantallas involucradas:** `ProfilesView` (lista), `ProfileListMode`, `ProfileDetailMode`, `ProfileCreateFlow`, `ProfileEditFlow`
* **Casos de uso:** Crear/editar/aplicar/eliminar perfiles de paquetes (conjuntos de formulae/casks); exportar con watermark
* **APIs asociadas:** `profile-manager.ts`; `brew-api` para aplicar; `watermark.ts` para exports
* **Persistencia asociada:** `~/.brew-tui/profiles/` (archivos JSON por perfil)
* **Estados criticos:** Aplicacion de perfil instala/desinstala paquetes; watermark con zero-width Unicode requiere `consent` explicito
* **Tier:** Pro
* **Riesgo funcional:** Alto — aplicar perfil puede instalar o desinstalar paquetes

### Smart Cleanup (Pro)

* **Nombre:** Limpieza inteligente
* **ViewId:** `smart-cleanup`
* **Modulo:** `src/views/smart-cleanup.tsx`
* **Pantallas involucradas:** Lista de paquetes candidatos a eliminar, analisis de dependencias, confirmacion
* **Casos de uso:** Identificar y eliminar paquetes no usados de forma segura
* **APIs asociadas:** `cleanup-analyzer.ts`; `execBrew(['cleanup', ...])` via `brew-api`
* **Persistencia asociada:** Ninguna propia
* **Estados criticos:** Analisis de dependencias antes de eliminar; operacion destructiva irreversible sin snapshot en esta vista
* **Tier:** Pro
* **Riesgo funcional:** Alto — eliminacion de paquetes

### History (Pro)

* **Nombre:** Historial de operaciones
* **ViewId:** `history`
* **Modulo:** `src/views/history.tsx`
* **Pantallas involucradas:** Lista cronologica de operaciones Homebrew (install/upgrade/uninstall/pin)
* **Casos de uso:** Auditar cambios pasados en el entorno Homebrew; filtrar por tipo y fecha
* **APIs asociadas:** `history-logger.ts`
* **Persistencia asociada:** `~/.brew-tui/history.json`
* **Estados criticos:** Archivo de historial puede crecer sin limite definido
* **Tier:** Pro
* **Riesgo funcional:** Bajo

### Rollback (Pro)

* **Nombre:** Rollback inteligente
* **ViewId:** `rollback`
* **Modulo:** `src/views/rollback.tsx`
* **Pantallas involucradas:** Lista de snapshots disponibles, plan de rollback generado, confirmacion y ejecucion
* **Casos de uso:** Revertir el estado de Homebrew a un snapshot anterior; estrategias bottle/versioned/pin
* **APIs asociadas:** `rollback-engine.ts`; `state-snapshot/snapshot.ts`; `execBrew` para aplicar rollback
* **Persistencia asociada:** `~/.brew-tui/snapshots/` (un JSON por snapshot)
* **Estados criticos:** Snapshots se capturan automaticamente post-operacion; rollback es destructivo (desinstala versiones actuales)
* **Tier:** Pro
* **Riesgo funcional:** Alto — operacion destructiva que modifica el entorno

### Brewfile (Pro)

* **Nombre:** Brewfile declarativo
* **ViewId:** `brewfile`
* **Modulo:** `src/views/brewfile.tsx`
* **Pantallas involucradas:** Editor de desired state YAML, drift score 0-100, reconciliacion interactiva
* **Casos de uso:** Definir el estado deseado de Homebrew como YAML, detectar drift, aplicar reconciliacion
* **APIs asociadas:** `brewfile-manager.ts`, `yaml-serializer.ts`; `diff-engine/diff.ts`; `state-snapshot`
* **Persistencia asociada:** Archivo Brewfile YAML en disco (ruta configurable)
* **Estados criticos:** Drift score calculado comparando snapshot actual con desired state; reconciliacion puede instalar o eliminar paquetes
* **Tier:** Pro
* **Riesgo funcional:** Alto — reconciliacion puede instalar/desinstalar paquetes masivamente

### Sync (Pro)

* **Nombre:** Sincronizacion cross-machine
* **ViewId:** `sync`
* **Modulo:** `src/views/sync.tsx`
* **Pantallas involucradas:** Estado de sync, resolucion interactiva de conflictos, detalle de maquinas sincronizadas
* **Casos de uso:** Sincronizar estado Homebrew entre maquinas via iCloud Drive; detectar conflictos; resolver manualmente
* **APIs asociadas:** `sync-engine.ts`; `crypto.ts` (AES-256-GCM); `backends/icloud-backend.ts`; `state-snapshot`
* **Persistencia asociada:** `~/Library/Mobile Documents/com~apple~CloudDocs/BrewTUI/sync.json` (cifrado AES-GCM); `~/.brew-tui/sync-config.json`
* **Estados criticos:** Conflictos entre maquinas con estado divergente; cifrado/descifrado del envelope; badge de drift en BrewBar via `SyncMonitor`
* **Tier:** Pro
* **Riesgo funcional:** Alto — sync puede sobrescribir estado local; depende de disponibilidad de iCloud

### Security Audit (Pro)

* **Nombre:** Auditoria de seguridad
* **ViewId:** `security-audit`
* **Modulo:** `src/views/security-audit.tsx`
* **Pantallas involucradas:** Lista de vulnerabilidades CVE por paquete instalado, severidad (CRITICAL/HIGH/MEDIUM/LOW), cache de 30 min, atajo `R` para ir a Rollback
* **Casos de uso:** Detectar vulnerabilidades CVE en paquetes Homebrew instalados via OSV.dev; navegar a rollback para paquetes vulnerables
* **APIs asociadas:** `security/osv-api.ts` → `https://api.osv.dev/v1/querybatch` (ecosistema Bitnami); `audit-runner.ts`; cache en `~/.brew-tui/cve-cache.json`
* **Persistencia asociada:** `~/.brew-tui/cve-cache.json` (TTL: 30 min TUI / 60 min BrewBar)
* **Estados criticos:** Rate del OSV API; ecosistema `Bitnami` no cubre todos los paquetes Homebrew; cache compartida entre TUI y BrewBar
* **Tier:** Pro
* **Riesgo funcional:** Medio — falsos negativos posibles (paquetes fuera del catalogo Bitnami)

### Compliance (Team)

* **Nombre:** Cumplimiento de politicas
* **ViewId:** `compliance`
* **Modulo:** `src/views/compliance.tsx`
* **Pantallas involucradas:** Score 0-100, lista de violaciones con severidad, planes de remediacion automatica
* **Casos de uso:** Verificar que el entorno Homebrew cumple un PolicyFile JSON de equipo; aplicar remediacion automatica
* **APIs asociadas:** `compliance-checker.ts`, `compliance-remediator.ts`, `policy-io.ts`; `state-snapshot`; `execBrew` para remediar
* **Persistencia asociada:** PolicyFile JSON (ruta configurable); snapshots para comparacion
* **Estados criticos:** Remediacion automatica es destructiva (instala/desinstala paquetes); score calculado en tiempo de ejecucion
* **Tier:** Team (tier separado de Pro; requiere `status === 'team'`)
* **Riesgo funcional:** Alto — remediacion automatica modifica el entorno

### Account

* **Nombre:** Cuenta y licencia
* **ViewId:** `account`
* **Modulo:** `src/views/account.tsx`
* **Pantallas involucradas:** Estado de licencia (plan, email, expiracion), acciones (activar, revalidar, desactivar), pricing Pro/Team
* **Casos de uso:** Ver estado actual de la licencia, activar/desactivar, ver tier y fecha de expiracion
* **APIs asociadas:** `license-store` → `license-manager.ts` → `polar-api.ts`
* **Persistencia asociada:** `~/.brew-tui/license.json` (AES-256-GCM cifrado)
* **Estados criticos:** Rate limiting (30s cooldown, lockout 15 min tras 5 intentos); grace period 7 dias offline; machine binding via `machineId`
* **Tier:** Free (visible para todos)
* **Riesgo funcional:** Critico — acceso a todos los features Pro/Team depende de este modulo

---

## 1.4 Dependencias externas

### TypeScript / npm (dependencies)

| Dependencia | Tipo | Version | Proposito |
|-------------|------|---------|-----------|
| `ink` | Runtime | `^7.0.1` | Terminal renderer (React → ANSI/terminal) |
| `react` | Runtime | `^19.2.5` | Framework UI declarativo |
| `@inkjs/ui` | Runtime | `^2.0.0` | Componentes Ink (TextInput, Spinner) — uncontrolled |
| `zustand` | Runtime | `^5.0.0` | State management |

### TypeScript / npm (devDependencies)

| Dependencia | Tipo | Version | Proposito |
|-------------|------|---------|-----------|
| `typescript` | Dev | `~6.0.3` | Compilador TS (strict mode, NodeNext) |
| `tsup` | Dev | `^8.4.0` | Bundler (wraps esbuild) |
| `tsx` | Dev | `^4.19.0` | Ejecucion directa de TS para `npm run dev` |
| `vitest` | Dev | `^4.1.5` | Test runner |
| `eslint` | Dev | `^10.2.1` | Linter |
| `@typescript-eslint/eslint-plugin` | Dev | `^8.58.0` | Reglas TS para ESLint |
| `@typescript-eslint/parser` | Dev | `^8.58.0` | Parser TS para ESLint |
| `husky` | Dev | `9.1.7` | Git hooks (pre-push: validate) |
| `ink-testing-library` | Dev | `^4.0.0` | Utilidad de test para Ink (disponible, no en uso activo) |
| `prettier` | Dev | `^3.4.0` | Formateador (disponible, sin config propia detectada) |
| `@rollup/rollup-darwin-arm64` | Dev | `^4.60.1` | Rollup nativo ARM para Apple Silicon |
| `@types/node` | Dev | `^25.6.0` | Tipos Node.js |
| `@types/react` | Dev | `^19.2.14` | Tipos React |

### APIs externas

| Servicio | URL | Auth | Proposito |
|----------|-----|------|-----------|
| Polar API | `https://api.polar.sh/v1/customer-portal/license-keys` | Bearer token (license key) | Activacion, validacion, desactivacion de licencias |
| OSV.dev API | `https://api.osv.dev/v1/querybatch` | Ninguna | Consulta batch de CVEs por paquete/version |
| Promo API | `https://api.molinesdesigns.com/api/promo` | Bearer token (machine-bound) | Canjes de codigos promocionales |
| GitHub Releases | `https://github.com/MoLinesGitHub/Brew-TUI/releases/latest/download/BrewBar.app.zip` | Ninguna | Descarga de BrewBar.app para install-brewbar |

### Swift / BrewBar (dependencias del sistema)

| Framework | Tipo | Proposito |
|-----------|------|-----------|
| SwiftUI | Apple SDK | UI declarativa del popover y settings |
| AppKit | Apple SDK | Menu bar (NSStatusItem), integracion macOS |
| Foundation | Apple SDK | Networking (URLSession), JSON, FileManager |
| CryptoKit | Apple SDK | AES-256-GCM para descifrar license.json |
| UserNotifications | Apple SDK | Notificaciones macOS (outdated, CVE) |
| ServiceManagement | Apple SDK | Launch at Login (SMAppService) |
| os.Logger | Apple SDK | Logging estructurado (subsistema `com.molinesdesigns.brewbar`) |

### Canales de distribucion

| Canal | Estado | Version publicada |
|-------|--------|-------------------|
| npm (`brew-tui`) | Publicado | 0.6.1 |
| GitHub Releases | Publicado | v0.6.1 |
| Homebrew Formula (`brew-tui`) | Desactualizado | 0.5.3 (tap: MoLinesGitHub/homebrew-tap) |
| Homebrew Cask (`brewbar`) | Desactualizado | 0.1.0 |
| Bun standalone (`dist-standalone/brew-tui-bun`) | No documentado en README | Desconocida |

---

## 1.5 Metricas generales

* **Total archivos TypeScript/TSX (src/):** 141
* **Total lineas de codigo TypeScript (aprox):** 16.596 (prod + tests)
* **Total archivos de test TypeScript:** 35 archivos, 4.923 lineas
* **Total archivos Swift (menubar/BrewBar/):** 20 fuente + 2 test = 22 archivos
* **Total lineas Swift (aprox):** 3.318 fuente + 519 tests = 3.837 lineas
* **Total lineas de codigo del proyecto (aprox):** 20.433
* **Total targets (binarios/apps):** 3 (brew-tui CLI, BrewBar.app, BrewBarTests)
* **Total views/pantallas TUI:** 16 routables (15 en `VIEWS` de navigation-store + `search`, accesible solo via shortcut `/`)
* **Total features Pro:** 7 vistas gateadas en `PRO_VIEWS` (`profiles`, `smart-cleanup`, `history`, `rollback`, `brewfile`, `sync`, `security-audit`) + 1 feature Pro inline no gateada (Impact Analysis en vista `outdated`)
* **Total features Team:** 1 view gateada (`compliance`)
* **Total modulos TypeScript lib/:** 14 subdirectorios + raiz
* **Total modulos Swift:** 5 grupos (App, Models, Services, Views, DesignExploration)
* **Total dependencias npm runtime:** 4
* **Total dependencias npm devDependencies:** 13
* **Total APIs externas:** 4 (Polar, OSV.dev, Promo API, GitHub Releases)
* **CI/CD:** GitHub Actions (1 workflow `ci.yml`) + Husky pre-push hook (`npm run validate`)
* **Cobertura de tests TypeScript:** 35/141 archivos tienen tests (24.8%). Todos los modulos de `lib/` tienen tests; views y la mayoria de components no tienen tests de integracion/UI
* **Cobertura de tests Swift (BrewBar):** 2 archivos de test para modelos y servicios; Services y Views no tienen tests E2E
* **Secretos en repositorio:** Ninguno detectado. `ENCRYPTION_SECRET` y `SCRYPT_SALT` estan hardcodeados en el bundle npm (documentado como limitacion arquitectonica conocida en `license-manager.ts`)
* **Datos de usuario en disco (`~/.brew-tui/`):** `license.json` (cifrado), `machine-id`, `history.json`, `cve-cache.json`, `profiles/`, `snapshots/`, `sync-config.json`; todos con permisos `0o700` (directorio) / `0o600` (archivos sensibles)
