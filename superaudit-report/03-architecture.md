# 3. Arquitectura y límites del sistema

> Auditor: architecture-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

La arquitectura de Brew-TUI sigue con coherencia el modelo de capas documentado en `CLAUDE.md` (Views → Stores → brew-api → brew-cli), y el companion BrewBar implementa protocolos de DI explícitos con aislamiento `@MainActor` correcto para la mayoría de sus componentes. Sin embargo, existe un vector de instalación arbitraria de paquetes en `compliance-remediator.ts` que pasa `packageName` extraído de un fichero de política controlado por el usuario directamente a `streamBrew` — cuyo `spawn` usa array de argumentos sin `shell: true`, por lo que no es inyección de shell clásica, sino ejecución de `brew install <nombre-arbitrario>` sin validación del trust boundary. Adicionalmente, un archivo de exploración de diseño de 991 líneas se incluye en el bundle de producción firmado y notariado de BrewBar debido a un glob excesivamente amplio en el manifest de Tuist.

---

## 3.1 Composición global

### Checklist

* [x] Existe composition root claro
* [x] La inicialización global está centralizada
* [x] No hay inicialización de servicios dispersa en vistas
* [x] La navegación tiene modelo definido
* [x] La DI es explícita y predecible

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — entry point y composición | Conforme | — | `src/app.tsx`: `<LicenseInitializer>` extraído, `<ViewRouter>` contiene switch de 16 casos. `src/index.tsx`: subcomandos CLI con `useLicenseStore.getState()` (correcto en contexto no-React). | — |
| TUI — navigation model | Conforme | — | `src/stores/navigation-store.ts`: `VIEWS` (16 ids) y `MENU_VIEWS` (15 ids, excluye `search` por ser contextual), coherentes con el router. `menuCursor` indexa sobre `MENU_VIEWS`. | — |
| TUI — DI via Zustand | Conforme | — | No se detectó inyección implícita de stores en Views. Todos los stores accedidos via `useXxxStore()` o `.getState()` en contextos no-React. | — |
| TUI — modal-store reference counter | Conforme | — | `src/stores/modal-store.ts`: `_count: number`, `openModal` incrementa, `closeModal` decrementa con floor 0. Correcto para supresores anidados. | — |
| BrewBar — composition root | Conforme | — | `menubar/BrewBar/Sources/App/AppDelegate.swift`: `AppState`, `SchedulerService`, `BadgePreferences` instanciados como propiedades privadas. Secuencia de lanzamiento en un único `Task { }` almacenado y cancelado en `applicationWillTerminate`. | — |
| BrewBar — DI via protocolos | Conforme | — | `AppState` recibe `any BrewChecking`; `SchedulerService` recibe `any Notifying`, `any BrewChecking`. Protocolos definidos en `Sources/Protocols/`. | — |

---

## 3.2 Separación por capas

### Checklist

* [x] UI no conoce detalles de persistencia
* [x] UI no conoce detalles de red
* [x] Domain no depende de UI
* [ ] Data implementa contratos del dominio — Parcial (ver hallazgos)
* [ ] Shared/Core no se convierte en cajón desastre — Parcial
* [x] No hay dependencias cíclicas

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — Views sin acceso directo a brew-cli | Conforme | — | Grep de `from.*brew-cli` en `src/views/` no arroja resultados. Todas las vistas pasan por stores o `brew-api`. | — |
| TUI — lib/ no importa stores vía hooks React | Conforme | — | Grep de `from.*stores` en `src/lib/` no arroja resultados. Los módulos lib reciben `isPro: boolean` como parámetro, conforme a `CLAUDE.md`. | — |
| TUI — `compliance-remediator.ts` llama `streamBrew` sin validar `packageName` | **No conforme** | **Crítica** | `src/lib/compliance/compliance-remediator.ts`: `streamBrew(['install', v.packageName])` y `streamBrew(['upgrade', v.packageName])`. `streamBrew` usa `spawn('brew', args, ...)` — array de argumentos sin `shell: true`, por lo que no es inyección de shell clásica. El vector es: un `PolicyFile` JSON artesanal puede especificar cualquier `packageName` (incluyendo nombres de paquetes maliciosos, taps privados o fórmulas con side-effects), y ese nombre se pasa sin validación a `brew install/upgrade`. `packageName` llega desde una ruta de fichero introducida por el usuario en `src/views/compliance.tsx` (TextInput → `importPolicy(filePath.trim())`). Sin llamada a `validatePackageName()` ni comprobación contra `PKG_PATTERN`. | 1) Llamar `validatePackageName()` de `src/lib/brew-api.ts` sobre cada `v.packageName` antes de pasarlo a `streamBrew`. 2) Restringir la ruta del PolicyFile a subdirectorios de `DATA_DIR` para impedir que ficheros externos controlen la política. |
| TUI — `async-state.ts` módulo muerto | **No conforme** | Media | `src/lib/async-state.ts` no tiene importadores en código de producción. Único consumidor: `src/lib/async-state.test.ts`. | Eliminar `async-state.ts` y `async-state.test.ts`. |
| BrewBar — `DesignExploration/BrewBarDesignVariants.swift` en producción | **No conforme** | Alta | `menubar/Project.swift:69`: `sources: ["BrewBar/Sources/**"]`. El glob incluye `BrewBar/Sources/DesignExploration/BrewBarDesignVariants.swift` (991 líneas). Este archivo entra en el binario notariado de producción. | Mover `DesignExploration/` fuera de `BrewBar/Sources/` o agregar exclusión explícita en `Project.swift`. |
| TUI — tipos Homebrew sin capa de presentación separada | Parcial | Baja | Los tipos de `src/lib/types.ts` (`FormulaInfo`, `OutdatedInfo`, `CaskInfo`) cruzan toda la pila desde el JSON de Homebrew hasta el render en vistas. No existe modelo de presentación intermedio. Aceptable para el tamaño del proyecto pero dificulta cambios de schema. | Documentar explícitamente que estos tipos son DTOs de Homebrew. Si el schema cambia, evaluar `src/lib/types-ui.ts`. |

### Matriz de dependencias

| Módulo | Depende de | Permitido? | Riesgo | Acción |
|--------|------------|------------|--------|--------|
| `src/views/*` | `src/stores/*`, `src/hooks/*`, `src/components/*`, `src/i18n`, `src/utils/*` | Sí | — | — |
| `src/views/compliance.tsx` | `src/lib/compliance/*` (vía store), `src/lib/brew-api` | Sí | Vector package-name injection propagado desde TextInput | Ver ARC-01 |
| `src/stores/*` Pro stores | `src/stores/brew-store`, `src/stores/license-store` | Parcial | Acoplamiento store↔store | Ver ARC-03 |
| `src/lib/*` | `src/lib/brew-cli`, `src/lib/parsers` | Sí | — | — |
| `src/lib/*` | `src/stores/*` (hooks React) | No — pero **no ocurre** | — | Mantener invariante |
| `BrewBar/Sources/Views/*` | `BrewBar/Sources/Models/*`, `BrewBar/Sources/Services/*` | Sí | — | — |
| `BrewBar/Sources/Services/*` | `BrewBar/Sources/Protocols/*`, Foundation, CryptoKit | Sí | — | — |
| `BrewBar/Sources/DesignExploration/*` | `BrewBar/Sources/Views/*` | En producción sin justificación | Dead code en binario firmado | Excluir del target |

---

## 3.3 Cohesión y acoplamiento

### Checklist

* [x] Cada módulo tiene responsabilidad clara
* [x] No hay god objects
* [ ] No hay ViewModels con demasiadas responsabilidades — Parcial
* [x] No hay servicios transversales con lógica de negocio escondida
* [x] Las features son componibles
* [ ] Convención `useViewInput` aplicada de forma consistente — Parcial

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — `src/views/outdated.tsx` (múltiples responsabilidades) | Parcial | Baja | Vista con selección múltiple, lógica de actualización por lotes, estado de confirmación y stream de progreso colocalizados. Más de 10 `useState` locales. No supera los 800 líneas. | Extraer lógica de selección/actualización a un custom hook `useOutdatedActions`. |
| TUI — `src/views/search.tsx` | Conforme | — | 257 líneas. Estado local justificado (query, results, cursor, confirmInstall). Sin lógica de negocio escondida. | — |
| TUI — PKG_PATTERN divergente | **No conforme** | Media | `src/lib/brew-api.ts`: `PKG_PATTERN = /^[\w@./+-]+$/`. `src/lib/profiles/profile-manager.ts`: `PKG_PATTERN = /^[a-z0-9][-a-z0-9_.@+]*$/` (más restrictivo, sin mayúsculas, sin `/`). Los perfiles pueden rechazar nombres que brew-api acepta (p.ej. casks con mayúsculas o paths con `/`). | Centralizar `PKG_PATTERN` en `src/lib/brew-api.ts` y reexportarlo desde `profile-manager.ts`. Decidir explícitamente qué patrón aplica en cada contexto. |
| TUI — `ConfirmDialog` usa `useInput` directo | **No conforme** | Baja | `src/components/common/confirm-dialog.tsx:2,23`: importa y usa `useInput` de Ink directamente, no `useViewInput`. La supresión del handler durante `menuMode` se realiza via `useModalStore` (el dialog gestiona su propia modal), lo cual es funcionalmente correcto pero viola la convención documentada en `CLAUDE.md`. Si se añaden nuevos componentes siguiendo este mismo patrón sin la guard de modal, el menú lateral podría perder el control de los arrow keys. | Documentar en un comentario de `confirm-dialog.tsx` que el uso de `useInput` directo es intencional y auto-guarded por `useModalStore`. Alternativamente, añadir soporte de `isActive` gate en `useViewInput` para cubrir este caso. |
| BrewBar — `BrewBarDesignVariants.swift` (991 LOC) | **No conforme** | Alta | Archivo de exploración visual incluido en el target de producción (ver 3.2). Engrosa el binario y su firma. | Excluir del glob de producción. |
| BrewBar — `SchedulerService.swift` | Conforme | — | Responsabilidades únicas: scheduling de checks periódicos, gestión de permisos de notificaciones. Sin mezcla con lógica de dominio. | — |

---

## 3.4 Deuda estructural

### Checklist

* [ ] Código muerto identificado — No conforme
* [x] Extensiones utilitarias justificadas
* [x] Helpers sin semántica reducidos o eliminados
* [x] Nombres alineados con el dominio
* [ ] No hay duplicación estructural relevante — Parcial

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — `async-state.ts` dead module | **No conforme** | Media | Solo importado en su propio test. Ningún archivo de producción lo referencia. | Eliminar. |
| BrewBar — clave legacy scrypt en `LicenseChecker.swift` | **No conforme** | Media | `menubar/BrewBar/Sources/Services/LicenseChecker.swift:159-163`: `legacyEncryptionKey` con hex hardcodeado. Comentario TODO dice "delete after 0.6.3". Versión actual: 1.2.0. La clave legacy permanece activa en el path de fallback de desencriptado, manteniendo una superficie con clave fija conocida. | Verificar si existen licencias 0.x en circulación. Si no, eliminar el path legacy. Si sí, establecer fecha de depreciación dura con warning al usuario. |
| TUI — duplicación de `PKG_PATTERN` | **No conforme** | Media | Dos definiciones con semántica diferente en `brew-api.ts` y `profile-manager.ts`. | Centralizar (ver 3.3). |
| BrewBar — `DesignExploration/` en Sources/ | **No conforme** | Alta | 991 líneas de código de exploración en el binario notariado. | Mover fuera del glob de producción. |
| TUI — caché de impactos sin TTL temporal | Parcial | Baja | `src/lib/brew-api.ts`: caché de `analyzeDependencyImpact` usa `Map` con LRU-lite (max 64 entradas), pero sin TTL basado en tiempo. Los datos pueden quedar stale si el proceso vive largo tiempo. | Añadir `expiresAt: Date.now() + 5 * 60 * 1000` por entrada e invalidar en `fetchInstalled`. |

---

# 4. Estado, concurrencia y flujo de datos

> Auditor: architecture-auditor | Fecha: 2026-05-21

## 4.1 Ownership del estado

### Checklist

* [x] Cada fuente de verdad está claramente definida
* [ ] No hay duplicación de estado — Parcial (cross-store coupling)
* [x] `@State` solo para estado local de vista
* [x] `@Binding` usado solo para proyección controlada
* [x] `@StateObject` en propietarios reales
* [x] `@ObservedObject` no recrea ownership accidental
* [x] `@EnvironmentObject` no introduce dependencias invisibles peligrosas
* [x] `@Observable` usado con criterio arquitectónico

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — Cross-store coupling en stores Pro | **No conforme** | Media | `src/stores/cleanup-store.ts` importa `useBrewStore` y `useLicenseStore` y llama `.getState()` dentro de `analyze()`. El mismo patrón en `history-store.ts`, `security-store.ts`, `profile-store.ts` (importan `useLicenseStore`). Aunque `.getState()` evita violaciones de hooks, crea grafo de dependencias store↔store que dificulta testing y sustitución de stores. | Pasar el estado necesario (`isPro`, `installedFormulae`) como argumentos a las funciones de los stores Pro, igual que hacen los lib/ modules. Alternativamente, centralizar la comprobación de licencia en el selector del caller (view/hook). |
| BrewBar — `AppState` como `@MainActor @Observable` | Conforme | — | `menubar/BrewBar/Sources/Models/AppState.swift`: `@MainActor @Observable final class AppState`. DI via `any BrewChecking`. Notificación correcta sin `@Published`. | — |
| BrewBar — `@State` en vistas Swift | Conforme | — | `SettingsView.swift`: `@State private var launchAtLogin`, `@State private var loginError` — estado local de la vista, no compartido. | — |
| BrewBar — `BadgePreferences` inyectada desde AppDelegate | Conforme | — | Instanciada en `AppDelegate`, pasada a vistas que la necesitan. No hay singletons globales. | — |
| TUI — fuentes de verdad Zustand | Conforme | — | `brew-store` para datos Homebrew, `navigation-store` para routing, `modal-store` para supresión de input, `license-store` para licencia, stores Pro para sus features. Sin solapamiento. | — |

### Registro de fuentes de verdad

| Feature | Fuente de verdad | Estado derivado | Riesgo detectado | Acción |
|---------|------------------|-----------------|------------------|--------|
| Datos Homebrew (formulae, casks, servicios) | `brew-store.ts` (`installed`, `outdated`, `services`) | Listas filtradas/ordenadas en vistas | — | — |
| Navegación y menú lateral | `navigation-store.ts` (`currentView`, `history`, `menuMode`, `menuCursor`) | Vista activa renderizada por `ViewRouter` | — | — |
| Supresión de input global | `modal-store.ts` (`_count`, `isOpen`) | `useViewInput` suprime handlers cuando `isOpen` | Reference counter correcto | — |
| Licencia y tier | `license-store.ts` (`license`, `status`) | `isPro()`, `isTeam()`, feature gating en `app.tsx` | Stores Pro importan `useLicenseStore` directamente | Desacoplar via parámetros |
| Smart Cleanup | `cleanup-store.ts` | Items sugeridos, estado de análisis | Acoplado a `brew-store` + `license-store` | Recibir datos como argumento |
| Historial | `history-store.ts` | Entradas filtradas | Acoplado a `license-store` | Desacoplar |
| Seguridad / OSV | `security-store.ts` | Vulnerabilidades por paquete, nivel de severidad | Acoplado a `license-store` | Desacoplar |
| Perfiles | `profile-store.ts` | Lista de perfiles, perfil activo | Acoplado a `license-store` | Desacoplar |
| AppState BrewBar | `AppState.swift` (`@MainActor @Observable`) | Badge counts, last action banner | Fire-and-forget `Task` en init (baja severidad, auto-guarded) | Almacenar handle |
| BadgePreferences BrewBar | `BadgePreferences.swift` | Badges visibles en menu bar icon | — | — |

---

## 4.2 Concurrencia

### Checklist

* [x] Aislamiento de actores definido
* [x] `@MainActor` usado solo donde corresponde
* [ ] No hay trabajo pesado en main thread — Parcial (I/O síncrono acotado)
* [ ] Tasks cancelables y con ciclo de vida claro — Parcial
* [ ] No hay fire-and-forget sin control — Parcial
* [x] Errores async propagados correctamente
* [x] Reentrancy revisada
* [x] Race conditions analizadas
* [x] Sendable revisado en tipos compartidos

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| BrewBar — `Data(contentsOf:)` síncrono en `@MainActor` (`LastActionMonitor`) | **No conforme** | Baja | `menubar/BrewBar/Sources/Services/LastActionMonitor.swift:120`: `Data(contentsOf: path)` llamado en un método `@MainActor`. El fichero `last-action.json` es pequeño y acotado, pero el I/O síncrono en el main thread está desaconsejado. | Mover la lectura a `Task { let data = try Data(contentsOf: path) }` y procesar el resultado de vuelta en `@MainActor`. |
| BrewBar — `Data(contentsOf:)` síncrono en `actor SyncMonitor` | Parcial | Baja | `menubar/BrewBar/Sources/Services/SyncMonitor.swift`: I/O síncrono dentro del actor. Reconocido internamente como `BK-013`. No bloquea main thread pero bloquea el executor del actor durante la lectura. | Usar `Task.detached { try Data(contentsOf:) }` o API async de `FileHandle`. |
| BrewBar — Fire-and-forget `Task` en `AppState.swift:116` | **No conforme** | Baja | `Task { await refresh(force: true) }` no almacena el handle. Auto-guarded con `guard force || !isLoading` — llamadas concurrentes son absorbidas. Riesgo bajo, pero la tarea no es cancelable desde exterior. | Almacenar como `private var refreshTask: Task<Void, Never>?` y cancelar en `deinit` o en `invalidate()`. |
| TUI — `streamBrew` con AsyncGenerator | Conforme | — | `src/lib/brew-cli.ts`: AsyncGenerator. `useBrewStream` almacena referencia y expone `cancel()`. Las vistas llaman `stream.cancel()` en tecla Escape. Ciclo de vida ligado al componente. | — |
| TUI — `execBrew` timeout de 30s | Conforme | — | Timeout explícito via `AbortController`. Error propagado como `Error` typed throw. | — |
| TUI — reentrancy en `doSearch` | Conforme | — | `setSearching(true)` previene llamadas paralelas visualmente. | — |
| BrewBar — `actor SyncMonitor` | Conforme | — | Actor propio, serial executor. Métodos `async`. No accedido desde main actor directamente. | — |
| BrewBar — `SWIFT_STRICT_CONCURRENCY=complete` | Conforme | — | `menubar/Project.swift`: flag habilitado a nivel de proyecto. Violaciones de aislamiento detectadas en compile time. | — |
| TUI — `void doSearch(query)` en submit | Parcial | Baja | `src/views/search.tsx:179`: `onSubmit={() => void doSearch(query)}`. Si la vista se desmonta durante la búsqueda, `setResults` actualiza estado de componente desmontado. En React 18 es generalmente inofensivo pero puede producir warnings. | Considerar ref `isMounted` o `AbortController` para abortar la llamada en desmontaje. |

---

## 4.3 Flujo de datos

### Checklist

* [x] La transformación de datos ocurre en la capa correcta
* [ ] DTO != modelo de dominio != modelo de presentación — Parcial
* [ ] El mapping es explícito — Parcial
* [ ] No hay lógica de negocio en la vista — Parcial
* [x] Estados de carga, error y éxito están tipados
* [x] Cancelaciones y reintentos modelados

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — `FormulaInfo` / `CaskInfo` usados en vistas directamente | Parcial | Baja | Los tipos de `src/lib/types.ts` cruzan toda la pila desde el JSON de Homebrew hasta el render. No hay modelo de presentación intermedio. Aceptable para este tamaño de proyecto. | Documentar explícitamente que estos tipos son DTOs de Homebrew. Si el schema cambia, evaluar `src/lib/types-ui.ts`. |
| TUI — `formulaeToListItems` / `casksToListItems` en `brew-api.ts` | Conforme | — | Converters explícitos para transformar `FormulaInfo[]` a `ListItem[]`. Transformación en la capa correcta (lib, no vista). | — |
| TUI — lógica de derivación en `search.tsx` | Parcial | Baja | `src/views/search.tsx:87-97`: construcción de `allResults` como `SearchResult[]` aplanando formulae y casks, cálculo de ventana de scroll (`start`/`visibleResults`). Suficientemente simple pero podría estar en un hook. | Opcional: extraer a `useSearchResults(results, cursor, resultRows)` para testabilidad. |
| TUI — estados de carga tipados | Conforme | — | Stores usan `loading: Record<string, boolean>` y `errors: Record<string, string | null>` por key. Pro stores tienen `isLoading: boolean` / `error: string | null`. | — |
| TUI — cancelación en `useBrewStream` | Conforme | — | `cancel()` llama `AbortController.abort()` propagado al AsyncGenerator. | — |
| BrewBar — flujo `LastAction` | Conforme | — | `src/lib/data-dir.ts` escribe `last-action.json` atómicamente (tmp + rename). `LastActionMonitor.swift` observa el directorio padre con `DispatchSourceFileSystemObject`. Schema coherente entre TS y Swift (`timestamp`, `action`, `packages`, `remainingOutdated`, `source`). | — |
| BrewBar — validación de respuestas de API Polar / OSV | Conforme | — | `src/lib/license/` valida respuestas Polar en runtime. `src/lib/security/` valida respuestas OSV. No se usa `as Type` sin validación previa. | — |

---

## 4.4 Persistencia temporal y caché

### Checklist

* [ ] Estrategia de caché documentada — Parcial
* [ ] Invalidation policy definida — Parcial
* [x] No hay stale state silencioso
* [x] La UI reacciona bien a datos expirados

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Acción |
|----------|--------|-----------|-----------|--------|
| TUI — caché de `analyzeDependencyImpact` sin TTL temporal | Parcial | Baja | `src/lib/brew-api.ts`: `Map` con LRU-lite (max 64 entradas, elimina más antigua al superar límite). Sin TTL basado en tiempo — datos pueden quedar stale si el proceso vive mucho tiempo. | Añadir `expiresAt: Date.now() + 5 * 60 * 1000` por entrada e invalidar en `fetchInstalled`. |
| TUI — caché OSV (seguridad) con 30min TTL | Conforme | — | `src/lib/security/`: TTL de 30 minutos documentado en `CLAUDE.md`. La UI muestra timestamp de última comprobación. | — |
| BrewBar — `BadgePreferences` persistidas | Conforme | — | `BadgePreferences` persiste via `UserDefaults`. Invalidación no necesaria (preferencias de usuario). | — |
| BrewBar — `SchedulerService` respeta interval configurado | Conforme | — | Rastrea `lastCheck: Date?` y respeta el `interval`. Si el interval cambia, el próximo check se recalcula. | — |
| BrewBar — estado stale en banner de `LastAction` | Conforme | — | Si el proceso TUI no completó el ciclo (error silencioso), el banner simplemente no aparece. No hay stale state visible al usuario. | — |

---

## Resumen de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| Crítica   | 1        |
| Alta      | 1        |
| Media     | 4        |
| Baja      | 9        |

**Total hallazgos no conformes:** 15

### Índice de hallazgos

| ID | Descripción | Severidad | Archivo principal |
|----|-------------|-----------|-------------------|
| ARC-01 | `compliance-remediator.ts`: `streamBrew` recibe `packageName` de PolicyFile controlado por el usuario sin pasar por `validatePackageName()` — permite instalar/actualizar paquetes arbitrarios | Crítica | `src/lib/compliance/compliance-remediator.ts` |
| ARC-02 | `DesignExploration/BrewBarDesignVariants.swift` (991 LOC) incluido en binario notariado de producción via glob `Sources/**` | Alta | `menubar/Project.swift:69` |
| ARC-03 | Cross-store coupling: `cleanup-store`, `history-store`, `security-store`, `profile-store` importan otros stores via `.getState()` | Media | `src/stores/cleanup-store.ts` et al. |
| ARC-04 | `async-state.ts` dead module — solo consumido por su propio test, sin callers en producción | Media | `src/lib/async-state.ts` |
| ARC-05 | Clave legacy scrypt hardcodeada en `LicenseChecker.swift` — TODO pendiente desde 0.6.3, versión actual 1.2.0 | Media | `menubar/BrewBar/Sources/Services/LicenseChecker.swift:159-163` |
| ARC-06 | `PKG_PATTERN` duplicado con semántica divergente en `brew-api.ts` (permissivo) y `profile-manager.ts` (restrictivo) | Media | `src/lib/brew-api.ts`, `src/lib/profiles/profile-manager.ts` |
| ARC-07 | `Data(contentsOf:)` síncrono en método `@MainActor` de `LastActionMonitor.swift` | Baja | `menubar/BrewBar/Sources/Services/LastActionMonitor.swift:120` |
| ARC-08 | Fire-and-forget `Task { await refresh(force:) }` sin handle almacenado en `AppState.swift:116` | Baja | `menubar/BrewBar/Sources/Models/AppState.swift:116` |
| ARC-09 | `void doSearch(query)` en `search.tsx:179` — actualización de estado en componente potencialmente desmontado | Baja | `src/views/search.tsx:179` |
| ARC-10 | Caché de `analyzeDependencyImpact` sin TTL temporal (LRU-lite solo por cantidad de entradas) | Baja | `src/lib/brew-api.ts` |
| ARC-11 | `ConfirmDialog` usa `useInput` directo en lugar de `useViewInput` — intencional pero no documentado, riesgo de replicación incorrecta | Baja | `src/components/common/confirm-dialog.tsx:2,23` |
| ARC-12 | `outdated.tsx`: >10 `useState` locales, múltiples responsabilidades colocalizadas | Baja | `src/views/outdated.tsx` |
| ARC-13 | `Data(contentsOf:)` síncrono dentro de `actor SyncMonitor` — bloquea executor del actor (reconocido como BK-013) | Baja | `menubar/BrewBar/Sources/Services/SyncMonitor.swift` |
| ARC-14 | `FormulaInfo`/`CaskInfo` cruzan toda la pila sin capa de presentación intermedia | Baja | `src/lib/types.ts` |
| ARC-15 | Lógica de derivación de `allResults` y ventana de scroll colocalizadas en `search.tsx` en lugar de un custom hook | Baja | `src/views/search.tsx:87-97` |
