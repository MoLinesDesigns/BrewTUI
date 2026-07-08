# 14. Testing y calidad / 15. Observabilidad y analitica

> Auditor: quality-auditor | Fecha: 2026-05-21

---

## Resumen ejecutivo

BrewTUI-Bar cuenta con una infraestructura de testing sólida para un proyecto indie: 60 archivos de test, 403 bloques `it()` literales (444 casos ejecutados por Vitest, incluyendo `it.each`), framework Vitest con `passWithNoTests: false` como gate de CI, y uso activo de `ink-testing-library` para renderizado de vistas. La suite cubre correctamente la lógica de licencias (incluyendo el pin SEG-009), parsers, stores principales y views Pro. Sin embargo, existen brechas relevantes: los 8 stores Pro carecen de tests unitarios directos, varios módulos de seguridad de licencias (`anti-tamper`, `anti-debug`, `pro-guard`) no tienen cobertura, y hay un test que falla por timeout en producción (`confirm-dialog` español). En observabilidad, el logging y el crash reporter están bien estructurados y son opt-in por defecto, pero el módulo de analytics tiene taxonomía definida y zero call sites en producción — ningún evento llega realmente a ningún sink.

---

## Metricas de testing

| Metrica | Valor |
|---------|-------|
| Total archivos de test (TS) | 60 |
| Total métodos de test (TS, `it(`) | 403 |
| Frameworks de test (TS) | Vitest 3.x |
| Tests de UI / render (ink-testing-library) | 20+ archivos de views/componentes |
| Tests de snapshot visual (toMatchSnapshot) | 0 |
| Tests deshabilitados/saltados (`skip`/`xit`/`xtest`) | 0 |
| Tests con timeout (`it.skip`, `it.todo`) | 0 |
| **Test fallando actualmente** | 1 (confirm-dialog · locale es · timeout) |
| **Archivos de test BrewBar (Swift Testing)** | 2 (`BrewBarTests.swift`, `ServiceTests.swift`) |
| **Métodos de test BrewBar (`@Test`)** | 30 |
| Frameworks de test (Swift) | Swift Testing (`@Test`/`@Suite`) |

---

## 14.1 Unit tests

### Checklist

* [x] Casos de uso cubiertos — `brew-api.test.ts`, `parsers.test.ts`, `parsers-extended.test.ts`, `license-manager.test.ts`, `polar-api.test.ts`, módulos Pro (`brewfile`, `cleanup`, `compliance`, `history`, `impact`, `rollback`, `security/audit-runner`, `sync/sync-engine`, `profiles`).
* [x] Logica de dominio cubierta — Dominio central bien cubierto. Licencias: 7 archivos de test cubren degradación, rate limit, canary, integridad, contrato cross-language, watermark, promo. Compliance, rollback y brewfile cubiertos.
* [x] Mapping cubierto — `json-parser.ts` y `text-parser.ts` cubiertos por `parsers.test.ts` y `parsers-extended.test.ts` (importan y ejercitan directamente las funciones de mapeo).
* [ ] Validaciones cubiertas — `brew-api.test.ts` cubre `PKG_PATTERN`. Sin embargo, `data-dir.ts` (`writeLastAction`, `ensureDataDirs`) carece de tests; `fetch-timeout.ts` (`fetchWithRetry`, `timed`) tampoco tiene cobertura directa.
* [ ] Casos borde cubiertos — `license-manager.test.ts` usa `vi.useFakeTimers()` para rate limit y degradación. `osv-api.test.ts` cubre `empty versions` y errores 400/5xx. Falta cobertura de edge cases en `icloud-backend.ts` (archivo no encontrado, permisos) y `onboarding.ts`.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `lib/data-dir.ts` sin test | Pendiente | Media | `writeLastAction` (IPC crítico con BrewBar) y `ensureDataDirs` no tienen test. El archivo tiene 74 líneas. | Añadir test unitario que mockee `node:fs/promises` y valide atomicidad (tmp+rename) de `writeLastAction`. |
| `lib/fetch-timeout.ts` sin test | Pendiente | Baja | `fetchWithRetry` con backoff exponencial y `timed()` no tienen test. La lógica de reintentos es usada por Polar API y OSV API (testeadas via mock del módulo completo). | Añadir test directo de `fetchWithRetry` con `vi.fn()` para fetch, verificando 3 intentos en error 503. |
| `lib/onboarding.ts` sin test | Pendiente | Baja | Módulo de lógica de primera ejecución sin cobertura. Función simple pero toca filesystem. | Test básico con `vi.mock('node:fs/promises')`. |
| `lib/license/anti-tamper.ts` sin test | Pendiente | Media | Módulo de integridad de store (`initStoreIntegrity`, `verifyStoreIntegrity`) sin test. Es parte del mecanismo anti-bypass de licencias. | Test unitario que sustituya la función `isPro` y verifique que `verifyStoreIntegrity()` devuelve `false`. |
| `lib/license/anti-debug.ts` sin test | Pendiente | Baja | `isDebuggerAttached()` no tiene test directo; el guard `__TEST_MODE__` correcto en source mitiga el riesgo de falsos positivos en CI, pero la lógica de detección de args no está verificada. | Test con `process.execArgv` mockeado. |
| `lib/license/pro-guard.ts` sin test | Pendiente | Baja | Sin test. | Verificar cobertura indirecta; si no existe, añadir test básico. |

---

## 14.2 Integration tests

### Checklist

* [ ] Repositorios — No hay capa de repositorio explícita (patrón directo store → lib → brew-cli). Las libs actúan como repositorios.
* [x] Persistencia — `snapshot.test.ts` hace round-trip real (save → load) usando `tmp` directory via mock de `node:fs/promises`. `profile-manager.test.ts` mockea filesystem. `sync-engine.test.ts` mockea `node:fs/promises` y `icloud-backend.js`.
* [x] Red — `polar-api.test.ts` mockea `fetch-timeout.js` completo (sin red real). `osv-api.test.ts` idem. Zero riesgo de llamadas externas en CI.
* [ ] Autenticacion — `license-manager.test.ts` cubre activación, degradación offline y rate limit. No hay test de flujo end-to-end con servidor real (correcto: no aplica en TUI offline-first).
* [ ] Sincronizacion — `sync-engine.test.ts` mockea iCloud backend completo; la capa `icloud-backend.ts` propiamente dicha (lectura/escritura de archivos reales en `~/Library/Mobile Documents`) no tiene test de integración.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `lib/sync/backends/icloud-backend.ts` sin test | Pendiente | Media | El sync-engine está bien testeado pero el backend real (`isICloudAvailable`, `readSyncEnvelope`, `writeSyncEnvelope`) carece de test. Fallo silencioso si el path de iCloud cambia. | Añadir test de integración con `tmp` directory que valide las rutas de iCloud en el sistema. |

---

## 14.3 UI tests

### Checklist

* [x] Flujos criticos — `ink-testing-library` en uso en 20 archivos de views. Flujos principales cubiertos: dashboard (carga, error), installed (responsive 60/100/140 cols), outdated, search, doctor, services, account. Vistas Pro: smart-cleanup, history, security-audit, rollback, brewfile, sync, compliance, profiles.
* [x] Estados de error — Views de seguridad, sync y compliance verifican renderizado de estado de error con datos mockeados.
* [x] Navegacion principal — `navigation-store.test.ts` cubre `menuMode`, `exitMenuMode`, push/pop, `goBack`. `app.test.tsx` cubre routing Pro/Team con `UpgradePrompt`.
* [ ] Acciones destructivas — Las views de cleanup (`analyze`) y rollback tienen test de renderizado pero sin verificación de flujo de confirmación completo (ConfirmDialog + acción destructiva).
* [ ] Permisos del sistema — No aplica en TUI (no hay permission dialogs del sistema operativo).

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Test de `ConfirmDialog` locale `es` falla por timeout | Defecto activo | Alta | `src/components/common/confirm-dialog.test.tsx:44` — `it('routes Spanish s/S to onConfirm only when locale is es')` falla con `Test timed out in 5000ms`. La suite completa actualmente reporta `1 failed | 443 passed`. `npm run validate` fallaría en PR. El test anterior (`routes y/Y`) pasa sin problema — el fallo es específico del caso español. Probable race entre `useLocaleStore.setState({ locale: 'es' })` y el read de `locale` dentro del handler `useInput` del componente; el render no refleja el estado antes de que `stdin.write('s')` sea procesado. | Añadir `await new Promise(r => setImmediate(r))` o similar entre `setState` y `stdin.write` para garantizar que el ciclo de render procesa el cambio de estado antes de emitir la tecla. Alternativamente añadir `timeout: 10_000` como cuarto argumento al `it()` mientras se investiga la causa. |
| Subcomponentes de `views/profiles/` sin test | Pendiente | Baja | `profile-create-flow.tsx`, `profile-detail-mode.tsx`, `profile-edit-flow.tsx`, `profile-list-mode.tsx` no tienen tests propios. `profiles.test.tsx` los ejercita indirectamente. | Añadir tests para los flujos de creación y edición que validen transiciones de modo. |
| `views/welcome.tsx` sin test | Pendiente | Baja | Vista de onboarding sin cobertura de renderizado. | Test básico con `render(<WelcomeView />)` verificando elementos clave. |

---

## 14.4 Snapshot / visual regression

### Checklist

* [ ] Componentes base — No se usa `toMatchSnapshot()` en ningún test. No hay librería de snapshot visual configurada.
* [ ] Pantallas clave — Sin snapshots.
* [ ] Dark mode — No aplica (TUI, sin color scheme del SO). Las pruebas responsive de `InstalledView` validan layout en tres anchos (60/100/140 cols).
* [ ] Dynamic Type — No aplica (TUI).
* [ ] Localizacion larga — No hay snapshots pero `brew-api.test.ts` y `parsers` tests validan strings de salida.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin snapshots visuales | Pendiente | Baja | `toMatchSnapshot()` con cero usos. Los tests de vistas verifican contenido (`toContain`) pero no layout exacto. Para un TUI donde los frames de Ink son texto puro, los snapshots inline serían útiles para detectar regresiones de formato. | Evaluar añadir `toMatchInlineSnapshot()` en las vistas de mayor superficie (InstalledView, DashboardView). Costo bajo, beneficio de regresión alto. |

---

## 14.5 Calidad del set de pruebas

### Checklist

* [ ] Tests estables — Un test falla por timeout en el run actual (ver 14.3). Los tests de `useTerminalSize` tienen tiempos de 787–1763ms — dentro del umbral pero costosos para hooks simples.
* [x] No flakes frecuentes — Cero tests con `skip`, `xit`, `xdescribe` o `it.todo`. No hay tests comentados detectados.
* [x] Fixtures claros — Los tests usan factories inline legibles (p.ej. `OutdatedPackage(name: ..., ...)` en Swift, objetos literales tipados en TS). Los stubs de Zustand en tests de views son legibles y consistentes.
* [x] Datos de prueba mantenibles — Mocks centralizados por módulo (`vi.mock()` al inicio del archivo). `StubBrewChecker` y `StubSecurityChecker` en BrewBar son reutilizables entre tests del mismo suite. Sin raw data sprawl.
* [x] Tiempo de suite razonable — 444 tests en 24.45s (transform + import incluidos). Aceptable para un proyecto de este tamaño sin paralelización explícita.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Suite roja en repo actual | Defecto activo | Alta | Salida de `npm run test`: `Test Files  1 failed | 59 passed (60)` · `Tests  1 failed | 443 passed (444)`. Pre-push hook ejecuta `npm run validate` que incluye los tests — un `git push` fallaría ahora mismo. | Corregir el test de `ConfirmDialog` locale `es` (ver 14.3). |
| 8 Pro stores sin tests unitarios | Pendiente | Media | `brewfile-store.ts`, `cleanup-store.ts`, `compliance-store.ts`, `history-store.ts`, `profile-store.ts`, `rollback-store.ts`, `security-store.ts`, `sync-store.ts` — ninguno tiene archivo `.test.ts`. Los stores son testeados indirectamente a través de los mocks de views. | Añadir tests unitarios que verifiquen `loading`/`error` state transitions y que las acciones deleguen a la lib correspondiente. |
| Hooks `use-brew-stream`, `use-debounce`, `use-view-input`, `use-visible-rows`, `use-keyboard` sin test | Pendiente | Baja | Cinco hooks sin cobertura directa. `use-terminal-size` y `use-container-size` sí tienen tests. | Prioritizar `use-brew-stream` (más complejo, envuelve AsyncGenerator) y `use-view-input` (gate crítico de navegación). |
| CLAUDE.md desactualizado sobre BrewBar tests | Doc drift | Baja | CLAUDE.md línea: *"BrewBar tiene target BrewBarTests pero no tests written yet"*. Realidad: `BrewBarTests.swift` (358 líneas, 6 suites) y `ServiceTests.swift` (199 líneas) con 30 `@Test` methods activos usando Swift Testing. CI también ejecuta `xcodebuild test`. | Actualizar CLAUDE.md: "BrewBarTests: 30 tests con Swift Testing (`@Test`/`@Suite`) cubriendo modelos, LicenseChecker y AppState con inyección de dependencias." |
| `utils/logger.ts` sin test | Pendiente | Baja | El logger tiene lógica de routing (TUI activo → archivo, normal → console), detección de `BREW_TUI_TUI_MODE`, y niveles. Sin test. | Test básico que verifique que `LOG_LEVEL=debug` emite `debug` y que el nivel `warn` no emite `debug`. |

---

## Matriz de cobertura util

| Zona | Tipo de test | Cobertura real | Riesgo sin cubrir | Accion |
|------|--------------|----------------|-------------------|--------|
| Parsers (json-parser, text-parser) | Unitario | Cubierta | Bajo | — |
| brew-cli (execBrew, streamBrew) | Unitario + fake timers | Cubierta | Bajo | — |
| brew-api | Unitario (brew-cli mockeado) | Cubierta | Bajo | — |
| License manager (degradación, rate limit, SEG-009) | Unitario + fake timers | Cubierta | Muy bajo | — |
| Polar API | Unitario (fetch mockeado) | Cubierta | Bajo | — |
| OSV API | Unitario (fetch mockeado) | Cubierta | Bajo | — |
| Canary functions | Unitario | Cubierta | Muy bajo | — |
| Integrity / watermark / promo | Unitario | Cubierta | Bajo | — |
| Feature gate | Unitario | Cubierta | Muy bajo | — |
| HKDF cross-platform | Unitario | Cubierta | Bajo | — |
| Anti-tamper / anti-debug / pro-guard | **Sin cubrir** | Sin cubrir | Medio | Añadir tests unitarios |
| Compliance (checker, remediator, policy-io) | Unitario | Cubierta | Bajo | — |
| Cleanup analyzer | Unitario | Cubierta | Bajo | — |
| History logger | Unitario | Cubierta | Bajo | — |
| Impact analyzer | Unitario | Cubierta | Bajo | — |
| Rollback engine | Unitario | Cubierta | Bajo | — |
| State snapshot | Unitario + round-trip FS | Cubierta | Bajo | — |
| Profile manager | Unitario (brew-cli mockeado) | Cubierta | Bajo | — |
| Brewfile manager / yaml-serializer | Unitario | Cubierta | Bajo | — |
| Sync engine | Unitario (iCloud mockeado) | Cubierta | Bajo | — |
| iCloud backend | **Sin cubrir** | Sin cubrir | Medio | Test con tmp dir |
| Sync crypto | Unitario | Cubierta | Bajo | — |
| Security audit runner | Unitario | Cubierta | Bajo | — |
| data-dir (writeLastAction) | **Sin cubrir** | Sin cubrir | Medio | Test con FS mockeado |
| fetch-timeout (fetchWithRetry) | **Sin cubrir** | Sin cubrir | Bajo | Test con fetch mockeado |
| crash-reporter | **Sin cubrir** | Sin cubrir | Bajo | Test de opt-in/opt-out |
| analytics (módulo completo) | **Sin cubrir** | Sin cubrir | Bajo | Test de consent + track |
| brew-store | Unitario | Cubierta | Bajo | — |
| license-store | Unitario | Cubierta | Bajo | — |
| modal-store | Unitario | Cubierta | Bajo | — |
| navigation-store | Unitario | Cubierta | Bajo | — |
| Pro stores (8: cleanup/history/security/profile/rollback/brewfile/sync/compliance) | Solo tests indirectos via views | Parcial | Medio | Tests unitarios de store directos |
| Views principales (dashboard, installed, search, outdated, services, doctor) | Render con ink-testing-library | Cubierta | Bajo | — |
| Views Pro (smart-cleanup, history, security-audit, rollback, brewfile, sync, compliance, profiles) | Render con ink-testing-library | Cubierta | Bajo | — |
| ViewRouter / app.tsx | Render + routing Pro/Team | Cubierta | Bajo | — |
| ConfirmDialog | Render + input (1 test roto) | Parcial | Alta | Corregir timeout en locale es |
| Hooks use-brew-stream / use-view-input | **Sin cubrir** | Sin cubrir | Bajo-Medio | Test con render + vitest |
| BrewBar: modelos (OutdatedPackage, BrewService) | Swift Testing @Test | Cubierta | Bajo | — |
| BrewBar: LicenseChecker | Swift Testing @Test | Cubierta | Bajo | — |
| BrewBar: AppState (con DI StubBrewChecker) | Swift Testing @Test | Cubierta | Bajo | — |
| BrewBar: SchedulerService (SecurityChecking DI) | Swift Testing @Test | Cubierta | Bajo | — |
| BrewBar: Views SwiftUI | Sin test | Sin cubrir | Bajo | Previews son suficiente para un menubar |

---

## 15.1 Logging

### Checklist

* [x] Logs estructurados — TS: `src/utils/logger.ts` implementa logger con niveles (`debug/info/warn/error`), contexto JSON estructurado en segundo parámetro, y routing automático a archivo (`~/.brewtui-bar/logs/brewtui-bar.log`) cuando el TUI está activo. Swift: todos los services de BrewBar usan `Logger(subsystem: "com.molinesdesigns.brewbar", category: ...)` — compatible con Unified Logging / Console.app.
* [x] Niveles correctos — TS: nivel por defecto `warn` (configurable con `LOG_LEVEL` env). Los paths críticos usan `logger.error()`. Rutas de diagnóstico usan `logger.debug()`. Swift: errores en `.error()`, avisos en `.warning()`, trazas en `.info()` y `.debug()`.
* [x] Sin datos sensibles — Grep exhaustivo de calls a `logger.*` en producción: solo se encontró `machineId` (UUID, no PII) y `machines: count` en `sync-engine.ts:218`. Sin tokens, emails, passwords ni claves en logs. Swift usa `privacy: .public` explícitamente en todas las interpolaciones — los datos privados no llegan a Unified Log sin debug consent.
* [ ] Correlacion frontend/backend — No existe correlation ID entre TUI y BrewBar. La única IPC es el archivo `last-action.json` (estructura `{ timestamp, action, packages, remainingOutdated, source }`). No hay request ID compartido.
* [x] Eventos criticos registrados — Auth (activación/desactivación), crash reporter install, sync completion, y errores de brew process están logueados. `license-manager.ts` loguea activación y revalidación.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin correlación IPC TUI↔BrewBar | Pendiente | Baja | `last-action.json` incluye `source: 'brewtui-bar'` pero no un trace ID correlacionable con el log de la sesión TUI. Dificulta debug de sincronía cuando BrewBar no aplica la acción. | Añadir campo `sessionId` (UUID generado en arranque del TUI) a `LastAction` y a los logs del `LastActionMonitor` de BrewBar. |

---

## 15.2 Crash y diagnostico

### Checklist

* [ ] Crash reporting configurado — TS (`src/lib/crash-reporter.ts`): opt-in, desactivado por defecto. Requiere `BREW_TUI_CRASH_ENDPOINT` env var o `~/.brewtui-bar/crash-reporter.json`. **No hay endpoint configurado en el binario distribuido.** Solo captura `uncaughtException` y `unhandledRejection`. Swift (`CrashReporter.swift`): idem, requiere `defaults write com.molinesdesigns.brewbar crashReporterEndpoint <url>`. Solo captura `NSException` via `NSSetUncaughtExceptionHandler`. Los crashes puros de Swift (`fatalError`, traps de acceso a memoria) **no son capturables** sin un SDK nativo (Sentry-Cocoa, Crashlytics) — comentario `QA-007` en source lo reconoce explícitamente.
* [ ] Symbolication verificada — No hay script de upload de dSYM. `menubar/scripts/release.sh` produce `BrewBar.app.zip` pero no sube symbols a ningún servicio. Sin symbolication, los stack traces del crash reporter son ilegibles si se produce un crash en código optimizado.
* [x] Trazas utiles — Los crash reports incluyen: `version`, `platform`, `os`, `arch`, `machineId`, `timestamp`, `level`, `message`, `stack` (callStackSymbols para NSException), `context`. El campo `context` permite añadir breadcrumbs via `reportError(err, { context })`.
* [ ] Alertas caidas criticas — No hay alertas configuradas. No hay webhook, PagerDuty, ni email integrado al endpoint de crash reporting. Requiere infraestructura adicional del usuario.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Crash reporting opt-in, no hay sink en distribución | Diseño documentado | Baja | Por diseño (privacy-first), pero significa que en producción real ningún crash se reporta a menos que el usuario configure manualmente el endpoint. El comentario `QA-007` en `CrashReporter.swift` reconoce el gap de `fatalError`. | Evaluar en roadmap: (a) integrar Sentry-Cocoa en BrewBar para captura nativa, o (b) añadir endpoint opt-in en `SettingsView`. |
| Sin symbolication de dSYM | Pendiente | Media | El proceso de release produce `BrewBar.app.zip` notarizado pero no sube symbols. Si un usuario configura el endpoint y llega un crash, el stack trace de producción será ofuscado. | Añadir paso en `release.sh` para subir dSYM al endpoint configurado o a un bucket privado. Evaluar `dsymutil` + upload a Sentry DSN privado. |
| `fatalError` de Swift no capturado | Limitación de diseño | Baja | Solo NSException es interceptado. Los crashes de Swift puro generan un crash report del SO que el usuario debe enviar manualmente. Comentado en `QA-007`. | Integrar Sentry-Cocoa o Bugsnag cuando el endpoint se formalice. |

---

## 15.3 Analytics

### Checklist

* [ ] Eventos nombrados semanticamente — `src/lib/analytics.ts` define 10 eventos con naming en snake_case semántico: `activation_started`, `activation_completed`, `activation_failed`, `feature_viewed`, `upgrade_prompt_shown`, `upgrade_completed`, `security_scan_started`, `security_scan_completed`, `profile_applied`, `rollback_invoked`. La taxonomía es correcta. **Pero ninguno se emite:** grep exhaustivo de `import.*analytics` y `track(` en todo `src/` (excluyendo `analytics.ts` mismo) devuelve 0 resultados en código de producción.
* [ ] Taxonomia consistente — La taxonomía está definida como union type en `analytics.ts` — callers no pueden inventar nombres ad-hoc. Correcto en diseño, irrelevante en práctica porque no hay callers.
* [ ] Sin duplicados — No aplica: zero call sites.
* [ ] Eventos alineados con producto — Los 10 eventos cubren activación, upgrade y features clave. Faltan eventos de retención (p.ej. `session_started`, `brew_action_completed`).
* [ ] Funnels criticos medibles — No hay funnels instrumentados. El funnel de activación (`activation_started` → `activation_completed`) está definido pero no conectado.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Analytics: infraestructura presente, 0 call sites en producción | Pendiente | Media | `src/lib/analytics.ts` tiene taxonomía, consent (granted/denied/unknown), `registerSink()`, `_resetAnalyticsForTests()` — todo listo. Pero `grep -rn "from.*analytics\|import.*analytics" src/ --include="*.ts" --include="*.tsx"` (excluyendo analytics.ts) devuelve 0 líneas. El módulo es un callejón sin salida — ningún producto kpi es medible. Comentario `QA-008` en source reconoce que es "minimum-viable seam". | Conectar al menos los eventos de activación (`activation_started/completed/failed`) en `src/lib/license/license-manager.ts`, y `upgrade_prompt_shown` en `<UpgradePrompt>`. Registrar el `debugSink` en `src/index.tsx` cuando `LOG_LEVEL=debug`. Evaluar PostHog self-hosted o Plausible para el sink de producción. |
| Sin test para el módulo analytics | Pendiente | Baja | `analytics.ts` no tiene `analytics.test.ts`. La función `_resetAnalyticsForTests()` existe sugiriendo intención de test. | Añadir test que verifique que `track()` no emite sin consent, que emite con consent + sink, y que `setConsent` persiste en disco. |

---

## 15.4 Metricas operativas

### Checklist

* [ ] Latencia — `src/lib/fetch-timeout.ts` incluye `timed(label, fn)` que loguea duración en `debug`. Es el único primitivo de medición de latencia. Solo visible cuando `LOG_LEVEL=debug`. Sin agregación ni histogramas.
* [ ] Error rate — No hay tracking de error rate. Los errores se loguean individualmente pero no se agregan.
* [ ] Throughput — No hay métricas de throughput. Correcto para un TUI de escritorio que no procesa requests concurrentes.
* [ ] Retried requests — `fetchWithRetry` reintenta hasta 3 veces con backoff exponencial (500ms base, 4s max). No hay counter de retries expuesto ni logueado — el caller solo recibe el error final si todos los intentos fallan.
* [ ] Job failures — `SchedulerService` en BrewBar persiste errores en `UserDefaults("lastSchedulerError")` con message + date. Visible en `AppState.lastSchedulerError`. El test `schedulerErrorPersistence` valida este flujo. Correcto para un job de background de menubar.
* [ ] SLA/SLO — No aplica. Producto desktop/CLI sin SLA definido. No hay health endpoint ni uptime monitoring. Correcto para el tipo de producto.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Latencia solo en debug, sin agregación | Pendiente | Baja | `fetch-timeout.ts:timed()` loguea en `debug`. En producción (`LOG_LEVEL=warn` por defecto) ninguna latencia es visible. Las llamadas a Polar API y OSV API no tienen SLA medido. | Considerar loguear latencias de operaciones críticas en nivel `info` (activación, OSV batch) para diagnóstico de campo sin necesidad de debug. |
| Retries de red sin contador expuesto | Pendiente | Baja | `fetchWithRetry` reintenta silenciosamente. Un usuario que experimenta latencia no puede distinguir "1 intento rápido" de "3 intentos con 4s backoff". | Añadir `logger.warn()` al iniciar cada reintento con el número de intento y el delay. |

---

## Apendice: cobertura BrewBar Swift

La documentación interna (`CLAUDE.md`) estaba desactualizada indicando que BrewBar no tenía tests. El estado real al 2026-05-21:

**`menubar/BrewBarTests/Sources/BrewBarTests.swift`** (358 líneas):
- Suite `OutdatedPackageTests` (5 tests): `installedVersion`, fallback a `?`, `id`, JSON decoding con/sin `pinned`.
- Suite `OutdatedResponseTests` (1 test): decodificación de formulae/casks.
- Suite `BrewServiceTests` (3 tests): JSON decoding, `hasError`, `isRunning`.
- Suite `LicenseCheckerTests` (5 tests): ISO8601 con fracciones, expired status, past expiration, degradación a 30+ días, niveles intermedios warning/limited.
- Suite `AppStateTests` (6 tests): `outdatedCount`, `errorServices`, upgrade bloqueado sin Pro, `upgradeAll` bloqueado, guard de refresh concurrente, persistencia de `lastSchedulerError`.
- Suite `DataHexTests` (3 tests): hex→data, hex vacío, hex inválido.

**`menubar/BrewBarTests/Sources/ServiceTests.swift`** (199 líneas):
- Suite `AppStateInjectedTests` (5 tests): refresh con stub, aislamiento de errores por dominio, upgrade routing, propagación de error, upgradeAll routing.
- Suite `SchedulerSecurityTests` (2 tests): nuevas alertas CVE llegan a AppState, check vacío no invoca loadCached.

**Framework**: Swift Testing (`@Test`/`@Suite`, no XCTest). CI ejecuta `xcodebuild test` en `macos-latest`.

**Gaps BrewBar**: vistas SwiftUI (`PopoverView`, `OutdatedListView`, `SettingsView`) sin test — aceptable para un menubar. `SyncMonitor`, `VersionChecker`, `NotificationSender` sin test.
