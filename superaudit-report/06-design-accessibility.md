# 7. Design System

> Auditor: design-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

El proyecto Brew-TUI tiene un sistema de tokens bien definido para el stack TUI (colores semanticos en `colors.ts`, espaciado en `spacing.ts`) y una capa de tema en BrewBar con adaptacion a contraste elevado y Bold Text. Las principales carencias son la ausencia de soporte Reduce Motion en ambos stacks, un alto fijo en `SettingsView` que rompe Dynamic Type en accesibilidad, y una desviacion puntual de breakpoints en `dashboard.tsx`. La cobertura de localizacion es del 100% en ambos stacks.

---

## 7.1 Tokens

### Checklist

* [x] Colores semanticos definidos — `DARK_PALETTE` y `LIGHT_PALETTE` con 20 tokens nombrados en `src/utils/colors.ts`
* [x] Soporte NO_COLOR — `isNoColorRequested()` colapsa todos los tokens a cadena vacia; `GradientText` verifica `NO_COLOR` antes de emitir ANSI
* [x] Deteccion de tema claro/oscuro — `detectTheme()` via `COLORFGBG` y override `BREW_TUI_THEME`
* [x] Tipografia por roles — Ink no expone escala tipografica propia; el stack TUI usa atributos `bold`/`color` de `<Text>` de forma consistente
* [x] Espaciado tokenizado — `SPACING = {none, xs, sm, md, lg, xl, xxl}` en `src/utils/spacing.ts`; los componentes de layout lo consumen
* [x] Breakpoints centralizados — `BREAKPOINTS = {narrow:50, mid:80, wide:120}` con `getLayoutMode()` como API publica
* [ ] Breakpoints usados de forma consistente — **Media**: `dashboard.tsx` usa el literal `60` en lugar de un valor de `BREAKPOINTS`, creando un punto de ruptura no documentado
* [x] Radios consistentes — No aplica en Ink (terminal); en BrewBar usa `cornerRadius` nativo de SwiftUI Form/Section
* [x] Tokens de elevacion — No aplica en entorno terminal; BrewBar delega sombras al sistema macOS
* [ ] Motion tokens definidos — **Alta**: ninguno de los dos stacks define tokens de duracion/curva de animacion; `BlinkingText` usa 600 ms literal; sin `@Environment(\.accessibilityReduceMotion)` en BrewBar

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Magic number en dashboard | No conforme | Media | `src/views/dashboard.tsx` linea 161: `const isNarrow = columns < 60` — no corresponde a ningun valor de `BREAKPOINTS` (`narrow=50`, `mid=80`) | Reemplazar por `getLayoutMode(columns)` o comparar contra `BREAKPOINTS.mid` |
| Motion tokens ausentes | No conforme | Alta | `src/components/common/blinking-text.tsx`: `setInterval(..., intervalMs)` con valor por defecto 600; sin consultar NO_COLOR ni reduce-motion | Definir constante de duracion; detener/pausar cuando NO_COLOR o reduce-motion esten activos |
| BrewBarTheme limitado | Parcial | Baja | `menubar/BrewBar/Sources/Views/Theme.swift`: solo 5 funciones de color; variantes high-contrast usan `Color(red:green:blue:)` crudo sin nombre semantico | Ampliar a tokens con nombre completo para facilitar auditoria de contraste futura |

---

## 7.2 Componentes base

### Checklist

**Stack TUI (Ink)**

* [x] Button — Ink no tiene primitiva; `<Text>` con color de acento + hints de footer actuan como botones; patron consistente
* [x] TextField — `@inkjs/ui TextInput` con `defaultValue`/`onChange`/`onSubmit`; envuelto en `<SearchInput>`
* [x] SearchBar — `src/components/common/search-input.tsx` reutilizable
* [x] Row seleccionable — `src/components/common/selectable-row.tsx` con cursor resaltado
* [x] Banner de resultado — `src/components/common/result-banner.tsx` para exito/error
* [x] Loading indicator — `src/components/common/loading.tsx` + `<Spinner>` de `@inkjs/ui`
* [x] Empty state — `src/components/common/` — presente como estado vacio en vistas (inline)
* [x] Error state — Gestionado por `<ResultBanner>` y mensajes de error en las vistas
* [x] StatCard — `src/components/common/stat-card.tsx`
* [x] SectionHeader — `src/components/common/section-header.tsx`
* [x] ProgressLog — `src/components/common/progress-log.tsx` para operaciones en streaming
* [x] ConfirmDialog — `src/components/common/confirm-dialog.tsx` con soporte i18n

**Stack BrewBar (SwiftUI)**

* [x] PopoverView — contenedor principal, `minWidth/maxWidth: 340`
* [x] OutdatedListView — lista con `LazyVStack` + `ScrollView`
* [x] SettingsView — `Form` + `ScrollView` con `formStyle(.grouped)`
* [x] Row de paquete — view inline en `OutdatedListView` con combine de accesibilidad
* [x] Badge de menu bar — `updateBadge()` en `AppDelegate`
* [ ] Toast/Banner — **Baja**: no existe componente de banner/toast reutilizable en BrewBar; los mensajes de error se muestran via `NSAlert`
* [ ] Empty state — **Baja**: no existe componente de estado vacio; la lista vacia se gestiona con condicionales inline
* [ ] Skeleton/Placeholder — **Baja**: no existe estado de carga esqueletico en ninguno de los dos stacks (el TUI usa `<Spinner>`)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Toast/Banner BrewBar ausente | No conforme | Baja | Sin componente reutilizable para notificaciones in-app en BrewBar; errores de revalidacion van a `@State revalidationError` + `.alert` | Crear `InlineMessageView` reutilizable para mensajes transitorios |
| Empty state BrewBar ausente | No conforme | Baja | `OutdatedListView` condiciona inline sin estado vacio dedicado | Extraer a componente `EmptyStateView` para consistencia visual |
| StatCard usa `useTerminalSize()` | No conforme | Baja | `src/components/common/stat-card.tsx` linea 10: `useTerminalSize()` en vez de `useContainerSize(ref)` — viola convencion de `CLAUDE.md` | Migrar a `useContainerSize(ref)` para que sea correcto si el componente se reparenta |

---

## 7.3 Calidad del sistema visual

### Checklist

* [x] Variantes definidas — `COLORS` expone paletas dark/light; `StatusBadge` tiene 5 variantes con icono + color
* [x] Estado disabled representado — Ink: color `muted`; BrewBar: `.disabled()` nativo de SwiftUI
* [x] No hay overrides locales injustificados — Ningun archivo de vista usa hex crudo; todos consumen `COLORS`
* [x] Componentes encapsulan estilo — `StatusBadge`, `SelectableRow`, `ResultBanner` etc. poseen su propio estilo
* [x] Nombres semanticos — Tokens como `success`, `warning`, `error`, `muted`, `accent` son descriptivos
* [x] Dark mode TUI consistente — Deteccion automatica por `COLORFGBG` + override; todos los tokens cambian de paleta
* [x] Dark mode BrewBar consistente — `isTemplate: true` en icon; colores del sistema macOS adaptativos; `BrewBarTheme` acepta `highContrast`
* [x] Contraste suficiente (BrewBar) — `BrewBarTheme.critical` usa rojo saturado; variantes `highContrast` aumentan saturacion
* [ ] `BlinkingText` sin adaptacion a NO_COLOR/reduce-motion — **Alta**: el componente titila siempre, sin respetar preferencias del sistema ni `NO_COLOR`
* [ ] `SectionHeader` emoji sin fallback ASCII — **Baja**: el prop `emoji` no tiene alternativa para terminales que no soporten Unicode extendido
* [ ] `SettingsView` alto fijo — **Media**: `.frame(width: 360, height: 540)` en `SettingsView` corta el contenido con Dynamic Type AX1+

### Auditoria de componentes

| Componente | Variantes | Estados | Accesible | Reutilizable | Hallazgo |
|------------|-----------|---------|-----------|--------------|----------|
| `StatusBadge` | 5 (success/warning/error/info/muted) | — | Si (icono + color) | Si | Conforme |
| `SelectableRow` | 1 (cursor highlight) | selected/unselected | Parcial (no label AT en Ink) | Si | Sin label de accesibilidad AT en terminal |
| `ResultBanner` | 2 (success/error) | — | Si (texto explicito) | Si | Conforme |
| `GradientText` | — | normal/NO_COLOR | Si (texto plano en NO_COLOR) | Si | Conforme |
| `BlinkingText` | — | bright/dim | No (sin reduce-motion) | Si | No respeta NO_COLOR ni reduce-motion |
| `StatCard` | — | — | Parcial | Si | Usa `useTerminalSize()` en vez de `useContainerSize` |
| `SectionHeader` | — | — | Parcial | Si | Emoji sin fallback ASCII |
| `ConfirmDialog` | — | — | Si (i18n `s`/`y`) | Si | Conforme |
| `SearchInput` | — | — | Si | Si | Conforme |
| `ProgressLog` | — | — | Si (texto streaming) | Si | Conforme |
| `PopoverView` (BrewBar) | — | loading/content/error | Si (labels, traits, combine) | No aplica | Conforme |
| `OutdatedListView` (BrewBar) | — | vacio/lista | Si (combine, labels por paquete) | No aplica | Conforme |
| `SettingsView` (BrewBar) | — | — | Parcial | No aplica | Alto fijo 540pt rompe Dynamic Type AX1+ |
| `Badge menu bar` (BrewBar) | — | — | Si (`accessibilityDescription` dinamico) | No aplica | Conforme |

---

# 8. Accesibilidad

## 8.1 Semantica

### Checklist

**BrewBar (SwiftUI — AT aplica)**

* [x] `.accessibilityLabel` en elementos interactivos — Todos los botones de icono tienen label localizado
* [x] `.accessibilityValue` — `Toggle` y `Picker` en `SettingsView` usan el sistema nativo de SwiftUI (valor leido automaticamente)
* [x] `.accessibilityHint` — No requerido en este nivel de complejidad; ausencia no es una no conformidad
* [x] Traits correctos — `.isHeader` en `headerView` de `PopoverView`; `.isButton` inferido por `Button`
* [x] Agrupacion logica — `.accessibilityElement(children: .combine)` en rows de paquete y `versionFooter`
* [x] Imagenes decorativas ocultas — `Image(systemName:)` decorativos tienen `.accessibilityHidden(true)`
* [x] `accessibilityDescription` del icono de menu bar — Actualizado dinamicamente con recuento de badges

**TUI Ink (VoiceOver no aplica; terminal screen reader)**

* [x] Texto explicito en todos los estados — Sin iconos solos; siempre acompanados de texto o label
* [x] Daltonismo — `StatusBadge` combina icono Unicode + color; sin dependencia exclusiva de color
* [x] i18n completa — `es.ts` tipada como `Translations`; cobertura 100% comprobada en compilacion

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `accessibilityIdentifier` ausente en pruebas BrewBar | Parcial | Baja | No hay tests UI en BrewBar (`BrewBarTests` vacio); sin `.accessibilityIdentifier` en los controles clave | Anadir identificadores para preparar pruebas UI automatizadas futuras |

---

## 8.2 Interaccion

### Checklist

**BrewBar**

* [x] Tamano de toque — Controles en Form/Section usan dimensiones nativas macOS (minimo 22pt implicito en menu bar; botones de Form cumplen HIG)
* [x] Navegacion con VoiceOver — Estructura logica: header → lista → footer; agrupacion con `.combine` evita lectura de subelementos
* [x] Navegacion con Voice Control — Todos los botones interactivos tienen `.accessibilityLabel` localizado
* [x] Inputs etiquetados — `Toggle`, `Picker`, `TextField` en `SettingsView` usan el label nativo de SwiftUI Form
* [x] Acciones de teclado — `Button("Done").keyboardShortcut(.defaultAction)` en `SettingsView`
* [ ] Acciones de accesibilidad personalizadas — **Baja**: `OutdatedListView` expone accion "Upgrade" solo como boton visible; no hay `.accessibilityAction` alternativa para usuarios que usan solo VoiceOver sin tap

**TUI Ink**

* [x] Navegacion por teclado completa — Todas las acciones accesibles via teclado; sin dependencia de raton
* [x] Hints de footer numerados — `VIEW_HINT_DEFS` con atajos numericos y letras legacy
* [x] `useViewInput` obligatorio — Todas las vistas usan el wrapper que suprime handlers durante `menuMode`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin `.accessibilityAction` en filas de paquete | Parcial | Baja | `OutdatedListView`: la accion de upgrade es solo un boton visible; sin accion AT custom para modos de navegacion alternativa | Agregar `.accessibilityAction(named: "Upgrade")` a la fila agrupada |

---

## 8.3 Adaptaciones del sistema

### Checklist

**BrewBar (SwiftUI)**

* [x] Bold Text — `@Environment(\.legibilityWeight)` en `PopoverView` y `SettingsView`; ajusta `.fontWeight` del titular principal
* [x] Increase Contrast — `@Environment(\.colorSchemeContrast)` en `PopoverView` y `SettingsView`; `BrewBarTheme` acepta `highContrast: Bool` en todas sus funciones de color
* [x] Dark Mode — `isTemplate: true` en el icono de menu bar; colores del sistema adaptativos en `Form`/`Section`
* [ ] Reduce Motion — **Alta**: ninguna vista de BrewBar consulta `@Environment(\.accessibilityReduceMotion)` ni `UIAccessibility.isReduceMotionEnabled`; no hay animaciones propias registradas en codigo de produccion (el archivo `BrewBarDesignVariants.swift` esta bajo `#if DEBUG`)
* [ ] Reduce Transparency — **Baja**: no se consulta `@Environment(\.accessibilityReduceTransparency)`; BrewBar no usa materiales `.ultraThinMaterial` ni blur propios (usa `NSPopover` del sistema), por lo que el impacto es bajo
* [ ] Dynamic Type — **Media**: `SettingsView` tiene `.frame(width: 360, height: 540)` — el ancho fijo 360pt es aceptable en macOS, pero el alto fijo 540pt impide que el contenido crezca con Dynamic Type AX1+

**TUI Ink**

* [x] NO_COLOR — `isNoColorRequested()` desactiva toda salida ANSI; tokens colapsan a cadena vacia; `GradientText` usa rama sin color
* [x] Deteccion de tema — `detectTheme()` + `BREW_TUI_THEME` override
* [ ] Reduce Motion (TUI) — **Alta**: `BlinkingText` titila siempre a 600 ms; sin comprobacion de variable de entorno equivalente (`NO_BLINKING`, `TERM_PROGRAM`, etc.)
* [x] Responsive layout — `BREAKPOINTS` + `getLayoutMode()`; header y footer se adaptan a `rows`/`columns`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `BlinkingText` sin reduce-motion | No conforme | Alta | `src/components/common/blinking-text.tsx`: `setInterval(() => setBright(b => !b), intervalMs)` sin ninguna condicion; no consulta `NO_COLOR`, `TERM` ni env var de preferencia | Detener el intervalo cuando `NO_COLOR` este activo o exponer prop `disableAnimation`; documentar env var de opt-out |
| `SettingsView` alto fijo 540pt | No conforme | Media | `menubar/BrewBar/Sources/Views/SettingsView.swift` linea 77: `.frame(width: 360, height: 540)` — con Dynamic Type AX2+ la seccion License puede quedar cortada | Cambiar a `.frame(width: 360, minHeight: 500)` y eliminar el maximo fijo; o usar `fixedSize` con `ScrollView` ya presente |
| Reduce Motion BrewBar no verificado | No conforme | Alta | Ninguna de las vistas en `menubar/BrewBar/Sources/Views/` consulta `@Environment(\.accessibilityReduceMotion)`; si se anadiesen animaciones en el futuro no habria gate | Anadir comprobacion preventiva en `PopoverView` y documentar patron de uso |
| `@Environment(\.accessibilityReduceTransparency)` ausente | No conforme | Baja | BrewBar usa `NSPopover` (blur del sistema); si se añade `.ultraThinMaterial` en el futuro no habra soporte | Anadir en `PopoverView` como placeholder comentado para uso futuro |

---

## 8.4 Media y contenido

### Checklist

**Imagenes**

* [x] Imagenes decorativas ocultas — `PopoverView` y `OutdatedListView`: todos los `Image(systemName:)` puramente decorativos tienen `.accessibilityHidden(true)`
* [x] Icono de menu bar con descripcion — `button.image?.accessibilityDescription` actualizado en cada ciclo de badge con texto localizado
* [x] `MenuBarIcon` como template — `isTemplate = true`; macOS adapta automaticamente tint en dark/light
* [x] TUI: sin imagenes binarias — Todo el contenido es texto/ANSI; no hay assets graficos en el TUI

**Video y audio**

* [x] Sin contenido de video — No aplica
* [x] Sin contenido de audio — No aplica

**Texto alternativo**

* [x] `Label` con `systemImage` en BrewBar — Todos los `Label(String(localized:), systemImage:)` incluyen texto localizado como parte del label compuesto
* [x] Badges de menu bar — `accessibilityDescription` dinamico con descripcion textual completa del estado (e.g., `"BrewBar — 3↑, 1⚠"`)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SectionHeader` emoji sin fallback | No conforme | Baja | `src/components/common/section-header.tsx`: prop `emoji` renderea el caracter directamente; terminales antiguas o SSH sin UTF-8 pueden mostrar `?` o caja vacia | Verificar `process.env.TERM` o exponer prop `asciiIcon` como fallback |

---

## Registro de accesibilidad por pantalla

### TUI Brew-TUI (Ink — terminal)

| Pantalla | VoiceOver | Dynamic Type | Contraste | Reduce Motion | Hallazgo |
|----------|-----------|--------------|-----------|---------------|----------|
| Dashboard | No aplica | No aplica | Conforme (tokens semanticos) | No conforme | Magic number `columns < 60`; `BlinkingText` en logo sin gate |
| Installed | No aplica | No aplica | Conforme | No conforme | `BlinkingText` heredado del header |
| Outdated | No aplica | No aplica | Conforme | No conforme | `BlinkingText` en header global |
| Services | No aplica | No aplica | Conforme | No conforme | Idem |
| Search | No aplica | No aplica | Conforme | No conforme | Idem |
| Security Audit | No aplica | No aplica | Conforme | No conforme | `SEVERITY_BADGE` usa icono+color; sin dependencia solo de color |
| Profiles | No aplica | No aplica | Conforme | No conforme | Idem BlinkingText |
| Smart Cleanup | No aplica | No aplica | Conforme | No conforme | Idem |
| History | No aplica | No aplica | Conforme | No conforme | Idem |
| WelcomeView | No aplica | No aplica | Conforme | No conforme | `BlinkingText` prominente; primera pantalla que ve el usuario |

### BrewBar (SwiftUI macOS)

| Pantalla | VoiceOver | Dynamic Type | Contraste | Reduce Motion | Hallazgo |
|----------|-----------|--------------|-----------|---------------|----------|
| PopoverView | Conforme | Conforme | Conforme | No conforme | Bold Text y Increase Contrast implementados; Reduce Motion no verificado |
| OutdatedListView | Conforme | Conforme | Conforme | No conforme | `.combine` correcto por fila; sin `.accessibilityAction` alternativa |
| SettingsView | Conforme | Parcial | Conforme | No conforme | Alto fijo `.frame(height: 540)` corta contenido en AX1+; Reduce Motion no verificado |
| Alertas NSAlert (startup) | Parcial | No aplica | Conforme | No aplica | NSAlert es modal del sistema; sin accesibilidad custom; aceptable |
| Icono menu bar | Conforme | No aplica | Conforme | No aplica | `isTemplate`, `accessibilityDescription` dinamico; CONFORME |
