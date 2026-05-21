# 10. Performance

> Auditor: performance-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

El stack TUI tiene cuidados de rendimiento explicitos y bien comentados (`PERF-002` wake-loop sin polling, `PERF-007` cache de impact, shared resize listener, `useVisibleRows` adoptado por todas las vistas con listas). No se detectan re-renders catastroficos ni leaks evidentes. Los huecos son cuantitativos: tres vistas (`services.tsx`, `doctor.tsx`, `outdated.tsx`) toman el store completo en vez de seleccionar campos, `BlinkingText` causa un re-render global cada 600 ms aunque tipograficamente contenido, y BrewBar usa `Timer` clasico con cadencia minima de 1 h pero sin suspender cuando el popover esta cerrado. Sin medicion empirica de cold start (no se profilo).

---

## 10.1 Launch / cold path

### Checklist

* [x] `execBrew` con timeout (`30 000 ms`) y `HOMEBREW_NO_AUTO_UPDATE=1`
* [x] `streamBrew` con idle timeout (`5 min`) y `HOMEBREW_NO_AUTO_UPDATE=1`
* [x] `streamBrew` sin polling: `PERF-002` reemplazo el `setTimeout(100ms)` por wake/wait promesas (`src/lib/brew-cli.ts:51-69`)
* [x] `fetchAll()` en `brew-store.ts` lanza fetches en paralelo via `Promise.allSettled`
* [x] `LicenseInitializer` y `checkBundleIntegrity()` en `app.tsx` se ejecutan una sola vez al montar
* [ ] `maxBuffer` no configurado — **Baja**: `execBrew` acumula `stdout` sin techo en una variable string; `brew info --json=v2 --installed` puede generar varios MB sin liberar
* [ ] Sin medicion empirica de cold start — **No medido**: el reporte no profila tiempos reales (TTI desde `brew-tui` hasta primer frame); la auditoria solo cubre la estructura

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `execBrew` sin techo de stdout | Parcial | Baja | `src/lib/brew-cli.ts:20` — `stdout += d.toString()` sin limite | Anadir guard de tamaño (p.ej. abortar si supera 32 MB) o cambiar a stream para `brew info --json` grandes |
| Cold start no profiled | No medido | Info | — | Capturar `time node bin/brew-tui.js status` (subcommand barato) como baseline reproducible |

---

## 10.2 Re-renders y selectors

### Checklist

* [x] Zustand selectors granulares en 12/15 vistas (`useBrewStore((s) => s.foo)`)
* [x] `GradientText` envuelto en `React.memo` con `useMemo` y short-circuit NO_COLOR
* [x] `useDebounce` aplicado en `installed.tsx:56`, `outdated.tsx:124` (cursor), `history.tsx:49`
* [ ] Tres vistas toman el store entero — **Media**: `services.tsx:34`, `doctor.tsx:15`, `outdated.tsx:65` desestructuran `useBrewStore()` sin selector; cualquier cambio en cualquier campo del store re-renderiza estas vistas (incluso fetch de paquetes no relacionados)
* [ ] `BlinkingText` re-renderiza cada 600 ms — **Baja**: `src/components/common/blinking-text.tsx:23` dispara `setBright` en intervalo fijo; el alcance del re-render esta contenido al `<Text>` interno (no propaga al padre porque el `setState` es local), pero el `<Header>` lo monta tres veces (`header.tsx:143,148,167`) → tres intervals activos en paralelo siempre que el header este visible
* [ ] `services.tsx:87` lee `useBrewStore.getState().errors['service-action']` dentro del render — **Baja**: `getState()` fuera de selector no se suscribe a cambios; cuando el error cambia, el componente puede no re-renderizarse hasta el proximo trigger

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Store entero en 3 vistas | No conforme | Media | `src/views/services.tsx:34`, `src/views/doctor.tsx:15`, `src/views/outdated.tsx:65` — `useBrewStore()` sin selector | Migrar a selectors granulares como ya hace `dashboard.tsx:88-96` |
| 3 timers de blink en header | Parcial | Baja | `src/components/layout/header.tsx:143,148,167` — tres `<BlinkingText>` instanciados, cada uno con su propio `setInterval(600)` | Centralizar en un unico hook `useBlinkPhase()` que comparta un solo timer global y devuelva `bright` |
| `getState()` en render | Parcial | Baja | `src/views/services.tsx:87` | Sustituir por selector `useBrewStore((s) => s.errors['service-action'])` |

---

## 10.3 Listas y virtualizacion

### Checklist

* [x] `useVisibleRows` adoptado por las 12 vistas con listas: dashboard, installed, outdated, search, history, services, rollback, brewfile, sync, compliance, doctor, profiles
* [x] `installed.tsx:255`, `outdated.tsx:263`, `search.tsx:220` paginan via `visible.map` calculado por `useVisibleRows`
* [x] Yoga reflows minimizados: `useContainerSize` ya devuelve `prev` si no cambian las dimensiones (`use-container-size.ts:35-40`)
* [x] No se renderizan N=todas filas: Ink no soporta virtualization nativa, pero el slice precomputado equivale
* [x] `outdated.tsx:124` debounce del cursor a 150 ms — evita recalcular `getUpgradeImpact` en cada flecha
* [x] Listas con keys semanticas (no `index`) — confirmado por frontend-auditor

### Hallazgos

Sin hallazgos. Las listas estan tratadas correctamente.

---

## 10.4 Cache y memoizacion

### Checklist

* [x] `impactCache` (`brew-api.ts:201`) con LRU de 64 entradas; key `type::name::from::to` invalida automaticamente al refetch outdated
* [x] OSV con cache de 30 min (`security-audit-store.ts`)
* [x] `_resetImpactCacheForTests()` expone seam de invalidacion para tests
* [ ] `impactCache` sin TTL temporal — **Baja**: ARC-10 ya detectado; el LRU evita crecimiento pero un valor cacheado puede quedar stale si el usuario actualiza brew CLI fuera de la app o cambia version pinada via `brew pin`
* [ ] `getCaskInfo` sin cache visible — **No verificado**: revisar si se llama repetidamente desde varias vistas con el mismo nombre

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `impactCache` sin TTL | Parcial | Baja | `src/lib/brew-api.ts:197-227` (ARC-10) | Anadir `cachedAt` por entrada y descartar si > 5 min |

---

## 10.5 Layout y resize

### Checklist

* [x] `useTerminalSize` con `useSyncExternalStore` y WeakMap por stdout: **un solo listener `resize` por stdout** (fix de `MaxListenersExceededWarning` documentado en commit `3e15a94`)
* [x] `useContainerSize` re-mide solo en cambio de dimensiones del terminal, no en cada render
* [x] No debounce de resize: documentado como decision (resizes son user-driven e infrecuentes; debounce introduciria lag perceptible)
* [x] FALLBACK 80×24 para terminales sin TTY (tests, pipes)

Sin hallazgos.

---

## 10.6 JSON parsing y IO

### Checklist

* [x] `json-parser.ts:5` y `brew-api.ts:74` usan `JSON.parse` directo — sin streaming JSON
* [x] Output de `brew info --json=v2 --installed` se acumula completo antes de parsear (acoplado al techo ausente en 10.1)
* [x] Parsers sin recursion peligrosa: estructura conocida, sin user-controlled depth

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Parsing no streaming | Parcial | Baja | `src/lib/parsers/json-parser.ts:5` | Para repos enormes (cientos de paquetes), considerar `stream-json`. Bajo impacto practico hoy; pin de mejora futura |

---

## 10.7 BrewBar scheduling

### Checklist

* [x] `SchedulerService` con cuatro intervalos: 15 min / 1 h / 6 h / 24 h (`SchedulerService.swift:10-22`)
* [x] Intervalo persistido en `UserDefaults` (`checkInterval`)
* [x] `Timer.scheduledTimer(withTimeInterval:repeats:)` clasico en main run loop
* [x] `permissionSyncTask` con handle para cancelar fire-and-forget (`ARQ-010`)
* [ ] Sin suspension cuando el popover esta cerrado — **Baja**: el timer corre siempre; en intervalo 15 min con app ociosa toda la noche dispara 96 checks brew. Aceptable pero un `NSWorkspace.willSleepNotification`-aware pause reduce CPU/wake-ups
* [ ] `Timer` clasico en lugar de `Task.sleep` + cancellation con `async` — **Baja**: `Timer` requiere main run loop y bloquea hot reload de SwiftUI Previews; un `AsyncTimerSequence` seria mas testeable
* [ ] Cadencia minima 15 min — **Conforme**: ya documentada por el equipo como minimo seguro para no agresividad con `brew outdated`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin pausa con sistema dormido | Parcial | Baja | `SchedulerService.swift:142` | Suscribirse a `NSWorkspace.willSleepNotification` / `didWakeNotification` y suspender/reanudar timer |

---

## 10.8 BrewBar monitores filesystem

### Checklist

* [x] `LastActionMonitor` usa `DispatchSourceFileSystemObject` sobre el **directorio padre** (correcto — el rename invalida el fd a fichero)
* [x] `SyncMonitor` actor-aislado para serializar lecturas
* [ ] Sin debounce explicito en `LastActionMonitor` ni `SyncMonitor` — **Baja**: un rename storm (ej. cli escribiendo varias acciones rapidas) dispara `eventHandler` por cada evento; no se coalesca. El coste real es bajo (un read JSON pequeño)
* [ ] `Data(contentsOf:)` sincrono en MainActor (`LastActionMonitor.swift:120`) — ya marcado por architecture-auditor (ARC-07)
* [ ] `Data(contentsOf:)` sincrono dentro de `actor SyncMonitor` (BK-013) — bloquea el executor del actor

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin debounce en monitores | Parcial | Baja | `menubar/BrewBar/Sources/Services/LastActionMonitor.swift:83+`, `SyncMonitor.swift` | Coalescer eventos en ventana 100-250 ms via `DispatchSource.setEventHandler` con throttle manual |

---

## 10.9 Memoria y leaks

### Checklist

* [x] `useBrewStream` con `mountedRef` / `cancelRef` / `generatorRef.return()` para teardown seguro (verificado por frontend-auditor)
* [x] `brew-cli.ts` finaliza con `proc.kill()` si el iterador se aborta (`brew-cli.ts:107`)
* [x] `clearInterval` en `BlinkingText` cleanup (`blinking-text.tsx:24`)
* [x] `WeakMap` en `useTerminalSize` libera entries cuando el stdout es GC'd
* [ ] Zombie brew processes — **Baja**: si la TUI muere con `SIGKILL` el proceso `brew` hijo sigue corriendo. Inevitable sin process group + signal forwarding

### Hallazgos

Sin hallazgos accionables. Comportamiento ya saneado.

---

## 10.10 Red

### Checklist

* [x] `fetchWithRetry` con backoff exponencial 500 ms → 4 s y 3 intentos (`fetch-timeout.ts`)
* [x] OSV `queryOneByOne` con 75 ms entre lotes + retry tras 429
* [x] Polar con timeout configurado y validacion runtime de respuestas
* [ ] 429 no incluido en `retryOn` por defecto — ya detectado por backend-auditor (Media)
* [ ] `promo.ts` sin retry — ya detectado por backend-auditor (Media)

Sin hallazgos nuevos en este eje (cubierto en `07-backend-persistence.md`).

---

## Resumen de severidad

| Severidad | Cantidad |
|-----------|----------|
| Critica | 0 |
| Alta | 0 |
| Media | 1 |
| Baja | 6 |
| Informativo | 1 |

**Total no conformes: 7**

---

## Prioridades de mejora

1. **PERF-MED-01** Selectors granulares en `services.tsx`, `doctor.tsx`, `outdated.tsx` — eliminacion del re-render-all-on-any-change.
2. **PERF-LOW-01** Unificar tres `<BlinkingText>` del header en un solo `useBlinkPhase()`.
3. **PERF-LOW-02** Suspender `SchedulerService` timer en sleep del sistema.
4. **PERF-LOW-03** TTL temporal en `impactCache` (ARC-10).
5. **PERF-LOW-04** Techo de `maxBuffer`/abort en `execBrew`.
6. **PERF-LOW-05** Debounce/coalesce en `LastActionMonitor`/`SyncMonitor`.
7. **PERF-INFO** Capturar baseline empirico de cold start.
