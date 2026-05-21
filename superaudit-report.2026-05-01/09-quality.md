# 14. Testing y calidad / 15. Observabilidad y analitica

> Auditor: quality-auditor | Fecha: 2026-05-01

---

## Resumen ejecutivo

El proyecto Brew-TUI dispone de una base de testing razonablemente solida para el codigo TypeScript (35 archivos de test, ~365 metodos, cobertura comprobable de los paths criticos de negocio), pero presenta gaps arquitectonicos significativos: ausencia total de medicion de cobertura de codigo, cero tests de UI para las 16 vistas de la TUI, y los tests Swift del componente BrewBar nunca se ejecutan en CI automatizado. La observabilidad es parcialmente funcional — el logging estructurado es correcto en ambas plataformas y el crash reporter es funcional aunque opt-in — pero la plataforma carece por completo de analytics y de metricas operativas instrumentadas, lo que impide medir KPIs de producto o SLOs de servicio.

---

## Metricas de testing

| Metrica | Valor |
|---------|-------|
| Total archivos de test (TS) | 35 |
| Total archivos de test (Swift) | 2 |
| Total metodos de test (TS estimado) | ~365 |
| Total metodos de test (Swift estimado) | ~28 |
| Frameworks de test (TS) | Vitest 4.1.5, ink-testing-library |
| Frameworks de test (Swift) | Swift Testing (`@Suite`, `@Test`, `#expect`) |
| Tests unitarios (TS) | ~320 |
| Tests de integracion (TS) | ~45 |
| Tests de UI / componente | 3 archivos (ConfirmDialog, ResultBanner, UpgradePrompt) |
| Tests de snapshot / visual regression | 0 |
| Tests deshabilitados / saltados | 0 |
| Cobertura de codigo medida | No configurada |

---

## 14.1 Unit tests

### Checklist

* [x] **Casos de uso cubiertos** — Los flujos de negocio principales (license activation/degradation, OSV security, sync engine, rollback engine, cleanup, brewfile, compliance, parsers, brew-api validation) tienen tests unitarios con mocks exhaustivos. El camino feliz del instalador de BrewBar (SHA-256 match + install exitoso) carece de test.
* [x] **Logica de dominio cubierta** — Modelos de dominio: `OutdatedPackage` (decodificacion pinned/pinnedVersion), `BrewService` (hasError), `LicenseChecker` (active/expired/past-expiry/degradation), `ProfileValidator`, `SnapshotValidator` — todos con tests representativos.
* [ ] **Mapping cubierto** — Las funciones `formulaeToListItems()` / `casksToListItems()` de `brew-api.ts` no tienen test dedicado. La logica de mapeo DTO→domain en el parser de `brew outdated --json` se cubre indirectamente via `json-parser.test.ts`, pero sin casos para formulae y casks mezclados en el mismo response.
* [x] **Validaciones cubiertas** — Validacion de nombre de paquete (`PKG_PATTERN`), activacion de licencia (formato de clave, rate limiting, lockout tras 5 fallos), perfil de usuario, payload de Polar API y respuesta OSV validados en tests.
* [ ] **Casos borde cubiertos** — La ausencia del campo `pinned` en casks (fix v0.6.1) solo se testa con el campo presente (=true). El path "campo completamente ausente del JSON" no tiene test de regresion explicito. El streaming de lineas parciales (`streamBrew` split mid-line) esta cubierto, pero el escenario de cancelacion durante flush final no lo esta.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `brewbar-installer.ts` — camino feliz sin test | Abierto | Media | `src/lib/brewbar-installer.test.ts`: 9 tests cubren errores y edge cases, no el flujo exitoso de descarga + SHA-256 match + mv a /Applications | Agregar test del happy path con SHA-256 correcto mockeando `fetch` y `fs.promises` |
| `OutdatedPackage` — cask sin campo `pinned` | Abierto | Alta | `menubar/BrewBarTests/Sources/BrewBarTests.swift`: test `jsonDecoding()` inyecta pinned=true, no prueba JSON de cask que omita la clave | Agregar test de regresion: JSON sin clave `pinned` ni `pinned_version` debe decodificar con `pinned=false, pinnedVersion=nil` |
| `formulaeToListItems` / `casksToListItems` sin test | Abierto | Baja | `src/lib/brew-api.ts` lines 80-120 aprox: funciones de conversion usadas por HomeView y UpdatesView sin archivo de test dedicado | Agregar tests unitarios para los conversores de lista en `brew-api.test.ts` |
| `streamBrew` — cancelacion durante flush | Abierto | Baja | `src/lib/brew-cli.test.ts`: no existe test de cancellation signal llegando durante lectura de ultima linea incompleta | Agregar caso de test con AbortSignal disparado en mid-flush |

---

## 14.2 Integration tests

### Checklist

* [ ] **Repositorios** — No existe capa de repositorio explicita (patron Repository no implementado); los stores de Zustand actuan como capa de acceso a datos. Los stores no tienen tests de integracion contra el CLI real.
* [ ] **Persistencia** — `data-dir.ts`, `license-manager.ts` (lectura/escritura de `license.json`), y `history-store.ts` (lectura/escritura de `history.json`) tienen tests unitarios con `vi.mock('node:fs/promises')` pero no tests de integracion contra el sistema de archivos real.
* [ ] **Red** — `SecurityMonitor` (Swift) usa `URLSession.shared` directamente sin punto de inyeccion. El path de red a OSV API no tiene test de integracion ni test con URLProtocol mock. El modulo TS `src/lib/security/osv-client.ts` tiene tests con `vi.mock` del fetch, pero no tests contra respuestas grabadas reales.
* [x] **Autenticacion** — `license-manager.test.ts` cubre AES-256-GCM round-trip, degradacion, built-in accounts, y rate limiting (con fake timers). `LicenseChecker.swift` cubre active/expired/past-expiry/degradation con `checkLicenseWith(_:)`.
* [ ] **Sincronizacion** — `sync-engine.test.ts` cubre conflictos y merge-union pero con todos los modulos de iCloud y crypto totalmente mockeados. No existe test de integracion que ejercite el round-trip real de escritura/lectura en `NSFileManager` + container de iCloud simulado.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SecurityMonitor.swift` — `URLSession.shared` no inyectable | Abierto | Alta | `menubar/BrewBar/Sources/Services/SecurityMonitor.swift:134`: `URLSession.shared.data(for:)` hardcoded; sin protocolo de inyeccion | Refactorizar para aceptar `URLSession` como parametro init o usar `URLProtocol` mock en tests; protocolo `URLSessionProtocol` o init `session: URLSession = .shared` |
| Tests de persistencia — solo mocks de fs | Abierto | Media | Todos los tests de `history-store`, `profile-store`, `state-snapshot` usan `vi.mock('node:fs/promises')`; no validan escritura real en directorio temporal | Agregar al menos un test de integracion por subsistema critico que escriba en `os.tmpdir()` y lea de vuelta |
| Sync — sin test de integracion iCloud | Abierto | Media | `src/lib/sync/sync-engine.test.ts`: icloud-backend y `captureSnapshot` completamente mockeados | Crear fixture de directorio temporal que simule container iCloud para test de round-trip de sync |

---

## 14.3 UI tests

### Checklist

* [ ] **Flujos criticos** — Ninguna de las 16 vistas de la TUI tiene test de renderizado completo via `ink-testing-library`. `HomeView`, `UpdatesView`, `SecurityAuditView`, `ProfilesView`, `SyncView` — sin coverage de renderizado.
* [ ] **Estados de error** — `UpgradePrompt` tiene test pero muestras de error state en vistas reales (por ejemplo `HomeView` con `error != null`) no estan cubiertas.
* [ ] **Navegacion principal** — `navigation-store.test.ts` cubre la logica del store (tab cycle, history) pero no hay test de renderizado que verifique que `ViewRouter` muestra la vista correcta al cambiar `currentView`.
* [ ] **Acciones destructivas** — `ConfirmDialog` tiene test de routing y/o/n. Las acciones destructivas reales (delete-account, uninstall-brewbar) no tienen test de flujo completo desde el UI.
* [ ] **Permisos del sistema** — No aplica para TUI (CLI). Para BrewBar, el flujo de permiso de notificaciones (`requestNotificationPermission`, `syncNotificationPermission`) no tiene test de UI.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| 16 vistas sin test de renderizado | Abierto | Alta | `src/views/` contiene 12+ archivos de vista; ninguno tiene archivo `.test.tsx` equivalente con `render()` de `ink-testing-library` | Priorizar tests de renderizado para `HomeView` (vista principal), `UpdatesView` (flujo core), `ViewRouter` (routing correcto), y `UpgradePrompt` dentro de vistas Pro |
| `ViewRouter` sin test | Abierto | Alta | `src/app.tsx`: switch sobre `currentView` con ramificacion Pro/Team/Free; 0 tests de renderizado verifican que la rama correcta se renderiza | Agregar `app.test.tsx` con casos: vista libre renderiza componente, vista Pro con isPro=false renderiza UpgradePrompt, vista Team renderiza Team gate |
| `SchedulerService.check()` — metodo privado no ejercido | Abierto | Media | `menubar/BrewBar/Sources/Services/SchedulerService.swift`: `check()` es `private`; `ServiceTests.swift` simula la logica manualmente sin llamar al metodo real | Exponer `check()` como `internal` para `@testable import` o extraer seam testeable; agregar test end-to-end del ciclo check→refresh→notify |

---

## 14.4 Snapshot / visual regression

### Checklist

* [ ] **Componentes base** — No existe infraestructura de snapshot testing. Ni `swift-snapshot-testing` (Swift) ni ninguna biblioteca de snapshot para React/Ink (TS) estan en las dependencias.
* [ ] **Pantallas clave** — Sin snapshot tests en ninguna pantalla.
* [ ] **Dark mode** — No aplica para TUI (CLI). Para BrewBar (SwiftUI), sin tests de snapshot en dark mode.
* [ ] **Dynamic Type** — No aplica para TUI. Para BrewBar, sin tests de accesibilidad de tamanyo de fuente.
* [ ] **Localizacion larga** — Sin tests de renderizado con strings en espanol (texto largo) para verificar truncaciones o layout breaks.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Ausencia total de snapshot testing | Abierto | Media | `package.json` devDependencies: sin `@vitest/snapshot` ni similar; `Project.swift`: sin target de snapshot tests Swift | Para BrewBar SwiftUI: integrar `swift-snapshot-testing` y cubrir al menos `ContentView`, `OutdatedListView`. Para TUI: `ink-testing-library` ya disponible — los tests de `lastFrame()` son de facto snapshots textuales; estandarizar ese patron |
| Sin cobertura de localizacion larga | Abierto | Baja | Los tests existentes de `ConfirmDialog` y `ResultBanner` usan strings en ingles; no hay prueba de truncacion con strings en espanol | Agregar variante de test con locale `es` en los componentes de TUI que renderizan strings variables |

---

## 14.5 Calidad del set de pruebas

### Checklist

* [x] **Tests estables** — Sin `sleep()`, `Thread.sleep`, ni `setTimeout` reales en tests. `vi.useFakeTimers()` usado correctamente en `brew-cli.test.ts` y `license-manager.test.ts`. Sin timeouts artificiales en Swift tests.
* [x] **No flakes frecuentes** — Sin tests deshabilitados (`XCTSkip`, `xit`, `xdescribe`, `skip`) en ninguno de los 37 archivos de test. Los tests comentados no fueron detectados.
* [x] **Fixtures claros** — Los stubs Swift (`StubBrewChecker`, `StubSecurityChecker`) son legibles y bien nombrados. Los mocks TS via `vi.fn()` en `beforeEach` con valores semanticos. Sin patrones de `testA()` o `test1()`.
* [ ] **Datos de prueba mantenibles** — Varios archivos de test TS contienen JSON inline extenso (respuestas simuladas de Polar API, OSV API, `brew info --json`) sin factories centralizadas. En Swift, los fixtures JSON de `OutdatedPackage` estan duplicados entre `BrewBarTests.swift` y `ServiceTests.swift`.
* [ ] **Tiempo de suite razonable / CI completo** — El CI (`.github/workflows/ci.yml`) ejecuta unicamente en `ubuntu-latest`. Los tests Swift (`BrewBarTests`, `ServiceTests`) **nunca se ejecutan en CI automatizado**. La suite TS (~365 tests) se ejecuta sin coverage instrumentation, sin paralelizacion explicita configurada, y sin reporte de duracion.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Swift tests fuera de CI | Abierto | Alta | `.github/workflows/ci.yml`: runner `ubuntu-latest`, paso `npm run validate`; sin paso `xcodebuild test` ni runner `macos-latest` | Agregar job `test-swift` con `macos-latest`, `tuist generate`, `xcodebuild test -scheme BrewBar -destination 'platform=macOS'` |
| Sin medicion de cobertura de codigo | Abierto | Media | `vitest.config.ts`: sin bloque `coverage`; `@vitest/coverage-v8` no esta en devDependencies; ninguna metrica de lineas/branches cubiertas es producida | Agregar `@vitest/coverage-v8` como devDependency; configurar `coverage: { provider: 'v8', reporter: ['text', 'lcov'] }` en `vitest.config.ts`; integrar reporte en CI |
| JSON fixtures duplicados en Swift | Abierto | Baja | `BrewBarTests.swift` y `ServiceTests.swift` definen strings JSON de `OutdatedPackage` independientemente | Extraer fixtures a `TestFixtures.swift` compartido en el target `BrewBarTests` |
| JSON inline extenso en tests TS sin factory | Abierto | Baja | `src/lib/license/license-manager.test.ts`, `src/lib/security/osv-client.test.ts`: bloques JSON de 40-80 lineas inline | Extraer a `src/__fixtures__/` con funciones factory exportadas (`makeLicense()`, `makeOSVResponse()`) |

---

## Matriz de cobertura util

| Zona | Tipo de test | Cobertura real | Riesgo sin cubrir | Accion |
|------|--------------|----------------|-------------------|--------|
| Domain models (TS) | Unitario | Parcial | Conversores `formulaeToListItems/casksToListItems` sin test | Agregar tests de conversion en `brew-api.test.ts` |
| Domain models (Swift) | Unitario | Parcial | `OutdatedPackage` — campo `pinned` ausente (cask path) sin test de regresion | Agregar test JSON sin clave `pinned` |
| Use cases / services (TS) | Unitario | Cubierta | Bajo: camino feliz de `brewbar-installer` | Agregar happy path test |
| Use cases / services (Swift — AppState) | Unitario | Cubierta | Ninguno critico | Mantener |
| Repositorios | No aplica | No aplica | — | — |
| ViewModels / Stores (TS) | Unitario | Cubierta | `brew-store.ts` `fetchAll()` paralelo sin test de fallo parcial | Agregar test: un fetch falla, resto continuan |
| Views / UI (TS — 16 vistas) | UI/componente | Sin cubrir | ViewRouter, HomeView, UpdatesView, SecurityView | Priorizar con `ink-testing-library` |
| Views / UI (Swift — SwiftUI) | Snapshot | Sin cubrir | Layout breaks, dark mode | Integrar `swift-snapshot-testing` |
| Navigation (TS) | Unitario | Cubierta | — | — |
| Networking (TS — brew-cli) | Unitario | Cubierta | Cancellation mid-flush | Agregar caso |
| Networking (Swift — SecurityMonitor) | Integracion | Sin cubrir | OSV API path no testeable | Inyectar URLSession |
| Authentication / Licensing (TS) | Unitario | Cubierta | — | — |
| Authentication / Licensing (Swift) | Unitario | Cubierta | — | — |
| Persistencia (TS) | Mock-only | Parcial | Sin test de integracion real contra fs | Agregar integracion en tmpdir |
| Sync (TS) | Unitario | Parcial | iCloud round-trip sin integracion | Fixture de directorio temporal |
| Rollback (TS) | Unitario | Cubierta | — | — |
| Design system components (TS) | Componente | Parcial | 3/15 componentes con tests; 12 sin renderizado | Priorizar componentes de layout |
| BrewBar menubar components | Sin test | Sin cubrir | Todos los SwiftUI views | Agregar con `swift-snapshot-testing` |
| CI gate (Swift) | No aplica | Sin cubrir | Tests Swift nunca validados automaticamente | Job `macos-latest` en CI |

---

## 15.1 Logging

### Checklist

* [x] **Logs estructurados** — Swift: `os.Logger` con subsistema `com.molinesdesigns.brewbar` y categorias por servicio (`AppState`, `SchedulerService`, `SecurityMonitor`, `BrewProcess`, `LicenseChecker`). TS: `logger` de `src/utils/logger.ts` con niveles debug/info/warn/error, redireccion a archivo en modo TUI. Sin `console.*` en produccion salvo excepciones documentadas.
* [x] **Niveles correctos** — Swift: errores de red y decodificacion en `.error`, operaciones normales en `.info`. TS: errores en `logger.error()`, operaciones en `logger.info()`, debug condicional via `LOG_LEVEL`.
* [x] **Sin datos sensibles** — Swift: todos los mensajes usan `privacy: .public` explicitamente para strings de error (no interpolacion implicita). TS: el crash reporter envia `machineId` (UUID) no email ni clave de licencia. No se detectaron logs con tokens, passwords, ni emails en ningun path.
* [ ] **Correlacion frontend/backend** — Sin correlation ID entre TUI (TS) y BrewBar (Swift). Ambos son aplicaciones independientes sin backend compartido; no existe ningun mecanismo de traza distribuida.
* [x] **Eventos criticos registrados** — Upgrade, upgradeAll, refresh error, scheduler error, CVE check, sync activity, crash, license activation/degradation — todos tienen llamadas `logger.error()` o `logger.info()` en los paths criticos.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `src/lib/brewbar-installer.ts:42` — `console.log` desnudo en modulo lib | Abierto | Baja | `console.log(t('cli_brewbarInstalling'))` en modulo lib; CLAUDE.md excepciona `console.*` solo para handlers CLI en `src/index.tsx` | Reemplazar con `logger.info(t('cli_brewbarInstalling'))` |
| Sin correlacion entre TUI y BrewBar | Informativo | Baja | Arquitectura intencional (apps independientes); sin traza distribuida posible con diseno actual | Documentar limitacion; si se agrega un backend compartido en el futuro, introducir request ID |

---

## 15.2 Crash y diagnostico

### Checklist

* [x] **Crash reporting configurado** — TS: `src/lib/crash-reporter.ts` maneja `uncaughtException` y `unhandledRejection`; opt-in via `BREW_TUI_CRASH_ENDPOINT` o `~/.brew-tui/crash-reporter.json`. Valida HTTPS o LAN. Payload: machineId, error message, stack trace, timestamp. Swift: sin crash reporting SDK (no Crashlytics, Sentry, Bugsnag); depende del crash reporter integrado de macOS (CrashReporter / Apple crash logs).
* [ ] **Symbolication verificada** — TS: N/A (Node.js, stack traces en texto). Swift: sin script de upload de dSYM en Fastfile ni en CI. El repositorio no contiene configuracion de Fastlane con `upload_symbols_to_crashlytics` ni equivalente. Los crashes de BrewBar produciran stack traces sin simbolos en produccion si el binario esta distribuido fuera del App Store.
* [ ] **Trazas utiles** — TS: el crash reporter envia stack trace completo. Swift: sin breadcrumbs ni custom keys adjuntados a los crash reports. El logger de BrewBar escribe a `os.Logger` (Unified Log) pero esos logs no se envian a ningun sistema de crash reporting externo.
* [ ] **Alertas caidas criticas** — Sin configuracion de alertas automaticas para crashes. El crash reporter TS es pasivo (envia al endpoint si esta configurado). Sin dashboard, sin webhook, sin alerta por email en caso de crash rate elevado.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| BrewBar sin crash reporting SDK | Abierto | Media | `menubar/` no tiene dependencia de Crashlytics, Sentry ni Bugsnag en `Project.swift`; depende de Apple crash logs (opt-in del usuario) | Integrar Sentry Swift SDK (SPM) o Firebase Crashlytics con dSYM upload automatico en release builds |
| Sin test del crash reporter TS | Abierto | Media | `src/lib/crash-reporter.ts`: sin archivo `crash-reporter.test.ts`; la logica de validacion de endpoint y el payload son criticos y sin cobertura | Agregar tests: validacion de HTTPS vs LAN, payload privacy (no incluye license key), manejo de endpoint no disponible |
| Sin dSYM upload en pipeline | Abierto | Media | `.github/workflows/ci.yml` y ausencia de `Fastfile`: sin paso de upload de simbolos de debug para BrewBar | Agregar script de upload de dSYM en el workflow de release de BrewBar, o configurar Xcode Cloud con symbolication automatica |
| Crash reporter TS opt-in — cobertura real desconocida | Informativo | Baja | `crash-reporter.ts`: sin mecanismo para conocer que fraccion de usuarios lo ha configurado | Considerar telemetria anonima de activacion (con consentimiento explicito) o documentacion prominente del setup |

---

## 15.3 Analytics

### Checklist

* [ ] **Eventos nombrados semanticamente** — Sin sistema de analytics en ninguna de las dos plataformas. No se detectaron llamadas a `track()`, `logEvent()`, `Analytics.`, `sendEvent()` ni equivalentes en ningun archivo TS o Swift.
* [ ] **Taxonomia consistente** — No aplica (sin analytics).
* [ ] **Sin duplicados** — No aplica (sin analytics).
* [ ] **Eventos alineados con producto** — No aplica. Los funnels de activacion de Pro (activate → payment → license written), uso de features Pro (sync, rollback, security audit, profiles), y conversion (UpgradePrompt → activate) son completamente invisibles desde el punto de vista de datos de producto.
* [ ] **Funnels criticos medibles** — Sin instrumentacion de funnels. Onboarding, activation, feature adoption, churn — ningun evento emitido.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Ausencia total de analytics | Abierto | Alta | Busqueda exhaustiva de `track\(`, `logEvent\(`, `Analytics\.`, `AnalyticsService`, `sendEvent` en `src/` y `menubar/`: 0 resultados | Definir taxonomia de eventos minima (activation_started, activation_completed, feature_used, upgrade_prompt_shown, upgrade_prompt_dismissed); integrar SDK ligero (PostHog, Mixpanel, o evento HTTP propio) con consentimiento explicito |
| Funnel de conversion Pro invisible | Abierto | Alta | `src/components/common/upgrade-prompt.tsx` muestra prompt sin emitir evento; `src/lib/license/activation.ts` completa activacion sin emitir evento | Instrumentar al menos: `upgrade_prompt_shown`, `activation_started`, `activation_completed`, `activation_failed` |
| Retencion de features Pro no medible | Abierto | Media | `src/views/security-audit/`, `src/views/sync/`, `src/views/profiles/`: navegacion sin tracking | Agregar evento `feature_viewed` con `featureId` al montar cada vista Pro |

---

## 15.4 Metricas operativas

### Checklist

* [ ] **Latencia** — Sin medicion de latencia de comandos brew en produccion. `brew-cli.ts` tiene timeout de 30s (execBrew) y 5min idle (streamBrew) pero no registra duracion de cada invocacion.
* [ ] **Error rate** — Sin agregacion de error rates. Los errores se loguean individualmente pero no hay acumulacion ni reporte de tasa de errores.
* [ ] **Throughput** — Sin conteo de requests o comandos ejecutados por sesion.
* [ ] **Retried requests** — Sin tracking de reintentos. `sync-engine.ts` y `osv-client.ts` no tienen logica de retry instrumentada.
* [ ] **Job failures** — `SchedulerService` registra el ultimo error en `UserDefaults` (`lastSchedulerError`) pero solo persiste el ultimo fallo, sin historial ni contador. `state.lastSchedulerError` expone el ultimo error a la UI pero sin metricas de frecuencia.
* [ ] **SLA/SLO** — Sin definicion de SLOs, sin health endpoint, sin uptime monitoring. La app no tiene backend propio (llama directamente a brew CLI y OSV API de terceros).

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin medicion de latencia de operaciones brew | Abierto | Media | `src/lib/brew-cli.ts`: `execBrew()` y `streamBrew()` sin instrumentacion de duracion | Agregar `performance.now()` antes/despues de cada invocacion y emitir `logger.debug()` con duracion; alimentar futura dashboard de rendimiento |
| `SchedulerService` — solo ultimo error persistido | Abierto | Media | `menubar/BrewBar/Sources/Services/SchedulerService.swift:138`: `UserDefaults.set(["message": error, "date":...], forKey: "lastSchedulerError")` — sobreescribe; sin historial ni contador | Cambiar a array de ultimos N errores (max 10) o incrementar un contador de fallos; exponer en Settings UI |
| Sin metricas de tasa de error | Abierto | Baja | Sin agregacion de errores en ninguna plataforma | Definir contador de errores por categoria en sesion (brew errors, network errors, license errors); loguear resumen al salir de la app |
| Sin SLO definidos | Informativo | Baja | Arquitectura sin backend propio hace SLO de servidor no aplicable; pero latencia maxima aceptable de `brew outdated` y OSV API podria definirse | Documentar SLOs esperados de latencia (p95 < 5s para refresh, < 15s para CVE check); agregar timeout reducido y alerta si se excede |

---

*Fin del informe de calidad — Secciones 14 y 15*
