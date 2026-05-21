# 10. Rendimiento

> Auditor: performance-auditor (manual run, agent reconfig) | Fecha: 2026-05-01

## 1. Resumen ejecutivo

El proyecto rinde bien para una app de terminal y un menubar pequeño: el bundle ESM final pesa 241 KB (1,0 MB con `.map` y chunks dinámicos), Ink renderiza listas paginadas a tamaño de viewport, y la `streamBrew` cancela procesos al desmontar. Los hallazgos relevantes son tres: (a) el panel de Impact Analysis dispara dos `brew deps`/`brew uses` por cada movimiento del cursor en `outdated.tsx`, lo que satura `brew` al desplazarse j/k sobre listas grandes; (b) el `brew update` se ejecuta secuencialmente antes del paralelismo `async let` en `AppState.refresh`, fijando el tiempo a primer dato en BrewBar como `T(brew update) + max(outdated, services)`; (c) el polling de 100 ms en `streamBrew` añade hasta 100 ms de latencia por línea. El resto son optimizaciones menores (selectores Zustand granulares, lectura redundante de `sync.json`).

## 2. Métricas medidas

| Métrica | Valor | Cómo se midió |
|---------|-------|---------------|
| `build/index.js` (entry compilada) | 247.032 bytes / 241 KB / 6.264 líneas | `ls -lh build/`, `wc -l build/index.js` |
| Total de `build/` (entry + chunks + sourcemaps) | 1,0 MB | `du -sh build` |
| Chunks dinámicos (lazy imports) generados | 9 chunks JS (sin contar sourcemaps) | `ls build/chunk-*.js` |
| Chunk dinámico mayor | `chunk-MSXH66I2.js` 49 KB / 1.055 líneas | `wc -l`, `ls -lh` |
| `node_modules` instalado | 132 MB / 178 paquetes top-level | `du -sh node_modules`, `ls node_modules \| wc -l` |
| `node_modules/ink` (peso) | 2,7 MB | `du -sh node_modules/ink` |
| `node_modules/react` | 252 KB | `du -sh node_modules/react` |
| `node_modules/zustand` | 252 KB | `du -sh node_modules/zustand` |
| Swift sources `App + Models + Services` | 1.764 líneas | `wc -l menubar/.../Services/*.swift App/*.swift Models/*.swift` |
| Línea de líneas de `SchedulerService.swift` | 259 | `wc -l SchedulerService.swift` |
| Línea de líneas de `SecurityMonitor.swift` | 304 | `wc -l SecurityMonitor.swift` |
| Línea de líneas de `BrewProcess.swift` | 146 | `wc -l BrewProcess.swift` |
| Timer de badge en menubar | 30 s (`Timer.scheduledTimer(withTimeInterval: 30, repeats: true)`) | `AppDelegate.swift:69` |
| Timeout `brew update` (Swift) | 120 s | `BrewChecker.swift:7` |
| Timeout `BrewProcess` por defecto | 60 s | `BrewProcess.swift:41` |
| Cooldown `brew update` (TS) | 5 min | `brew-store.ts:6` |
| Timeout `execBrew` (TS) | 30 s | `brew-cli.ts:3` |
| Idle timeout `streamBrew` (TS) | 5 min | `brew-cli.ts:4` |
| Polling `streamBrew` | 100 ms (`setTimeout(r, 100)`) | `brew-cli.ts:87` |
| Debounce búsqueda en `installed.tsx` | 200 ms | `installed.tsx:35` |
| Debounce búsqueda en `history.tsx` | 200 ms | `history.tsx:46` |
| Debounce de cursor en `outdated.tsx` (Impact) | 150 ms | `outdated.tsx:87` |
| `MAX_LINES` buffer de log streaming | 100 | `use-brew-stream.ts:7` |
| Cache CVE TTL (TUI / BrewBar) | 30 min / 60 min | (documentado en CLAUDE.md, ver `SecurityMonitor.swift:11`) |
| Lectura `sync.json` por tick scheduler | 2 (checkForSyncActivity + getKnownMachineCount) | `SyncMonitor.swift:23,42` y `SchedulerService.swift:165-166` |

---

## 3. Sub-secciones

### 3.1 Coste de arranque y CLI subcommands (TUI)

#### Checklist

* [x] El entry CLI (`src/index.tsx`) hace `await ensureDataDirs()` + `installCrashReporter()` antes que cualquier subcommand
* [x] Subcommands Pro-only (`install-brewbar`, `status` con secciones Pro) usan `await import(...)` dinámico para no cargar módulos pesados en flujos free
* [x] `delete-account`, `activate`, `deactivate`, `revalidate` no tocan stores ni Ink
* [x] Lanzamiento por defecto (TUI) limpia la pantalla con `\x1B[2J\x1B[3J\x1B[H` (`index.tsx:222`) antes de `render(<App/>)`
* [ ] `ensureBrewBarRunning()` se llama antes de la TUI **incondicionalmente** en macOS (no se puede desactivar sin variable de entorno)

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Lazy imports en `status` Pro y en installer | Conforme — Informativa | `src/index.tsx:122,136,148,159,160,178,190,232` — cada bloque Pro hace `await import()` para snapshots, brewfile, sync, compliance, brewbar-installer | Mantener patrón. Generaron 9 chunks de tamaño pequeño (≤49 KB) en lugar de cargarse en el bundle principal |
| `ensureBrewBarRunning()` se ejecuta antes de la TUI | Baja | `src/index.tsx:217` se llama en cada arranque de TUI; chequea `process.platform === 'darwin'`, inicializa licencia y verifica `isBrewBarInstalled()`. En usuarios free retorna pronto, pero ya pagó `ensureDataDirs + initialize` | Mover el chequeo a "primer arranque" o gating con flag (variable de entorno o config en `~/.brew-tui/`) para no penalizar arranques repetidos |
| Bundle `index.js` 241 KB / 6.264 líneas | Informativa | `build/index.js` — incluye Ink, Zustand, lógica completa de stores y vistas (React queda externalizado por `tsup.config.ts:9`) | Aceptable para CLI. Considerar `tsup --metafile` para auditar el reparto si crece más de 350 KB |
| `tsup target: 'node18'` con `engines: ">=22"` | Baja (ya documentado en 03.4) | `tsup.config.ts:9` vs `package.json` engines | Alinear a `node22` para evitar polyfills innecesarios y aprovechar nativos (ya nombrado en sección 3) |
| Borrado de scrollback al iniciar (`\x1B[3J`) | Conforme — Informativa | `index.tsx:222` — limpia scrollback además de pantalla; típico para apps fullscreen TUI pero pierde contexto visible al usuario antes del `render` | — |

### 3.2 Bundle TS (tsup output)

#### Checklist

* [x] Bundle ESM, sin CJS dual
* [x] React externalizado (`tsup.config.ts:9`)
* [x] Sourcemaps `hidden` (no referenciados desde el bundle)
* [x] Compile-time defines reemplazan `__TEST_MODE__` y `process.env.APP_VERSION`

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Bundle principal compactado a 241 KB con Ink + Zustand inline | Conforme | `ls -lh build/index.js` 247.032 bytes | — |
| Chunks dinámicos correctamente generados | Conforme | `ls build/chunk-*.js` produce 9 chunks; el mayor (`chunk-MSXH66I2.js` 49 KB) corresponde a sync engine + crypto; `policy-io` y `compliance-checker` quedan en chunks dedicados de <300 B (re-export shells) | — |
| Sourcemaps en `build/` aumentan el footprint en disco | Informativa | 1,0 MB total `du -sh build` (47 % son `.map`); el campo `files` en `package.json` incluye `build/` completo | Si el tarball npm está apretado, considerar excluir `*.map` del paquete vía `.npmignore` o `package.json#files` granular |
| Bundle no incluye `react` ni `react-devtools-core` (externalizados) | Conforme | `tsup.config.ts:9` y `import { render } from 'ink'` — Ink importa React en runtime | — |

### 3.3 Concurrencia inicial y selectores Zustand

#### Checklist

* [x] `fetchAll()` paraleliza las 6 fetches con `Promise.all` (`brew-store.ts:168-175`)
* [x] `fetchAll()` deduplica con `fetchAllInFlight` y `brewUpdateInFlight`
* [x] Cooldown de 5 min para `brew update` (`brew-store.ts:6`)
* [ ] `dashboard.tsx` usa selector destructurado (re-render por cualquier cambio del store)
* [x] `installed.tsx` usa selectores granulares (`useBrewStore((s) => s.formulae)` etc.)

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| `DashboardView` desestructura el store completo | Baja | `src/views/dashboard.tsx:82` `const { formulae, casks, outdated, services, config, loading, errors, lastFetchedAt, fetchAll } = useBrewStore();`. Cualquier mutación del map `loading` o `errors` re-renderiza el dashboard entero. El coste real en Ink es acotado (terminal, no DOM), pero contrasta con `installed.tsx:22-26` que usa selectores granulares | Aplicar el mismo patrón granular: un selector por campo o `useShallow` |
| `OutdatedView` también desestructura el store | Baja | `src/views/outdated.tsx:60` `const { outdated, loading, errors, fetchOutdated } = useBrewStore();` — idem dashboard | Ídem |
| `loading` y `errors` modelados como `Record<string, …>` | Media (ya cubierto en 03.3) | `brew-store.ts:22-24` y comentario en 03 sección 4.3 — un `loading: true` y `error: "..."` simultáneos son representables | Migrar a `AsyncState<T>` discriminado |
| `fetchAll` paraleliza todas las fetches | Conforme | `brew-store.ts:168-175` `Promise.all([fetchInstalled, fetchOutdated, fetchServices, fetchConfig, fetchLeaves, fetchDoctor])` | — |
| `brewUpdate()` lanzado fire-and-forget con cooldown 5 min | Conforme | `brew-store.ts:160-165`, sin bloquear `fetchAll`. Aceptable; el bug de "sin timeout" ya está cubierto en `07-backend-persistence.md` 11.1 | Cita: ver sección 11.1 del informe 07 (Media) |

### 3.4 Streaming brew (AsyncGenerator + hook)

#### Checklist

* [x] `streamBrew` mata el proceso en `finally` (`brew-cli.ts:90-94`)
* [x] `useBrewStream` cancela el generador en cleanup de `useEffect` (`use-brew-stream.ts:42-45`)
* [x] Buffer interno acotado a `MAX_LINES = 100` en el hook (`use-brew-stream.ts:7,64`)
* [x] Idle timeout de 5 min en `streamBrew` (`brew-cli.ts:83-85`)
* [ ] Loop de espera por nuevas líneas usa polling (`setTimeout(r, 100)`)

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Polling de 100 ms en lugar de event-driven | Baja | `src/lib/brew-cli.ts:87` `await new Promise((r) => setTimeout(r, 100))` dentro del bucle del generador. Añade hasta 100 ms de latencia por línea visible y despierta el event loop 10 veces por segundo durante toda la operación de install/upgrade | Reemplazar por un patrón con `Promise` resuelta desde `proc.stdout.on('data', …)` (cola + resolvedor pendiente). Reduce latencia y CPU |
| Backpressure | Informativa | `brew-cli.ts:46-58` acumula líneas en un array sin límite; en la práctica el consumidor en React shiftea (`lines.shift()`) más rápido que `brew` produce, pero un `brew install` con miles de líneas en burst podría retener memoria transitoria | Si llega a notarse, limitar la cola interna del generador (no solo el `setLines` del hook) |
| Cancelación correcta al desmontar | Conforme | `use-brew-stream.ts:42-45` y `:97-98` llaman `generator.return(undefined)`; el `finally` del generador mata el proceso | — |
| `setLines` con `.slice(-(MAX_LINES - 1))` | Conforme | `use-brew-stream.ts:64` — preserva los últimos 100 (cota dura, evita re-render con miles de strings) | — |

### 3.5 Debouncing y búsqueda

#### Checklist

* [x] `useDebounce` cancela el timer en cleanup (`use-debounce.ts:8`)
* [x] `installed.tsx` debounced 200 ms (`installed.tsx:35`)
* [x] `history.tsx` debounced 200 ms (`history.tsx:46`)
* [x] `outdated.tsx` debounced 150 ms para Impact (`outdated.tsx:87`)
* [x] Búsqueda online (`search.tsx`) requiere `Enter`, no auto-fire (`search.tsx:86-88`)

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| `useDebounce` recrea el timer en cada cambio de `value` o `delayMs` | Conforme | `use-debounce.ts:6-9` — patrón estándar. Cleanup limpia el `setTimeout` previo en cada render | — |
| `search.tsx` valida `term.length < 2` antes de spawn | Conforme | `src/views/search.tsx:42-46` | — |

### 3.6 Renderizado de listas (Ink)

#### Checklist

* [x] `installed.tsx` calcula `MAX_VISIBLE_ROWS` por `stdout.rows - 8` (`installed.tsx:139`)
* [x] `outdated.tsx` ídem (`outdated.tsx:144`)
* [x] `history.tsx` ídem (`history.tsx:105`)
* [x] `search.tsx` cap fijo `MAX_VISIBLE = 20` por sección (`search.tsx:68`)
* [x] Slicing antes de map: solo se renderizan filas visibles
* [x] Indicadores `more above`/`more below` para guiar al usuario
* [ ] `useStdout()` se llama después de un `return` temprano en `history.tsx`

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Listas paginadas a viewport antes de render | Conforme | `installed.tsx:139-141`, `outdated.tsx:144-146`, `history.tsx:104-107`. Solo `MAX_VISIBLE_ROWS` filas se mapean a `<SelectableRow>` | — |
| `useStdout()` invocado después de `return` temprano | Baja | `src/views/history.tsx:101-104` — los hooks `if (loading) return …; if (error) return …; const { stdout } = useStdout();` violan las reglas de hooks (ejecución condicional). React 19 no avisa siempre y el flujo "feliz" funciona, pero un cambio del orden producirá warnings | Mover `useStdout()` al inicio del componente, con el resto de hooks |
| Cómputo de `allOutdated` en cada render | Baja | `src/views/outdated.tsx:82-85` `const allOutdated = [...outdated.formulae.map(...), ...outdated.casks.map(...)]` — sin `useMemo`. Cada movimiento de cursor genera un nuevo array y, por tanto, recrea `visible` aunque `outdated` no cambió | Envolver con `useMemo([...formulae, ...casks], [outdated.formulae, outdated.casks])` |

### 3.7 JSON parser y conversiones

#### Checklist

* [x] `safeParse` envuelve `JSON.parse` con contexto de error (`json-parser.ts:3-13`)
* [x] Parsers tolerantes a campos faltantes (devuelven arrays vacíos)
* [x] `parseInstalledJson` y `parseOutdatedJson` no clonan, solo verifican estructura

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| `JSON.parse` síncrono sobre `brew info --json=v2 --installed` | Informativa | `src/lib/parsers/json-parser.ts:5`. La salida puede ser de varios MB (cientos de paquetes); `JSON.parse` bloquea el event loop. En la práctica una instalación normal está por debajo del umbral perceptible (<50 ms) | Si se detecta jank en `fetchInstalled` con instalaciones masivas, considerar `worker_threads` para parsing |
| `parseSearchResults` recorre líneas con `startsWith('==>')` | Conforme | `src/lib/parsers/text-parser.ts:9-22` — O(n) sobre líneas, suficiente | — |

### 3.8 Modal store (contador de referencia)

#### Checklist

* [x] Contador en lugar de booleano (correcto para suprimores anidados)
* [x] `Math.max(0, ...)` evita underflow
* [x] No hay listeners ni efectos colaterales

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Overhead del contador despreciable | Conforme | `src/stores/modal-store.ts:15-28` — dos campos, dos acciones puras. Cada open/close ejecuta una resta y un comparador. El re-render se dispara solo cuando `isOpen` cambia (de 0 a 1 o de 1 a 0) | — |

---

### 3.9 BrewBar — `applicationDidFinishLaunching`

#### Checklist

* [x] Crash reporter instalado primero (`AppDelegate.swift:25`)
* [x] `launchTask` cancelable y guardado para terminación (`AppDelegate.swift:17,76-77`)
* [x] `setupStatusItem()` y `setupPopover()` se ejecutan tras la verificación de Pro
* [x] `appState.refresh()` se invoca tras `setupStatusItem` (el icono ya está visible)
* [ ] `await checkBrewTuiInstalled()` se ejecuta antes de cualquier UI; en el peor caso bloquea hasta que `which brew-tui` termine

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Tiempo a primer icono dependiente de `checkBrewTuiInstalled` | Baja | `menubar/BrewBar/Sources/App/AppDelegate.swift:106-142`. Primero recorre 3 paths conocidos (operación de FS muy rápida); si fallan, hace un `which brew-tui` con `terminationHandler`. En la mayoría de máquinas el path `/opt/homebrew/bin/brew-tui` se resuelve sin spawn | Ya optimizado con check de paths conocidos. Aceptable |
| `setupStatusItem()` ocurre tras `LicenseChecker.checkLicense()` | Informativa | `AppDelegate.swift:34-49`. La verificación de licencia incluye descifrado AES-GCM (`LicenseChecker.swift:64-75`); es local y rápida (<5 ms) pero retrasa la aparición del icono | — |
| Carga inicial de CVE alerts y sync activity (sin red) | Conforme | `AppDelegate.swift:59-65` — `loadCachedAlerts()` y `checkForSyncActivity()` solo leen archivos locales antes de `updateBadge` | — |
| `NSHostingController` reutilizado entre apariciones del popover | Conforme | `AppDelegate.swift:209-213` — comentario explícito: "Create the hosting controller once and reuse on each popover open" | — |

### 3.10 BrewBar — `SchedulerService.check()`

#### Checklist

* [x] Timer `Timer.scheduledTimer` se invalida en `stop()`
* [x] `state.refresh()` paraleliza outdated + services con `async let`
* [x] CVE check usa cache 1h antes de consultar OSV
* [x] `SyncMonitor` consultado tras CVE
* [ ] `SchedulerService.check()` ejecuta `state.refresh()`, luego `security.checkForNewVulnerabilities()`, luego `SyncMonitor` — todo serializado con `await`
* [ ] `state.refresh()` espera `updateIndex()` antes de iniciar el `async let` de outdated/services

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| `AppState.refresh()` serializa `updateIndex` antes del paralelismo | Media | `menubar/BrewBar/Sources/Models/AppState.swift:51-55`. `await checker.updateIndex()` (timeout 120 s, `BrewChecker.swift:7`) se ejecuta primero; recién después `async let outdatedResult = checker.checkOutdated(); async let servicesResult = checker.checkServices()`. El tiempo a primer dato de la lista es `T(brew update) + max(outdated, services)` cuando podría ser `max(brew update, outdated, services)` aceptando datos potencialmente "viejos" en el primer tick | Lanzar `updateIndex()` como `async let` o como `Task` no awaited; refrescar tras `outdated` cuando termine. Documentar el trade-off (datos posiblemente cacheados en el primer pintado) |
| `check()` serializa CVE, sync y notificaciones | Baja | `SchedulerService.swift:129-173` — todas las secciones se hacen secuencialmente con `await`. CVE depende del refresh anterior, pero `SyncMonitor` (líneas 165-173) podría ir en paralelo con CVE | Considerar `async let` para CVE y SyncMonitor; el ahorro es marginal porque corren cada hora/4h/8h |
| `syncNotificationPermission()` se llama hasta tres veces por tick | Baja | `SchedulerService.swift:144,156,169` — antes de cada notificación. Cada llamada es asíncrona y consulta `UNUserNotificationCenter`. Se justifica para no perder cambios de permiso entre disparos pero es redundante en una misma ejecución | Cachear el resultado durante la ejecución de `check()` (variable local) |

### 3.11 BrewBar — `BrewProcess.swift`

#### Checklist

* [x] `OnceGuard` (NSLock) garantiza un único `resume`
* [x] `TimeoutBox` permite cancelar el `Task.sleep` cuando el proceso termina antes
* [x] `process.standardError = FileHandle.nullDevice` (no acumula stderr en memoria)
* [ ] `terminationHandler` ejecuta `pipe.fileHandleForReading.readDataToEndOfFile()` síncrono

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| `readDataToEndOfFile()` síncrono dentro del terminationHandler | Alta (cita 07.4) | `BrewProcess.swift:99`. `terminationHandler` corre en un hilo de GCD; bloquea hasta drenar el pipe. El issue de v0.6.1 fue del decoder, no del pipe (todavía); el riesgo a futuro es real para `brew info --json=v2` con cientos de paquetes (>64 KB de buffer del pipe) | Ya documentado como Alta en `07-backend-persistence.md` 11.4. Migrar a `pipe.fileHandleForReading.readabilityHandler` con buffer incremental, o `Process.run()` async-await iOS-style |
| Timeout `Task.sleep` cancelado correctamente al terminar | Conforme | `BrewProcess.swift:104-107` y `:122-126` — el `terminationHandler` cancela el `timeoutBox.task`; el `Task.sleep` retorna `error` y sale por el guard `return` | — |
| Cero buffering visible en stderr | Conforme | `BrewProcess.swift:92` — `FileHandle.nullDevice`, sin retención de memoria | — |

### 3.12 BrewBar — Badge timer y `@Observable`

#### Checklist

* [x] Badge timer cada 30 s (`AppDelegate.swift:69`)
* [x] `updateBadge()` evita re-asignar `button.title` si no cambió (`AppDelegate.swift:231-233`)
* [x] `badgeTimer` invalidado en `applicationWillTerminate`

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Timer de 30 s para refrescar badge sin red | Conforme | `AppDelegate.swift:69-71`. El timer solo lee propiedades de `appState` (que ya están cacheadas en memoria) y reasigna icon + title si cambiaron. Coste despreciable | — |
| `updateBadge()` reconstruye `NSImage` cada tick | Baja | `AppDelegate.swift:235-242` — siempre `NSImage(named: "MenuBarIcon")` aunque la imagen no haya cambiado. AppKit cachea internamente, pero el `setSize` y `accessibilityDescription` se asignan cada vez | Cachear `let icon = NSImage(named: ...).map { … }` en `setupStatusItem()` y mutar solo `accessibilityDescription` cuando cambie; ahorro micro |
| Modelo `@Observable` correcto, vista observa subset | Conforme | `AppState.swift:7-22` — campos individuales; SwiftUI/Observation lee solo los keypaths usados en el body, no fuerza re-render por cualquier cambio (no aplica el problema de Zustand destructurado en TUI) | — |

### 3.13 BrewBar — Notificaciones

#### Checklist

* [x] Identifier único por disparo en `sendNotification` (`SchedulerService.swift:213-216`)
* [x] Comentario explícito sobre por qué (evitar reemplazo silencioso macOS)
* [x] Identifier estable en CVE (`brewbar-cve`) y sync (`brewbar-sync`) — colapsan intencionalmente
* [x] `requestAuthorization` solo si el usuario activa el toggle

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Identifiers fijos en CVE y sync | Conforme | `SchedulerService.swift:184,253` — `brewbar-sync` y `brewbar-cve` reemplazan la notificación previa. Decisión deliberada para no spamear; el del outdated sí usa timestamp | — |
| Cadencia de notificaciones controlada por `Interval` | Conforme | `SchedulerService.swift:10-22` — 1h/4h/8h. `notificationsEnabled` consultado en cada disparo | — |

### 3.14 BrewBar — `SyncMonitor`

#### Checklist

* [ ] `checkForSyncActivity()` y `getKnownMachineCount()` leen y parsean `sync.json` por separado
* [x] El archivo es local (iCloud Drive sincronizado al disco)
* [x] No descifra contenido — solo lee `updatedAt` y `machines`

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Doble lectura/parse de `sync.json` por tick | Baja | `SyncMonitor.swift:23-54`. `checkForSyncActivity()` hace `Data(contentsOf:) + JSONSerialization`; `getKnownMachineCount()` hace exactamente lo mismo. En `AppDelegate.swift:63-65` y `SchedulerService.swift:165-166` ambos métodos se llaman en serie. En total: **dos `JSONSerialization` por tick** y **cuatro lecturas en arranque + cada hora** | Refactor: un único método `func checkSync() async -> (Bool, Int)` que parsea una sola vez y devuelve tupla. Reduce lecturas a la mitad |
| `SyncMonitor` sin protocolo de DI | Media (cita 03.2) | `SyncMonitor.swift:8` actor con `static let shared`. Ya documentado | Ya nombrado en informe 3 |

### 3.15 Impact Analysis (TUI Pro) — efecto sobre la lista de outdated

#### Checklist

* [ ] `useEffect([debouncedCursor, stream.isRunning])` dispara `getUpgradeImpact` por cada movimiento del cursor
* [x] `analyzeUpgradeImpact` cortocircuita para `cask` (no spawn)
* [ ] Para formulae, ejecuta `brew deps --1 <pkg>` y `brew uses --installed <pkg>` (dos spawns)
* [ ] Sin caché por paquete entre cursor moves

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Cada cambio de cursor dispara dos `brew` spawns para el paquete actual | Media | `src/views/outdated.tsx:89-105` — `useEffect` con `debouncedCursor` (150 ms). Llama `getUpgradeImpact` que invoca `analyzeUpgradeImpact` (`src/lib/impact/impact-analyzer.ts:81,88`). Para cada formula: `execBrew(['deps', '--1', name])` + `execBrew(['uses', '--installed', name])`. Holding j/k sobre una lista de 50 paquetes outdated genera 100+ subprocesos brew durante el scroll, con coste real medible (cada `brew` arranca Ruby + carga formula data) | Cachear los resultados en un `Map<string, UpgradeImpact>` con el `(name, fromVersion, toVersion)` como clave; subir el debounce a 400-500 ms; o solo analizar al pedirlo explícitamente (tecla `i`) |
| Llamadas en cascada bloquean el render con spinner `impact_analyzing` | Baja | `outdated.tsx:245-249` — la UI muestra spinner durante el análisis; UX aceptable, pero la racha de spawns no se cancela si el cursor sigue moviéndose | Cancelar requests anteriores (almacenar `lastRequestId` y descartar resultado si cambió) |
| Sin cache LRU en el módulo `impact-analyzer` | Baja | `src/lib/impact/impact-analyzer.ts` — no exporta caché. Cada llamada recalcula desde cero | Añadir cache en módulo con TTL razonable (por ejemplo 5 min) |

### 3.16 OSV API (TUI)

#### Checklist

* [x] Batch de 100 paquetes (`osv-api.ts:60`)
* [x] Reintentos con backoff para 5xx en `fetchWithRetry` (`osv-api.ts:73`)
* [x] Backoff de 2 s + retry para 429 (`osv-api.ts:135-149`)
* [x] Delay de 75 ms entre requests individuales en fallback (`osv-api.ts:157`)

#### Hallazgos

| Elemento | Severidad | Evidencia | Acción |
|----------|-----------|-----------|--------|
| Bug funcional `ecosystem: 'Homebrew'` | Crítica (cita 07.1) | `src/lib/security/osv-api.ts:125,143,181`. Ya cubierto exhaustivamente en informe 07 | Sin nueva acción de performance — es bug de correctness que invalida todos los resultados |

---

## 4. Registro de performance (consolidado)

| ID | Área | Severidad | Hallazgo | Archivo / línea |
|----|------|-----------|----------|-----------------|
| PERF-001 | TUI / Bundle | Baja | `tsup target: node18` con engines `>=22` (cita 03.4) | `tsup.config.ts:9` |
| PERF-002 | TUI / Streaming | Baja | Polling 100 ms en `streamBrew` en lugar de event-driven | `src/lib/brew-cli.ts:87` |
| PERF-003 | TUI / Backpressure | Informativa | Cola interna sin límite en `streamBrew` | `src/lib/brew-cli.ts:46-58` |
| PERF-004 | TUI / Re-render | Baja | `dashboard.tsx` y `outdated.tsx` desestructuran el store completo | `src/views/dashboard.tsx:82`, `src/views/outdated.tsx:60` |
| PERF-005 | TUI / Re-render | Baja | `outdated.tsx` recompone `allOutdated` en cada render sin `useMemo` | `src/views/outdated.tsx:82-85` |
| PERF-006 | TUI / Hooks | Baja | `useStdout()` invocado tras returns tempranos en `history.tsx` | `src/views/history.tsx:101-104` |
| PERF-007 | TUI / Pro feature | Media | Impact Analysis spawnea 2 brew por cada movimiento del cursor sin caché | `src/views/outdated.tsx:89-105`, `src/lib/impact/impact-analyzer.ts:81,88` |
| PERF-008 | TUI / Arranque | Baja | `ensureBrewBarRunning()` se ejecuta en cada arranque de TUI | `src/index.tsx:217` |
| PERF-009 | TUI / Bundle | Informativa | Sourcemaps incluidos en el tarball npm vía `package.json#files` | `package.json` `files: [build/]` |
| PERF-010 | TUI / Estado | Media (cita 03.3) | `loading`/`errors` como maps no discriminados | `src/stores/brew-store.ts:22-24` |
| PERF-011 | BrewBar / Arranque | Media | `AppState.refresh()` serializa `updateIndex` antes del paralelismo | `menubar/BrewBar/Sources/Models/AppState.swift:51-55` |
| PERF-012 | BrewBar / Scheduler | Baja | `check()` serializa CVE y SyncMonitor (podrían paralelizarse) | `menubar/BrewBar/Sources/Services/SchedulerService.swift:152-173` |
| PERF-013 | BrewBar / Notificaciones | Baja | `syncNotificationPermission()` llamada hasta 3× por tick | `SchedulerService.swift:144,156,169` |
| PERF-014 | BrewBar / Pipes | Alta (cita 07.4) | `readDataToEndOfFile()` síncrono en `terminationHandler` | `BrewProcess.swift:99` |
| PERF-015 | BrewBar / Sync | Baja | `SyncMonitor` parsea `sync.json` dos veces por tick | `SyncMonitor.swift:23,42` |
| PERF-016 | BrewBar / Badge | Baja | `updateBadge()` reconstruye `NSImage` cada 30 s | `AppDelegate.swift:235-242` |

---

## 5. Notas metodológicas

* **No se ha ejecutado profiling en runtime** ni en el lado TS (no hay `--prof` Node ni `clinic.js` ejecutado) ni en el lado Swift (no se ha pasado `Instruments` Time Profiler ni `os_signpost` granulares). Todos los hallazgos parten de lectura de código y de medidas estáticas (tamaños de fichero, conteos de líneas, configuraciones de timeouts).
* **Tiempo a primer icono en BrewBar** y **tiempo a primer dato de outdated** se infieren de la estructura de `applicationDidFinishLaunching` y `AppState.refresh`. No se ha medido el coste real con un cronómetro o `signpostStart`/`signpostEnd`.
* **Re-render real del dashboard** ante cambios del store no se midió — Ink no expone un profiler equivalente a React DevTools. La conclusión "destructurar fuerza re-render por cualquier mutación" se basa en el contrato de Zustand documentado, no en una traza.
* **Latencia OSV** y **tiempos de `brew info`/`outdated`** dependen del estado del sistema (cache de Homebrew, conexión, número de paquetes); no se ejecutó ninguna petición real ni se midió RTT.
* **Bundle measurement** se hizo sobre el `build/` ya generado (`ls -lh`, `wc -l`, `du -sh`); no se regeneró con `npm run build` durante la auditoría.
* **No se confirmó empíricamente el bug de `BrewProcess.readDataToEndOfFile`** en futuros casos >64 KB — se cita el hallazgo del informe 07 (Alta), no se reproduce.
* **El bug de OSV `ecosystem: 'Homebrew'`** se trata como cuestión de correctness (sección 11.1 del informe 07), no de performance. Mientras siga rompiendo, el coste de performance del Security Audit en TUI es irrelevante porque devuelve vacío.
