# 5. Auditoria UI estructural

> Auditor: frontend-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

La arquitectura de componentes de Brew-TUI es solida para un TUI en React/Ink: jerarquia clara, separacion layout/comportamiento bien ejecutada, tokens de color y spacing sin excepciones, patron uncontrolled de `TextInput` respetado en todo el codigo. Se detectan dos hallazgos de severidad Alta con impacto funcional real — el bloque de estados del componente `account.tsx` que silencia el tier `team` y la ruptura del canal IPC con BrewBar en instalaciones desde `search.tsx` — mas tres hallazgos de severidad Media/Baja que afectan mantenibilidad y consistencia sin impacto inmediato en el usuario.

---

## 5.1 Jerarquia de vistas

### Checklist

* [x] Root views identificadas
* [x] Contenedores claros
* [x] Navegacion consistente
* [x] Separacion entre layout y comportamiento
* [x] Subvistas extraidas por intencion de dominio
* [ ] No hay vistas gigantes dificiles de mantener — **Media**: `compliance.tsx` (348 LOC) y `sync.tsx` (347 LOC) superan el umbral de 300 LOC con maquinas de estado internas

### Root views identificadas

El punto de entrada es `src/app.tsx`. Estructura confirmada:

- `<App>` → `<LicenseInitializer>` + `<AppLayout>` → `<Header>` + `<ViewRouter>` + `<Footer>`
- `<WelcomeView>` renderizado fuera del router en primer lanzamiento (flag en `~/.brew-tui/onboarding`)
- `<ViewRouter>` enruta 16 vistas via `switch(currentView)` con gate Pro/Team via `isProView()`/`isTeamView()`
- `<LicenseInitializer>` extraido como componente propio, no inline effect en `App` — conforme

### Contenedores

`<AppLayout>` usa `useTerminalSize().rows` para altura viewport y `useContainerSize` para el area de contenido interno, pasando dimensiones via `<ContentSizeProvider>`. Las vistas reciben el presupuesto de filas a traves de `useVisibleRows`. Patron correcto para TUI.

`<ProfilesView>` descompuesta en subcomponentes en `src/views/profiles/` (list, detail, create, edit). Conforme.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `src/views/compliance.tsx` | No conforme | Media | 348 LOC; mezcla maquina de estado (`phase` enum) con layout JSX sin descomposicion por fase | Extraer `ComplianceScanPhase`, `ComplianceResultPhase`, `ComplianceFixPhase` como subcomponentes; el componente raiz coordina fases |
| `src/views/sync.tsx` | No conforme | Media | 347 LOC; patron identico a `compliance.tsx` — fase `idle/syncing/result/conflict` embebida en el body principal | Extraer subcomponentes por fase; `SyncView` queda como coordinador de ~80 LOC |
| `ProBadge` component | No conforme | Baja | `src/components/common/pro-badge.tsx` existe pero no tiene ninguna importacion en el resto del codigo; `header.tsx` inlinea el badge manualmente | Eliminar `pro-badge.tsx` o adoptarlo en `header.tsx` eliminando el inline — evitar dead code |

---

## 5.2 Navegacion

### Checklist

* [x] NavigationStack / Tabs / Sheets coherentes
* [x] Rutas reproducibles
* [x] Deep links contemplados — No aplica (TUI CLI, no hay URLs ni deep links)
* [x] Estados de navegacion restaurables si aplica — No aplica (TUI stateless entre sesiones)
* [x] No hay doble presentacion de sheets/alerts
* [x] Back navigation coherente

### Arquitectura de navegacion

El patron es: `navigationStore` con `currentView: ViewId`, `viewHistory: ViewId[]` (max 20), `menuMode: boolean`, `menuCursor: number`. No hay NavigationStack ni Sheets de SwiftUI — el equivalente TUI es el estado del store.

- `VIEWS` (16 entradas, canonica) y `MENU_VIEWS` (15 entradas, excluye `search`) — separacion correcta
- `goBack()`: si `menuMode` → `exitMenuMode()`; si no, pop de `viewHistory` — conforme
- `menuMode: true` en init — el menu lateral es propietario de las flechas desde el primer frame
- `useViewInput` wrapper activo en las 16 vistas — suprime handlers mientras `menuMode === true`

### Modal store

`modal-store.ts` usa contador de referencias (`_count`), no booleano, para manejar supresores anidados correctamente. Confirmado que `ConfirmDialog` y `SearchView` pueden coexistir sin conflicto (SearchView abre modal al mostrar resultados; ConfirmDialog abre su propio contador encima).

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Navegacion global | Conforme | — | `src/stores/navigation-store.ts` — patron reproducible via `ViewId` tipado, sin strings ad-hoc | — |
| `useViewInput` adopcion | Conforme | — | Grep confirma 0 usos de `useInput` en vistas (solo `confirm-dialog.tsx` y `use-keyboard.ts`, ambos intencionales) | — |
| Back navigation | Conforme | — | `goBack()` en `use-keyboard.ts` maneja menuMode y history stack correctamente | — |

---

## 5.3 Estados visuales por pantalla

### Pantallas auditadas

#### DashboardView

* **Ruta:** `src/views/dashboard.tsx` (247 LOC)
* [x] Estado inicial — muestra skeleton via `loading` del brew store
* [x] Cargando — `<Loading>` con mensaje contextual; `fetchAll()` en mount
* [x] Vacio — `ProStatusPanel` muestra `—` cuando datos no cargados; `outdatedItems.length === 0` renderiza mensaje vacio
* [x] Error recuperable — `partialErrors` array con errores no fatales; `<ErrorMessage>` inline
* [x] Error fatal — No aplica (dashboard es de solo lectura)
* [x] Sin conexion — No aplica (brew trabaja offline por defecto)
* [x] Datos parciales — `partialErrors` cubre fallos de fetch individual sin bloquear render
* [ ] Permiso denegado — No aplica (no requiere permisos del OS)
* [ ] Modo edicion — No aplica (read-only)
* [ ] Confirmacion — No aplica
* [ ] Destructivo — No aplica
* [x] Accesibilidad validada — TUI; wrap/truncate correctos
* [x] Dark mode validado — Todos los colores via `COLORS` tokens; `NO_COLOR` soportado
* [x] Dynamic Type validado — No aplica en TUI terminal

#### OutdatedView

* **Ruta:** `src/views/outdated.tsx` (313 LOC)
* [x] Estado inicial — `fetchOutdated()` en mount; muestra lista inmediatamente si datos en store
* [x] Cargando — `<Loading>` con `t('loading_checking')`
* [x] Vacio — mensaje `t('outdated_allUpToDate')` cuando lista vacia
* [x] Error recuperable — `<ErrorMessage message={error}>` con posibilidad de retry via refetch manual
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — cursor bound-checked con `Math.min(cursor, packages.length-1)`
* [ ] Permiso denegado — No aplica
* [x] Modo edicion — No aplica (upgrades son acciones, no edicion)
* [x] Confirmacion — `ConfirmDialog` antes de upgrade individual y upgrade-all
* [x] Destructivo — `upgrade-all` tiene warning adicional en el mensaje de confirmacion
* [x] Accesibilidad validada — wrap truncate en nombre de paquetes
* [x] Dark mode validado — Usa `COLORS` tokens
* [x] Dynamic Type validado — No aplica

#### InstalledView

* **Ruta:** `src/views/installed.tsx`
* [x] Estado inicial — datos del brew store, carga en mount si no hay datos
* [x] Cargando — `<Loading>` mientras `loadingInstalled`
* [x] Vacio — estado vacio cuando no hay paquetes instalados
* [x] Error recuperable — `<ErrorMessage>` si fetch falla
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — filtrado y paginacion correctos
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — `ConfirmDialog` antes de uninstall
* [x] Destructivo — uninstall requiere confirmacion explicita
* [x] Accesibilidad validada — truncado correcto
* [x] Dark mode validado — tokens correctos
* [x] Dynamic Type validado — No aplica

#### SearchView

* **Ruta:** `src/views/search.tsx` (256 LOC)
* [x] Estado inicial — input vacio; placeholder con instrucciones
* [x] Cargando — `<Loading message={t('loading_searching')}>` durante busqueda
* [x] Vacio — `t('search_noResults')` cuando `allResults.length === 0`
* [x] Error recuperable — `searchError` mostrado con color `COLORS.error`; nueva busqueda posible
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica (brew search trabaja con cache local)
* [x] Datos parciales — scroll con indicadores de mas resultados arriba/abajo
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — `ConfirmDialog` antes de instalar desde la vista de busqueda
* [x] Destructivo — No aplica (install no es destructivo)
* [x] Accesibilidad validada — truncado correcto
* [x] Dark mode validado — tokens correctos
* [x] Dynamic Type validado — No aplica

#### ServicesView

* **Ruta:** `src/views/services.tsx`
* [x] Estado inicial — fetch en mount
* [x] Cargando — `<Loading>` visible
* [x] Vacio — mensaje cuando no hay servicios instalados
* [x] Error recuperable — `<ErrorMessage>` con error de fetch
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — lista filtrable por estado (running/stopped/all)
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — acciones start/stop/restart con confirmacion
* [x] Destructivo — No aplica
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### HistoryView

* **Ruta:** `src/views/history.tsx` (232 LOC)
* [x] Estado inicial — `fetchHistory()` en mount
* [x] Cargando — `<Loading message={t('loading_history')}>` via early return
* [x] Vacio — `t('history_noEntries')` o `t('history_noEntriesFor', { filter })` segun filtro activo
* [x] Error recuperable — `<ErrorMessage message={error}>` via early return; sin boton de retry explicito (Baja)
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — filtro por tipo de accion + busqueda debounced (200ms)
* [ ] Permiso denegado — No aplica
* [x] Modo edicion — No aplica (replay es accion, no edicion)
* [x] Confirmacion — `ConfirmDialog` para replay y para clear
* [x] Destructivo — `clearHistory` tiene confirmacion con cuenta de entradas
* [x] Accesibilidad validada — truncate correcto; `wrap="truncate-middle"` en nombres de paquetes
* [x] Dark mode validado — tokens correctos
* [x] Dynamic Type validado — No aplica

#### AccountView

* **Ruta:** `src/views/account.tsx`
* [x] Estado inicial — lee `licenseStore` (cargado en `<LicenseInitializer>`)
* [x] Cargando — estado loading durante revalidacion
* [x] Vacio — No aplica
* [x] Error recuperable — errores de activacion/revalidacion mostrados
* [x] Error fatal — `status === 'expired'` renderizado con color error
* [x] Sin conexion — modo offline con grace period comunicado al usuario
* [x] Datos parciales — No aplica
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — deactivate requiere confirmacion
* [x] Destructivo — deactivate es accion destructiva confirmada
* [ ] Accesibilidad validada — **No conforme**: bloque de estados en lineas 87-89 no cubre `status === 'team'`; usuarios team ven label vacio
* [x] Dark mode validado — tokens correctos
* [x] Dynamic Type validado — No aplica

#### SecurityAuditView

* **Ruta:** `src/views/security-audit.tsx`
* [x] Estado inicial — muestra resumen de cache si disponible
* [x] Cargando — `<Loading>` durante scan (OSV.dev API)
* [x] Vacio — mensaje cuando no hay vulnerabilidades encontradas
* [x] Error recuperable — error de red con posibilidad de reintento
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica (OSV.dev requiere red; error gestionado)
* [x] Datos parciales — resultados de CVE con detalle expandible
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [ ] Confirmacion — No aplica
* [ ] Destructivo — No aplica
* [x] Accesibilidad validada — truncado correcto
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### ProfilesView

* **Ruta:** `src/views/profiles.tsx` (225 LOC) + `src/views/profiles/`
* [x] Estado inicial — lista de perfiles cargada del store
* [x] Cargando — `<Loading>` durante importacion
* [x] Vacio — mensaje cuando no hay perfiles guardados
* [x] Error recuperable — errores de import/export con mensaje
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — No aplica
* [ ] Permiso denegado — No aplica
* [x] Modo edicion — modos `list/detail/create/edit/importing` con `useViewInput` condicionados por modo
* [x] Confirmacion — delete de perfil con `ConfirmDialog`
* [x] Destructivo — delete de perfil confirmado
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### SmartCleanupView

* **Ruta:** `src/views/smart-cleanup.tsx`
* [x] Estado inicial — analisis en mount
* [x] Cargando — `<Loading>` durante analisis
* [x] Vacio — mensaje cuando no hay candidatos de limpieza
* [x] Error recuperable — `<ErrorMessage>` si analisis falla
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — categorias de limpieza con tamanio estimado
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — `ConfirmDialog` antes de ejecutar limpieza
* [x] Destructivo — limpieza es destructiva; advertencia de impacto incluida
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### WelcomeView

* **Ruta:** `src/views/welcome.tsx`
* [x] Estado inicial — renderizado en primer lanzamiento via flag `onboarding.ts`
* [ ] Cargando — No aplica (contenido estatico)
* [ ] Vacio — No aplica
* [ ] Error recuperable — No aplica
* [ ] Error fatal — No aplica
* [ ] Sin conexion — No aplica
* [ ] Datos parciales — No aplica
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [ ] Confirmacion — No aplica
* [ ] Destructivo — No aplica
* [x] Accesibilidad validada — No aplica (pantalla de bienvenida estatica)
* [x] Dark mode validado — tokens correctos
* [x] Dynamic Type validado — No aplica

#### ComplianceView

* **Ruta:** `src/views/compliance.tsx` (348 LOC)
* [x] Estado inicial — carga politica en mount
* [x] Cargando — `<Loading>` durante scan
* [x] Vacio — mensaje cuando no hay violaciones
* [x] Error recuperable — errores de scan con retry
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — violaciones por categoria
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [ ] Confirmacion — aplicar fixes con confirmacion
* [x] Destructivo — fixes son acciones brew (uninstall/install)
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### SyncView

* **Ruta:** `src/views/sync.tsx` (347 LOC)
* [x] Estado inicial — estado de sincronizacion del store
* [x] Cargando — `<Loading>` durante sync
* [x] Vacio — estado idle con instrucciones
* [x] Error recuperable — errores de red/iCloud con retry
* [x] Error fatal — No aplica
* [x] Sin conexion — gestionado (iCloud sync requiere red)
* [x] Datos parciales — conflictos de sync con resolucion manual
* [ ] Permiso denegado — No aplica (iCloud permisos gestionados por el OS, no por la app)
* [ ] Modo edicion — No aplica
* [x] Confirmacion — aplicar sync remoto con confirmacion
* [x] Destructivo — sobreescribir datos locales confirmado
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### BrewfileView

* **Ruta:** `src/views/brewfile.tsx`
* [x] Estado inicial — carga Brewfile si existe
* [x] Cargando — `<Loading>` durante operaciones
* [x] Vacio — instrucciones cuando no hay Brewfile
* [x] Error recuperable — errores de lectura/escritura de archivo
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — drift entre Brewfile y estado actual
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — aplicar Brewfile con confirmacion
* [x] Destructivo — apply puede instalar/desinstalar paquetes; confirmado
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### RollbackView

* **Ruta:** `src/views/rollback.tsx`
* [x] Estado inicial — lista de snapshots disponibles
* [x] Cargando — `<Loading>` durante carga de snapshots
* [x] Vacio — mensaje cuando no hay snapshots
* [x] Error recuperable — errores de snapshot con mensaje
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — informacion de snapshot con paquetes afectados
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [x] Confirmacion — rollback con `ConfirmDialog` y advertencia de impacto
* [x] Destructivo — rollback es operacion destructiva; confirmacion requerida
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

#### ImpactView

* **Ruta:** `src/views/impact.tsx`
* [x] Estado inicial — analisis bajo demanda
* [x] Cargando — `<Loading>` durante analisis de dependencias
* [x] Vacio — No aplica (vista modal/contextual)
* [x] Error recuperable — errores de analisis con mensaje
* [x] Error fatal — No aplica
* [x] Sin conexion — No aplica
* [x] Datos parciales — dependencias con detalle de impacto
* [ ] Permiso denegado — No aplica
* [ ] Modo edicion — No aplica
* [ ] Confirmacion — No aplica (read-only)
* [ ] Destructivo — No aplica
* [x] Accesibilidad validada — conforme
* [x] Dark mode validado — conforme
* [x] Dynamic Type validado — No aplica

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `account.tsx` — label tier `team` | No conforme | Alta | `src/views/account.tsx:87-89` — bloque `if/else` cubre `pro`/`free`/`expired` pero no `team`; usuarios team ven label vacio | Anadir rama `else if (status === 'team')` renderizando label `[Team]` con color correspondiente |
| `account.tsx` — deactivate para tier `team` | No conforme | Alta | `src/views/account.tsx:36` — condicion `input === '2' && status === 'pro'` excluye tier team; footer muestra `2:deactivate` para ambos tiers | Cambiar condicion a `(status === 'pro' \|\| status === 'team')` |
| `history.tsx` — retry explicito | No conforme | Baja | `src/views/history.tsx:114-115` — early return con `<ErrorMessage>` pero sin boton/hint de retry | Anadir hint de teclado para reintentar fetch (`r` o `1`) en el estado de error |

---

## 5.4 Layout y adaptabilidad

### Nota de contexto

Brew-TUI es un TUI (terminal UI) ejecutado en macOS sobre terminal emuladores. Los conceptos de "iPhone/iPad/Mac idiom" no aplican. Los equivalentes TUI son: terminales estreching (resizes), `rows < N` (terminales pequenas), `columns < N` (terminales angostas), modo multitarea no aplica.

### Checklist

* [x] Terminal estrecho (< 50 cols) — `getLayoutMode()` en `spacing.ts`; header colapsa con `columns < 45`
* [x] Terminal estandar (80 cols) — layout principal disenado para 80 cols
* [x] Terminal ancho (> 120 cols) — `getLayoutMode()` retorna `'wide'`; dos columnas en header menu
* [x] Terminal con pocas filas (< 22) — header colapsa a una linea; `BlinkingText` adaptado
* [x] Terminal con muchas filas — `useVisibleRows` calcula presupuesto correcto
* [ ] Safe areas correctas — No aplica en TUI
* [x] Keyboard avoidance correcto — No aplica en TUI terminal
* [x] Scroll correcto con contenido grande — `useVisibleRows` + indicadores arriba/abajo en todas las listas
* [x] Rotacion correcta — No aplica (terminal no tiene orientacion)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `stat-card.tsx` — medicion viewport vs container | No conforme | Media | `src/components/common/stat-card.tsx` usa `useTerminalSize().columns` para calcular `minW`; deberia usar `useContainerSize` o `useContentSize` para medir el contenedor real, no el viewport entero | Refactorizar para recibir `containerWidth` como prop o usar `useContentSize()` del `ContentSizeContext` |
| `upgrade-prompt.tsx` — `width="80%"` hardcodeado | No conforme | Baja | `src/components/common/upgrade-prompt.tsx:46` — `width="80%"` no es un token del sistema; Ink acepta porcentajes pero la convencion del proyecto es usar `SPACING` o ancho calculado | Cambiar a `flexGrow={1}` con `maxWidth` o eliminar el width constraint si no es necesario |
| Scroll indicators | Conforme | — | Todas las vistas con listas usan patron `scroll_moreAbove`/`scroll_moreBelow` con contador de items ocultos | — |
| `useVisibleRows` adoption | Conforme | — | Todas las vistas con listas usan `useVisibleRows` con `reservedRows` y `fallbackReservedRows` correctamente calibrados | — |

---

# 9. Motion y percepcion de velocidad

> Auditor: frontend-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

En un TUI con Ink, "motion" es fundamentalmente diferente a una app grafica: no hay animaciones CSS, transiciones de view, ni GPU. El unico mecanismo de animacion es re-render React controlado por `setInterval` (para el spinner y el `BlinkingText`). Ambas implementaciones son correctas — cleanup con `clearInterval`, frecuencia razonable, sin jank observable. La percepcion de velocidad esta bien gestionada: `useBrewStream` proporciona feedback linea a linea durante operaciones largas, `useVisibleRows` evita renders costosos de listas, y los loaders tienen mensajes contextuales. No se detecta uso de haptics (plataforma CLI, no aplica).

---

## 9.1 Transiciones

### Checklist

* [x] Las transiciones comunican cambio de estado — los re-renders de estado (loading/error/empty/data) son inmediatos y semanticamente correctos
* [x] No hay animacion gratuita — `BlinkingText` usado solo en el menu indicator `M`; no hay blink decorativo en contenido
* [x] Las duraciones son consistentes — `BlinkingText` a 600ms en todas las instancias
* [x] Las curvas son coherentes — No aplica (TUI no tiene curvas de animacion)
* [x] No hay jank perceptible — `setInterval` a 600ms con simple toggle booleano; costo minimo
* [ ] Reduced Motion respetado — No aplica (TUI CLI, sin accessibility reduce motion del OS)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `BlinkingText` — cleanup | Conforme | — | `src/components/common/blinking-text.tsx` — `clearInterval` en funcion de cleanup del `useEffect`; no hay memory leak | — |
| `BlinkingText` — instancias simultaneas | Conforme | — | `src/components/layout/header.tsx` — analisis de ramas condicionales confirma que como maximo una instancia de `BlinkingText` esta montada en cualquier momento (ramas `collapseMenu`, `isNarrow`, `hideLogoByHeight`, `else` son mutuamente exclusivas) | — |
| `Spinner` de `@inkjs/ui` | Conforme | — | Usado en operaciones de carga; gestiona su propio `setInterval` internamente via la libreria | — |

---

## 9.2 Percepcion de rendimiento

### Checklist

* [x] Skeletons correctos — `<Loading>` con mensajes contextuales por operacion; sin skeleton visual de layout (correcto para TUI)
* [x] Loaders adecuados al contexto — `<Loading>` para fetch inicial de lista, `<ProgressLog>` para operaciones streaming de brew
* [x] Optimistic UI justificada — No se usa UI optimista; todas las operaciones esperan confirmacion del proceso brew
* [x] Prefetch donde aporta valor — `fetchAll()` en dashboard mount hace fetch paralelo de todos los datos; conforme
* [x] Placeholders evitan vacio abrupto — `showWelcome === null` en `app.tsx` render blank mientras se lee el flag de onboarding; evita flash de `WelcomeView` para usuarios recurrentes
* [x] Haptics coherentes y no invasivos — No aplica (TUI CLI)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `ProgressLog` — feedback streaming | Conforme | — | `src/components/common/progress-log.tsx` — muestra las ultimas N lineas del stream con `isRunning` indicator; claves absolutas para identidad estable de `ForEach` | — |
| `useBrewStream` — ring buffer | Conforme | — | `src/hooks/use-brew-stream.ts` — `MAX_LINES = 100`; previene acumulacion ilimitada de output en operaciones largas | — |
| Feedback durante operaciones | Conforme | — | Todas las vistas con operaciones brew muestran `<ProgressLog>` durante streaming y `<ResultBanner>` al finalizar | — |
| `GradientText` — optimizacion | Conforme | — | `src/components/common/gradient-text.tsx` — `React.memo` + `useMemo` por-caracter; `NO_COLOR` short-circuit; interpolacion costosa solo recalcula cuando cambia `text` o `colors` | — |
| `fetchAll()` paralelo | Conforme | — | `src/stores/brew-store.ts` — `Promise.all` en `fetchAll()`; datos disponibles en paralelo sin waterfalls | — |

### Registro de motion

| Elemento | Tipo de transicion | Objetivo UX | Correcta | Riesgo | Accion |
|----------|--------------------|-------------|----------|--------|--------|
| `BlinkingText` (header menu indicator `M`) | `setInterval` toggle bright/dim a 600ms | Indicar visualmente que `m` toggle el menu; distincion sin cambiar hue | Si | Ninguno; instancia unica activa; `clearInterval` en cleanup | — |
| `Spinner` (`@inkjs/ui`) | `setInterval` interno de la libreria (~80ms frames) | Indicar operacion en progreso sin duracion conocida | Si | Ninguno; gestionado por libreria | — |
| Re-render de estados (loading/data/empty/error) | React re-render sincrono | Reflejar cambio de estado inmediatamente | Si | Ninguno | — |
| `ProgressLog` scroll automatico | Ventana deslizante sobre array lineas | Mantener las ultimas N lineas visibles durante streaming | Si | Ninguno; claves absolutas para identidad estable | — |
| Header collapse (rows < 22) | Re-render sincrono al resize | Preservar espacio util en terminales pequenos | Si | Un frame en blanco posible si resize llega durante render; imperceptible | — |
| Header two-column expand (cols >= 95) | Re-render sincrono al resize | Aprovechar espacio horizontal en terminales anchos | Si | Ninguno | — |

---

# 10. Frontend tecnico

> Auditor: frontend-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

El codigo frontend tecnico es de alta calidad: identidad estable en `ForEach`, ningun `useInput` directo en vistas, patron uncontrolled de `TextInput` respetado sin excepciones, tokens de color y spacing sin magic numbers. Los hallazgos de mayor impacto son funcionales, no de calidad de codigo: la ausencia de `writeLastAction()` en `SearchView` rompe el canal IPC con BrewBar para instalaciones desde esa vista, y el bloque de estados de `AccountView` ignora el tier `team`. El codigo del lado del motor (hooks de layout, stores, streaming) esta especialmente bien ejecutado.

---

## 10.1 Renderizado y estabilidad

### Checklist

* [x] ForEach con identidad estable
* [x] No hay diffing defectuoso
* [x] No hay parpadeos por recreacion de vistas
* [x] No hay perdida de estado por identidad incorrecta
* [x] Imagenes cargan con estrategia correcta — No aplica (TUI, sin imagenes raster)
* [x] Scroll en listas grandes fluido

### ForEach — identidad de claves

Verificado en todas las vistas con listas:

- `search.tsx:224` — `key={\`${result.type}:${result.name}\`}` — clave compuesta estable
- `history.tsx:196` — `key={entry.id}` — UUID unico por entrada
- `outdated.tsx` — `key={pkg.name}` — nombre de paquete es unico en el contexto brew
- `installed.tsx` — `key={item.name}` — idem
- `progress-log.tsx` — claves absolutas (indice + offset del ring buffer, no indice relativo) — conforme
- `services.tsx` — `key={service.name}` — conforme

Ningun `ForEach` usa indice relativo del array como clave.

### `useContainerSize` — primer frame

`src/hooks/use-container-size.ts` reporta `{width:0, height:0}` en el primer frame antes de que `measureElement` se ejecute. `useVisibleRows` tiene `fallbackReservedRows` para este caso. Patrón conocido y manejado; no genera parpadeo visible.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `ForEach` identidad | Conforme | — | Todas las listas usan claves semanticas (id, nombre compuesto) — ningun `index` como clave | — |
| `ProgressLog` claves | Conforme | — | `src/components/common/progress-log.tsx` — claves absolutas del ring buffer; identidad estable durante scroll de output | — |
| Primer frame `useContainerSize` | Conforme | — | `fallbackReservedRows` en `useVisibleRows` cubre el frame inicial con width=0 | — |

---

## 10.2 Presentacion y coordinacion UI

### Checklist

* [x] Sheets coordinadas correctamente — No aplica (TUI; el equivalente son vistas modales via `modal-store`)
* [x] Alerts no compiten entre si — `modal-store` con contador de referencias; no hay competencia
* [x] NavigationDestination centralizada o bien trazable — `ViewRouter` en `app.tsx` centraliza todas las rutas con `switch(currentView)`
* [x] Side effects fuera del body — verificado; ninguna vista tiene side effects en el render path
* [x] Tareas ligadas al ciclo de vida correcto

### Side effects

Verificacion exhaustiva: ningun componente ni vista ejecuta network calls, mutaciones de store, ni `console.*` dentro del render path (body del componente). Todos los side effects estan en `useEffect`, `useCallback`, o handlers de `useViewInput`/`useInput`.

La convencion `logger` de `src/utils/logger.ts` esta respetada en componentes; los unicos `console.log/error` directos estan en `src/index.tsx` (handlers de CLI subcommands), que es el canal de salida intencionado.

### `useBrewStream` — lifecycle

`src/hooks/use-brew-stream.ts` — patron `mountedRef` + `generatorRef.current?.return(undefined)` en cleanup del `useEffect`. Las tareas de streaming se cancelan correctamente cuando el componente desmonta. `cancelRef` permite cancelacion imperativa via `stream.cancel()` desde `useViewInput`. Conforme.

### `ConfirmDialog` — coordinacion modal

`src/components/common/confirm-dialog.tsx` usa bare `useInput` (no `useViewInput`) de forma intencional: el `modal-store` ya fue incrementado por la vista padre antes de renderizar el dialog, bloqueando el teclado global via `if (modalOpen) return` en `useGlobalKeyboard`. El dialog abre su propio contador adicional en su `useEffect` para el caso en que sea el primer modal. Patron correcto.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `search.tsx` — `writeLastAction()` ausente | No conforme | Alta | `src/views/search.tsx:81-84` — post-install solo llama `fetchInstalled()`; no llama `writeLastAction()` | Anadir llamada a `writeLastAction({ action: 'install', packages: [name], ... })` en el efecto post-stream, igual que `outdated.tsx` y `installed.tsx` |
| `modal-store` coordinacion | Conforme | — | Contador de referencias maneja correctamente SearchView + ConfirmDialog anidado | — |
| `ViewRouter` centralizacion | Conforme | — | `src/app.tsx` — `switch(currentView)` unico punto de enrutamiento; gate Pro/Team inline | — |
| Side effects en body | Conforme | — | 0 side effects en render path en las 16 vistas + todos los componentes comunes | — |

---

## 10.3 Calidad de codigo UI

### Checklist

* [x] Previews utiles — No aplica (TUI; no hay `#Preview` de SwiftUI ni Storybook; `ink-testing-library` disponible pero no en uso — estado documentado en CLAUDE.md como pendiente)
* [x] Componentes testeables — componentes comunes aceptan datos via props; sin singletons embebidos
* [x] No hay logica de negocio incrustada — verificado; vistas delegan a stores y `lib/` modules
* [x] El body principal sigue siendo legible — con dos excepciones (compliance.tsx, sync.tsx)
* [x] Modificadores custom con sentido semantico — `useViewInput`, `useVisibleRows`, `useBrewStream` tienen nombres que expresan su intencion

### Componentes reutilizables

Los componentes en `src/components/common/` siguen el patron de inyeccion de datos:
- `<SelectableRow isCurrent={bool}>` — recibe estado, no lo lee del store
- `<StatusBadge label={...} variant={...}>` — puro
- `<ProgressLog lines={...} isRunning={bool}>` — recibe datos, no accede al stream directamente
- `<ConfirmDialog message={...} onConfirm onCancel>` — pure callback pattern
- `<ResultBanner status message>` — puro

Ningun componente common hace fetch de datos ni importa stores directamente.

### Logica de negocio en vistas

Unico caso limite detectado: `history.tsx:151-160` contiene una funcion `switch(entry.action)` para construir los `args` de replay. Esta logica es trivial (mapeo action→args) y podria estar en `lib/history/`, pero no constituye logica de dominio critica — es presentacional. No se marca como no conforme; se anota como candidato de refactor menor.

### Previews / testabilidad

El proyecto no tiene tests de UI con `ink-testing-library`. Esto esta fuera del alcance de esta seccion (la seccion 14 — Testing — lo evaluara) pero se anota como deuda tecnica.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `compliance.tsx` body legibilidad | No conforme | Media | `src/views/compliance.tsx` — 348 LOC; `body` principal supera 80 lineas utiles con logica de fase inlinea | Extraer subcomponentes por fase; ver hallazgo en 5.1 |
| `sync.tsx` body legibilidad | No conforme | Media | `src/views/sync.tsx` — 347 LOC; identico patron que `compliance.tsx` | Idem |
| `history.tsx` — logica de replay args | Parcial | Baja | `src/views/history.tsx:151-160` — construccion de `args` para `stream.run()` dentro de callback de UI | Mover a funcion exportable en `src/lib/history/replay.ts`; mejora testabilidad |
| Componentes comunes — pureza | Conforme | — | Todos los componentes en `common/` son puros (props-only o callbacks); ninguno importa stores | — |
| `useViewInput` — semantica | Conforme | — | Nombre expresa intencion; adopcion consistente en las 16 vistas | — |
| `TextInput` — patron uncontrolled | Conforme | — | Grep confirma 0 instancias de `value=` en `TextInput` de `@inkjs/ui`; todos usan `defaultValue` | — |
| Colores hardcodeados | Conforme | — | Grep de patrones hex (`#[0-9a-fA-F]{3,6}`) en archivos TSX/TS: 0 ocurrencias en vistas o componentes; todos los colores via `COLORS` tokens | — |
| Spacing hardcodeado | Conforme | — | Grep de magic numbers en props de Ink (`paddingX={[2-9]}`, `gap={[2-9]}`): 0 ocurrencias fuera de `SPACING` tokens | — |

---


## Resumen de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| Critica | 0 |
| Alta | 3 |
| Media | 4 |
| Baja | 5 |

**Total hallazgos no conformes:** 12

### Hallazgos Alta

1. `account.tsx:87-89` — Label de tier `team` ausente; usuarios team ven status vacio
2. `account.tsx:36` — Keybinding deactivate restringido a `status === 'pro'`; tier `team` ve el hint en footer pero la accion no dispara
3. `search.tsx:81-84` — `writeLastAction()` no se llama tras install; BrewBar nunca recibe notificacion de instalaciones desde SearchView

### Hallazgos Media

4. `stat-card.tsx` — Usa `useTerminalSize().columns` (viewport) en lugar de medicion de contenedor (`useContainerSize` / `useContentSize`)
5. `compliance.tsx` (348 LOC) — Supera umbral de mantenibilidad; fase state machine inlinea en body; extraer subcomponentes por fase
6. `sync.tsx` (347 LOC) — Identico patron que `compliance.tsx`; misma accion requerida

### Hallazgos Baja

7. `upgrade-prompt.tsx:46` — `width="80%"` hardcodeado fuera del sistema de tokens
8. `pro-badge.tsx` — Componente dead code no utilizado en ninguna importacion
9. `history.tsx:151-160` — Logica de construccion de args de replay en callback de UI (candidato menor de refactor)
10. `history.tsx:114-115` — Estado de error sin hint/boton de retry explicito
11. `welcome.tsx:18-20` — `useEffect` con cuerpo vacio (`return () => { /* cleanup not required */ }`) es dead code; eliminar
