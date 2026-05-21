# 3. Arquitectura y limites del sistema

> Auditor: architecture-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

La arquitectura de Brew-TUI es solida en sus capas principales: la separacion entre `lib/`, `stores/` y `views/` en TypeScript esta bien mantenida y la convencion de que los modulos `lib/` no importen stores se cumple sin excepcion. En Swift, el modelo de actores (`SecurityMonitor`, `SyncMonitor`) y `@MainActor` esta aplicado correctamente. Los problemas detectados son en su mayoria deuda menor —un import innecesario, un export muerto, un target de compilacion desalineado— con dos excepciones de mayor peso: la divergencia de politica de degradacion de licencia entre los dos codebases (mismo archivo en disco, logica diferente) y la ausencia de seam de DI para `SyncMonitor`, que deja una parte del `SchedulerService` sin cobertura de test.

---

## 3.1 Composicion global

### Checklist

* [x] Existe composition root claro
* [x] La inicializacion global esta centralizada
* [x] No hay inicializacion de servicios dispersa en vistas
* [x] La navegacion tiene modelo definido
* [x] La DI es explicita y predecible

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: `app.tsx` como composition root | Conforme | — | `src/app.tsx` contiene `LicenseInitializer` y `ViewRouter`; inicializacion de licencia via `useEffect` sobre la raiz del arbol | — |
| TUI: navegacion via `VIEWS` tipado | Conforme | — | `src/stores/navigation-store.ts`: `const VIEWS: ViewId[]` define el orden y el ciclo de tabs | — |
| Swift: `AppDelegate` como composition root | Conforme | — | `menubar/BrewBar/Sources/App/AppDelegate.swift`: `SchedulerService`, `AppState` e `NSStatusBar` inicializados en `AppDelegate`, no en vistas | — |
| Swift: DI via protocolos | Conforme | — | `BrewChecking` y `SecurityChecking` son protocolos inyectados en `AppState` y `SchedulerService` respectivamente via `init` | — |

---

## 3.2 Separacion por capas

### Checklist

* [x] UI no conoce detalles de persistencia
* [x] UI no conoce detalles de red
* [x] Domain no depende de UI
* [ ] Data implementa contratos del dominio (parcial — `SyncMonitor` sin protocolo)
* [x] Shared/Core no se convierte en cajon desastre
* [x] No hay dependencias ciclicas

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: `lib/` no importa stores | Conforme | — | Grep exhaustivo de `useLicenseStore\|useBrewStore\|useNavigation` en `src/lib/` retorna cero resultados; `profile-store.ts:20-26` documenta el patron con comentario explicito | — |
| TUI: `views/` no importa `brew-cli` ni `parsers` | Conforme | — | Grep de `import.*brew-cli\|import.*parsers` en `src/views/` retorna cero resultados | — |
| Swift: `Services/` sin imports de SwiftUI/AppKit (salvo excepcion) | Parcial | Baja | `menubar/BrewBar/Sources/Models/AppState.swift:2`: `import SwiftUI` presente; sin embargo, ninguna API de SwiftUI se usa en el archivo — `@Observable` pertenece al framework `Observation`, no a SwiftUI | Eliminar `import SwiftUI` de `AppState.swift`; sustituir por `import Observation` si el compilador lo requiere explicitamente |
| Swift: `SyncMonitor` sin protocolo `SyncMonitoring` | No conforme | Media | `menubar/BrewBar/Sources/Services/SyncMonitor.swift`: `actor SyncMonitor` con `static let shared`; `SecurityMonitor` tiene `SecurityChecking` protocol (`SecurityChecking.swift`) pero `SyncMonitor` carece de equivalente; `SchedulerService.swift:165-166` accede a `.shared` directamente sin seam de DI | Crear protocolo `SyncMonitoring: Sendable` e inyectarlo en `SchedulerService.init` con valor por defecto `SyncMonitor.shared`; anadir mock en `BrewBarTests` |
| Schemas de licencia duplicados entre TS y Swift | No conforme | Alta | `src/lib/license/types.ts` define `LicenseData` / `LicenseFile`; `menubar/BrewBar/Sources/Services/LicenseChecker.swift` redefine `LicenseData` y `LicenseFile` como structs Swift independientes; cualquier cambio de campo en uno de los lados no se propaga automaticamente al otro | Anadir un test de contrato en `BrewBarTests` que lea un `license.json` de fixture generado por el lado TS y verifique que el decoder Swift lo parsea correctamente; documentar el schema en un archivo compartido fuera del codigo |

---

## 3.3 Cohesion y acoplamiento

### Checklist

* [x] Cada modulo tiene responsabilidad clara
* [x] No hay god objects
* [x] No hay view models con demasiadas responsabilidades
* [x] No hay servicios transversales con logica de negocio escondida
* [x] Las features son componibles

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: responsabilidades de modulos bien delimitadas | Conforme | — | `brew-cli.ts` → primitivas de proceso; `parsers/` → transformacion; `brew-api.ts` → API tipada; `stores/` → estado reactivo; separacion respetada | — |
| Swift: `SchedulerService` acumula responsabilidades mixtas | Parcial | Baja | `menubar/BrewBar/Sources/Services/SchedulerService.swift`: gestiona timer de fondo, permisos de notificaciones del SO, envio de notificaciones UNUserNotificationCenter, orquestacion de CVE y sync. Son 260 lineas con 5 responsabilidades. No es un god object critico pero la cohesion es debil | Extraer `NotificationSender` con los tres metodos `sendNotification`/`sendCVENotification`/`sendSyncNotification`; `SchedulerService` solo decide cuándo notificar, `NotificationSender` gestiona el como |
| TUI: `security-store.ts` importa dos stores laterales | Parcial | Baja | `src/stores/security-store.ts`: llama a `useBrewStore.getState()` y `useLicenseStore.getState()` directamente — acoplamiento store-a-store. No viola la regla `lib/`; los stores si pueden importarse entre si, pero dificulta tests unitarios de la store | Recibir `isPro` y la lista de paquetes como parametros en las acciones afectadas, o extraer a una store de orquestacion |

---

## 3.4 Deuda estructural

### Checklist

* [ ] Codigo muerto identificado (hallazgo activo)
* [x] Extensiones utilitarias justificadas
* [x] Helpers sin semantica reducidos o eliminados
* [x] Nombres alineados con el dominio
* [x] No hay duplicacion estructural relevante

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `getBuiltinAccountType` export muerto | No conforme | Baja | `src/lib/license/license-manager.ts:13` (comentario): "retained as a stable export but always returns null; remove it once no caller references it". Grep confirma cero callers en produccion. | Eliminar la funcion y el comentario en el siguiente ciclo de limpieza |
| `CVE_CACHE_PATH` declarado pero nunca consumido en TS | No conforme | Media | `src/lib/data-dir.ts` exporta `CVE_CACHE_PATH = join(DATA_DIR, 'cve-cache.json')`; grep de `CVE_CACHE_PATH` en todo `src/` retorna solo la declaracion — ningun modulo TS la importa. Solo `menubar/BrewBar/Sources/Services/SecurityMonitor.swift` escribe ese archivo. El inventario 01 indicaba cache compartida; en realidad el lado TS usa cache en memoria de 30 min y no persiste a disco | Si la intencion es compartir el cache, implementar lectura/escritura en `src/lib/security/`; si no, documentar que el cache en disco es exclusivo de BrewBar y eliminar `CVE_CACHE_PATH` de `data-dir.ts` |
| tsup target `node18` vs engines `>=22` | No conforme | Baja | `tsup.config.ts:9`: `target: 'node18'`; `package.json` declara `engines: { "node": ">=22" }`. El bundle puede incluir polyfills innecesarios o no aprovechar APIs nativas de Node 22 | Alinear: `target: 'node22'` en `tsup.config.ts` |
| `DesignExploration/` en Sources | Conforme | — | `menubar/BrewBar/Sources/DesignExploration/BrewBarDesignVariants.swift:7`: `#if DEBUG` — el archivo completo esta guardado en compilacion Release | — |

### Matriz de dependencias

| Modulo | Depende de | Permitido? | Riesgo | Accion |
|--------|------------|------------|--------|--------|
| `src/views/` | `src/stores/`, `src/hooks/`, `src/components/`, `src/i18n/`, `src/utils/` | Si | Ninguno | — |
| `src/stores/` | `src/lib/`, `src/i18n/`, `src/utils/` | Si | `security-store` importa `useBrewStore` y `useLicenseStore` (store-a-store) | Considerar refactor a parametros |
| `src/lib/` | `src/utils/`, tipos externos npm | Si | Ninguno — stores ausentes confirmado | — |
| `src/hooks/` | `src/stores/`, `src/lib/` | Si | Ninguno | — |
| `Sources/Views/` | `Sources/Models/`, `Sources/Services/` (via protocolos) | Si | Ninguno | — |
| `Sources/Models/` | `Sources/Services/` (protocolos via `BrewChecking`) | Si | `AppState.swift` importa SwiftUI sin usarlo | Eliminar import |
| `Sources/Services/` | Foundation, UserNotifications, os | Si | `SchedulerService` accede a `SyncMonitor.shared` sin DI | Crear `SyncMonitoring` protocol |
| `Sources/Services/` ↔ `Sources/Models/` | `AppState` pasa a `SchedulerService.start(state:)` | Si — flujo correcto | Acoplamiento es debil (referencia `weak`) | — |

---

# 4. Estado, concurrencia y flujo de datos

> Auditor: architecture-auditor | Fecha: 2026-05-01

## 4.1 Ownership del estado

### Checklist

* [x] Cada fuente de verdad esta claramente definida
* [ ] No hay duplicacion de estado (hallazgo activo — license policy divergence)
* [x] `@State` solo para estado local de vista
* [x] `@Binding` usado solo para proyeccion controlada
* [x] `@StateObject` en propietarios reales (no aplica — proyecto usa `@Observable`)
* [x] `@ObservedObject` no recrea ownership accidental (no aplica — proyecto usa `@Observable`)
* [ ] `@EnvironmentObject` no introduce dependencias invisibles peligrosas (no aplica — no se usa)
* [x] `@Observable` usado con criterio arquitectonico

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: Zustand como unica fuente de verdad por feature | Conforme | — | Cada feature tiene exactamente un store; no hay estado duplicado entre stores para la misma entidad | — |
| TUI: `modal-store` usa contador de referencia | Conforme | — | `src/stores/modal-store.ts`: `_count` en lugar de booleano — patron correcto para supresores anidados | — |
| Swift: `AppState` como fuente de verdad de paquetes y servicios | Conforme | — | `@Observable @MainActor AppState` centraliza `outdatedPackages`, `services`, `cveAlerts`, `syncActivity`; vistas observan sin duplicar | — |
| Swift: politica de degradacion de licencia divergente entre TS y Swift | No conforme | Alta | TS (`src/lib/license/license-manager.ts`): grace period de 7 dias, luego degradacion progresiva hasta expirado en 30 dias. Swift (`menubar/BrewBar/Sources/Services/LicenseChecker.swift`): `expiredThreshold = 30` — trata la licencia como Pro plena hasta el dia 30, luego directamente expirada. Un usuario con licencia offline entre 7 y 30 dias recibe estado `degradado/limitado` en el TUI pero `Pro` en BrewBar. Misma fuente de datos (`~/.brew-tui/license.json`), politica inconsistente | Extraer la logica de degradacion a una especificacion compartida (documento de referencia + test de contrato); alinear `expiredThreshold` y los umbrales de degradacion en ambos lados; o simplificar Swift al mismo esquema de 7 dias |
| TUI: module-level singletons en stores | Parcial | Baja | `src/stores/brew-store.ts`: `let fetchAllInFlight: Promise<void> \| null = null`, `let brewUpdateInFlight`; `src/stores/license-store.ts`: `let _revalidatingPromise`, `let _revalidationInterval` — estas variables persisten entre tests en la misma ejecucion de Vitest si los modulos no se re-importan | Inicializar estas variables dentro del estado de Zustand o limpiar en `afterEach` de los tests relevantes |

---

## 4.2 Concurrencia

### Checklist

* [x] Aislamiento de actores definido
* [x] `@MainActor` usado solo donde corresponde
* [x] No hay trabajo pesado en main thread
* [ ] Task cancelables y con ciclo de vida claro (hallazgo activo)
* [ ] No hay fire-and-forget sin control (hallazgo activo)
* [x] Errores async propagados correctamente
* [x] Reentrancy revisada
* [x] Race conditions analizadas
* [x] Sendable revisado en tipos compartidos

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Swift: `SecurityMonitor` y `SyncMonitor` como `actor` | Conforme | — | Ambos actores encapsulan estado mutable (cache en disco/memoria) y toda la mutacion ocurre dentro del actor | — |
| Swift: `@MainActor` en clases de UI y presentacion | Conforme | — | `AppDelegate`, `AppState`, `SchedulerService` son `@MainActor`; `SecurityMonitor`/`SyncMonitor` son `actor` independientes — separacion correcta | — |
| Swift: trabajo pesado (red, proceso) fuera del main thread | Conforme | — | Llamadas a `URLSession.shared.data(for:)` y `BrewProcess.runString` son `async` y se ejecutan fuera del actor de main; `AppState.refresh()` usa `async let` para paralelismo | — |
| Swift: `OnceGuard`/`TimeoutBox` en `BrewProcess` | Conforme | — | `menubar/BrewBar/Sources/Services/BrewProcess.swift`: `@unchecked Sendable` con `NSLock` — patron correcto para bridging de continuation con handler de terminacion de `Process` | — |
| Swift: fire-and-forget en `SchedulerService` | No conforme | Baja | `menubar/BrewBar/Sources/Services/SchedulerService.swift:80`: `Task { await syncNotificationPermission() }` lanzado en `start()` sin almacenar handle; `:192`: `Task { @MainActor in self?.notificationsDenied = false }` en callback de `requestAuthorization` sin handle. El trabajo es acotado (no bucle infinito) pero no se puede cancelar si el servicio se detiene antes de que terminen | Almacenar handle en `private var permissionSyncTask: Task<Void, Never>?`; cancelar en `stop()` |
| TUI: `streamBrew` con limpieza garantizada | Conforme | — | `src/lib/brew-cli.ts`: `streamBrew()` mata el proceso en bloque `finally` del generador; `src/hooks/use-brew-stream.ts`: `generatorRef.current?.return(undefined)` en cleanup de `useEffect` | — |
| TUI: `_revalidationInterval` sin limpieza en salida | Parcial | Baja | `src/stores/license-store.ts`: `setInterval` con `.unref()` — el `.unref()` evita que bloquee la salida de Node, por lo que el impacto en produccion es nulo; sin embargo, en tests el intervalo puede no limpiarse si el modulo persiste entre suites | Anadir `clearInterval(_revalidationInterval)` en la funcion de limpieza del store para completitud |
| TUI: fire-and-forget en `use-brew-stream.ts` | Conforme | — | `src/hooks/use-brew-stream.ts:81,87`: `void logToHistory(...)` y `void import(...).then(...)` son fire-and-forget intencionales de logging/carga perezosa — no modifican estado critico ni causan inconsistencia | — |

---

## 4.3 Flujo de datos

### Checklist

* [x] La transformacion de datos ocurre en la capa correcta
* [x] DTO != modelo de dominio != modelo de presentacion (en la medida del proyecto)
* [x] El mapping es explicito
* [x] No hay logica de negocio en la vista
* [ ] Estados de carga, error y exito estan tipados (hallazgo activo)
* [x] Cancelaciones y reintentos modelados

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: transformacion en `parsers/` y `brew-api.ts` | Conforme | — | Parsing de texto/JSON en `src/lib/parsers/`; mapping a tipos de dominio en `src/lib/brew-api.ts`; vistas consumen tipos ya transformados del store | — |
| TUI: validacion de entrada con `PKG_PATTERN` | Conforme | — | `src/lib/brew-api.ts`: `PKG_PATTERN = /^[\w@./+-]+$/` aplicado antes de pasar nombres al CLI | — |
| TUI: estados de carga con maps ad-hoc | No conforme | Media | `src/stores/brew-store.ts`: `loading: Record<string, boolean>` y `errors: Record<string, string \| null>` — no hay un tipo discriminado (`LoadingState<T>`) que garantice que loading y error son mutuamente excluyentes. Permite estados inconsistentes (`loading: true` y `error: "..."` simultaneamente) | Introducir `type AsyncState<T> = { status: 'idle' } \| { status: 'loading' } \| { status: 'success'; data: T } \| { status: 'error'; message: string }` para los datos del brew store |
| TUI: reintentos en OSV API | Conforme | — | `src/lib/security/osv-api.ts`: `fetchWithRetry` con backoff en 5xx y 429; fallback a peticiones individuales en 400 | — |
| Swift: mapping de JSON a modelos via `Codable` | Conforme | — | `SecurityMonitor.swift` usa `JSONDecoder().decode(CVECache.self, ...)` con manejo de error explicito | — |

---

## 4.4 Persistencia temporal y cache

### Checklist

* [ ] Estrategia de cache documentada (hallazgo activo)
* [ ] Invalidation policy definida (parcial)
* [ ] No hay stale state silencioso (hallazgo activo)
* [x] La UI reacciona bien a datos expirados

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Cache de CVE no compartida entre TUI y BrewBar | No conforme | Media | El inventario (`01-inventario.md`) describe el cache CVE como compartido entre ambas apps. El analisis revela: `src/lib/data-dir.ts` exporta `CVE_CACHE_PATH` pero ningun modulo TS lo importa (grep exhaustivo). Solo `menubar/BrewBar/Sources/Services/SecurityMonitor.swift` lee y escribe `~/.brew-tui/cve-cache.json`. El lado TS mantiene cache en memoria de 30 minutos (`CACHE_TTL_MS = 30 * 60 * 1000` en `security-store.ts`) que se pierde al reiniciar. TTL divergente: BrewBar 1 hora en disco, TUI 30 minutos en memoria | Decidir el contrato de cache: (a) TUI lee el archivo escrito por BrewBar y usa `CVE_CACHE_PATH`; (b) TUI escribe su propio cache con TTL documentado; documentar la decision en `data-dir.ts` |
| BrewBar: invalidation policy con TTL de 1 hora | Conforme | — | `menubar/BrewBar/Sources/Services/SecurityMonitor.swift:11`: `cacheMaxAge = 3600`; el check de `checkForNewVulnerabilities()` retorna vacio si el cache es reciente — correcto | — |
| BrewBar: cache de CVE sin stale state visible | Conforme | — | Si el cache existe pero es reciente, la UI muestra los datos ya cargados en `AppState.cveAlerts`; el usuario no tiene indicacion de antiguedad, pero el TTL de 1h es suficientemente corto para este dominio | — |
| TUI: `security-store` sin persistencia entre sesiones | Parcial | Baja | `src/stores/security-store.ts`: cache en memoria pura — al relanzar el TUI, la pantalla de security audit siempre muestra estado inicial hasta completar la peticion OSV, incluso si BrewBar ya tiene datos frescos en disco. No hay stale state falso pero si latencia evitable | Si se unifica el cache en disco, el TUI puede pre-cargar desde `CVE_CACHE_PATH` al iniciar |

### Registro de fuentes de verdad

| Feature | Fuente de verdad | Estado derivado | Riesgo detectado | Accion |
|---------|------------------|-----------------|------------------|--------|
| Paquetes outdated (TUI) | `brew-store.ts` (`outdatedPackages`) | Contadores en Header y FooterBar | Ninguno | — |
| Paquetes outdated (BrewBar) | `AppState.outdatedPackages` (`@Observable`) | `outdatedCount`, icono de badge | Ninguno | — |
| Licencia (TUI) | `license-store.ts` → `~/.brew-tui/license.json` | `isPro()`, `isTeam()`, degradacion | Politica de gracia diverge con BrewBar | Unificar logica |
| Licencia (BrewBar) | `LicenseChecker.swift` → `~/.brew-tui/license.json` | `canUpgrade` en AppState | Umbral 30 dias vs 7 dias TS | Alinear umbral |
| CVE alerts (TUI) | `security-store.ts` (memoria, 30min TTL) | Lista en SecurityAuditView | No persiste entre sesiones | Leer cache de disco |
| CVE alerts (BrewBar) | `SecurityMonitor` actor → `~/.brew-tui/cve-cache.json` | `AppState.cveAlerts`, badge critico | Es el unico writer del archivo | Documentar exclusividad |
| Sync status | `SyncMonitor` actor → iCloud `sync.json` | `AppState.syncActivity`, `syncMachineCount` | Sin DI seam para tests | Crear `SyncMonitoring` protocol |
| Estado de servicios Homebrew | `AppState.services` | `errorServices`, icono de status bar | Ninguno | — |
| Configuracion scheduler | `UserDefaults` (interval, notificationsEnabled) | `SchedulerService` interval y toggle UI | Ninguno | — |

---

## Resumen de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| Critica | 0 |
| Alta | 2 |
| Media | 3 |
| Baja | 6 |

**Total hallazgos no conformes o parciales:** 11

### Hallazgos Alta

1. **Schemas de licencia duplicados sin test de contrato** — `src/lib/license/types.ts` vs `LicenseChecker.swift`: structs independientes que leen el mismo archivo en disco; un cambio de campo en un lado no alerta al otro.
2. **Politica de degradacion de licencia divergente** — TS aplica gracia de 7 dias; Swift expira directamente a los 30 dias. Mismo `license.json`, comportamiento diferente segun que app usa el usuario.

### Hallazgos Media

1. **`CVE_CACHE_PATH` declarado en TS pero nunca consumido** — el inventario asumia cache compartida que no existe en la implementacion actual; la funcionalidad de cache en disco de CVE es exclusiva de BrewBar.
2. **`SyncMonitor` sin protocolo `SyncMonitoring`** — inconsistencia respecto a `SecurityMonitor`; `SchedulerService` y `AppDelegate` acceden a `.shared` directamente sin seam de DI, impidiendo tests del comportamiento de sync.
3. **Estados de carga ad-hoc en `brew-store`** — `Record<string, boolean>` en lugar de tipo discriminado permite estados logicamente inconsistentes.

### Hallazgos Baja

1. **`import SwiftUI` innecesario en `AppState.swift`** — no causa error ni behavior incorrecto, pero difumina el limite Models/Views.
2. **`getBuiltinAccountType` export muerto** — siempre retorna `null`, documentado para eliminar, cero callers en produccion.
3. **`tsup target: 'node18'`** — desalineado con `engines: >=22`; puede generar polyfills innecesarios.
4. **Fire-and-forget Tasks en `SchedulerService`** — trabajo acotado pero sin handle de cancelacion.
5. **Module-level singletons en stores TS** — sin impacto en produccion (Node es single-thread) pero contaminan entre tests.
6. **`_revalidationInterval` sin `clearInterval` explicito** — `.unref()` mitiga el bloqueo en produccion; incompleto en escenarios de test.
