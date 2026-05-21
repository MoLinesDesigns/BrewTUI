# 5. Auditoria UI estructural

> Auditor: frontend-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El frontend del proyecto es un hibrido bien articulado: un TUI de terminal React/Ink con 16 vistas routables y una app menubar SwiftUI de 3 vistas. La jerarquia de vistas del TUI es coherente y el enrutamiento via Zustand es predecible, con una separacion limpia entre layout y logica en la mayoria de pantallas. Los principales riesgos estructurales son tres cadenas de texto hardcodeadas sin pasar por el sistema i18n (dos en espanol, una en ingles), la vista `SearchView` excluida del ciclo Tab/Shift-Tab, la ausencia de estado de error inline para `InstalledView` al desinstalar, y la inexistencia de cobertura de tests UI para cualquier vista. En el lado Swift, `PopoverView` tiene un `minHeight: 420` rigido que no crece con Dynamic Type y los package rows de `OutdatedListView` carecen de `accessibilityElement(children:)` para agrupar nombre y versiones en un elemento unico de VoiceOver.

---

## 5.1 Jerarquia de vistas

### Checklist

* [x] Root views identificadas
* [x] Contenedores claros
* [x] Navegacion consistente
* [x] Separacion entre layout y comportamiento
* [x] Subvistas extraidas por intencion de dominio
* [ ] No hay vistas gigantes dificiles de mantener

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Root view TUI clara: `App` en `src/app.tsx:69` con `LicenseInitializer` + `ViewRouter` separados | Conforme | — | `src/app.tsx:28-80` | — |
| `App.tsx` es el unico punto de enrutamiento; el switch exhaustivo sobre `ViewId` garantiza que no puede existir una ruta no manejada | Conforme | — | `src/app.tsx:49-66` | — |
| `ProfilesView` correctamente descompuesta en `ProfileListMode`, `ProfileDetailMode`, `ProfileCreateFlow`, `ProfileEditFlow` con responsabilidades por dominio | Conforme | — | `src/views/profiles/` | — |
| Vistas `compliance.tsx` (308 lineas) y `sync.tsx` (304 lineas) superan el umbral de 300 lineas, mezclando renderizado condicional de fases, subcomponentes inline y logica de coordinacion de async generators | No conforme | Baja | `src/views/compliance.tsx:1-308`, `src/views/sync.tsx:1-304` | Extraer `ConflictsList` y `OverviewSection` (ya inline en sync) a ficheros propios; en compliance extraer `ViolationList`/`ComplianceScore` a `src/views/compliance/` |
| `OverviewSection` y `ConflictsList` estan definidas dentro de `sync.tsx` pero no exportadas ni usadas en otro lugar; podrian tener fichero propio | No conforme | Baja | `src/views/sync.tsx:24-132` | Mover a `src/views/sync/overview-section.tsx` y `src/views/sync/conflicts-list.tsx` |
| Logo en `header.tsx` usa `key={i}` (indice de array) para lineas del logo ASCII que son estaticas | No conforme | Baja | `src/components/layout/header.tsx:93` | Sustituir por `key={brew}` o `key={"logo-row-" + i}` — el array es estatico, asi que no hay riesgo funcional real, pero es un antipatron |

---

## 5.2 Navegacion

### Checklist

* [ ] NavigationStack / Tabs / Sheets coherentes — SearchView excluida del ciclo Tab
* [x] Rutas reproducibles
* [x] Deep links contemplados — No aplica (TUI CLI, sin URL schemes)
* [x] Estados de navegacion restaurables si aplica — No aplica (proceso efimero)
* [x] No hay doble presentacion de sheets/alerts
* [x] Back navigation coherente

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SearchView` (`ViewId: 'search'`) no esta en el array `VIEWS` de `navigation-store.ts` y por tanto queda fuera del ciclo Tab/Shift-Tab | No conforme | Media | `src/stores/navigation-store.ts:14-17` — `search` ausente; `src/hooks/use-keyboard.ts:53` — `S` la abre pero Tab no llega a ella | Anadir `'search'` al array `VIEWS` despues de `'installed'`, o documentar explicitamente que la vista solo es accesible via `S` y actualizar el footer con esa informacion |
| La navegacion de `SearchView` usa `selectPackage` + `navigate('package-info')` sin type, por lo que `selectedPackageType` queda como `null` cuando se llega desde Search; `PackageInfoView` intentara primero formula-info y funcionara en la mayoria de casos | No conforme | Baja | `src/views/search.tsx:93` — `selectPackage(allVisible[cursor])` sin argumento de tipo | Pasar el tipo correcto: los resultados de busqueda distinguen formulae y casks en arrays separados; calcular si `cursor < visibleFormulae.length` para inferir el tipo |
| Historial de navegacion limitado a 20 entradas (`viewHistory.slice(-19)`); comportamiento correcto para TUI | Conforme | — | `src/stores/navigation-store.ts:27-31` | — |
| `ModalStore` usa contador de referencias para suprimir el teclado global durante dialogs y SearchInput; coordinacion correcta entre `ConfirmDialog` y vistas que abren el modal | Conforme | — | `src/stores/modal-store.ts:1-28` | — |
| Tres `useInput` activos simultaneamente en `ProfilesView` (lineas 54, 73, 85), cada uno con condiciones de activacion diferentes; el tercero en linea 85 usa `isActive: mode === 'importing' && !importRunning`, lo que es correcto pero fragil | No conforme | Baja | `src/views/profiles.tsx:54,73,85` | Consolidar en un unico `useInput` con un bloque switch/if sobre `mode` para mayor trazabilidad |

---

## 5.3 Estados visuales por pantalla

### Pantallas auditadas

#### DashboardView

* **Ruta:** `src/views/dashboard.tsx`
* [x] Estado inicial — muestra `Loading` mientras `loading.installed`
* [x] Cargando — `<Loading message={t('loading_fetchingBrew')} />` en linea 119
* [x] Vacio — no aplica (el dashboard nunca tiene lista vacia; muestra cero paquetes)
* [x] Error recuperable — `<ErrorMessage>` para `errors.installed`; errores parciales de otros stores se muestran en panel amarillo
* [ ] Error fatal — no hay mecanismo de retry visible desde el dashboard si `errors.installed` es permanente; el `ErrorMessage` solo muestra texto, sin boton de reintentar
* [ ] Sin conexion — no hay deteccion de red offline; el error de `brew` aparece como texto generico
* [x] Datos parciales — panel `partialErrors` muestra fallos de outdated/services/config sin bloquear la vista
* [ ] Permiso denegado — no aplica para esta vista
* [x] Modo edicion — no aplica
* [x] Confirmacion — no aplica
* [x] Destructivo — no aplica
* [ ] Accesibilidad validada — No aplica (TUI terminal; no hay API de accesibilidad en Ink)
* [ ] Dark mode validado — No aplica (solo modo oscuro de terminal)
* [ ] Dynamic Type validado — No aplica (TUI terminal)

#### InstalledView

* **Ruta:** `src/views/installed.tsx`
* [x] Estado inicial — `<Loading message={t('loading_installed')} />`
* [x] Cargando — linea 112
* [x] Vacio — mensaje `t('installed_noPackages')` si `visible.length === 0` en linea 200
* [x] Error recuperable — `<ErrorMessage>` en linea 113
* [ ] Error fatal — tras una desinstalacion fallida via `stream`, el error se muestra en `stream.error` dentro de `ProgressLog`, pero al salir con Esc el estado de error se pierde sin confirmacion visual persistente
* [ ] Sin conexion — no aplica (operacion local)
* [x] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [x] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` ante desinstalacion
* [x] Destructivo — desinstalacion con confirmacion en linea 171
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### OutdatedView

* **Ruta:** `src/views/outdated.tsx`
* [x] Estado inicial — `<Loading message={t('loading_outdated')} />`
* [x] Cargando — linea 148
* [x] Vacio — `<ResultBanner status="success">` cuando lista vacia
* [x] Error recuperable — `<ErrorMessage>` en linea 149
* [x] Error fatal — error de stream se muestra en banner al terminar
* [ ] Sin conexion — no aplica (brew local)
* [x] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [x] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` antes de upgrade individual y masivo
* [x] Destructivo — upgrade con lista completa de paquetes en confirmacion (SCR-012)
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### SearchView

* **Ruta:** `src/views/search.tsx`
* [x] Estado inicial — `TextInput` listo para escribir
* [x] Cargando — `<Loading message={t('loading_searching')} />`
* [x] Vacio — `t('search_noResults')` en linea 213
* [x] Error recuperable — `searchError` mostrado en linea 157
* [ ] Error fatal — si `brew search` falla por timeout, el error se muestra pero no hay opcion de retry sin limpiar manualmente
* [ ] Sin conexion — el error de red aparece como mensaje generico; no hay texto especifico offline
* [x] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [x] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` antes de instalar en linea 163
* [x] Destructivo — instalacion con confirmacion
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### ServicesView

* **Ruta:** `src/views/services.tsx`
* [x] Estado inicial — `<Loading message={t('loading_services')} />`
* [x] Cargando — linea 72
* [x] Vacio — `t('services_noServices')` en linea 79
* [x] Error recuperable — `<ErrorMessage>` en linea 73; error de accion con `lastError` persistente
* [ ] Error fatal — si el error de accion proviene del store (`service-action`) y el servicio requiere `sudo`, el mensaje de error no explica el requisito de permisos elevados
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — no aplica
* [ ] Permiso denegado — ningun mensaje especifico cuando el servicio requiere permisos de root
* [x] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` antes de stop y restart
* [x] Destructivo — stop/restart con confirmacion
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### DoctorView

* **Ruta:** `src/views/doctor.tsx`
* [x] Estado inicial — `<Loading message={t('loading_doctor')} />`
* [x] Cargando — linea 27
* [x] Vacio — `<ResultBanner status="success">` cuando `doctorClean`
* [x] Error recuperable — `<ErrorMessage>` en linea 28
* [ ] Error fatal — no aplica (solo lectura)
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — caso `doctorClean === false && doctorWarnings.length === 0` manejado con mensaje especifico en linea 39-41
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica
* [ ] Confirmacion — no aplica
* [ ] Destructivo — no aplica
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### PackageInfoView

* **Ruta:** `src/views/package-info.tsx`
* [x] Estado inicial — `t('pkgInfo_noPackage')` si no hay paquete seleccionado
* [x] Cargando — `<Loading>` en linea 135
* [ ] Vacio — no aplica (si la info no existe, hay error)
* [x] Error recuperable — `<ErrorMessage>` en linea 136; `t('pkgInfo_notFound')` en linea 137
* [ ] Error fatal — no aplica
* [ ] Sin conexion — no aplica (brew info es local)
* [ ] Datos parciales — la conversion de Cask a formula-shape en lineas 58-84 puede producir campos vacios (license, tap) que se muestran como cadena vacia; aceptable pero visible
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` para install/uninstall/upgrade
* [x] Destructivo — uninstall con confirmacion
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### ProfilesView

* **Ruta:** `src/views/profiles.tsx` + `src/views/profiles/`
* [x] Estado inicial — `<Loading message={t('loading_profiles')} />`
* [x] Cargando — linea 129
* [x] Vacio — `t('profiles_noProfiles')` con instruccion de como crear
* [ ] Error recuperable — `loadError` se muestra en `ProfileListMode` pero no hay boton de retry explici to
* [ ] Error fatal — no aplica
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [x] Modo edicion — `ProfileEditFlow` implementado
* [x] Confirmacion — `ConfirmDialog` para borrar y para importar (con resumen de formulae/casks)
* [x] Destructivo — importar profile con confirmacion previa del numero de paquetes
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### SmartCleanupView

* **Ruta:** `src/views/smart-cleanup.tsx`
* [x] Estado inicial — `<Loading message={t('loading_cleanup')} />`
* [x] Cargando — linea 64
* [x] Vacio — `<ResultBanner status="success">` cuando no hay candidatos
* [x] Error recuperable — `<ErrorMessage>` en linea 65
* [ ] Error fatal — no aplica
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica (seleccion via toggle, no modo edicion)
* [x] Confirmacion — `ConfirmDialog` en dos pasos: aviso sobre system tools + confirmacion del numero de paquetes
* [x] Destructivo — doble confirmacion implementada (SCR-001)
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### HistoryView

* **Ruta:** `src/views/history.tsx`
* [x] Estado inicial — `<Loading message={t('loading_history')} />`
* [x] Cargando — linea 101
* [x] Vacio — `t('history_noEntries')` y version por filtro
* [x] Error recuperable — `<ErrorMessage>` en linea 102
* [ ] Error fatal — no aplica (solo lectura del fichero)
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` para borrar historial y para replay
* [x] Destructivo — replay de operaciones destructivas (uninstall) con confirmacion; aviso especifico para `upgrade-all`
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### SecurityAuditView

* **Ruta:** `src/views/security-audit.tsx`
* [x] Estado inicial — `<Loading message={t('loading_security')} />`
* [x] Cargando — linea 72
* [x] Vacio — `<ResultBanner status="success">` cuando sin vulnerabilidades
* [x] Error recuperable — `<ErrorMessage>` con mensaje de red amigable (SCR-017) en lineas 75-78
* [ ] Error fatal — no aplica
* [x] Sin conexion — mensaje especifico de red en lineas 37-39
* [ ] Datos parciales — nota: el ecosistema Bitnami no cubre todos los paquetes Homebrew; no hay mensaje de advertencia visible al usuario sobre coverage parcial
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` antes de upgrade
* [x] Destructivo — upgrade con confirmacion
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### RollbackView

* **Ruta:** `src/views/rollback.tsx`
* [x] Estado inicial — `<Loading message={t('rollback_select_snapshot')} />`
* [x] Cargando — linea 175
* [x] Vacio — `<ResultBanner status="info">` cuando no hay snapshots
* [x] Error recuperable — `<ErrorMessage>` en linea 176
* [x] Error fatal — error en ejecucion mostrado en `ResultBanner` fase 'result'
* [ ] Sin conexion — no aplica (operacion local)
* [ ] Datos parciales — acciones con strategy `unavailable` se muestran con icono `⊗` y color muted; correcto
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica
* [x] Confirmacion — `ConfirmDialog` antes de ejecutar el plan de rollback
* [x] Destructivo — rollback con confirmacion y plan detallado previo
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### BrewfileView

* **Ruta:** `src/views/brewfile.tsx`
* [x] Estado inicial — `<Loading message={t('loading_default')} />`
* [x] Cargando — linea 170
* [x] Vacio — `<ResultBanner status="info">` cuando no existe brewfile
* [x] Error recuperable — `<ErrorMessage>` en linea 171
* [x] Error fatal — errores de reconciliacion mostrados en phase 'result'
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — drift `driftLoading` muestra `Computing drift...` hardcodeado en ingles (linea 261)
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — creacion de brewfile via `TextInput` inline
* [x] Confirmacion — reconciliacion requiere accion explicita con `c`; no hay dialog de confirmacion antes de iniciar, solo el keybind explici to
* [x] Destructivo — reconciliacion puede instalar/desinstalar; sin `ConfirmDialog` previo (solo requiere pulsar `c`)
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### SyncView

* **Ruta:** `src/views/sync.tsx`
* [x] Estado inicial — `<Loading message={t('sync_syncing')} />`
* [x] Cargando — linea 250
* [x] Vacio — mensaje `t('sync_disabled')` cuando no hay config
* [x] Error recuperable — `<ResultBanner status="error">` en fase overview y result
* [x] Error fatal — errores de sync mostrados en result
* [ ] Sin conexion — no hay deteccion especifica de iCloud no disponible
* [ ] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — no aplica (resolucion de conflictos es inline)
* [ ] Confirmacion — no hay `ConfirmDialog` antes de `syncNow`; solo se requiere pulsar `s`
* [x] Destructivo — sync puede sobrescribir estado local; solo el flujo de conflictos protege parcialmente
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### ComplianceView

* **Ruta:** `src/views/compliance.tsx`
* [x] Estado inicial — `<Loading>` en linea 219
* [x] Cargando — linea 208
* [x] Vacio — mensaje `t('compliance_no_policy')` cuando no hay policy
* [x] Error recuperable — `<ResultBanner status="error">` en linea 244
* [x] Error fatal — errores de remediacion en phase 'result'
* [ ] Sin conexion — no aplica
* [ ] Datos parciales — no aplica
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — importacion de policy via `TextInput`
* [ ] Confirmacion — remediacion inicia directamente con `c` sin `ConfirmDialog`
* [x] Destructivo — remediacion puede instalar/desinstalar; sin confirmacion previa
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

#### AccountView

* **Ruta:** `src/views/account.tsx`
* [x] Estado inicial — `<Loading message={t('account_loading')} />` cuando `status === 'validating'`
* [x] Cargando — linea 47
* [ ] Vacio — no aplica (siempre hay estado de licencia)
* [ ] Error recuperable — errores de desactivacion mostrados en `deactivateError`; no hay retry de la licencia desde esta vista
* [ ] Error fatal — no aplica
* [ ] Sin conexion — estado de degradacion mostrado en banner naranja (7-day grace period), correcto
* [ ] Datos parciales — `status === 'expired'` manejado con banner error
* [ ] Permiso denegado — no aplica
* [ ] Modo edicion — modo promo con `TextInput`
* [x] Confirmacion — `ConfirmDialog` antes de desactivar
* [x] Destructivo — desactivacion con confirmacion
* [ ] Accesibilidad — No aplica (TUI)
* [ ] Dark mode — No aplica
* [ ] Dynamic Type — No aplica

### Hallazgos de estados visuales

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `DashboardView`: sin boton de retry cuando `errors.installed` es permanente | No conforme | Media | `src/views/dashboard.tsx:119-120` — solo muestra `ErrorMessage` sin accion | Anadir hint de teclado `r:${t('hint_refresh')}` y conectar a `fetchAll()` cuando hay error en la vista principal |
| `BrewfileView`: cadena `Computing drift...` hardcodeada en ingles sin pasar por `t()` | No conforme | Media | `src/views/brewfile.tsx:261` | Mover a clave `brewfile_computing_drift` en `en.ts`/`es.ts` y usar `t('brewfile_computing_drift')` |
| `SyncView`: `ConflictsList` tiene instrucciones de teclado hardcodeadas en espanol (`j/k:navegar`, `enter:aplicar`) sin pasar por el sistema i18n | No conforme | Media | `src/views/sync.tsx:127` | Extraer a claves de traduccion o usar `t()` para cada parte de la cadena |
| `BrewfileView`: reconciliacion inicia directamente con `c` sin `ConfirmDialog`; puede instalar/desinstalar paquetes masivamente | No conforme | Alta | `src/views/brewfile.tsx:155-163` | Anadir `ConfirmDialog` con resumen del numero de paquetes afectados antes de iniciar |
| `SyncView`: `syncNow` inicia directamente con `s` sin confirmacion cuando sync puede sobrescribir estado local | No conforme | Alta | `src/views/sync.tsx:232` | Anadir `ConfirmDialog` antes de invocar `syncNow` |
| `ComplianceView`: remediacion inicia con `c` sin `ConfirmDialog`; puede instalar/desinstalar paquetes | No conforme | Alta | `src/views/compliance.tsx:198-204` | Anadir confirmacion con numero de violaciones accionables antes de iniciar |
| `ServicesView`: ninguna indicacion al usuario cuando el error de accion es por permisos root insuficientes | No conforme | Media | `src/views/services.tsx:52-65` | Detectar `EACCES`/`sudo` en el error y mostrar mensaje especifico |
| `SecurityAuditView`: sin advertencia visible sobre cobertura parcial del ecosistema Bitnami | No conforme | Baja | `src/views/security-audit.tsx:83-185` — sin nota sobre falsos negativos posibles | Anadir una nota `t('security_coverage_warning')` debajo del resumen estadistico |
| `InstalledView`: error de desinstalacion en stream se pierde al salir con Esc sin confirmacion persistente | No conforme | Baja | `src/views/installed.tsx:69-76` — `stream.clear()` en Esc borra el error | Implementar un estado `lastResult` en `InstalledView` similar a `lastError` en `ServicesView` |

---

## 5.4 Layout y adaptabilidad

### Checklist

* [x] iPhone pequeno — No aplica (plataforma macOS CLI/terminal)
* [x] iPhone grande — No aplica
* [x] iPad portrait — No aplica
* [x] iPad landscape — No aplica
* [x] Multitarea — No aplica (TUI CLI)
* [x] Mac idiom si aplica — BrewBar target macOS 14+ confirmado
* [x] Safe areas correctas — no aplica (Ink terminal renderer)
* [x] Keyboard avoidance correcto — no aplica (TUI no es UI grafica)
* [x] Scroll correcto con contenido grande — ventana deslizante implementada en todas las vistas de lista
* [x] Rotacion correcta — no aplica (TUI)

### Hallazgos de layout TUI

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: `useStdout().columns` y `.rows` usados correctamente para adaptar numero de filas visibles y layout narrow/wide | Conforme | — | `src/views/dashboard.tsx:84-85`, `src/views/outdated.tsx:143-144`, `src/views/installed.tsx:40-41` | — |
| TUI: `isNarrow` en `Header` (cols < 95) y `DashboardView` (cols < 60) adapta layout correctamente | Conforme | — | `src/components/layout/header.tsx:86-87`, `src/views/dashboard.tsx:123` | — |
| TUI: ventana deslizante en `OutdatedView`, `InstalledView`, `ServicesView`, `HistoryView`, `SecurityAuditView` con indicadores `scroll_moreAbove`/`scroll_moreBelow` | Conforme | — | pattern comun en vistas de lista | — |
| BrewBar: `PopoverView` con `minHeight: 420` fijo podria clipar contenido cuando el texto es mas grande con Dynamic Type activo en macOS | No conforme | Baja | `src/views`… `menubar/BrewBar/Sources/Views/PopoverView.swift:40` — `.frame(minWidth: 340, maxWidth: 340, minHeight: 420)` | Cambiar a `minHeight: 0` y dejar que el contenido determine la altura minima, o aumentar el valor minimo con referencia al escenario de accesibilidad mas exigente |

---

# 9. Motion y percepcion de velocidad

> Auditor: frontend-auditor | Fecha: 2026-05-01

## Resumen

El proyecto es un TUI de terminal basado en Ink: no existe un sistema de animacion/transicion en el sentido SwiftUI/CSS. No hay uso de `withAnimation`, `.transition()`, ni curvas de animacion. El movimiento percibido proviene de: (1) el `Spinner` de `@inkjs/ui` en estados de carga, (2) la actualizacion de lineas en `ProgressLog` durante streaming, (3) el badge en el menu bar de BrewBar. En el lado SwiftUI de BrewBar tampoco hay animaciones explicitas mas alla del comportamiento por defecto del popover del sistema.

## 9.1 Transiciones

### Checklist

* [x] Las transiciones comunican cambio de estado — el Spinner y el ProgressLog son el unico feedback de cambio de estado activo
* [x] No hay animacion gratuita — no se detectan animaciones decorativas
* [x] Las duraciones son consistentes — no aplica (sin animaciones custom)
* [x] Las curvas son coherentes — no aplica
* [x] No hay jank perceptible — el streaming de lineas via AsyncGenerator mantiene el render incremental; cada linea nueva fuerza un re-render de `ProgressLog`, acotado a los ultimos 15 visibles via `slice(-maxVisible)`
* [ ] Reduced Motion respetado — en BrewBar no se detecta uso de `@Environment(\.accessibilityReduceMotion)` ni equivalente para las animaciones del popover del sistema; el popover usa animacion por defecto de macOS

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| TUI: `Spinner` de `@inkjs/ui` es el unico elemento animado; correcto para comunicar carga | Conforme | — | `src/components/common/loading.tsx:15`, `src/components/common/progress-log.tsx:21` | — |
| TUI: ProgressLog limita lineas visibles a 15 por defecto, evitando re-renders masivos | Conforme | — | `src/components/common/progress-log.tsx:14,16` | — |
| BrewBar: no hay animaciones custom en SwiftUI; el popover usa animacion por defecto del sistema macOS que respeta automaticamente la preferencia de Reduced Motion del sistema | Conforme | — | Comportamiento por defecto NSPopover | — |
| TUI: no hay transicion visible cuando se cambia de vista (cambio instantaneo de contenido); en un TUI esto es el comportamiento esperado y correcto | Conforme — comportamiento esperado | — | Arquitectura Ink/React | — |

## 9.2 Percepcion de rendimiento

### Checklist

* [x] Skeletons correctos — no aplica; el `Spinner` es el indicador correcto para TUI
* [x] Loaders adecuados al contexto — `Loading` para cargas iniciales, `Spinner` en `ProgressLog` para operaciones en curso
* [ ] Optimistic UI justificada — no hay optimistic UI implementada
* [x] Prefetch donde aporta valor — `fetchAll()` en `DashboardView` carga todos los datos en paralelo al montar
* [x] Placeholders evitan vacio abrupto — las vistas muestran `Loading` antes de que lleguen los datos
* [x] Haptics coherentes y no invasivos — no aplica (TUI CLI); BrewBar no implementa hapticos (correcto para menubar app)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `useBrewStream`: limita el buffer de lineas a 100 en el hook (`MAX_LINES = 100`) y a 15 en `ProgressLog` (`maxVisible`); esta doble limitacion es correcta para evitar consumo de memoria ilimitado | Conforme | — | `src/hooks/use-brew-stream.ts:7`, `src/components/common/progress-log.tsx:14` | — |
| `OutdatedView`: `Impact Analysis` usa `useDebounce(cursor, 150ms)` antes de disparar `getUpgradeImpact`; correcto para evitar peticiones en cada pulsacion de tecla de navegacion | Conforme | — | `src/views/outdated.tsx:87-105` | — |
| `DashboardView`: `fetchAll()` ejecuta fetches en paralelo al montar; la vista no bloquea en `loading.installed` pero muestra `...` en los StatCards de outdated/services mientras cargan | Conforme | — | `src/views/dashboard.tsx:87,103-113` | — |
| `BrewBar`: badge en menu bar se actualiza cada 30 segundos via `Timer`; eficiente (solo actualiza `button.title` cuando cambia el valor) | Conforme | — | `menubar/BrewBar/Sources/App/AppDelegate.swift:69-72,224-231` | — |
| `BrewBar`: `ProgressView("Checking for updates...")` en estado de carga es un spinner textual minimal; correcto para el contexto de popover | Conforme | — | `menubar/BrewBar/Sources/Views/PopoverView.swift:79-85` | — |

### Registro de motion

| Elemento | Tipo de transicion | Objetivo UX | Correcta | Riesgo | Accion |
|----------|--------------------|-------------|----------|--------|--------|
| `Loading` / `Spinner` (TUI) | Animacion de spinner terminal via `@inkjs/ui` | Indicar carga activa | Si | Ninguno | — |
| `ProgressLog` lineas en tiempo real (TUI) | Actualizacion incremental de texto (re-render React) | Mostrar progreso de operacion brew en curso | Si | Re-renders frecuentes si las lineas llegan muy rapido; mitigado con slice de 100 | — |
| `ProgressView` en BrewBar `loadingView` | Spinner circular SwiftUI del sistema | Indicar check de updates en curso | Si | Ninguno | — |
| `ProgressView(scaleEffect: 0.6)` en header de `PopoverView` | Spinner inline compacto durante carga | Feedback no intrusivo de refresco | Si | Ninguno | — |
| Badge de menu bar (`outdated↑ cve⚠ ⟳`) | Actualizacion de texto en `NSStatusItem.button.title` | Notificar estado sin abrir popover | Si | Ninguno | — |
| Animacion de apertura del popover `NSPopover` | Animacion por defecto del sistema macOS | Transicion natural al mostrar el popover | Si | Ninguno — el sistema respeta Reduced Motion automaticamente | — |
| `confirmationDialog` en `OutdatedListView` | Sheet/dialog nativo de macOS | Confirmar upgrade antes de ejecutar | Si | Ninguno | — |

---

# 10. Frontend tecnico

> Auditor: frontend-auditor | Fecha: 2026-05-01

## 10.1 Renderizado y estabilidad

### Checklist

* [ ] ForEach con identidad estable — un caso con `key={i}` para el logo ASCII (estatico, sin impacto funcional)
* [x] No hay diffing defectuoso — identidades estables en todas las listas de datos
* [x] No hay parpadeos por recreacion de vistas — Ink no tiene el mismo diffing que el DOM; no se detectan patrones de recreacion problematicos
* [x] No hay perdida de estado por identidad incorrecta — los `@State` de Swift estan en componentes estables; los `useState` del TUI estan en vistas de primer nivel
* [x] Imagenes cargan con estrategia correcta — no hay imagenes remote en el TUI; BrewBar carga `NSImage(named:)` estatica y `AsyncImage` no se usa
* [x] Scroll en listas grandes fluido — ventanas deslizantes en todas las vistas; BrewBar usa `LazyVStack` en `OutdatedListView` (linea 48)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `header.tsx`: logo ASCII renderizado con `key={i}` sobre un array estatico de 6 elementos; sin impacto funcional real ya que el array nunca cambia ni se reordena | No conforme | Baja | `src/components/layout/header.tsx:93` | Sustituir por `key={"logo-" + i}` o simplemente `key={brew.slice(0,4)}` |
| `ProgressLog`: clave de los items calculada como `lines.length - visible.length + i`; esta clave es un numero que cambia con cada nuevo line append, provocando que React trate cada render como una lista completamente nueva | No conforme | Media | `src/components/common/progress-log.tsx:26` — `key={lines.length - visible.length + i}` | Cambiar la clave a un identificador estable: por ejemplo `key={lines.length - maxVisible + i}` calculando el indice absoluto desde el principio del buffer; o, dado que las lineas son texto de brew, usar el indice global `lines.length - visible.length + i` pero aplicarlo como offset fijo |
| `ProfilesView` mantiene estado local de `importGenRef` y `mountedRef` con cleanup correcto en `useEffect` de desmontaje | Conforme | — | `src/views/profiles.tsx:37-44` | — |
| `RollbackView` y `BrewfileView` y `ComplianceView` limpian sus `AsyncGenerator` en el cleanup de `useEffect` via `return () => { generatorRef.current?.return(undefined) }` | Conforme | — | pattern en multiples vistas | — |
| Swift `OutdatedListView`: `LazyVStack` con `ForEach(appState.outdatedPackages)` donde `OutdatedPackage` conforma `Identifiable`; identidad correcta | Conforme | — | `menubar/BrewBar/Sources/Views/OutdatedListView.swift:48-54` | — |
| Swift `SettingsView`: `ForEach(SchedulerService.Interval.allCases, id: \.self)` sobre un enum `Hashable`; identidad correcta para un conjunto fijo | Conforme | — | `menubar/BrewBar/Sources/Views/SettingsView.swift:33` | — |

---

## 10.2 Presentacion y coordinacion UI

### Checklist

* [x] Sheets coordinadas correctamente — `ModalStore` con contador de referencias previene supresiones prematuras
* [x] Alerts no compiten entre si — un unico `ConfirmDialog` activo por vez en cada vista
* [x] NavigationDestination centralizada o bien trazable — `ViewRouter` en `app.tsx` centraliza todo el enrutamiento
* [ ] Side effects fuera del `body` — un efecto colateral menor detectado en `body` Swift
* [x] Tareas ligadas al ciclo de vida correcto — `mountedRef` en todas las vistas con AsyncGenerators; `onDisappear` cancela tasks en Swift

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `ModalStore` con contador de referencias (no booleano) gestiona correctamente el caso de supresor anidado; bien disenado | Conforme | — | `src/stores/modal-store.ts:1-28` | — |
| `ViewRouter` en `app.tsx` es el unico punto de enrutamiento; todas las rutas estan en un switch exhaustivo sobre `ViewId` | Conforme | — | `src/app.tsx:35-67` | — |
| `useBrewStream`: el hook limpia el generador al desmontar via `return () => { generatorRef.current?.return(undefined) }` y no actualiza estado si `!mountedRef.current` | Conforme | — | `src/hooks/use-brew-stream.ts:39-45` | — |
| `ProfilesView`: tiene dos `useEffect` de cleanup potencialmente competidores (lineas 37-44 y 46-52) — el primero limpia el generador de importacion al desmontar, el segundo abre/cierra el modal. Si la limpieza ocurre en orden incorrecto, el modal podria no cerrarse antes de que se destruya el componente | No conforme | Baja | `src/views/profiles.tsx:37-52` | Consolidar en un unico `useEffect` que gestione el ciclo de vida del generador y el modal de forma coordinada |
| BrewBar `PopoverView`: el `@State private var refreshTask` solo se cancela en `onDisappear`; si el popover se reutiliza sin desaparecer (NSPopover reutiliza el hosting controller), la task anterior podria no cancelarse antes de la siguiente | No conforme | Media | `menubar/BrewBar/Sources/Views/PopoverView.swift:8,41` — la task creada al pulsar el boton de refresco no se cancela antes de crear una nueva | Guardar la task anterior y cancelarla en el action del boton antes de crear la nueva: `refreshTask?.cancel(); refreshTask = Task { ... }` |
| BrewBar `OutdatedListView`: `packageToConfirm` es un estado opcional que controla la apertura de confirmationDialogs en cada fila via `Binding` derivado; correcto pero con un borde: si dos botones son pulsados rapidamente podria haber una race condition entre el dismiss del primer dialog y la asignacion del segundo | No conforme | Baja | `menubar/BrewBar/Sources/Views/OutdatedListView.swift:99-115` | Deshabilitar los botones de upgrade durante `appState.isLoading` (ya implementado en linea 95) — suficiente mitigacion |
| BrewBar `AppDelegate`: el `badgeTimer` no invalida la task anterior si `updateBadge` se llama durante un ciclo del timer mientras el refresh esta en curso; el timer usa `[weak self]` correctamente para evitar retain cycle | Conforme | — | `menubar/BrewBar/Sources/App/AppDelegate.swift:69-72` | — |

---

## 10.3 Calidad de codigo UI

### Checklist

* [ ] Previews utiles — `ProfilesView`, `SmartCleanupView`, `HistoryView`, `SecurityAuditView`, `RollbackView`, `BrewfileView`, `SyncView`, `ComplianceView` y todos los componentes comunes del TUI carecen de previews de cualquier tipo
* [x] Componentes testeables — los componentes aceptan datos/dependencias como props o stores inyectados
* [ ] No hay logica de negocio incrustada — tres casos detectados
* [x] El body principal sigue siendo legible — los `body` de SwiftUI y los `return JSX` de React estan dentro de limites razonables
* [x] Modificadores custom con sentido semantico — no se usan `ViewModifier` custom en SwiftUI; los hooks custom del TUI tienen nombres semanticos (`useBrewStream`, `useDebounce`)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Ninguna vista del TUI (20 archivos en `src/views/`) tiene tests de renderizado; `ink-testing-library` esta instalada pero sin uso | No conforme | Alta | `src/views/*.tsx` — sin archivos `*.test.tsx` equivalentes; `package.json` incluye `ink-testing-library@^4.0.0` | Crear tests de renderizado minimos para las vistas criticas: al menos `DashboardView` (estado loading/error), `OutdatedView` (estado vacio/lista) y `AccountView` (estado free/pro/expired) |
| Ninguno de los componentes comunes (`StatusBadge`, `StatCard`, `ProgressLog`, `ConfirmDialog`, `SelectableRow`, `ResultBanner`, `UpgradePrompt`) tiene tests de renderizado | No conforme | Alta | `src/components/common/*.tsx` — solo `*.test.ts` para logica de negocio, no para renderizado | Priorizar tests para `ConfirmDialog` (acepta input de teclado) y `UpgradePrompt` (logica de ramificacion Pro/Team) |
| `ServicesView`: logica de negocio (`doAction` closure, lectura directa de `useBrewStore.getState()` para obtener `errors['service-action']`) incrustada dentro del handler de `useInput` del componente | No conforme | Media | `src/views/services.tsx:53-65` — la closure `doAction` accede a `useBrewStore.getState()` directamente para leer el error post-accion | Mover la coordinacion de estado al store: `serviceAction` deberia retornar el error o actualizarlo en el store de forma que la vista solo reaccione al estado del store |
| `PackageInfoView`: conversion de `CaskInfo` a `Formula`-shape (bloque lineas 58-85) es logica de presentacion, pero incluye logica de adaptacion de modelo que deberia estar en `brew-api.ts` o un mapper dedicado | No conforme | Baja | `src/views/package-info.tsx:52-93` | Extraer a `formulaeFromCask(cask: CaskInfo): Formula` en `src/lib/brew-api.ts` |
| `SyncView`: logica de resolucion de conflictos (acumular resoluciones, validar que todas esten resueltas antes de `apply`) esta en el componente | No conforme | Baja | `src/views/sync.tsx:174-185` | Mover la validacion de `pending.length > 0` y el mapeo de resoluciones al `sync-store` o a una funcion auxiliar |
| SwiftUI `PopoverView`: `makeLaunchScript()` crea un fichero temporal de shell en el componente de vista | No conforme | Baja | `menubar/BrewBar/Sources/Views/PopoverView.swift:228-245` | Mover a un helper en `Services/` o `App/` separado; las vistas no deben manejar operaciones de sistema de ficheros |
| SwiftUI previews en BrewBar son completas y cubren los estados principales: loading, up-to-date, error, service errors, espanol | Conforme | — | `menubar/BrewBar/Sources/Views/PopoverView.swift:250-304`, `OutdatedListView.swift:131-154`, `SettingsView.swift:98-105` | — |
| TUI: colores todos via `COLORS` de `src/utils/colors.ts`; no se detectan colores hex hardcodeados en vistas (la unica excepcion es el comentario de documentacion en `colors.ts` linea 6-8) | Conforme | — | `src/utils/colors.ts` | — |
| `UpgradePrompt`: `FEATURE_KEYS` no incluye `rollback` ni `brewfile`; si se navega a esas vistas como usuario free antes del gate en `app.tsx`, retornaria `null` silenciosamente | No conforme | Media | `src/components/common/upgrade-prompt.tsx:9-16` — keys para `rollback` y `brewfile` ausentes | `rollback` y `brewfile` si estan en `PRO_VIEWS` en `feature-gate.ts`; anadir sus claves a `FEATURE_KEYS` para mostrar el prompt correcto en vez de renderizar `null` |

---

## Resumen de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| Critica | 0 |
| Alta | 5 |
| Media | 9 |
| Baja | 13 |

**Total hallazgos no conformes:** 27

### Hallazgos Alta severidad (resumen rapido)

1. **`BrewfileView` reconciliacion sin `ConfirmDialog`** — puede instalar/desinstalar paquetes masivamente con solo pulsar `c` (`src/views/brewfile.tsx:155`).
2. **`SyncView` sync sin confirmacion** — `syncNow` inicia con `s` sin paso de confirmacion explici ta cuando puede sobrescribir el estado local (`src/views/sync.tsx:232`).
3. **`ComplianceView` remediacion sin `ConfirmDialog`** — `c` inicia remediacion destructiva directamente (`src/views/compliance.tsx:198`).
4. **Ninguna vista TUI tiene tests de renderizado** — `ink-testing-library` instalada sin uso; las vistas criticas con logica de estado (Dashboard, Account, Outdated) no tienen cobertura de render.
5. **Ningun componente comun tiene tests de renderizado** — `ConfirmDialog`, `UpgradePrompt` y `ProgressLog` sin tests.

### Hallazgos Media severidad (resumen rapido)

1. **`SearchView` fuera del ciclo Tab/Shift-Tab** — solo accesible via `S`.
2. **Strings hardcodeados sin i18n**: `"Computing drift..."` en ingles (`brewfile.tsx:261`), `"System is in sync with Brewfile"` en ingles (`brewfile.tsx:70`), `"j/k:navegar  l:... enter:aplicar"` en espanol hardcodeado (`sync.tsx:127`).
3. **`DashboardView` sin boton de retry en error de carga inicial**.
4. **`ProgressLog` key inestable** — `lines.length - visible.length + i` cambia en cada append.
5. **`ServicesView` logica de negocio en handler de `useInput`** — acceso directo a `useBrewStore.getState()`.
6. **BrewBar `PopoverView`: `refreshTask` no se cancela antes de crear una nueva** — race condition potencial en popover reutilizado.
7. **`UpgradePrompt` sin claves para `rollback` y `brewfile`** — retorna `null` silenciosamente para vistas Pro sin clave definida.
8. **`ServicesView` sin mensaje especifico de permisos root**.
9. **`ProfilesView` dos `useEffect` de cleanup potencialmente competidores**.
