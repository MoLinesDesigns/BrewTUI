# 12. Auditoria de pantallas (TUI + SwiftUI)

> Auditor: screen-auditor (manual run) | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto tiene 16 pantallas TUI routables (15 en `VIEWS` + `package-info`) descompuestas en 20 ficheros `.tsx` bajo `src/views/`, mas tres vistas SwiftUI bajo `menubar/BrewBar/Sources/Views/`. Los hallazgos cruzados que aparecen en multiples pantallas ya estan recogidos en `04-frontend.md`, `05-ux.md` y `06-design-accessibility.md`; este informe se centra en cinco bloques que aquellos no cubren a nivel de pantalla:

1. **Disciplina de `mountedRef`**: solo 6 de 16 vistas TUI (`package-info`, `profiles`, `rollback`, `brewfile`, `compliance`, `doctor`) usan `mountedRef.current` para evitar `setState` post-unmount; el resto puede disparar warnings de React o leaks si la vista se desmonta mientras una promesa sigue en vuelo.
2. **Cobertura del shortcut numerico 1-0**: `use-keyboard.ts:7-18` solo mapea 10 vistas; `rollback`, `brewfile`, `sync`, `compliance`, `package-info` y `search` solo son alcanzables via Tab cycling (o via el navigate desde otra vista, en algunos casos).
3. **Gating Pro/Team interno**: la mayoria de vistas Pro no renderiza su propio fallback porque `app.tsx:40-47` devuelve `UpgradePrompt` antes de invocarlas. Hay sin embargo 4 vistas que invocan `isPro()` internamente (`outdated`, `dashboard`, `profiles`, `rollback`/`brewfile`/`sync`/`compliance` para pasar el flag al lib), generando una doble defensa que conviene documentar.
4. **Cancelacion de generadores**: 4 de 5 vistas que consumen `AsyncGenerator` directamente (no via `useBrewStream`) si llaman `gen.return()` en cleanup. La excepcion es ProfilesView, que combina `gen.return()` con `mountedRef.current`.
5. **SwiftUI Localization**: las tres vistas SwiftUI estan cubiertas por `Localizable.xcstrings` (verificado para los 15 literales principales). El riesgo real es que algunos `Text` con `String(format:)` no esten en el catalog en futuros cambios; hoy todos los strings del PopoverView/SettingsView/OutdatedListView estan presentes.

---

## 12.1 Vistas TUI (`src/views/`)

> Notas comunes a todas las vistas TUI: VoiceOver/Dynamic Type **no aplica** (es un terminal). El sistema dark/light se delega al esquema de color del terminal del usuario; los `COLORS` de `src/utils/colors.ts` son ANSI 256-aware. La gating por router (`app.tsx:40-47`) intercepta las vistas Pro/Team no licenciadas y muestra `UpgradePrompt`, por lo que la mayoria de vistas no ven jamas el flujo `denied/expired` internamente — se documenta como **"gateado por router"**.

### 12.1.1 DashboardView

* **Ruta:** `src/views/dashboard.tsx`
* **Responsabilidad:** Pantalla de aterrizaje con StatCards (formulae/casks/outdated/services), info del sistema, lista resumida de outdated, errores de servicios y panel Pro adicional.
* **Estados cubiertos:** loading (`Loading` linea 119), error (`ErrorMessage` linea 120), populated (resto), parcial (banda `partialErrors` linea 149-158). Falta: empty puro (no hay caso real), denied (no aplica, vista Free).
* **Teclas:** ninguna propia. Solo las globales (numero, Tab, q, Esc, L, S).
* **i18n:** todas las cadenas pasan por `t()`. **Conforme**.
* **Gating:** llama `useLicenseStore.isPro()` (linea 83) para decidir si renderiza `<ProStatusPanel />` (linea 203). Doble dependencia: si los stores Pro (`security`, `brewfile`, `sync`, `compliance`) no estan inicializados el panel muestra `—` correctamente.
* **Concurrencia:** `fetchAll()` en mount (linea 87) no usa `mountedRef`; si el usuario salta de view antes de terminar, el setState del store sigue, lo cual es seguro porque va al store global (no a estado local). **Sin riesgo concreto pero merece nota**.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-D1 | `fetchAll()` se reinvoca cada vez que el usuario vuelve al Dashboard via Tab/numero, sin debounce ni throttle (linea 87). En sesiones largas con `outdated` lento (>2s) puede haber peticiones solapadas. | Baja | `dashboard.tsx:87` |
| SCR-12-D2 | El error de `installed` corta toda la pantalla con `ErrorMessage` (linea 120) sin opcion de retry inline. Ya documentado en `04-frontend.md:354`. | Media | ver 04 |

### 12.1.2 InstalledView

* **Ruta:** `src/views/installed.tsx`
* **Responsabilidad:** Lista de formulae/casks con tabs, busqueda incremental y atajo de uninstall.
* **Estados cubiertos:** loading (linea 112), error (linea 113), empty filtrado (`installed_noPackages` linea 202), populated, streaming (uninstall progress linea 116-137), success/error post-stream (`ResultBanner` linea 128). Falta: denied (no aplica).
* **Teclas:** `j/k` o flechas (scroll), `g/G` (top/bottom), `f` (toggle formulae/casks), `/` (busqueda), `u` (uninstall), Enter (navegar a package-info), Esc (cerrar busqueda o limpiar stream).
* **i18n:** todas las cadenas via `t()`. **Conforme**.
* **Gating:** vista Free, sin gating interno.
* **Concurrencia:** `fetchInstalled()` en mount (linea 43) sin `mountedRef`. `useModalStore` correctamente abrir/cerrar al entrar/salir de busqueda (linea 45-51). Stream cancelado por escape solo despues de finalizar (no hay `stream.cancel()` en uninstall progress, linea 124 — solo se muestra hint).
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-I1 | Hint `esc:{t('hint_cancel')}` se muestra durante `stream.isRunning` (linea 124) pero el `useInput` de la vista (linea 65-110) no llama `stream.cancel()` cuando el stream corre — el `esc` queda capturado por el goBack global. **Hint enganoso**: el esc cancela navegacion, no la operacion. | Media | `installed.tsx:65-110,124` |
| SCR-12-I2 | Sin `mountedRef`: si el usuario hace Tab durante `fetchInstalled()` (mount linea 43) y la respuesta llega despues, no afecta porque el setState va al store. Pero `setConfirmUninstall(null)` linea 175 dentro del onConfirm puede dispararse despues de unmount si el dialog persiste. | Baja | `installed.tsx:170-179` |

### 12.1.3 SearchView

* **Ruta:** `src/views/search.tsx`
* **Responsabilidad:** Busca en el indice Homebrew via `brew search` y permite instalar.
* **Estados cubiertos:** idle (input vacio), searching (`Loading` linea 154), error (linea 156), empty (`search_noResults` linea 213), populated, streaming install (linea 114-136), success/error post-stream. Falta: denied (vista Free).
* **Teclas:** Enter (buscar o navegar a package-info), `i` (install con confirm), `j/k` o flechas (scroll), Esc (cerrar resultados o cancelar stream linea 75).
* **i18n:** todas via `t()`. **Conforme**.
* **Gating:** Free.
* **Concurrencia:** `doSearch` (linea 41-59) no chequea `mountedRef`; si el usuario sale durante un `brew search` lento (3-5s en search libre) y la respuesta llega tarde, `setSearching(false)` y `setResults(...)` corren sobre componente desmontado. `useEffect` linea 61-66 con `hasRefreshed.current` evita dobles refresh, correcto. Stream sí soporta `cancel()` con Esc (linea 75).
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-S1 | `search` no esta en `VIEW_KEYS` de `use-keyboard.ts:7-18`, solo accesible via shortcut global `S` (`use-keyboard.ts:53`) o desde otra vista. Documentar al usuario en footer/help; no hay hint visible de la tecla `S`. | Baja | `use-keyboard.ts:7-18,53` |
| SCR-12-S2 | `doSearch` (linea 41) sin `mountedRef`: setStates post-unmount posibles. | Baja | `search.tsx:41-59` |
| SCR-12-S3 | `selectPackage(allVisible[cursor])` linea 93 sin tipo: ya documentado en `04-frontend.md:51`. | Baja | ver 04 |

### 12.1.4 OutdatedView

* **Ruta:** `src/views/outdated.tsx`
* **Responsabilidad:** Lista de paquetes desactualizados, upgrade individual o masivo, panel Impact Analysis (Pro).
* **Estados cubiertos:** loading (linea 148), error (linea 149), empty (`outdated_upToDate` linea 209), populated, streaming upgrade, success/error post-stream con hint `r:refresh esc:clear`. Confirmar single/all (`ConfirmDialog` linea 188).
* **Teclas:** `j/k` o flechas, Enter (upgrade single), `A` (upgrade all), `p` (pin/unpin), `r` (refresh), Esc (cancel stream linea 109).
* **i18n:** todas via `t()`. **Conforme**.
* **Gating:** vista Free; el panel Impact Analysis (linea 242) es Pro solamente en la lib (`getUpgradeImpact` lo internamente gates). La vista no diferencia visualmente, pero `getUpgradeImpact` retorna sin pintarse si no es Pro.
* **Concurrencia:** `fetchOutdated()` en mount; `useEffect` linea 89-105 con `useDebounce(cursor, 150)` hace fetch del impact analysis. **Falta `mountedRef`**: `setImpact`/`setImpactLoading` pueden llamarse tras unmount. `hasRefreshed.current` evita dobles refresh.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-O1 | `getUpgradeImpact` (linea 96) no se cancela cuando el cursor cambia rapido — dispara N fetches solapados; el debounce solo ayuda si las teclas paran ≥150ms. Una `AbortController` con cleanup en `useEffect` evitaria condiciones de carrera. | Media | `outdated.tsx:89-105` |
| SCR-12-O2 | Pin/unpin (linea 134-137) no muestra confirmacion ni feedback de exito; ya documentado en `05-ux.md:44`. | Baja | ver 05 |

### 12.1.5 PackageInfoView

* **Ruta:** `src/views/package-info.tsx`
* **Responsabilidad:** Detalle de un paquete (formula o cask) con acciones install/upgrade/uninstall.
* **Estados cubiertos:** sin paquete (linea 132), loading (linea 135), error (linea 136), not-found (linea 137), populated, streaming, success/error.
* **Teclas:** `i` (install si no instalado), `u` (uninstall si instalado), `U` (upgrade si outdated), Esc (cancel stream linea 114).
* **i18n:** todas via `t()`. **Conforme**.
* **Gating:** Free.
* **Concurrencia:** **Tiene `mountedRef`** (linea 38, 42-45) usado correctamente en `fetchInfo` (linea 92, 96), refresh post-stream (linea 107) y catch (linea 96). `hasRefreshed.current` evita dobles refresh. Buen ejemplo a replicar.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-P1 | `package-info` no esta en `VIEW_KEYS` (use-keyboard.ts:7-18). Solo se llega navegando desde Installed/Search/Outdated. **Esperado** — vista de detalle, no de nivel raiz. | Informativa | `use-keyboard.ts:7-18` |
| SCR-12-P2 | Conversion `CaskInfo`→`Formula`-shape (linea 52-93) ya marcada en `04-frontend.md:524`. | Baja | ver 04 |

### 12.1.6 ServicesView

* **Ruta:** `src/views/services.tsx`
* **Responsabilidad:** Gestion de daemons brew services.
* **Estados cubiertos:** loading (linea 72), error (linea 73), empty (linea 75-82), populated, action-in-progress (linea 151), confirm dialog (linea 91), persistent error (linea 154-158).
* **Teclas:** `j/k`, `r` (refresh), `s` (start), `x` (stop con confirm), `R` (restart con confirm).
* **i18n:** todas via `t()`. **Conforme**.
* **Gating:** Free.
* **Concurrencia:** `fetchServices()` en mount; `serviceAction` invoca via store con `setActionInProgress` y `lastError` locales. **Falta `mountedRef`**: setState dentro de `.finally` (linea 60-64) y de `onConfirm` (linea 107-111) puede dispararse tras unmount. La logica de leer `useBrewStore.getState().errors['service-action']` directamente desde el handler tambien se documenta en `04-frontend.md:523`.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Sv1 | Sin `mountedRef`; `setActionInProgress(false)` y `setLastError(...)` post-action pueden ejecutarse tras unmount. | Baja | `services.tsx:53-65,99-112` |
| SCR-12-Sv2 | Detectar `EACCES`/sudo en errores ya documentado `04-frontend.md:360`. | Media | ver 04 |

### 12.1.7 DoctorView

* **Ruta:** `src/views/doctor.tsx`
* **Responsabilidad:** Salida de `brew doctor` parseada como warnings.
* **Estados cubiertos:** loading (linea 27), error (linea 28), clean (linea 35), warnings-not-captured (linea 39), populated.
* **Teclas:** `r` (refresh).
* **i18n:** todas via `t()` + plural via `tp()`. **Conforme**.
* **Gating:** Free.
* **Concurrencia:** **Tiene `mountedRef`** (linea 16-19), pero curiosamente no se usa en ninguno de los call-sites — el ref se inicializa pero la unica fuente de setState es `fetchDoctor()` que pasa por el store. `mountedRef.current` queda como guard preventivo no consumido.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Dr1 | `mountedRef` declarado y mantenido (linea 14-19) pero nunca leido. Codigo muerto. | Informativa | `doctor.tsx:14-19` |

### 12.1.8 ProfilesView

* **Ruta:** `src/views/profiles.tsx` + 4 subcomponentes en `src/views/profiles/`
* **Responsabilidad:** Listar, crear, editar, importar y borrar perfiles de paquetes.
* **Estados cubiertos:** loading global (linea 129); modos: `list`, `detail`, `create-name`, `create-desc`, `edit-name`, `edit-desc`, `confirm-import`, `importing`. Cada modo tiene su propia vista. Falta: estado de error por crear/editar — `loadError` se muestra solo en create-desc/edit-desc.
* **Teclas (mode `list`):** `n` (new), `d` (delete con confirm), `i` (import), Enter (detail), `j/k`. **Mode `detail`:** Esc/`q` (back), `e` (edit). **Mode `importing`:** cualquier tecla cierra (linea 85-87).
* **i18n:** todas via `t()`. **Conforme**.
* **Gating:** Pro. **Gateado por router** (`app.tsx:40-47`). Internamente la vista llama `useLicenseStore.getState().isPro()` (lineas 92, 109) para pasarlo a `manager.loadProfile/importProfile` — defensa en profundidad correcta.
* **Concurrencia:** **Tiene `mountedRef`** (lineas 33, 37-44) y cancelacion del generador via `importGenRef.current?.return(undefined)` (linea 41). Patron robusto, **buena referencia**. La nota de `04-frontend.md:500` sobre el orden de los dos `useEffect` cleanup sigue valida.
* **Subcomponentes:**
  - **`profile-list-mode.tsx`**: pure render, sin estado propio, sin `useInput`. Recibe handlers. Conforme.
  - **`profile-detail-mode.tsx`**: pure render. Hint estatico en linea 36 con `esc/e/i`. Sin issues.
  - **`profile-create-flow.tsx`**: dos componentes (`ProfileCreateName`, `ProfileCreateDesc`) con `TextInput` uncontrolled. Sin validacion del nombre (e.g., evitar slashes/espacios). El `loadError` solo se renderiza en desc, pero un nombre invalido fallara despues de pedir descripcion.
  - **`profile-edit-flow.tsx`**: idem create flow, mismas observaciones.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Pr1 | Triple `useInput` (lineas 54, 73, 85) ya marcado en `04-frontend.md:54`. | Baja | ver 04 |
| SCR-12-Pr2 | `ProfileCreateName`/`ProfileEditName` no validan formato (slashes, vacios, longitud) — fallo se ve solo tras pedir descripcion. | Media | `profile-create-flow.tsx:11-21`, `profile-edit-flow.tsx:12-22` |
| SCR-12-Pr3 | Modo `importing` se cierra con cualquier tecla (linea 85-87) — al usuario se le pierde el ResultBanner si toca enter de inercia. | Baja | `profiles.tsx:85-87` |

### 12.1.9 SmartCleanupView

* **Ruta:** `src/views/smart-cleanup.tsx`
* **Responsabilidad:** Detectar paquetes huerfanos, seleccion multi-item y cleanup.
* **Estados cubiertos:** loading (linea 64), error (linea 65), system-clean (linea 141), populated, streaming, success, dependency-error con opcion de force.
* **Teclas:** `j/k`, `r` (refresh), Enter (toggle select), `a` (select all), `c` (clean con confirm), `F` (force tras dependency-error), Esc (cancel stream linea 41).
* **i18n:** todas via `t()`. **Conforme**.
* **Gating:** Pro. Gateado por router.
* **Concurrencia:** `analyze()` en mount sin `mountedRef`. Setstates locales (`failedNames`, `confirmClean`, `confirmForce`) en handlers; el stream usa `useBrewStream` que ya cancela bien. Falta cancel de `analyze()` si el usuario abandona durante un cleanup-analyzer largo.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Cl1 | Sin `mountedRef`; `analyze()` puede setstate post-unmount via store (seguro), pero `setFailedNames`/`setConfirmForce` en handlers async no estan protegidos. | Baja | `smart-cleanup.tsx:25-32,52` |
| SCR-12-Cl2 | El warning de "system tools" (linea 124) es estatico — no diferencia entre paquetes triviales (e.g., `tree`) y herramientas criticas (`coreutils`). Falsos positivos altos. | Informativa | `smart-cleanup.tsx:120-125` |

### 12.1.10 HistoryView

* **Ruta:** `src/views/history.tsx`
* **Responsabilidad:** Historial cronologico con filtros y replay.
* **Estados cubiertos:** loading (linea 101), error (linea 102), empty filtered (linea 162), empty global, populated, search-mode, confirm-clear, confirm-replay, streaming-replay.
* **Teclas:** `j/k`, `/` (search), `f` (cycle filter), `c` (clear con confirm), Enter (replay con confirm), Esc (cerrar busqueda).
* **i18n:** todas via `t()` + plural via `tp()`. **Conforme**.
* **Gating:** Pro. Gateado por router.
* **Concurrencia:** `fetchHistory()` en mount sin `mountedRef`. `clearHistory` y `stream.run` son async sin cleanup. El `ProgressLog` durante replay no se cierra automaticamente al terminar — el usuario debe presionar Esc (no documentado en hints).
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-H1 | Sin `mountedRef`. | Baja | `history.tsx:37-58` |
| SCR-12-H2 | `useStdout()` invocado en linea 104 **despues de los `if` de loading/error** (linea 101-102) — viola las reglas de React Hooks: el hook puede saltarse en algunos renders. | Alta | `history.tsx:101-105` |
| SCR-12-H3 | Tras un replay exitoso (linea 156-160), no hay hint visible para limpiar el log (`stream.clear()` no se invoca). | Baja | `history.tsx:156-160` |

### 12.1.11 SecurityAuditView

* **Ruta:** `src/views/security-audit.tsx`
* **Responsabilidad:** CVE scan via OSV.dev, lista por severidad, expandir detalle.
* **Estados cubiertos:** loading (linea 72), error con mensaje friendly de network (linea 75-78), populated, no-vulns banner (linea 106), confirm-upgrade, streaming, cache indicator.
* **Teclas:** `j/k`, Enter (toggle expand), `r` (rescan), `R` (navigate a rollback), `u` (upgrade con confirm).
* **i18n:** todas via `t()` + `tp()`. **Conforme**.
* **Gating:** Pro. Gateado por router.
* **Concurrencia:** `scan()` en mount sin `mountedRef`. La cobertura limitada del ecosistema Bitnami ya documentada en `04-frontend.md:361`.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Se1 | Sin `mountedRef`. | Baja | `security-audit.tsx:41-70` |
| SCR-12-Se2 | El collision entre `r` (rescan) y `R` (rollback nav) es solo distinguible por shift; documentado en lineas 56-59 pero no en footer global. Footer global muestra `r`/`R`? — verificar `footer.tsx`. | Informativa | `security-audit.tsx:56-59` |

### 12.1.12 RollbackView

* **Ruta:** `src/views/rollback.tsx`
* **Responsabilidad:** Lista de snapshots, plan de rollback, confirmacion y ejecucion.
* **Estados cubiertos:** loading (linea 175), error (linea 176), no-snapshots (linea 204), phases `list`, `plan`, `confirm`, `executing` (linea 178), `result` (linea 186).
* **Teclas (list):** `j/k`, Enter (selectSnapshot → plan), `r` (refresh). **plan:** Enter (→ confirm si canExecute), Esc. **result:** Esc/`r`. **executing:** ninguna (bloqueado).
* **i18n:** todas via `t()` + `tp()`. **Conforme**.
* **Gating:** Pro. Gateado por router. La vista pasa `isPro()` (linea 113, 121, 149, 168, 171) a la lib — defensa en profundidad correcta.
* **Concurrencia:** **Tiene `mountedRef`** (linea 103, 105-111) y cancelacion del generador `generatorRef.current?.return(undefined)` en cleanup. Patron solido.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-R1 | El emoji `⏪` (linea 202) no esta como escape `\u{...}` como otras vistas — formato inconsistente. | Informativa | `rollback.tsx:202` |
| SCR-12-R2 | `rollback` no esta en `VIEW_KEYS` — solo via Tab cycling o desde SecurityAudit. | Baja | `use-keyboard.ts:7-18` |

### 12.1.13 BrewfileView

* **Ruta:** `src/views/brewfile.tsx`
* **Responsabilidad:** Definir desired state, calcular drift, reconciliar.
* **Estados cubiertos:** loading (linea 170), error (linea 171), no-brewfile (linea 230), populated overview, creating, reconciling, result.
* **Teclas:** `n` (new), `r` (refresh), `c` (reconcile, sin confirm).
* **i18n:** parcialmente conforme. Cadenas hardcoded en ingles `"My Environment"` (linea 181, 183), `"✓ System is in sync with Brewfile"` (linea 70), `"Computing drift..."` (linea 261) — esta ultima ya documentada en `04-frontend.md:355`.
* **Gating:** Pro. Gateado por router. Llama `isPro()` para pasarlo a `reconcile`/`createFromCurrent`/`load`.
* **Concurrencia:** **Tiene `mountedRef`** (linea 88, 90-97) y cancelacion del generador. Patron solido.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-B1 | Reconciliacion sin `ConfirmDialog` ya marcada `04-frontend.md:357,546`. | Alta | ver 04 |
| SCR-12-B2 | Tres cadenas hardcoded en ingles: `"My Environment"` (`brewfile.tsx:181,183`), `"✓ System is in sync with Brewfile"` (linea 70), `"Computing drift..."` (linea 261). | Media | `brewfile.tsx:70,181,183,261` |
| SCR-12-B3 | `brewfile` no esta en `VIEW_KEYS`. Solo via Tab. | Baja | `use-keyboard.ts:7-18` |

### 12.1.14 SyncView

* **Ruta:** `src/views/sync.tsx`
* **Responsabilidad:** Sync via iCloud, resolucion de conflictos.
* **Estados cubiertos:** overview (con/sin config, con/sin conflictos), syncing (linea 250), conflicts, result. Falta: empty (no hay maquinas sincronizadas) — se mezcla con "sync_disabled".
* **Teclas (overview):** `s` (sync), `c` (conflictos o navigate a compliance segun lastResult), `r` (refresh). **conflicts:** `j/k`, `l` (use-local), `r` (use-remote), Enter (apply), Esc (back). **result:** Esc/`r`.
* **i18n:** parcialmente. Cadenas hardcoded en espanol `"j/k:navegar"`, `"aplicar"` (linea 127) ya en `04-frontend.md:356` y `05-ux.md:34`.
* **Gating:** Pro. Gateado por router. Llama `isPro()` para pasar a `initialize/syncNow`.
* **Concurrencia:** Sin `mountedRef`. `syncNow` (linea 158-172) hace `setSyncError`/`setPhase` post-await sin guard — leak de setState potencial. La cancelacion del fetch al backend de iCloud no esta expuesta. Apply de resoluciones (linea 174-185) sin confirmacion final ya marcada en `04-frontend.md:358` y `05-ux.md:37`.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Sy1 | Solapamiento de la tecla `c`: `c:conflicts` vs `c:check_compliance`. Si `lastResult.success && conflicts.length > 0` ambas condiciones evaluarian — el orden actual prioriza conflicts (linea 235), pero no esta documentado. | Media | `sync.tsx:235-243` |
| SCR-12-Sy2 | Sin `mountedRef`, multiples setStates async sin guard. | Media | `sync.tsx:158-185` |
| SCR-12-Sy3 | `sync` no esta en `VIEW_KEYS`. Solo via Tab. | Baja | `use-keyboard.ts:7-18` |

### 12.1.15 ComplianceView

* **Ruta:** `src/views/compliance.tsx`
* **Responsabilidad:** Cargar PolicyFile, calcular score y violaciones, remediar.
* **Estados cubiertos:** loading (linea 219), error (linea 244), no-policy (linea 268), policy-without-report (linea 287), report-compliant (linea 280), report-violations (linea 282), importing, remediating, result.
* **Teclas:** `i` (import), `r` (rescan), `e` (export report), `c` (remediate sin confirm).
* **i18n:** mayormente via `t()`. Detalles en ingles (`"(errors)"`, `"(warnings)"` lineas 60, 68 dentro de `<Text>`) anexados a strings traducidos — pequeno breakage de i18n.
* **Gating:** Team. Gateado por router. Llama `isPro()` (sic — debe ser team-aware en lib) para pasar al checker.
* **Concurrencia:** **Tiene `mountedRef`** (linea 88, 90-96) y cancelacion del generador. Patron solido. Pero `handleRecheck` (linea 112-114) llama `runCheck` sin `mountedRef.current` post-async.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Co1 | Remediation sin `ConfirmDialog` ya marcada en `04-frontend.md:359,548`. | Alta | ver 04 |
| SCR-12-Co2 | Importacion sin spinner (`05-ux.md:46`). | Baja | ver 05 |
| SCR-12-Co3 | Reconcile silencioso para `forbidden`/`extra` (`05-ux.md:47`). | Baja | ver 05 |
| SCR-12-Co4 | Strings ingles `"(errors)"`/`"(warnings)"` concatenados a cadenas traducidas (lineas 60, 68). | Media | `compliance.tsx:60,68` |
| SCR-12-Co5 | `compliance` no esta en `VIEW_KEYS`. | Baja | `use-keyboard.ts:7-18` |

### 12.1.16 AccountView

* **Ruta:** `src/views/account.tsx`
* **Responsabilidad:** Mostrar estado de licencia, deactivar, redimir promo.
* **Estados cubiertos:** validating (linea 47), free, pro, expired (linea 138), warning/limited (linea 85), confirm-deactivate, deactivating, deactivate-error, promo-mode (input + loading + result).
* **Teclas:** `d` (deactivate, solo si pro), `p` (promo).
* **i18n:** mayormente via `t()`. La placeholder `"BREW-XXXX-XXXX"` (linea 162) es ASCII estatico, no es problema. Hint final tiene formato manual.
* **Gating:** Free, sin gating interno.
* **Concurrencia:** Sin `mountedRef`. `deactivate` (linea 59-71) y `redeemPromoCode` (linea 167) hacen `setState` despues de awaits — puede correr post-unmount.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-A1 | Sin accion de `revalidate` en TUI ya documentada `05-ux.md:39`. | Media | ver 05 |
| SCR-12-A2 | Hint `d` solo se muestra para `status === 'pro'`, omitiendo team (`05-ux.md:42`). | Baja | ver 05 |
| SCR-12-A3 | Sin `mountedRef` en `deactivate`/`redeemPromoCode` async paths. | Baja | `account.tsx:59-71,163-177` |
| SCR-12-A4 | El degradation banner (linea 85) usa `Math.floor((Date.now() - new Date(license.lastValidatedAt)).getTime() ...)` — el `getTime()` esta despues del paréntesis de cierre y solo se llama sobre la diferencia, lo cual es matematicamente correcto pero ilegible. | Informativa | `account.tsx:88-89` |

---

## 12.2 Vistas SwiftUI (`menubar/BrewBar/Sources/Views/`)

> Notas comunes a SwiftUI: el catalog `menubar/BrewBar/Resources/Localizable.xcstrings` cubre los 15 literales mas frecuentes (verificado por `grep`). Las tres vistas leen `@Environment(\.legibilityWeight)` y `@Environment(\.colorSchemeContrast)` para Bold Text e Increase Contrast. Dynamic Type funciona automaticamente porque todos los `Text` usan `font(.body|.caption|.subheadline|...)`. Dark mode funciona porque ningun color es absoluto excepto los flags de color de version, que ya se documentan en 06-design-accessibility.md.

### 12.2.1 PopoverView

* **Ruta:** `menubar/BrewBar/Sources/Views/PopoverView.swift`
* **Responsabilidad:** Popover principal del menubar: header + contenido (loading/error/empty/list/services-error/basic-mode) + footer.
* **Estados cubiertos:** loading (linea 78), error (linea 87), empty/up-to-date (linea 107), populated (delega a `OutdatedListView`), services-error (linea 127), basic-mode/Pro-expirado (linea 194). Falta: empty inicial absoluto (sin `lastChecked`).
* **Keyboard / Focus:** ningun `keyboardShortcut` explicito. Botones (Refresh, Settings, Quit, Open Brew-TUI) son accesibles via Tab nativo de macOS. El sheet de Settings se cierra con su propio "Done" (`keyboardShortcut(.defaultAction)`).
* **VoiceOver:** `accessibilityHidden(true)` en iconos decorativos (mug, exclamation, check). `accessibilityAddTraits(.isHeader)` en titulos. `accessibilityLabel` explicito en botones (Refresh linea 72, Settings linea 180, Quit linea 188, Open Brew-TUI linea 164). Filas sin agrupar — ya en `06-design-accessibility.md:157`.
* **Dynamic Type:** todas las fuentes son sistema (`.headline`, `.caption`, `.body`). `legibilityWeight` se respeta (linea 53, 130). El `frame(minHeight: 420)` linea 40 puede clipar con tamanos AX5 — ya en `04-frontend.md:388`.
* **Dark mode / contraste:** `colorSchemeContrast` se chequea para `.green` (linea 112), `.orange` (linea 131). Falta para `.yellow` (linea 92), `.red` (linea 136, 146), `.orange` (linea 197, 201) — ya en `06-design-accessibility.md:38,224`.
* **i18n:** todas las cadenas usan `String(localized:)` o `Text("...")` con strings literales que el catalog cubre (verificado: "Homebrew Updates", "All packages up to date", "Service Errors", "Pro license expired", "Refresh", "Settings", "Quit", "Open Brew-TUI", "BrewBar Settings"). **Conforme**. La cadena de error `"Could not open Brew-TUI in your terminal app."` (linea 215) y la de NSAlert tambien usan `String(localized:)`.
* **Gating Pro:** La basicMode (linea 194) muestra solo "Pro license expired" sin CTA — `05-ux.md:45` ya lo recoge.
* **Concurrencia:** `refreshTask: Task<Void, Never>?` (linea 8) cancelado en `onDisappear` (linea 41). El issue de `04-frontend.md:501` (no se cancela la task previa antes de crear una nueva) sigue valido.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Pv1 | `makeLaunchScript()` linea 228-245 dentro de la vista — operacion de filesystem; ya en `04-frontend.md:526`. | Baja | ver 04 |
| SCR-12-Pv2 | Cuando `appState.canUpgrade == false` y la vista se renderiza con outdated packages, se muestra la lista pero los botones de upgrade muestran lock icon (delegado a `OutdatedListView`) y al final aparece la basicMode bar. Doble pista visual. | Informativa | `PopoverView.swift:32-36` + `OutdatedListView.swift:116-121` |

### 12.2.2 OutdatedListView

* **Ruta:** `menubar/BrewBar/Sources/Views/OutdatedListView.swift`
* **Responsabilidad:** Lista de paquetes outdated con boton de upgrade individual y "Upgrade All".
* **Estados cubiertos:** populated (siempre — solo se renderiza si hay packages segun `PopoverView`), pinned (icono pin linea 80), Pro-expirado (lock icon en lugar del boton upgrade linea 116). No hay loading propio — heredado del padre.
* **Keyboard:** botones nativos via Tab. `confirmationDialog` para Upgrade All (linea 30) y Upgrade single (linea 99) — manejo nativo de teclas.
* **VoiceOver:** `accessibilityAddTraits(.isHeader)` en el contador de updates (linea 20). `accessibilityHidden(true)` en flecha decorativa (linea 71). `accessibilityLabel` con el nombre del paquete en el boton upgrade (linea 96). Lock icon tiene `accessibilityLabel("Upgrade not available — Pro license required")` (linea 120) — buena UX VoiceOver. Pin icon con label "Pinned". Filas sin `.combine` — ya en `06-design-accessibility.md:157`.
* **Dynamic Type:** todas fuentes sistema. Mejorable con AX5 (filas pueden truncarse).
* **Dark mode / contraste:** `colorSchemeContrast` para installedVersion (linea 67) y currentVersion (linea 73). Pin icon `.orange` sin rama de contraste — `06-design-accessibility.md:38`.
* **i18n:** `String(format: String(localized: "%lld updates available"), ...)` (linea 16-17) — pluralizacion correcta. "Upgrade All", "Upgrade", "Cancel", "Pinned", "Upgrade %@", "Upgrade %@?", "Upgrade not available — Pro license required" — todos en catalog. **Conforme**.
* **Gating Pro:** `appState.canUpgrade` controla mostrar boton vs lock icon (linea 22, 88, 116). **Buena UX**: feedback visual y VoiceOver en el lock.
* **Concurrencia:** `upgradeTask: Task<Void, Never>?` cancelado en `onDisappear` (linea 56). El binding `packageToConfirm` para confirmation dialog tiene posible race con doble click rapido — ya en `04-frontend.md:502`.
* **Issues propios:** ninguno nuevo. Ver `06-design-accessibility.md:157, 224` y `04-frontend.md:502`.

### 12.2.3 SettingsView

* **Ruta:** `menubar/BrewBar/Sources/Views/SettingsView.swift`
* **Responsabilidad:** Sheet de configuracion (intervalo de check, notificaciones, launch at login).
* **Estados cubiertos:** populated (siempre). Estado de error: alert para Login Item Error (linea 73). Estado denied de notificaciones (`scheduler.notificationsDenied` linea 50).
* **Keyboard:** boton "Done" con `keyboardShortcut(.defaultAction)` (linea 85) → enter cierra. Picker, Toggles via Tab nativo.
* **VoiceOver:** `accessibilityAddTraits(.isHeader)` en titulo (linea 26). Picker, Toggles infieren label del texto (`Picker("Check interval", ...)`, `Toggle("Notifications", ...)`, `Toggle("Launch at login", $launchAtLogin)`) — `06-design-accessibility.md:158` recomienda label explicito.
* **Dynamic Type:** fuentes sistema. Form .grouped escala bien.
* **Dark mode / contraste:** texto de notificaciones denegadas con `colorSchemeContrast` (linea 53). **Conforme**.
* **i18n:** todas via `String(localized:)` o `Text("...")` cubierto por catalog ("BrewBar Settings", "Check interval", "Notifications", "Launch at login", "Login Item Error", "OK", "Done", "Notifications are disabled..."). **Conforme**.
* **Gating Pro:** no aplica.
* **Concurrencia:** `Task { await scheduler.syncNotificationPermission() }` en `.task` (linea 90) — auto-cancelable por SwiftUI. Toggle cambio dispara `Task` inline (linea 44) — no se cancela si la vista desaparece, pero la operacion es instantanea. **Conforme**.
* **Issues propios:**

| ID | Descripcion | Severidad | Ref |
|----|-------------|-----------|-----|
| SCR-12-Sv1-Sw | El init lee `SMAppService.mainApp.status == .enabled` sincrono en linea 17. En tests previews esta capado por `isRunningForPreviews`, pero en runtime real bloquea la creacion del view por unos millis. | Informativa | `SettingsView.swift:15-19` |

---

## 12.3 Matriz consolidada

> Leyenda: ✓ = conforme · △ = parcial / con notas · ✗ = no conforme · — = no aplica · gateado = `app.tsx` intercepta antes de renderizar

### TUI

| Vista | Estado coverage | a11y (terminal) | i18n | Gating Pro/Team | Concurrencia (mountedRef / cancel) |
|-------|------------------|-----------------|------|-----------------|------------------------------------|
| dashboard | ✓ loading/error/populated/parcial | — | ✓ | — (Free); panel Pro condicional | △ sin mountedRef (fetch al store, OK) |
| installed | ✓ + streaming + empty filtrado | — | ✓ | — | △ sin mountedRef; hint esc enganoso (SCR-12-I1) |
| search | ✓ + streaming | — | ✓ | — | △ sin mountedRef en doSearch (SCR-12-S2) |
| outdated | ✓ + impact panel | — | ✓ | — (Impact Pro inline) | △ sin mountedRef; sin abort en getUpgradeImpact (SCR-12-O1) |
| package-info | ✓ + streaming + not-found | — | ✓ | — | ✓ mountedRef bien usado |
| services | ✓ + persistent error + confirm | — | ✓ | — | △ sin mountedRef (SCR-12-Sv1) |
| doctor | ✓ | — | ✓ | — | △ mountedRef declarado pero no usado (SCR-12-Dr1) |
| profiles | ✓ multi-modo | — | ✓ | gateado; isPro() inline OK | ✓ mountedRef + gen.return; tres useInput (ver 04) |
| smart-cleanup | ✓ + force-after-error | — | ✓ | gateado | △ sin mountedRef (SCR-12-Cl1) |
| history | ✓ + replay + filter | — | ✓ | gateado | ✗ useStdout despues de early returns (SCR-12-H2) |
| security-audit | ✓ + cache indicator | — | ✓ | gateado | △ sin mountedRef |
| rollback | ✓ multi-fase | — | ✓ | gateado; isPro() inline OK | ✓ mountedRef + gen.return |
| brewfile | ✓ multi-fase | — | △ 3 strings hardcoded (SCR-12-B2) | gateado | ✓ mountedRef + gen.return; reconcile sin confirm (ver 04) |
| sync | ✓ multi-fase | — | △ "navegar"/"aplicar" hardcoded (ver 04/05) | gateado | △ sin mountedRef; collision tecla c (SCR-12-Sy1) |
| compliance | ✓ multi-fase | — | △ "(errors)"/"(warnings)" mezclados (SCR-12-Co4) | gateado | ✓ mountedRef + gen.return; rechck async sin guard |
| account | ✓ free/pro/expired/warning/limited | — | ✓ | — (Free) | △ sin mountedRef en deactivate/promo (SCR-12-A3) |

### SwiftUI

| Vista | Estado coverage | VoiceOver | Dynamic Type | Dark mode / contraste | i18n (catalog) | Gating Pro | Concurrencia |
|-------|------------------|-----------|--------------|-----------------------|----------------|------------|--------------|
| PopoverView | ✓ loading/error/empty/list/services-err/basic | △ filas sin combine (06) | △ minHeight 420 (04:388) | △ 4 colores sin contraste (06:38) | ✓ catalog cubre | △ basicMode sin CTA (05:45) | △ refreshTask no cancela previa (04:501) |
| OutdatedListView | ✓ populated/pinned/Pro-expirado | △ filas sin combine (06:157) | △ filas pueden truncar AX5 | △ pin sin contraste (06:38) | ✓ pluralizacion correcta | ✓ lock icon + VO label (linea 120) | △ packageToConfirm race (04:502) |
| SettingsView | ✓ + alert + denied notifications | △ Toggles sin label explicito (06:158) | ✓ | ✓ contraste implementado | ✓ | — | ✓ Task auto-cancela; init sincrono (SCR-12-Sv1-Sw) |

---

## 12.4 Resumen de severidades nuevas (no duplicadas con 04/05/06)

| Severidad | Cantidad | Ids |
|-----------|----------|-----|
| Critica | 0 | — |
| Alta | 1 | SCR-12-H2 (`useStdout` post early-return en HistoryView) |
| Media | 7 | SCR-12-D2 (ya en 04), SCR-12-I1, SCR-12-O1, SCR-12-Pr2, SCR-12-Sy1, SCR-12-Sy2, SCR-12-Co4 |
| Baja | 14 | SCR-12-D1, SCR-12-I2, SCR-12-S1, SCR-12-S2, SCR-12-O2 (ya en 05), SCR-12-Sv1, SCR-12-Cl1, SCR-12-H1, SCR-12-H3, SCR-12-Pr1 (ya en 04), SCR-12-Pr3, SCR-12-Se1, SCR-12-R2, SCR-12-B3, SCR-12-Sy3, SCR-12-A2 (ya en 05), SCR-12-A3, SCR-12-Co5, SCR-12-Pv1 (ya en 04) |
| Informativa | 7 | SCR-12-P1, SCR-12-Dr1, SCR-12-Cl2, SCR-12-Se2, SCR-12-R1, SCR-12-A4, SCR-12-Pv2, SCR-12-Sv1-Sw |

> Nota: el conteo deduplica los ids ya presentes en 04/05/06 (marcados con "ya en …").

## 12.5 Acciones recomendadas top 5 (ordenadas)

1. **SCR-12-H2 (Alta):** mover `useStdout()` arriba del early return en `HistoryView` para no violar las reglas de hooks.
2. **SCR-12-O1 (Media):** envolver `getUpgradeImpact` con `AbortController` y cleanup en `useEffect` para evitar fetches solapados.
3. **SCR-12-I1 (Media):** o eliminar el hint `esc:cancel` durante stream de uninstall en InstalledView, o implementar `stream.cancel()` en su `useInput`.
4. **SCR-12-Sy1 (Media):** documentar/desambiguar la tecla `c` en SyncView (conflictos vs compliance).
5. **SCR-12-Pr2 (Media):** validar nombre de perfil en `ProfileCreateName` antes de pasar a la fase de descripcion para evitar fallos tardios.

---

> Pantallas auditadas: 16 TUI + 3 SwiftUI = **19 pantallas** revisadas. Cero pantallas declaradas en el inventario que no se hayan podido localizar.
