# 7. Design System

> Auditor: design-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto presenta dos subsistemas de diseno claramente diferenciados: la TUI en TypeScript/Ink con tokens de color centralizados pero un sistema de espaciado definido y completamente ignorado, y la app de menu bar en SwiftUI con colores semanticos parcialmente aplicados y adaptaciones de accesibilidad bien iniciadas pero incompletas. La accesibilidad de la TUI esta estructuralmente limitada por la ausencia de soporte para `NO_COLOR`, tema oscuro exclusivo documentado como limitacion conocida, y la imposibilidad de ofrecer etiquetas de accesibilidad en un entorno terminal. BrewBar implementa correctamente las adaptaciones clave de macOS (Dynamic Type, Bold Text, VoiceOver) con fallos menores en ramas de contraste alto y un error de asignacion de apariencia en el asset del icono de menu bar.

---

## 7.1 Tokens

### Checklist

* [x] Colores semanticos definidos y centralizados (TUI: `src/utils/colors.ts`, 16 tokens con nombres semanticos)
* [x] Colores usados de forma consistente en vistas y componentes TUI — sin hex en produccion fuera de `gradient.tsx`
* [ ] Tokens de gradiente no provienen de COLORS — **Media**: `GRADIENTS` en `src/utils/gradient.tsx` usa hex crudos desvinculados de `COLORS`
* [x] Tokens de espaciado definidos (`src/utils/spacing.ts`: xs=1, sm=2, md=3, lg=4, xl=6, xxl=8)
* [ ] Tokens de espaciado adoptados en vistas — **Alta**: `SPACING` nunca se importa; 165+ valores numericos crudos en vistas y componentes
* [ ] Soporte de tema claro / alto contraste en TUI — **Media**: solo tema oscuro; limitacion documentada en `colors.ts:7-9`
* [ ] Soporte `NO_COLOR` — **Alta**: no implementado; la app ignora la variable de entorno estandar
* [x] Tipografia en TUI: no aplica (gestionada por el terminal); componentes usan `bold`, `color` via tokens
* [x] BrewBar: colores semanticos del sistema usados como base (`Color.green`, `Color.orange`, `.primary`, `.secondary`)
* [ ] BrewBar: colores de contraste alto incompletos — **Media**: 5 usos de color en produccion carecen de rama `colorSchemeContrast == .increased`
* [ ] BrewBar: sin sistema de tokens de espaciado — **Baja**: magic numbers en padding (4, 6, 8, 10, 12, 16) sin constantes centralizadas
* [x] BrewBar: tipografia usa estilos de texto del sistema (`.headline`, `.caption`, `.body`, `.subheadline`) — compatible con Dynamic Type
* [ ] BrewBar: `AccentColor.colorset` sin variante dark mode — **Baja**: una sola apariencia definida
* [ ] BrewBar: `StatCard` default `color='white'` en TUI — **Baja**: prop default usa literal `'white'` en lugar de `COLORS.white`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SPACING` tokens nunca usados | No conforme | Alta | `src/utils/spacing.ts` definido; `grep -r 'SPACING' src/views src/components` = 0 resultados; 165 valores numericos crudos en vistas | Migrar padding/margin/gap a `SPACING.xs/sm/md/lg/xl/xxl`; forzar con regla ESLint `no-magic-numbers` |
| `NO_COLOR` no soportado | No conforme | Alta | `src/utils/colors.ts:1-40`; no hay rama `process.env.NO_COLOR` en ningun punto de arranque | Verificar `NO_COLOR` en `src/app.tsx` o `src/utils/colors.ts`; retornar objeto con todos los valores en `''` cuando esta activo |
| Tema oscuro exclusivo | Parcial | Media | `src/utils/colors.ts:7-9`: comentario "Light/high-contrast theme support is not yet implemented" | Backlog: anadir variante de tokens para terminal claro; evaluar `TERM_PROGRAM` y `COLORTERM` |
| `GRADIENTS` hex desvinculados de COLORS | No conforme | Media | `src/utils/gradient.tsx:60-68`: `gold: ['#FFD700','#FFA500','#B8860B']`; `COLORS.gold = '#B8860B'` — valores parcialmente solapados pero no referenciados | Derivar GRADIENTS desde `COLORS.gold`, `COLORS.brand`, etc., o mapear explicitamente |
| BrewBar contraste alto incompleto | No conforme | Media | `PopoverView.swift:92` `.yellow`; lineas 136, 146 `.red`; lineas 197, 201 `.orange`; `OutdatedListView.swift:83` `.orange` (icono pin) — sin rama `colorSchemeContrast == .increased` | Anadir ternario `colorSchemeContrast == .increased ? Color(red:...) : Color.xxx` o usar `Color(.systemYellow/.systemRed/.systemOrange)` que el sistema adapta automaticamente |
| Colores locales no centralizados (BrewBar) | No conforme | Baja | `OutdatedListView.swift:10-11`: `let installedVersionColor = Color.orange` y `let currentVersionColor = Color.cyan` — constantes locales duplicadas | Mover a un archivo `Theme.swift` con tokens reutilizables |
| AccentColor sin variante dark mode | No conforme | Baja | `Assets.xcassets/AccentColor.colorset/Contents.json`: una sola apariencia (Any) | Agregar entrada `"appearances": [{"appearance": "luminosity", "value": "dark"}]` con color adaptado |
| `StatCard` default `color='white'` | No conforme | Baja | `src/components/common/stat-card.tsx`: prop `color = 'white'` — literal en lugar de `COLORS.white` | Cambiar a `color = COLORS.white` para mantener consistencia semantica |
| Sin tokens de espaciado en BrewBar | No conforme | Baja | `PopoverView.swift`, `OutdatedListView.swift`, `SettingsView.swift`: padding/spacing con literales 4, 6, 8, 10, 12, 16 | Crear `enum Spacing { static let xs: CGFloat = 4; ... }` en `DesignSystem/Tokens.swift` |

---

## 7.2 Componentes base

### Checklist

**TUI (TypeScript / Ink)**

* [x] `StatusBadge` — componente reutilizable con icono+texto y colores semanticos
* [x] `StatCard` — tarjeta de estadisticas con titulo, valor y color configurable
* [x] `ProgressLog` — log de streaming con limite de lineas configurable
* [x] `ConfirmDialog` — dialogo de confirmacion destructiva con soporte i18n (y/Y/s/S)
* [x] `Loading` — indicador de carga (Spinner de @inkjs/ui)
* [x] `ResultBanner` — banner exito/error estandarizado
* [x] `SelectableRow` — fila con cursor resaltado y estado seleccionado
* [x] `SearchInput` — campo de busqueda con emoji 🔍
* [x] `SectionHeader` — cabecera de seccion
* [x] `ProBadge` — etiqueta de caracteristica Pro
* [x] `UpgradePrompt` — pantalla de bloqueo para vistas Pro
* [x] `VersionArrow` — indicador de version antigua → nueva
* [ ] `EmptyState` dedicado — **Baja**: no existe componente unificado; cada vista renderiza su propio mensaje vacio con patrones distintos
* [ ] `ErrorState` dedicado — **Baja**: no existe componente unificado; manejo de error inline en cada vista
* [ ] `Skeleton` / placeholder de carga — **Baja**: no existe; la TUI usa `<Spinner>` y en algunos casos vacio

**BrewBar (SwiftUI)**

* [x] Botones de accion principales (`.buttonStyle(.borderedProminent)` / `.bordered`)
* [x] Icono de menu bar con `isTemplate = true` y descripcion de accesibilidad
* [x] Filas de paquetes con `contentShape(Rectangle())` para target de toque extendido
* [x] Dialogo de requisito de Brew-TUI (`NSAlert` con `.critical`)
* [x] Alerta de licencia expirada (`NSAlert` con `.warning`)
* [ ] `Card` o contenedor de seccion reutilizable — **Baja**: no existe; cada vista define su propio `GroupBox` o `VStack` ad-hoc
* [ ] `EmptyState` reutilizable — **Baja**: no existe en BrewBar
* [ ] `Skeleton` / estado de carga — **Baja**: `ProgressView()` ad-hoc en `PopoverView`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| EmptyState no unificado (TUI) | No conforme | Baja | Vistas como `installed`, `outdated`, `services` renderizan texto vacio inline sin componente comun | Crear `<EmptyState label={...} />` en `src/components/common/` |
| ErrorState no unificado (TUI) | No conforme | Baja | Manejo de error inline en cada vista; patrones distintos de formato y color | Crear `<ErrorState message={...} />` reutilizable |
| Sin Skeleton en TUI | No conforme | Baja | Carga mostrara pantalla en blanco o spinner sin estructura visual | Evaluar `<Box>` de placeholder con `COLORS.border` mientras se carga |
| Card/GroupBox no unificado (BrewBar) | No conforme | Baja | `PopoverView.swift`, `SettingsView.swift` usan patrones de agrupacion distintos | Crear `CardView` o extension de `GroupBox` con estilo estandar |

---

## 7.3 Calidad del sistema visual

### Checklist

* [x] Nombres semanticos en tokens de color TUI (`success`, `error`, `warning`, `brand`, `muted`, `textSecondary`, etc.)
* [x] Componentes TUI encapsulan su propio estilo (no se aplican estilos externamente al componente)
* [x] Dark mode en BrewBar: sistema de colores de SwiftUI es adaptativo por defecto
* [x] Iconografia BrewBar: SF Symbols usados consistentemente (`arrow.clockwise`, `gear`, `xmark`, `lock`, `bell`)
* [x] Estados hover/focus/pressed en BrewBar: SwiftUI los gestiona automaticamente en componentes nativos
* [ ] Overrides locales injustificados — **Media**: `OutdatedListView.swift:10-11` constantes de color locales que deberian ser tokens centrales
* [ ] Variantes de componentes TUI documentadas — **Baja**: sin documentacion de variantes; variantes implicitas en props
* [ ] Contraste suficiente en TUI — **Baja**: imposible garantizar en terminal sin conocer el tema del emulador; `colors.ts:7-9` documenta la limitacion
* [ ] MenuBarIcon luminosidad invertida — **Media**: `Contents.json` asigna archivos `menubar_dark@` a apariencia por defecto y `menubar_light@` a luminosity=dark

### Auditoria de componentes

| Componente | Variantes | Estados | Accesible | Reutilizable | Hallazgo |
|------------|-----------|---------|-----------|--------------|----------|
| `StatusBadge` (TUI) | badge de color+icono por tipo | N/A (display) | Si — icono+texto diferencia sin color | Si | Conforme |
| `StatCard` (TUI) | color configurable | N/A (display) | Parcial — default `'white'` sin COLORS.white | Si | Baja: prop default literal |
| `ProgressLog` (TUI) | maxLines configurable | N/A (display) | Si | Si | Conforme |
| `ConfirmDialog` (TUI) | destructive/default | idle/waiting | Si — i18n de teclas confirmacion | Si | Conforme |
| `Loading` (TUI) | label configurable | animado | Parcial — Spinner sin label semantico para lectores | Si | Baja: sin texto alternativo |
| `ResultBanner` (TUI) | success/error | visible/oculto | Si — usa COLORS.success/error | Si | Conforme |
| `SelectableRow` (TUI) | cursor/no-cursor | selected/idle | Parcial — sin accessibilityLabel TUI | Si | Conforme para TUI |
| `SearchInput` (TUI) | — | focused/idle | Parcial — emoji 🔍 sin alternativa | Si | Baja: emoji NO_COLOR |
| `VersionArrow` (TUI) | — | N/A | Si — flecha → diferencia sin color | Si | Conforme |
| `UpgradePrompt` (TUI) | — | — | Si | Si | Conforme |
| Fila de paquete (BrewBar) | upgradeable/pinned | idle/hover | Si — contentShape + accessibilityLabel | Si | Conforme |
| Boton Upgrade (BrewBar) | primary/disabled | enabled/disabled | Si — label incluye nombre de paquete | Si | Conforme |
| Icono menu bar (BrewBar) | badge/sin badge | — | Si — accessibilityDescription actualizado | Si — isTemplate | Media: apariencias invertidas en Contents.json |
| AccentColor (BrewBar) | — | — | No aplica | Si | Baja: sin variante dark |

---

# 8. Accesibilidad

## 8.1 Semantica

### Checklist

**TUI (Ink / terminal)**

* [ ] `.accessibilityLabel` — **No aplica**: Ink no ofrece API de accesibilidad; el lector de pantalla ve texto raw del terminal
* [ ] `.accessibilityHint` / traits — **No aplica**: no disponible en entorno terminal
* [x] Diferenciacion sin color: `StatusBadge` usa simbolos (✔▲✘◆○); `VersionArrow` usa flecha →
* [x] `ConfirmDialog` muestra teclas de confirmacion visualmente (no solo color)
* [ ] Elementos decorativos ocultos a lectores — **No aplica**: terminal no tiene API para esto
* [x] Footer de hints documenta todos los atajos de teclado accesibles visualmente

**BrewBar (SwiftUI / macOS)**

* [x] Boton Refresh: `accessibilityLabel("Refresh")` — `PopoverView.swift:53`
* [x] Boton Settings: `accessibilityLabel("Settings")` — `PopoverView.swift:58`
* [x] Boton Quit: `accessibilityLabel("Quit")` — `PopoverView.swift:62`
* [x] Boton Open Brew-TUI: `accessibilityLabel` + `.accessibilityAddTraits(.isButton)` — `PopoverView.swift:67`
* [x] Cabecera "Outdated Packages": `.accessibilityAddTraits(.isHeader)` — `PopoverView.swift:79`
* [x] Iconos decorativos: `.accessibilityHidden(true)` en iconos de estado — `PopoverView.swift`
* [x] Boton Upgrade por paquete: label incluye nombre del paquete — `OutdatedListView.swift:96-98`
* [x] Icono menu bar: `accessibilityDescription` actualizado con badge — `AppDelegate.swift:196, 239-242`
* [ ] Grupo de fila de paquete: sin `.accessibilityElement(children: .combine)` — **Baja**: VoiceOver navega nombre, version y boton por separado en lugar de leerlos como unidad
* [ ] Toggle notificaciones: sin `accessibilityLabel` explicito — **Baja**: `SettingsView.swift` — SwiftUI infiere el label del texto adyacente pero no es garantizado en todos los casos

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Fila paquete sin agrupacion VoiceOver | Parcial | Baja | `OutdatedListView.swift`: `HStack` con nombre, version y boton navegables independientemente | Agregar `.accessibilityElement(children: .combine)` en la `HStack` exterior, o definir `.accessibilityLabel` compuesto |
| Toggle de notificaciones sin label explicito | Parcial | Baja | `SettingsView.swift`: `Toggle("Enable notifications", ...)` — inferido por SwiftUI pero fragil | Agregar `.accessibilityLabel(String(localized: "Enable notifications"))` explicito |
| TUI sin API de accesibilidad formal | No aplica | — | Limitacion estructural de Ink/terminal; no es defecto del codigo | Documentar en README que usuarios de lectores de pantalla deben usar la app macOS BrewBar |

---

## 8.2 Interaccion

### Checklist

**TUI**

* [x] Navegacion completa por teclado — todas las vistas usan `useInput` de Ink
* [x] Atajos documentados en footer por vista activa
* [x] `ConfirmDialog` requiere confirmacion explicita antes de acciones destructivas
* [x] Teclas de cancelacion (Esc, q) disponibles globalmente (`use-keyboard.ts`)
* [x] Busqueda accesible via tecla `S` global y `/` en vistas con lista
* [ ] Tamano de objetivo tactil — **No aplica**: entorno terminal, no interfaz tactil
* [ ] `Voice Control` — **No aplica**: no disponible en terminal
* [ ] `Custom actions` de accesibilidad — **No aplica**: no disponible en Ink

**BrewBar (macOS)**

* [x] `.contentShape(Rectangle())` en filas de paquete — `OutdatedListView.swift:125` — extiende el area de click
* [x] Popover cierra con clic fuera (`.behavior = .transient`) — comportamiento estandar macOS
* [x] Botones de accion principal visibles y etiquetados
* [x] Acciones destructivas (quit) con boton dedicado
* [x] VoiceOver puede navegar todos los controles interactivos identificados
* [ ] `accessibilityAction` para swipe-actions — **Baja**: no hay acciones de accesibilidad alternativas a gestos de ratón complejos; baja criticidad en popover de menu bar

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin accessibilityAction para acciones de fila | Parcial | Baja | `OutdatedListView.swift`: el boton "Upgrade" existe como control independiente; pero no hay `.accessibilityAction` nombrado en la fila | Agregar `.accessibilityAction(named: "Upgrade") { ... }` en la fila para completar el patron |
| Emoji 🔍 en SearchInput TUI | Parcial | Baja | `src/components/common/search-input.tsx`: `'\u{1F50D}'` — en terminal con `NO_COLOR` o con lector de pantalla, el emoji puede leerse como nombre de caracter Unicode | Sustituir por literal ASCII `>` o `[?]` con fallback, o filtrar con `process.env.NO_COLOR` |

---

## 8.3 Adaptaciones del sistema

### Checklist

**TUI**

* [ ] `NO_COLOR` — **Alta**: no implementado; variable de entorno estandar (freedesktop.org) ignorada
* [ ] Tema claro de terminal — **Media**: tokens solo calibrados para fondo oscuro (`colors.ts:7-9`)
* [x] Responsive al ancho del terminal: `header.tsx` detecta `cols < 95` y adapta layout
* [x] Escape de contenido: sin animaciones, sin transparencias — Reduce Motion no aplica
* [ ] `TERM_PROGRAM` / capacidades del terminal — **Baja**: no se detectan capacidades; asume soporte de color full

**BrewBar (SwiftUI / macOS)**

* [x] Dynamic Type: todos los textos usan estilos de texto del sistema (`.headline`, `.body`, `.caption`, `.subheadline`) — automaticamente escalables
* [x] Bold Text: `@Environment(\.legibilityWeight)` leido en `PopoverView.swift:9`, `OutdatedListView.swift`, `SettingsView.swift` — aplica `.bold()` cuando esta activo
* [x] Dark Mode: colores del sistema (`Color.green`, `.primary`, `.secondary`) adaptativos; `@Environment(\.colorScheme)` usado donde es necesario
* [ ] Increase Contrast: implementado parcialmente — **Media**: 5 colores sin rama `colorSchemeContrast == .increased` (`.yellow` en PopoverView:92, `.red` en :136 y :146, `.orange` en :197 y :201, `.orange` en OutdatedListView:83)
* [x] Reduce Motion: no hay animaciones en BrewBar — conforme por ausencia de animaciones personalizadas
* [x] Reduce Transparency: no se usan efectos de blur ni materiales de vidriera — conforme por ausencia
* [x] Differentiacion sin color: SF Symbols + texto en todos los indicadores de estado

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `NO_COLOR` no implementado (TUI) | No conforme | Alta | `src/utils/colors.ts:1-40`; `src/app.tsx`: ningun punto chequea `process.env.NO_COLOR` | En `src/utils/colors.ts`, exportar `COLORS` como resultado de funcion que retorna tokens vacios `''` si `process.env.NO_COLOR` esta definido |
| Tema oscuro exclusivo (TUI) | Parcial | Media | `src/utils/colors.ts:7-9`: limitacion documentada; tokens como `gold: '#B8860B'` son ilegibles en terminal claro | Roadmap: detectar `COLORFGBG` o `TERM_PROGRAM` para variante de tema claro |
| Increase Contrast incompleto (BrewBar) | No conforme | Media | `PopoverView.swift:92` — `.yellow` (icono error scheduler); lineas 136, 146 — `.red` (texto de error de servicio); lineas 197, 201 — `.orange` (modo basico / icono lock); `OutdatedListView.swift:83` — `.foregroundStyle(.orange)` (icono pin) | Sustituir con `colorSchemeContrast == .increased ? Color(red:...) : Color.xxx` o usar colores del sistema que el OS adapta automaticamente (`Color(.systemOrange)`, etc.) |
| Deteccion de capacidades de terminal ausente | No conforme | Baja | `src/app.tsx`, `src/utils/colors.ts`: no se revisa `$TERM`, `$COLORTERM`, `$TERM_PROGRAM` | Evaluar `process.env.COLORTERM === 'truecolor'` para habilitar gradientes; degradar a 256 colores en caso contrario |

---

## 8.4 Media y contenido

### Checklist

**TUI**

* [x] Logo ASCII art en `header.tsx`: decorativo, sin informacion critica; aceptable sin alternativa de texto
* [x] Sin video ni audio en la aplicacion
* [x] Sin imagenes bitmap en la TUI
* [ ] Emoji en UI (`search-input.tsx`: 🔍; `AppDelegate.swift` badge: ⚠, ⟳) — **Baja**: lectores de pantalla verbalizan el nombre Unicode completo del emoji

**BrewBar**

* [x] `MenuBarIcon`: `isTemplate = true` — imagen adaptativa a tema claro/oscuro del sistema
* [x] Sin video ni audio
* [x] `NSImage` con `accessibilityDescription` — `AppDelegate.swift:196, 240-242`
* [ ] MenuBarIcon luminosidad invertida — **Media**: `Assets.xcassets/MenuBarIcon.imageset/Contents.json` asigna `menubar_dark@1x.png` a apariencia por defecto (sin luminosity) y `menubar_light@1x.png` a `"luminosity": "dark"` — el icono se muestra invertido en cada modo
* [ ] CVEAlert.Severity.emoji muerto — **Baja**: `CVEAlert.swift:15-23` define `.emoji` (`🔴🟠🟡🟢⚪`) pero ningun archivo de vista lo usa

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| MenuBarIcon apariencias invertidas | No conforme | Media | `Assets.xcassets/MenuBarIcon.imageset/Contents.json`: `"filename": "menubar_dark@1x.png"` bajo `"idiom": "universal"` (default) y `"filename": "menubar_light@1x.png"` bajo `"luminosity": "dark"` — invertido | Intercambiar las asignaciones en `Contents.json`: `menubar_light@` para default, `menubar_dark@` para dark |
| Emoji en badge del menu bar (BrewBar) | Parcial | Baja | `AppDelegate.swift:225-226`: `"\(cve)⚠"` y `"⟳"` en `button.title` — VoiceOver lee "advertencia" y "sincronizar en sentido horario" en vez del significado contextual | La `accessibilityDescription` en linea 240-242 ya mitiga esto; confirmar que VoiceOver prioriza `accessibilityDescription` sobre `title` — si no, separar el titulo del badge visual del label de accesibilidad |
| CVEAlert.Severity.emoji sin usar | No conforme | Baja | `CVEAlert.swift:15-23`: propiedad `var emoji: String` compilada en produccion; grep en todos los archivos Swift de vistas da 0 resultados | Eliminar la propiedad o renderizarla en alguna vista de CVE |
| Emoji 🔍 en TUI sin fallback | Parcial | Baja | `src/components/common/search-input.tsx`: `'\u{1F50D}'` en label del campo de busqueda | Sustituir por `>` o `[?]`; o condicionar a `!process.env.NO_COLOR` |

---

## Registro de accesibilidad por pantalla

| Pantalla | VoiceOver | Dynamic Type | Contraste | Reduce Motion | Hallazgo |
|----------|-----------|--------------|-----------|---------------|----------|
| TUI: dashboard | No aplica (terminal) | No aplica (terminal) | Parcial — tokens oscuros, terminal claro sin soporte | Conforme — sin animaciones | Tema claro no soportado |
| TUI: installed | No aplica | No aplica | Parcial | Conforme | Idem; sin EmptyState unificado |
| TUI: search | No aplica | No aplica | Parcial | Conforme | Emoji 🔍 sin fallback NO_COLOR |
| TUI: outdated | No aplica | No aplica | Parcial | Conforme | Sin EmptyState unificado |
| TUI: package-info | No aplica | No aplica | Parcial | Conforme | Sin ErrorState unificado |
| TUI: services | No aplica | No aplica | Parcial | Conforme | StatusBadge usa simbolos — correcto |
| TUI: doctor | No aplica | No aplica | Parcial | Conforme | Sin EmptyState unificado |
| TUI: profiles (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: smart-cleanup (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: history (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: rollback (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: brewfile (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: sync (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: security-audit (Pro) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Pro |
| TUI: compliance (Team) | No aplica | No aplica | Parcial | Conforme | UpgradePrompt si no Team |
| TUI: account | No aplica | No aplica | Parcial | Conforme | Atajos documentados en footer |
| BrewBar: PopoverView | Parcial — labels/traits presentes; filas sin `.combine` | Conforme — estilos de texto del sistema | Parcial — 4 usos de color sin rama contraste alto | Conforme — sin animaciones | Filas de paquete sin agrupacion VoiceOver; `.yellow`/`.red`/`.orange` sin contraste alto |
| BrewBar: OutdatedListView | Parcial — boton Upgrade con label correcto; fila sin combinar | Conforme | Parcial — `installedVersionColor`, `currentVersionColor`, icono pin sin contraste alto | Conforme | Colores locales no centralizados; icono pin sin rama contraste |
| BrewBar: SettingsView | Conforme — controles nativos con labels inferidos | Conforme | Conforme — contraste alto implementado en texto de advertencia | Conforme | Toggle sin label explicito (fragil) |
