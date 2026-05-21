# SUPERAUDIT-REPORT — Reporte de Auditoria Completo

> Generado por: report-consolidator | Fecha: 2026-05-01

---

## Estadisticas globales

* **Fecha de auditoria:** 2026-05-01
* **Proyecto:** Brew-TUI + BrewBar v0.6.1
* **Total hallazgos:** 98
* **Criticos:** 2 | **Altos:** 22 | **Medios:** 38 | **Bajos:** 36
* **Dominios auditados:** 14 de 14
* **Pantallas auditadas:** 16 de 16 (TUI) + 3 (SwiftUI BrewBar)
* **Endpoints auditados:** 5 integraciones HTTP externas + 8 subcomandos CLI + ~25 invocaciones brew
* **Archivos TypeScript:** 141 (16.596 lineas) | **Archivos Swift:** 22 (3.837 lineas)

---

## Tabla de contenidos

1. [0. Ficha de auditoria](#0-ficha-de-auditoria)
2. [1. Inventario maestro de cobertura](#1-inventario-maestro-de-cobertura)
3. [2. Gobierno del proyecto](#2-gobierno-del-proyecto)
4. [3-4. Arquitectura, concurrencia y estado](#3-4-arquitectura-concurrencia-y-estado)
5. [5. UI estructural](#5-ui-estructural)
6. [6. UX funcional](#6-ux-funcional)
7. [7-8. Design system y accesibilidad](#7-8-design-system-y-accesibilidad)
8. [11. Backend funcional y persistencia](#11-backend-funcional-y-persistencia)
9. [13. Seguridad y privacidad](#13-seguridad-y-privacidad)
10. [14-15. Testing y observabilidad](#14-15-testing-y-observabilidad)
11. [16. Rendimiento](#16-rendimiento)
12. [17-18. Localizacion y release readiness](#17-18-localizacion-y-release-readiness)
13. [19. Auditoria por pantalla](#19-auditoria-por-pantalla)
14. [20. Auditoria por endpoint](#20-auditoria-por-endpoint)
15. [21. Registro central de hallazgos](#21-registro-central-de-hallazgos)
16. [22. Priorizacion ejecutiva](#22-priorizacion-ejecutiva)
17. [23. Veredicto final](#23-veredicto-final)
18. [24. Checklist ultra resumido](#24-checklist-ultra-resumido)

---

# 0. Ficha de auditoria

> Auditor: project-scanner | Fecha: 2026-05-01

## Datos del proyecto

* **Nombre del proyecto:** Brew-TUI + BrewBar
* **Version actual:** 0.6.1 (npm / GitHub Release / BrewBar). Nota: la formula Homebrew tap (`homebrew/Formula/brew-tui.rb`) todavia apunta a 0.5.3 — desincronizacion documentada.
* **Plataformas:** macOS (CLI via Node.js, TUI en terminal) + macOS 14+ (BrewBar, app nativa en menu bar)
* **Stack principal:**
  * TUI: TypeScript 6, React 19, Ink 7 (terminal renderer), Zustand 5 — ESM-only, Node >= 22
  * BrewBar: Swift 6, SwiftUI + AppKit, macOS 14+ (Sonoma+), Observation (`@Observable`), async/await estricto, Swift strict concurrency
  * Build TUI: tsup 8 + tsx 4, vitest 4, ESLint 10
  * Build BrewBar: Tuist (Project.swift + Tuist.swift), xcodebuild
  * CI/CD: GitHub Actions (ubuntu-latest, Node 22), Husky pre-push
  * Licencias: Polar API (SaaS), AES-256-GCM para license.json en disco
  * Seguridad CVE: OSV.dev API (batch endpoint)
  * Sync: iCloud Drive con AES-256-GCM
* **Repositorio:** https://github.com/MoLinesDesigns/Brew-TUI.git
* **Commit auditado:** 72b6d84 (chore: release v0.6.1)
* **Rama auditada:** main
* **Fecha de auditoria:** 2026-05-01

## Escala de severidad

* **Critica:** riesgo de caida, fuga de datos, perdida de negocio o bloqueo de uso
* **Alta:** afecta flujos clave, calidad percibida o mantenibilidad severamente
* **Media:** afecta consistencia, deuda tecnica o UX de forma relevante
* **Baja:** mejora recomendable sin impacto grave inmediato

---

# 1. Inventario maestro de cobertura

> Auditor: project-scanner | Fecha: 2026-05-01

## Resumen ejecutivo

Brew-TUI es un proyecto hibrido con dos codebases independientes: un TUI de terminal en TypeScript/React/Ink (141 archivos, 16.596 lineas) y BrewBar, una app nativa de macOS en Swift 6/SwiftUI (22 archivos, 3.837 lineas incluyendo tests). Ambas herramientas invocan `brew` directamente sin compartir codigo ni IPC. El proyecto implementa un modelo freemium con dos tiers (Pro / Team) sobre Polar API, cifrado AES-256-GCM, machine-binding y 11 features Pro/Team gateadas. La suite de tests TypeScript cuenta con 35 archivos de test (4.923 lineas); BrewBar tiene 2 archivos de test Swift (519 lineas). La version actual publicada es 0.6.1 en npm y GitHub Releases; la formula Homebrew tap permanece en 0.5.3.

## Metricas generales

* **Total archivos TypeScript/TSX (src/):** 141
* **Total lineas de codigo TypeScript (aprox):** 16.596 (prod + tests)
* **Total archivos de test TypeScript:** 35 archivos, 4.923 lineas
* **Total archivos Swift (menubar/BrewBar/):** 20 fuente + 2 test = 22 archivos
* **Total lineas Swift (aprox):** 3.318 fuente + 519 tests = 3.837 lineas
* **Total lineas de codigo del proyecto (aprox):** 20.433
* **Total views/pantallas TUI:** 16 routables
* **Total features Pro:** 7 vistas gateadas (`profiles`, `smart-cleanup`, `history`, `rollback`, `brewfile`, `sync`, `security-audit`) + 1 feature Pro inline (Impact Analysis en `outdated`)
* **Total features Team:** 1 view gateada (`compliance`)
* **Total APIs externas:** 4 (Polar, OSV.dev, Promo API, GitHub Releases)
* **CI/CD:** GitHub Actions (1 workflow `ci.yml`) + Husky pre-push hook (`npm run validate`)
* **Cobertura de tests TypeScript:** 35/141 archivos tienen tests (24.8%). Todos los modulos de `lib/` tienen tests; views y la mayoria de components no tienen tests de integracion/UI
* **Cobertura de tests Swift (BrewBar):** 2 archivos de test para modelos y servicios; sin tests E2E

## Canales de distribucion

| Canal | Estado | Version publicada |
|-------|--------|-------------------|
| npm (`brew-tui`) | Publicado | 0.6.1 |
| GitHub Releases | Publicado | v0.6.1 |
| Homebrew Formula (`brew-tui`) | Desactualizado | 0.5.3 |
| Homebrew Cask (`brewbar`) | Desactualizado + URL rota | 0.1.0 |
| Bun standalone (`dist-standalone/brew-tui-bun`) | No documentado | Desconocida |

---

# 2. Gobierno del proyecto

> Auditor: governance-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto tiene una base de gobierno razonablemente solida: `package.json` incluye un allowlist de `files` que limita el contenido publicado a npm, el pipeline de pre-push ejecuta la suite de validacion completa, y BrewBar configura correctamente Developer ID Application, Hardened Runtime y timestamp para Release. Sin embargo, se identifican **siete hallazgos de severidad Alta**: (1) la pipeline de release de BrewBar es enteramente manual sin ningun step de CI que compile, archive, firme ni notarice la app; (2-3) los canales Homebrew Formula (`0.5.3`) y Homebrew Cask (`0.1.0`) apuntan a versiones dramaticamente desactualizadas con la URL del Cask rota (usuario GitHub incorrecto); (4) `jsr.json` esta en la version `0.5.2` mientras el proyecto es `0.6.1`; (5) BrewBar no tiene notarizacion en ningun script ni CI; (6) el `PrivacyInfo.xcprivacy` declara `NSPrivacyAccessedAPICategoryFileTimestamp` sin ninguna llamada a APIs de timestamps de fichero en el codigo Swift; (7) los secretos AES hardcodeados en el bundle npm y en el binario Swift (evaluados en detalle en seccion 13).

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| CI pipeline Swift (BrewBar) | No conforme | Alta | `.github/workflows/ci.yml`: `ubuntu-latest`, sin ningun step Swift | Anadir job con runner `macos-latest` que ejecute `tuist generate && xcodebuild test -scheme BrewBar` |
| `NSPrivacyAccessedAPICategoryFileTimestamp` sin justificacion | No conforme | Alta | `PrivacyInfo.xcprivacy:14-21`: sin `attributesOfItem`, `creationDate`, `modificationDate` en fuentes Swift | Eliminar el bloque del manifest |
| `ENCRYPTION_SECRET` AES en bundle npm | No conforme | Alta | `src/lib/license/license-manager.ts:78-79`, `src/lib/sync/crypto.ts:6-7` | Migrar a macOS Keychain |
| Clave AES derivada hex en binario Swift | No conforme | Alta | `LicenseChecker.swift:50`: literal hex de 64 caracteres | Rederivarlo en runtime o migrar a Keychain |
| Homebrew Cask `0.1.0` + URL rota | No conforme | Alta | `homebrew/Casks/brewbar.rb:2,5` — `MoLinesGitHub` (usuario incorrecto) | Corregir URL a `MoLinesDesigns`, actualizar version a `0.6.1` |
| Homebrew Formula `0.5.3` | No conforme | Alta | `homebrew/Formula/brew-tui.rb:3` | Actualizar URL y SHA256 a `0.6.1` |
| `jsr.json` version `0.5.2` | No conforme | Alta | `jsr.json:3` | Sincronizar con `package.json` |
| BrewBar no notarizado | No conforme | Alta | `exportOptions.plist`: `method: none`; ausencia de `notarytool` | Agregar `xcrun notarytool submit --wait` al script de release |
| `dist-standalone/brew-tui-bun` en git (65 MB) | No conforme | Media | `git ls-files dist-standalone/brew-tui-bun` | Agregar a `.gitignore`; ejecutar `git rm --cached` |
| URL repositorio erronea en `package.json` | No conforme | Media | `package.json:17` apunta a `MoLinesGitHub` en lugar de `MoLinesDesigns` | Actualizar `package.json`, README, Formula y Cask |
| `tsup target: node18` vs `engines: >=22` | No conforme | Baja | `tsup.config.ts:9` | Cambiar a `'node22'` |
| `.gitattributes` ausente | No conforme | Baja | Sin normalizacion de line endings ni marcadores de binary | Crear con `* text=auto` |
| `exportOptions.plist` case mismatch con `.gitignore` | No conforme | Baja | `.gitignore` excluye `ExportOptions.plist` (mayuscula) pero el archivo es `exportOptions.plist` | Corregir la entrada `.gitignore` |
| `menubar/build/` no gitignoreado | No conforme | Baja | `.gitignore` excluye `Derived/` y `DerivedData/` pero no `build/` | Anadir `menubar/build/` a `.gitignore` |
| xcarchive en disco version 0.6.0 | No conforme | Baja | `menubar/build/BrewBar.xcarchive/Products/.../Info.plist:26` | Regenerar xcarchive tras cada bump de version |

---

# 3-4. Arquitectura, concurrencia y estado

> Auditor: architecture-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

La arquitectura de Brew-TUI es solida en sus capas principales: la separacion entre `lib/`, `stores/` y `views/` en TypeScript esta bien mantenida y la convencion de que los modulos `lib/` no importen stores se cumple sin excepcion. En Swift, el modelo de actores (`SecurityMonitor`, `SyncMonitor`) y `@MainActor` esta aplicado correctamente. Los problemas detectados son en su mayoria deuda menor con dos excepciones de mayor peso: la divergencia de politica de degradacion de licencia entre los dos codebases (mismo archivo en disco, logica diferente) y la ausencia de seam de DI para `SyncMonitor`.

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Schemas de licencia duplicados sin test de contrato | No conforme | Alta | `src/lib/license/types.ts` vs `LicenseChecker.swift`: structs independientes que leen el mismo archivo; cambio de campo en uno no alerta al otro | Anadir test de contrato en `BrewBarTests` con fixture `license.json` generado por TS |
| Politica de degradacion de licencia divergente | No conforme | Alta | TS: grace period de 7 dias; Swift: expira directamente a los 30 dias. Mismo `license.json`, politica inconsistente | Extraer especificacion compartida; alinear umbrales en ambos lados |
| `SyncMonitor` sin protocolo `SyncMonitoring` | No conforme | Media | `SyncMonitor.swift`: actor con `static let shared`; `SchedulerService` accede a `.shared` sin seam de DI | Crear protocolo `SyncMonitoring: Sendable` e inyectarlo en `SchedulerService.init` |
| `CVE_CACHE_PATH` declarado pero nunca consumido en TS | No conforme | Media | `data-dir.ts` exporta `CVE_CACHE_PATH`; grep en `src/` retorna solo la declaracion | Eliminar o documentar que el cache en disco es exclusivo de BrewBar |
| Estados de carga ad-hoc en `brew-store` | No conforme | Media | `loading: Record<string, boolean>` y `errors: Record<string, string \| null>` — estados logicamente inconsistentes posibles | Introducir `AsyncState<T>` discriminado |
| `import SwiftUI` innecesario en `AppState.swift` | No conforme | Baja | `AppState.swift:2`: sin uso de API SwiftUI | Sustituir por `import Observation` |
| `getBuiltinAccountType` export muerto | No conforme | Baja | `license-manager.ts:13`: siempre retorna `null`, cero callers en produccion | Eliminar la funcion y el comentario |
| Fire-and-forget Tasks en `SchedulerService` | No conforme | Baja | `SchedulerService.swift:80,192`: Tasks sin handle de cancelacion | Almacenar handles; cancelar en `stop()` |
| Module-level singletons en stores TS | Parcial | Baja | Variables de modulo que persisten entre tests en Vitest | Limpiar en `afterEach` o inicializar dentro del estado Zustand |

---

# 5. UI estructural

> Auditor: frontend-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El frontend del proyecto es un hibrido bien articulado: un TUI de terminal React/Ink con 16 vistas routables y una app menubar SwiftUI de 3 vistas. La jerarquia de vistas del TUI es coherente y el enrutamiento via Zustand es predecible. Los principales riesgos estructurales son: tres vistas destructivas sin `ConfirmDialog` (Brewfile reconcile, SyncView syncNow, ComplianceView remediacion), ausencia total de tests de renderizado con `ink-testing-library` instalada sin uso, `SearchView` excluida del ciclo Tab/Shift-Tab, y `ProgressLog` con key inestable.

## Hallazgos principales (Alta)

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `BrewfileView` reconciliacion sin `ConfirmDialog` | No conforme | Alta | `src/views/brewfile.tsx:155-163` — `c` ejecuta directamente | Anadir `ConfirmDialog` con resumen de paquetes afectados |
| `SyncView` sync sin confirmacion | No conforme | Alta | `src/views/sync.tsx:232` — `s` invoca `syncNow` directamente | Anadir `ConfirmDialog` antes de `syncNow` |
| `ComplianceView` remediacion sin `ConfirmDialog` | No conforme | Alta | `src/views/compliance.tsx:198-204` — `c` ejecuta directamente | Anadir confirmacion con numero de violaciones accionables |
| Ninguna vista TUI con tests de renderizado | No conforme | Alta | `src/views/*.tsx` — sin `.test.tsx`; `ink-testing-library@^4.0.0` en `package.json` sin uso | Crear tests para `DashboardView`, `OutdatedView`, `AccountView`, `ViewRouter` |
| Ningun componente comun con tests de renderizado | No conforme | Alta | `src/components/common/*.tsx` — sin tests de render para `ConfirmDialog`, `UpgradePrompt`, `ProgressLog` | Priorizar tests para `ConfirmDialog` y `UpgradePrompt` |

## Hallazgos Media

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SearchView` fuera del ciclo Tab/Shift-Tab | No conforme | Media | `navigation-store.ts:14-17` — `search` ausente | Agregar `'search'` al array `VIEWS` o documentar en footer |
| Strings hardcodeados sin i18n | No conforme | Media | `brewfile.tsx:261` en ingles; `sync.tsx:127` en espanol hardcodeado | Extraer a claves i18n en `en.ts`/`es.ts` |
| `DashboardView` sin retry en error de carga | No conforme | Media | `dashboard.tsx:119-120` — solo `ErrorMessage` sin accion | Anadir hint `r` conectado a `fetchAll()` |
| `ProgressLog` key inestable | No conforme | Media | `progress-log.tsx:26`: `key={lines.length - visible.length + i}` cambia en cada append | Cambiar a identificador estable basado en indice absoluto |
| `ServicesView` logica de negocio en `useInput` | No conforme | Media | `services.tsx:53-65`: acceso directo a `useBrewStore.getState()` | Mover coordinacion de estado al store |
| `BrewBar PopoverView`: `refreshTask` no cancelada | No conforme | Media | `PopoverView.swift:8,41` — task anterior no se cancela antes de nueva | `refreshTask?.cancel()` antes de crear nueva |
| `UpgradePrompt` sin claves para `rollback` y `brewfile` | No conforme | Media | `upgrade-prompt.tsx:9-16` — retorna `null` para vistas Pro sin clave | Agregar entradas a `FEATURE_KEYS` |

---

# 6. UX funcional

> Auditor: ux-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

Brew-TUI y BrewBar ofrecen una experiencia coherente para usuarios intermedios de Homebrew, pero presentan fricciones significativas en el primer arranque (ausencia total de onboarding), en flujos Pro clave (sin confirmacion antes de reconciliar Brewfile, sin accion de revalidacion en TUI), y dos bugs de severidad Alta que rompen la internacionalizacion. El fallo mas critico desde el punto de vista de notificaciones es la colision de identificadores en `SchedulerService.swift`, que silencia todas las alertas CVE y Sync subsiguientes a la primera. El modelo de degradacion de licencia esta desincronizado entre TUI (7/14/30 dias) y BrewBar (30 dias planos).

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Onboarding ausente | No conforme | Alta | `dashboard.tsx` — primer render sin guia para el usuario nuevo | Agregar flujo de bienvenida condicional a `hasLaunchedKey` |
| Identificadores CVE/Sync fijos en `SchedulerService.swift` | No conforme | Alta | `SchedulerService.swift:184,253` — `"brewbar-cve"` y `"brewbar-sync"` fijos; macOS reemplaza silenciosamente notificaciones con mismo id | Usar identificadores unicos con timestamp |
| Strings hardcodeados en `sync.tsx` y `brewfile.tsx` | No conforme | Alta | `sync.tsx:127`: espanol hardcodeado; `brewfile.tsx:70,261`: ingles hardcodeado | Extraer a claves i18n |
| Sin confirmacion en Brewfile reconcile | No conforme | Alta | `brewfile.tsx` — `c` ejecuta directamente | Agregar `ConfirmDialog` |
| Sin confirmacion en Sync conflict apply | No conforme | Alta | `sync.tsx` — `enter` aplica sin confirmacion previa | Agregar confirmacion antes de aplicar resolucion de conflicto |
| Rate-limit activacion solo en memoria | No conforme | Media | `license-manager.ts` — `activationAttempts` Map en memoria; se resetea al reiniciar | Persistir intentos en disco |
| Sin accion de revalidacion en TUI | No conforme | Media | `account.tsx` — solo muestra instruccion CLI, sin accion in-TUI | Agregar accion `revalidate` con keybind en `AccountView` |
| Modelo de degradacion desincronizado | No conforme | Media | TS (7 dias) vs Swift (30 dias) con mismo `license.json` | Alinear umbrales |
| `UpgradePrompt` sin claves para `rollback`/`brewfile` | No conforme | Media | `upgrade-prompt.tsx:9-16` | Agregar entradas en `FEATURE_KEYS` |
| Tecla `d` invisible para Team users | No conforme | Baja | `account.tsx` — hint solo si `status === 'pro'` | Incluir `status === 'team'` en la condicion |
| Clave `account_validating` nunca renderizada | No conforme | Baja | `account.tsx` — early return usa `account_loading`; `account_validating` es dead code | Eliminar o conectar correctamente |

---

# 7-8. Design system y accesibilidad

> Auditor: design-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto presenta dos subsistemas de diseno diferenciados: la TUI en TypeScript/Ink con tokens de color centralizados pero un sistema de espaciado definido y completamente ignorado (165+ magic numbers en produccion), y la app de menu bar en SwiftUI con colores semanticos parcialmente aplicados. La accesibilidad de la TUI esta estructuralmente limitada por la ausencia de soporte para `NO_COLOR`, tema oscuro exclusivo documentado, y la imposibilidad de ofrecer etiquetas de accesibilidad en un entorno terminal. BrewBar implementa correctamente las adaptaciones clave de macOS con fallos menores en ramas de contraste alto y un error de asignacion de apariencia en el asset del icono.

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SPACING` tokens nunca usados | No conforme | Alta | `spacing.ts` definido; grep en `src/views src/components` = 0 resultados; 165+ valores numericos crudos | Migrar a `SPACING.xs/sm/md/lg`; forzar con ESLint `no-magic-numbers` |
| `NO_COLOR` no soportado | No conforme | Alta | `colors.ts:1-40`; sin rama `process.env.NO_COLOR` | Retornar tokens vacios si `NO_COLOR` esta definido |
| Tema oscuro exclusivo en TUI | Parcial | Media | `colors.ts:7-9`: limitacion documentada | Backlog: detectar `TERM_PROGRAM`/`COLORTERM` para variante clara |
| `GRADIENTS` hex desvinculados de `COLORS` | No conforme | Media | `gradient.tsx:60-68`: hex crudos sin referenciar tokens | Derivar `GRADIENTS` desde `COLORS.*` |
| BrewBar contraste alto incompleto | No conforme | Media | `PopoverView.swift:92,136,146,197,201`; `OutdatedListView.swift:83` — sin rama `colorSchemeContrast == .increased` | Usar colores del sistema adaptables |
| MenuBarIcon apariencias invertidas | No conforme | Media | `Assets.xcassets/MenuBarIcon.imageset/Contents.json`: `menubar_dark@1x.png` asignada a default | Intercambiar asignaciones de apariencia |
| Colores locales no centralizados en BrewBar | No conforme | Baja | `OutdatedListView.swift:10-11`: constantes locales duplicadas | Mover a `Theme.swift` |
| `StatCard` default `color='white'` con literal | No conforme | Baja | `stat-card.tsx`: prop `color = 'white'` en lugar de `COLORS.white` | Cambiar a `color = COLORS.white` |
| Fila de paquete en BrewBar sin agrupacion VoiceOver | No conforme | Baja | `OutdatedListView.swift` — `HStack` navegable por separado | Agregar `.accessibilityElement(children: .combine)` |
| Toggle de notificaciones sin `accessibilityLabel` | No conforme | Baja | `SettingsView.swift`: label inferido por SwiftUI | Agregar `.accessibilityLabel` explicito |
| Deteccion de capacidades de terminal ausente | No conforme | Baja | Sin revision de `COLORTERM`/`TERM` en arranque | Evaluar `COLORTERM === 'truecolor'` para degradar gradientes |

---

# 11. Backend funcional y persistencia

> Auditor: backend-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto no tiene backend HTTP propio: toda la logica de servidor es externa. La superficie HTTP consumida esta bien estructurada para Polar y OSV en cuanto a timeouts, reintentos con backoff exponencial y validacion de respuestas en runtime, pero presenta un bug critico de produccion: el TUI TypeScript envia `ecosystem: 'Homebrew'` a la API OSV.dev, valor que la API rechaza con HTTP 400, haciendo que el Security Audit devuelva resultados vacios en todos los escaneos del TUI. La persistencia local esta bien disenada (escrituras atomicas, permisos 0o600, cifrado AES-256-GCM), pero cuatro implementaciones divergentes de `getMachineId` con fallbacks inconsistentes representan riesgos adicionales.

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `ecosystem: 'Homebrew'` en OSV API (TS) | No conforme | Critica | `osv-api.ts:125,143,181` — rechaza con HTTP 400; Security Audit siempre retorna 0 CVEs | Cambiar a `'Bitnami'` en las tres ocurrencias |
| `isExpired()` falla abierto en fecha invalida | No conforme | Alta | `license-manager.ts:214-217`: `NaN < Date.now()` es false; licencias con fecha corrupta nunca expiran | `isExpired` debe retornar `true` cuando la fecha es invalida o no parseable |
| Deadlock en `BrewProcess.swift:99` | No conforme | Alta | `readDataToEndOfFile()` sincrono en `terminationHandler`; buffers > 64 KB causan deadlock | Migrar a lectura incremental con `availableData` |
| Snapshots sin poda en `~/.brew-tui/snapshots/` | No conforme | Alta | `snapshot.ts:95-107`, `rollback-engine.ts:204-209` — sin poda automatica | Implementar `pruneSnapshots(maxCount = 20)` |
| Cuatro implementaciones divergentes de `getMachineId` | No conforme | Alta | `polar-api.ts`, `license-manager.ts`, `sync-engine.ts`, `promo.ts` — `sync-engine.ts:53` cae a `hostname()` | Extraer funcion unica a `data-dir.ts` con mutex |
| AES secrets en bundle npm | No conforme | Alta | `license-manager.ts:78-79`, `sync/crypto.ts:6-7` | Incorporar `machineId` como salt adicional en `scryptSync` |
| Hex AES literal en binario Swift | No conforme | Alta | `LicenseChecker.swift:50-53`: hex de 64 caracteres | Eliminar literal; rederivarlo en runtime |
| `decryptLicenseData` sin type guard | No conforme | Media | `license-manager.ts:121`: `JSON.parse(...) as LicenseData` sin validacion de forma | Agregar `isLicenseData()` type guard |
| Lock de historial sin TTL | No conforme | Media | `history-logger.ts:13-24`: lockfile huerfano bloquea todas las escrituras | Verificar `mtime` del lockfile; eliminar si tiene mas de 30s |
| `decryptPayload` sin type guard en sync | No conforme | Media | `crypto.ts:53`: mismo patron | Agregar validacion de forma de `SyncPayload` |
| `sync-engine.ts` fallback a `hostname()` | No conforme | Media | `sync-engine.ts:53` — colision entre maquinas con mismo hostname | Crear `machine-id` en `ensureDataDirs()` |
| Token crash reporter en `UserDefaults` | No conforme | Media | `CrashReporter.swift:45-46`: texto claro accesible por cualquier proceso del usuario | Mover a Keychain |
| `brewUpdate()` sin timeout | No conforme | Media | `brew-api.ts:18-26` — `spawn('brew', ['update'])` sin timer | Reutilizar `execBrew` o agregar timeout |
| Promo API sin validacion de host | No conforme | Media | `promo.ts:94,142` — sin `validateApiUrl` | Aplicar misma guardia que `polar-api.ts` |
| Watermark con `consent = true` por defecto | No conforme | Media | `watermark.ts`: `getWatermark(license, consent = true)` | Cambiar a `consent = false`; requerir parametro explicito |

---

# 13. Seguridad y privacidad

> Auditor: security-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto tiene una postura de seguridad activa y documentada: AES-256-GCM sobre el archivo de licencia, machine binding via UUID persistente, rate limiting en activaciones, canary functions, comprobacion de integridad del bundle y Hardened Runtime en BrewBar. Sin embargo, persiste una limitacion arquitectonica estructural — la clave AES de cifrado de licencias esta derivada de constantes literales embebidas tanto en el bundle npm como en el binario Swift. Se identifican hallazgos de severidad Critica (tokens npm con credenciales reales en `.claude/settings.local.json`) y Alta (constantes AES literales en bundle npm y clave hex precomputada en binario Swift).

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Tokens npm con credenciales reales en `.claude/settings.local.json` | No conforme | Critica | `settings.local.json:56,58`: dos tokens `npm_*` en texto plano; blast radius: publicacion maliciosa en npm | Revocar ambos tokens. Agregar `.claude/` al `.gitignore`. Usar tokens con scope `publish` restringido |
| `ENCRYPTION_SECRET` literal en bundle npm | No conforme | Alta | `license-manager.ts:78`: `'brew-tui-license-aes256gcm-v1'`; `sync/crypto.ts:6`: `'brew-tui-sync-aes256gcm-v1'` — bundle publicado en npm | Derivar la clave combinando la constante con el machine-id; alternativa: Keychain |
| Hex AES precomputada en binario Swift | No conforme | Alta | `LicenseChecker.swift:50-53`: `let hex = "5c3b2ae2a3066bca28773f36db347d8c8a0a396d4b9fab628331446acd6d4126"` — recuperable via `strings` | Incluir machine-id como factor en la derivacion; migrar a Keychain |
| Watermark: `consent = true` por defecto | No conforme | Media | `watermark.ts`: `getWatermark(license, consent = true)` | Cambiar a `consent = false`; requerir consentimiento explicito |
| Token crash reporter en `UserDefaults` | No conforme | Media | `CrashReporter.swift:45-46` | Mover a Keychain |
| Rate limit de activaciones solo en memoria | Parcial | Baja | `license-manager.ts:34`: `tracker` es variable de modulo | Persistir o documentar como primer filtro |

---

# 14-15. Testing y observabilidad

> Auditor: quality-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto dispone de una base de testing razonablemente solida para el codigo TypeScript (35 archivos de test, ~365 metodos, cobertura de los paths criticos de negocio), pero presenta gaps arquitectonicos significativos: ausencia total de medicion de cobertura de codigo, cero tests de UI para las 16 vistas de la TUI, y los tests Swift del componente BrewBar nunca se ejecutan en CI automatizado. La observabilidad es parcialmente funcional — el logging estructurado es correcto en ambas plataformas y el crash reporter es funcional aunque opt-in — pero la plataforma carece por completo de analytics y de metricas operativas instrumentadas.

## Metricas de testing

| Metrica | Valor |
|---------|-------|
| Total archivos de test (TS) | 35 |
| Total archivos de test (Swift) | 2 |
| Tests UI / componente | 3 archivos (ConfirmDialog, ResultBanner, UpgradePrompt — solo logica) |
| Tests de snapshot / visual regression | 0 |
| Cobertura de codigo medida | No configurada |

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| 16 vistas sin test de renderizado | Abierto | Alta | `src/views/` — ninguno tiene `.test.tsx` con `render()` de `ink-testing-library` | Priorizar `HomeView`, `OutdatedView`, `ViewRouter`, `AccountView` |
| `ViewRouter` sin test | Abierto | Alta | `app.tsx`: switch Pro/Team/Free sin tests de renderizado | Agregar `app.test.tsx` con casos free/pro/team |
| Tests Swift fuera de CI | Abierto | Alta | `.github/workflows/ci.yml`: `ubuntu-latest`; Swift no compila en Ubuntu | Agregar job `macos-latest` con `xcodebuild test` |
| `OutdatedPackage` cask sin campo `pinned` sin test de regresion | Abierto | Alta | `BrewBarTests.swift`: test solo con `pinned=true` | Agregar test: JSON sin clave `pinned` debe decodificar con `pinned=false` |
| `SecurityMonitor.swift` — `URLSession.shared` no inyectable | Abierto | Alta | `SecurityMonitor.swift:134`: sin punto de inyeccion para mocks | Refactorizar para aceptar `URLSession` como parametro init |
| Sin medicion de cobertura | Abierto | Media | `vitest.config.ts` sin bloque `coverage`; `@vitest/coverage-v8` no instalado | Agregar `@vitest/coverage-v8` y configurar `coverage` en vitest.config |
| Ausencia total de analytics | Abierto | Alta | Sin SDK de analytics en TUI ni BrewBar | Definir taxonomia minima e integrar SDK con consentimiento |
| Tests de persistencia solo con mocks de fs | Abierto | Media | `history-store`, `profile-store`, `state-snapshot` — mocks puros sin tests reales | Agregar tests de integracion con `os.tmpdir()` |
| Sin snapshot testing | Abierto | Media | Sin `swift-snapshot-testing` ni equivalente para Ink | Integrar en ambas plataformas |
| BrewBar sin crash reporting SDK activo | Abierto | Media | `Project.swift` sin dependencia de Sentry/Crashlytics | Integrar Sentry Swift SDK o Firebase Crashlytics |

---

# 16. Rendimiento

> Auditor: performance-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto rinde bien para una app de terminal y un menubar pequeno: el bundle ESM final pesa 241 KB, Ink renderiza listas paginadas a tamano de viewport, y la `streamBrew` cancela procesos al desmontar. Los hallazgos relevantes son tres principales: (a) el panel de Impact Analysis dispara dos `brew deps`/`brew uses` por cada movimiento del cursor en `outdated.tsx`, saturando `brew` al desplazarse j/k sobre listas grandes; (b) el `brew update` se ejecuta secuencialmente antes del paralelismo `async let` en `AppState.refresh`, fijando el tiempo a primer dato en BrewBar; (c) el polling de 100 ms en `streamBrew` anade hasta 100 ms de latencia por linea.

## Metricas medidas

| Metrica | Valor |
|---------|-------|
| `build/index.js` | 241 KB (6.264 lineas) |
| Total `build/` (entry + chunks + sourcemaps) | 1.0 MB |
| Chunks dinamicos generados | 9 chunks JS |
| Polling `streamBrew` | 100 ms (`setTimeout(r, 100)`) |
| Debounce cursor en `outdated.tsx` (Impact) | 150 ms |
| Cache CVE TTL (TUI / BrewBar) | 30 min / 60 min |

## Hallazgos principales

| ID | Descripcion | Severidad | Evidencia | Accion |
|----|-------------|-----------|-----------|--------|
| PERF-007 | Impact Analysis — 2 spawns de `brew` por cursor move sin cache | Media | `outdated.tsx:89-105`, `impact-analyzer.ts:81,88` | Cache `Map<string, UpgradeImpact>` + debounce 400-500ms |
| PERF-011 | `AppState.refresh()` serializa `brew update` antes del paralelismo | Media | `AppState.swift:51-55` | Lanzar `updateIndex()` como `async let` |
| PERF-014 | `readDataToEndOfFile()` sincrono en `terminationHandler` | Alta | `BrewProcess.swift:99` (ver BK-002) | Ver BK-002 |
| PERF-002 | Polling de 100ms en `streamBrew` | Baja | `brew-cli.ts:87` | Reemplazar con patron `Promise` desde `proc.stdout.on('data', ...)` |
| PERF-004 | `DashboardView`/`OutdatedView` desestructuran el store completo | Baja | `dashboard.tsx:82`, `outdated.tsx:60` | Aplicar selectores granulares o `useShallow` |
| PERF-005 | `allOutdated` recompuesto en cada render sin `useMemo` | Baja | `outdated.tsx:82-85` | Envolver con `useMemo` |
| PERF-006 | `useStdout()` invocado tras returns tempranos en `history.tsx` | Baja | `history.tsx:101-104` | Mover al inicio del componente |
| PERF-015 | `SyncMonitor` parsea `sync.json` dos veces por tick | Baja | `SyncMonitor.swift:23,42` | Refactor a un unico `checkSync() -> (Bool, Int)` |

---

# 17-18. Localizacion y release readiness

> Auditor: release-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

La infraestructura de localizacion de Brew-TUI es solida: el modulo i18n del TUI garantiza paridad completa en tiempo de compilacion (427 claves, en + es), y BrewBar usa String Catalog con variantes de plural correctas; no se detecta texto hardcodeado visible en produccion (la excepcion son los bugs de `sync.tsx:127` y `brewfile.tsx:70,261` ya catalogados en seccion 6). El estado de release presenta riesgos serios: BrewBar carece completamente de notarizacion, tres canales de distribucion publican versiones desincronizadas, y el pipeline CI solo cubre Ubuntu/Node sin ningun paso Swift.

## Metricas de localizacion

| Metrica | Valor |
|---------|-------|
| Idiomas soportados | en (base), es |
| Total claves TUI (en.ts / es.ts) | 427 claves — paridad 100% garantizada por TypeScript |
| Total entradas BrewBar xcstrings | 69+ entradas |
| Strings hardcodeadas en produccion | 2 (sync.tsx, brewfile.tsx) — ya catalogadas en UX-003 |

## Metricas de release

| Metrica | Valor |
|---------|-------|
| Version actual (npm / package.json) | 0.6.1 |
| Homebrew Formula | 0.5.3 (desincronizado) |
| Homebrew Cask | 0.1.0 (desincronizado + URL rota) |
| jsr.json | 0.5.2 (desincronizado) |
| Notarizacion | AUSENTE |
| Firma BrewBar Release | Manual — Developer ID Application (GD6M44DYPQ) |
| Hardened Runtime | YES (Release) / NO (Debug) |

## Hallazgos principales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| BrewBar no notarizado | No conforme | Alta | Sin `xcrun notarytool` en ningun script de release; `exportOptions.plist`: `method: none` | Anadir notarizacion al script de release |
| CI pipeline sin runner macOS ni Swift | No conforme | Alta | `.github/workflows/ci.yml`: `ubuntu-latest`, solo `npm run validate` | Anadir job `macos-latest` con `xcodebuild build` |
| xcarchive en disco version 0.6.0 | Pendiente | Baja | `menubar/build/BrewBar.xcarchive/Info.plist`: `0.6.0` | Regenerar xcarchive tras el bump de version |

---

# 19. Auditoria por pantalla

> Auditor: screen-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto tiene 16 pantallas TUI routables (15 en `VIEWS` + `package-info`) descompuestas en 20 ficheros `.tsx` bajo `src/views/`, mas tres vistas SwiftUI bajo `menubar/BrewBar/Sources/Views/`. Los hallazgos cruzados que aparecen en multiples pantallas estan recogidos en los reportes de UI estructural (04), UX funcional (05) y Design system/accesibilidad (06). Este informe se centra en cinco bloques:

1. **Disciplina de `mountedRef`**: solo 6 de 16 vistas TUI usan `mountedRef.current` para evitar `setState` post-unmount.
2. **Cobertura del shortcut numerico 1-0**: solo mapea 10 vistas; `rollback`, `brewfile`, `sync`, `compliance`, `package-info` y `search` solo son alcanzables via Tab cycling o navigate.
3. **Gating Pro/Team interno**: la mayoria de vistas Pro no renderiza su propio fallback porque `app.tsx:40-47` devuelve `UpgradePrompt` antes de invocarlas.
4. **Cancelacion de generadores**: 4 de 5 vistas que consumen `AsyncGenerator` directamente si llaman `gen.return()` en cleanup.
5. **SwiftUI Localization**: las tres vistas SwiftUI estan cubiertas por `Localizable.xcstrings`.

## Hallazgos de pantallas

| ID | Vista | Descripcion | Severidad |
|----|-------|-------------|-----------|
| SCR-12-O1 | OutdatedView | `getUpgradeImpact` no se cancela cuando el cursor cambia rapido; N fetches solapados posibles | Media |
| SCR-12-I1 | InstalledView | Hint `esc:cancel` enganoso — Esc captura navegacion global, no cancela el stream de desinstalacion | Media |
| SCR-12-D1 | DashboardView | `fetchAll()` reinvocado en cada visita al Dashboard sin debounce | Baja |
| SCR-12-S1 | SearchView | `search` no en `VIEW_KEYS`; sin hint visible de la tecla `S` | Baja |
| SCR-12-S2 | SearchView | `doSearch` sin `mountedRef`: setStates post-unmount posibles | Baja |
| SCR-12-I2 | InstalledView | Sin `mountedRef`: `setConfirmUninstall(null)` puede dispararse tras unmount | Baja |

## Cobertura de estados por vista

De 16 vistas auditadas:
- **Completamente conformes en estados**: `DoctorView`, `PackageInfoView`, `RollbackView`, `SmartCleanupView`, `HistoryView` — todos los estados principales cubiertos
- **Con gaps menores**: `DashboardView` (sin retry en error), `SearchView` (sin retry en timeout), `ServicesView` (sin feedback de permisos root)
- **Con gaps mayores**: `BrewfileView` (sin confirmacion en reconcile), `SyncView` (sin confirmacion en apply), `ComplianceView` (sin confirmacion en remediacion)

---

# 20. Auditoria por endpoint

> Auditor: endpoint-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto carece de servidor HTTP propio. Las "endpoints" auditables se reducen a cuatro integraciones HTTP salientes (Polar, OSV.dev, Promo backend propio, y descarga de release de GitHub), ocho subcomandos del binario `brew-tui` y ~25 invocaciones distintas de `brew`. La superficie HTTP esta razonablemente protegida en Polar y GitHub Releases (TLS sistema, validacion de host, timeouts, SHA-256 obligatorio). Se conservan tres defectos sin corregir: (a) `ecosystem: 'Homebrew'` en TypeScript hacia OSV (Critica); (b) `promo.ts` sin `validateApiUrl`; (c) `brewUpdate()` sin timeout.

## Inventario de endpoints

| Endpoint | Metodo | Auth | Contrato validado | Idempotente | Hallazgo |
|----------|--------|------|-------------------|-------------|----------|
| `api.polar.sh/.../activate` | POST | — (key en body) | Si | No | Baja: doble retry posible |
| `api.polar.sh/.../validate` | POST | — (key en body) | Si | Si | Conforme |
| `api.polar.sh/.../deactivate` | POST | — (key + id en body) | Si (204 aceptado) | Si | Baja: double retry (hasta 9 requests) |
| `api.osv.dev/v1/querybatch` (TS) | POST | Ninguna | Si | Si | **Critica**: `'Homebrew'` → HTTP 400 siempre |
| `api.osv.dev/v1/querybatch` (Swift) | POST | Ninguna | Si | Si | Conforme (`'Bitnami'`) |
| `api.molinesdesigns.com/api/promo/validate` | POST | — (code en body) | Si | Si | Sin validateApiUrl |
| `api.molinesdesigns.com/api/promo/redeem` | POST | machineId en body | Si | No | Media: sin idempotency-key |
| GitHub Releases (descarga BrewBar.zip) | GET | Ninguna | SHA-256 obligatorio | N/A | Conforme (SHA-256 fail-closed) |

## Hallazgos de endpoints

| ID | Elemento | Severidad | Evidencia | Accion |
|----|----------|-----------|-----------|--------|
| BK-001 | `ecosystem: 'Homebrew'` en OSV TS | Critica | `osv-api.ts:125,143,181` — HTTP 400 siempre | Cambiar a `'Bitnami'` |
| EP-002 | Promo `/redeem` sin idempotency-key | Media | `promo.ts:142-172` | Agregar `idempotencyKey: randomUUID()` al body |
| BK-015 | Promo API sin validacion de host | Media | `promo.ts:94,142` | Aplicar `validateApiUrl` |
| BK-016 | `brewUpdate()` sin timeout | Media | `brew-api.ts:18-26` | Refactorizar usando `execBrew` |
| EP-001 | Double retry en deactivacion | Baja | `license-manager.ts:354-362` + `fetchWithRetry` = 9 requests max | Eliminar loop externo |

---

# 21. Registro central de hallazgos

> Auditor: report-consolidator | Fecha: 2026-05-01

## Resumen

* **Total hallazgos:** 98
* **Criticos:** 2
* **Altos:** 22
* **Medios:** 38
* **Bajos:** 36
* **Reportes analizados:** 14 de 14
* **Reportes faltantes:** Ninguno

## Notas metodologicas

Los IDs existentes en sub-reportes se han conservado verbatim (PERF-xxx, SCR-12-xxx). Los hallazgos citados transversalmente en multiples reportes (p.ej. el bug OSV aparece en 07, 10 y 13) se registran **una sola vez** con referencia cruzada de evidencia.

## Registro completo (resumido — ver 21-findings.md para tabla completa)

Los 98 hallazgos se distribuyen en los siguientes dominios:

| Dominio | Critica | Alta | Media | Baja | Total |
|---------|---------|------|-------|------|-------|
| Seguridad | 1 | 2 | 0 | 0 | 3 |
| Backend / Persistencia | 1 | 4 | 10 | 0 | 15 |
| Gobierno / Release | 0 | 6 | 3 | 5 | 14 |
| Testing / Calidad | 0 | 4 | 5 | 0 | 9 |
| UX funcional | 0 | 2 | 5 | 3 | 10 |
| Arquitectura | 0 | 2 | 2 | 6 | 10 |
| UI estructural | 0 | 3 | 6 | 6 | 15 |
| Design system | 0 | 1 | 3 | 3 | 7 |
| Accesibilidad | 0 | 1 | 0 | 3 | 4 |
| Pantallas | 0 | 0 | 2 | 0 | 2 |
| Rendimiento | 0 | 1* | 6 | 5 | 12 |
| Endpoints | 0 | 0 | 1 | 1 | 2 |

*PERF-014 es cross-referencia a BK-002; no contabilizado como hallazgo adicional.

> Para el registro completo con todos los campos (ID, Dominio, Subzona, Hallazgo, Severidad, Impacto, Evidencia, Accion, Estado), consultar el archivo `21-findings.md` en este mismo directorio.

---

# 22. Priorizacion ejecutiva

> Auditor: report-consolidator | Fecha: 2026-05-01

## Distribucion de hallazgos

| Severidad | Cantidad | % del total |
|-----------|----------|-------------|
| Critica | 2 | 2.0% |
| Alta | 22 | 22.4% |
| Media | 38 | 38.8% |
| Baja | 36 | 36.7% |
| **Total** | **98** | **100%** |

## Criticos — Accion inmediata requerida

| ID | Hallazgo | Riesgo | Accion inmediata |
|----|----------|--------|------------------|
| SEG-001 | Dos tokens npm en `.claude/settings.local.json:56,58` en texto plano | Publicacion maliciosa de `brew-tui` en npmjs.com | Revocar tokens. Agregar `.claude/` a `.gitignore`. Tokens con scope restringido |
| BK-001 | `ecosystem: 'Homebrew'` en `osv-api.ts:125,143,181` → OSV HTTP 400 → 0 CVEs siempre | Feature Pro Security Audit completamente roto | Cambiar a `'Bitnami'` en las tres ocurrencias; publicar hotfix npm 0.6.2 |

## Plan "Proximas 5 PRs"

| PR | Tiempo | Hallazgos |
|----|--------|-----------|
| PR 1 — Hotfix seguridad | < 2h | SEG-001 (revocacion), BK-001 (3 lineas), publicar 0.6.2 |
| PR 2 — Release plumbing | < 4h | GOV-002, GOV-003, GOV-004, GOV-007 (bumps de version y URLs) |
| PR 3 — Confirmaciones y UX critica | < 1 dia | UI-001, UI-002, UI-003, UX-001, BK-004, GOV-006 |
| PR 4 — Robustez de backend | < 2 dias | BK-005, BK-002, BK-003, ARQ-001, GOV-001/QA-003, GOV-005 |
| PR 5 — Tests de renderizado | < 3 dias | QA-001, QA-002, QA-006, ACC-001, DS-001 (inicio) |

> Para el mapa de calor completo por dominio y las listas detalladas por severidad, consultar el archivo `22-prioritization.md` en este mismo directorio.

---

# 23. Veredicto final

> Auditor: report-consolidator | Fecha: 2026-05-01

## Resumen ejecutivo por area

* **Estado general del frontend (TUI):** Preocupante — Tres vistas destructivas carecen de confirmacion antes de operaciones irreversibles; `ink-testing-library` esta instalada pero ninguna de las 16 vistas tiene tests de renderizado.

* **Estado general del backend:** Critico — El feature Pro mas importante (Security Audit) devuelve sistematicamente cero CVEs. La funcion `isExpired()` falla abierta en fechas invalidas. Cuatro implementaciones divergentes de `getMachineId` con fallback a `hostname()` pueden causar colision de datos en sync.

* **Estado general de UI/UX:** Preocupante — Onboarding ausente. Notificaciones CVE/Sync inoperativas despues de la primera alerta. Strings hardcodeados rompen la localizacion.

* **Estado general de arquitectura:** Preocupante — La politica de degradacion de licencia diverge entre TS (7 dias) y Swift (30 dias). Schemas de licencia duplicados sin test de contrato.

* **Estado general de seguridad:** Critico — Dos tokens npm activos en texto plano en disco. Claves AES hardcodeadas en bundle npm y binario Swift recuperables sin herramientas especializadas.

* **Estado general de rendimiento:** Aceptable — Impact Analysis (2 spawns de `brew` por cursor move) es el unico problema perceptible para el usuario Pro.

* **Estado general de accesibilidad:** Aceptable — `NO_COLOR` no implementado es el gap mas importante para usuarios con terminales sin soporte de color.

## Metricas clave

* **Total hallazgos:** 98
* **Hallazgos criticos:** 2
* **Hallazgos altos:** 22
* **Hallazgos medios:** 38
* **Hallazgos bajos:** 36
* **Dominios auditados:** 14 de 14
* **Pantallas auditadas:** 16 de 16 (TUI) + 3 (BrewBar SwiftUI)
* **Endpoints auditados:** 5 integraciones HTTP + 8 subcomandos CLI

## Riesgos de salida a produccion

1. **Tokens npm activos en texto plano en disco** — explotables en tiempo real. Ver SEG-001.
2. **Security Audit Pro completamente inoperativo** — devuelve 0 CVEs siempre. Ver BK-001.
3. **Canal de distribucion BrewBar roto** — HTTP 404 para cualquier instalacion via Homebrew. Ver GOV-002.
4. **BrewBar no notarizado** — Gatekeeper bloquea a usuarios que descargan directamente. Ver GOV-005.
5. **Formula y Cask desactualizados** — usuarios de Homebrew reciben `brew-tui` 0.5.3. Ver GOV-003.
6. **`isExpired()` falla abierta en fecha invalida** — potencialmente explotable con SEG-002. Ver BK-004.
7. **Notificaciones CVE silenciadas despues de la primera** — feature de seguridad de BrewBar inoperativo. Ver UX-001.

## Recomendacion

* [ ] Apto para continuar desarrollo
* [ ] Apto para beta interna
* [ ] Apto para TestFlight / staging
* [x] **No apto para produccion sin correcciones previas** — Requiere resolver hallazgos criticos y altos antes de release

**Justificacion:** El proyecto tiene dos hallazgos Criticos activos (tokens npm explotables en tiempo real, feature Pro Security Audit silenciosamente roto) y el canal de distribucion principal de BrewBar esta completamente inoperativo por una URL incorrecta. Con 24 hallazgos Criticos + Altos de los cuales siete afectan directamente a la experiencia del usuario en produccion, el codigo actual no cumple los estandares minimos de una release v0.6.1. La buena noticia es que los tres problemas mas urgentes (revocar tokens, corregir `osv-api.ts`, corregir URL del Cask) son cambios de menos de 5 lineas cada uno.

## Proximas acciones

1. **[Critico — ahora mismo]** Revocar ambos tokens npm en npmjs.com y agregar `.claude/` al `.gitignore` del repo — Ver SEG-001
2. **[Critico — PR inmediato]** Cambiar `'Homebrew'` → `'Bitnami'` en `osv-api.ts:125,143,181` y publicar hotfix npm 0.6.2 — Ver BK-001
3. **[Alta — PR 2]** Corregir URL del Cask (`MoLinesGitHub` → `MoLinesDesigns`), actualizar versiones en `brewbar.rb`, `brew-tui.rb` y `jsr.json` a 0.6.1 — Ver GOV-002, GOV-003, GOV-004
4. **[Alta — PR 3]** Agregar `ConfirmDialog` en `brewfile.tsx`, `sync.tsx` y `compliance.tsx`; corregir identificadores de notificacion en `SchedulerService.swift`; eliminar `FileTimestamp` de `PrivacyInfo.xcprivacy` — Ver UI-001, UI-002, UI-003, UX-001, GOV-006
5. **[Alta — PR 3]** Corregir `isExpired()` para retornar `true` en fecha invalida — Ver BK-004
6. **[Alta — PR 4]** Extraer `getMachineId()` a funcion unica en `data-dir.ts`; eliminar fallback a `hostname()` — Ver BK-005
7. **[Alta — PR 4]** Migrar `readDataToEndOfFile()` a lectura incremental en `BrewProcess.swift:99` — Ver BK-002
8. **[Alta — PR 4]** Implementar notarizacion con `xcrun notarytool submit --wait` en el script de release — Ver GOV-005
9. **[Alta — PR 4]** Agregar job `macos-latest` a `.github/workflows/ci.yml` con `tuist generate && xcodebuild test` — Ver GOV-001, QA-003
10. **[Alta — PR 5]** Crear tests de renderizado para `DashboardView`, `OutdatedView`, `AccountView` y `ViewRouter` — Ver QA-001, QA-002

---

# 24. Checklist ultra resumido

| Area | Estado | Hallazgos | Accion prioritaria |
|------|--------|-----------|--------------------|
| Inventario y ficha | Conforme | 0 | Ninguna |
| Gobierno / Release | No conforme | 13 | Corregir URL Cask + bumps de version Formula/Cask/JSR |
| Arquitectura | Parcial | 9 | Alinear politica de degradacion de licencia TS/Swift |
| Concurrencia y estado | Parcial | 2 | Crear protocolo `SyncMonitoring`; tipo discriminado `AsyncState` |
| UI estructural | No conforme | 15 | Agregar `ConfirmDialog` en vistas destructivas |
| UX funcional | No conforme | 10 | Corregir identificadores de notificacion; agregar onboarding |
| Design system | Parcial | 7 | Adoptar `SPACING.*`; corregir icono de menu bar invertido |
| Accesibilidad | Parcial | 4 | Implementar `NO_COLOR` |
| Backend / Persistencia | Critico | 15 | Corregir `osv-api.ts` (`'Homebrew'` → `'Bitnami'`); `isExpired()` falla abierto |
| Seguridad | Critico | 3 | Revocar tokens npm; eliminar literal hex de `LicenseChecker.swift` |
| Testing / Calidad | No conforme | 9 | Crear tests de renderizado TUI; agregar CI macOS para Swift |
| Rendimiento | Parcial | 12 | Cache de Impact Analysis; `brew update` serializado |
| Pantallas | Parcial | 2 | AbortController en Impact Analysis; corregir hint Esc en InstalledView |
| Endpoints | Aceptable | 2 | Agregar idempotency-key a Promo `/redeem` |

---

> Fin del reporte. Generado automaticamente por super-audit | report-consolidator.
> Para el registro completo de hallazgos ver `21-findings.md`. Para la priorizacion ejecutiva completa ver `22-prioritization.md`. Para el veredicto detallado ver `23-verdict.md`.
