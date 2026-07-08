# 17. Localizacion / 18. Release readiness

> Auditor: release-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

El estado de localizacion es solido: BrewTUI-Bar TUI y BrewBar cubren ingles y espanol con mecanismos distintos (catalogo de tipos `Translations` con verificacion en tiempo de compilacion para TS, String Catalog `.xcstrings` para Swift) y no se detectaron strings de usuario hardcodeados fuera del sistema i18n. El estado de release readiness es mayoritariamente bueno — los tres canales publicos (npm, GitHub Release, homebrew-tap vivo) estan sincronizados en v1.2.1 — pero existen brechas operacionales concretas: `CODEOWNERS` apunta al handle de organizacion legacy `@MoLinesGitHub` (reviews automaticos no funcionan), los archivos `homebrew/` dentro del repo estan desactualizados respecto al tap canonico, el descriptor MacPorts tiene checksums invalidos y homepage legacy, y el script `release.sh` carece de verificacion previa de salud del perfil notary y de bloqueo ante version desincronizada.

---

## Metricas de localizacion

| Metrica | Valor |
|---------|-------|
| Idiomas soportados (TUI) | en, es |
| Idiomas soportados (BrewBar) | en, es |
| Total claves TUI (`en.ts`) | 479 |
| Cobertura `es.ts` | 479 / 479 (100 %, verificado por tipo `Translations`) |
| Formato localizacion TUI | Custom i18n module (`src/i18n/`) con `t()` / `tp()` |
| Formato localizacion BrewBar | String Catalog `Localizable.xcstrings` |
| Claves xcstrings | 109 |
| Cobertura ES en xcstrings | 109 / 109 (100 %) |
| Strings con state `new` en xcstrings | 1 (EN solamente, no afecta ES) |
| Strings hardcodeados detectados (TUI views) | 1 placeholder no critico (`account.tsx:167`) |
| Strings hardcodeados detectados (BrewBar) | 0 |

## Metricas de release

| Metrica | Valor |
|---------|-------|
| Version `package.json` | 1.2.1 |
| Git tag mas reciente | v1.2.1 |
| Version npm publicada (live tap) | 1.2.1 |
| Version BrewBar (live tap cask) | 1.2.1 |
| `homebrew/Formula/brewtui-bar.rb` en repo | 0.7.0 (vestigial) |
| `homebrew/Casks/brewbar.rb` en repo | 0.7.0 (vestigial) |
| MARKETING_VERSION en `Project.swift` | Derivada de `package.json` en tiempo de generate |
| CURRENT_PROJECT_VERSION | 1 (hardcodeado, no incrementa) |
| Configuraciones de build | Debug, Release |
| Firma (Release) | Manual — Developer ID Application |
| Firma (Debug) | Automatica — Apple Development |
| Privacy manifest | Presente (`PrivacyInfo.xcprivacy`) |
| Release workflow CI | Ausente (solo `ci.yml` para validate) |

---

## 17. Localizacion e internacionalizacion

### Checklist

* [x] **Strings externalizadas** — `src/i18n/en.ts` es la fuente de verdad; todas las vistas TUI llaman a `t()` o `tp()`. BrewBar usa `Text(...)` para SwiftUI (extraccion automatica) y `String(localized:)` para alertas y notificaciones. Unico caso marginal: `placeholder="BREW-XXXX-XXXX"` en `account.tsx:167` es un formato de entrada tecnico, no texto visible de usuario.
* [x] **Claves semanticas** — Las claves de `en.ts` siguen convencion `dominio_contexto_accion` (ej. `profiles_confirmDelete`, `cleanup_systemClean`). Las claves del String Catalog xcstrings usan el texto ingles como clave (patron Apple estandar para auto-extraccion de SwiftUI).
* [x] **Plurales correctos** — TUI: `tp()` usa sufijos `_one` / `_other` (ej. `outdated_title_one`, `outdated_title_other`). BrewBar: `%lld packages can be updated.` tiene variacion plural `one` / `other` en xcstrings para ambos idiomas.
* [x] **Fechas localizadas** — TUI: `src/i18n/en.ts` usa claves relativas (`time_justNow`, `time_minutesAgo`, `time_daysAgo`); no se detectaron `new Date().toLocaleString()` hardcodeados fuera del modulo i18n. BrewBar no tiene vistas con fechas formateadas directamente.
* [x] **Numeros y moneda localizados** — TUI no muestra moneda; los conteos usan `tp()`. No se detectaron `String(format: "%.2f")` para valores visibles de usuario.
* [x] **Layout soporta textos largos** — El CHANGELOG 1.2.0 documenta migracion de celdas string-based a `<Box flexShrink={1} minWidth={0}><Text wrap="truncate">`. Historia columna `desinstalacion` fue el caso problema, ya resuelto. BrewBar usa SwiftUI nativo con layout adaptativo.
* [ ] **RTL contemplado si aplica** — Ni el TUI (Ink/terminal) ni BrewBar soportan idiomas RTL. No hay `.lproj` para `ar` ni `he`. Ink no tiene soporte nativo RTL. Marcado como limitacion conocida, no bloqueante para el mercado objetivo actual (macOS en/es).
* [x] **No texto hardcodeado visible** — Revision exhaustiva de `src/views/**` confirma uso consistente de `t()`. Los `console.log` hardcodeados en `src/index.tsx` (lineas 133, 135, 147, 158, 172) son salidas de CLI para el subcomando `status` con datos dinamicos de maquina, no strings de UI traducibles; se consideran aceptables segun el patron documentado en CLAUDE.md.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `security_rollback_hint` en posicion diferente entre `en.ts` y `es.ts` | Conforme | Informativo | `en.ts:288`, `es.ts:459` — misma clave, orden distinto en el objeto; TypeScript verifica la presencia en compilacion | Ninguna; el orden no afecta funcionalidad ni compilacion |
| xcstrings: `"%@ security alert%@"` con `state: "new"` en EN | Baja conformidad | Baja | `Localizable.xcstrings` linea aprox. 33: la entrada EN tiene `state: "new"`, sugiere que Xcode extrae la clave automaticamente pero el valor EN no fue confirmado manualmente; ES si esta traducido | Marcar el valor EN como `"translated"` en Xcode o confirmar via Build Setting que `new` es aceptable para el idioma base |
| `placeholder="BREW-XXXX-XXXX"` hardcodeado en `account.tsx:167` | Aceptable | Baja | `src/views/account.tsx:167` — es formato tecnico de clave de licencia, no texto narrativo; usuario comprende el patron independientemente del idioma | Considerar mover a constante en `en.ts` / `es.ts` si se quiere localizacion completa (ej. descripcion del formato) |
| RTL no soportado | Limitacion conocida | Baja | No hay `.lproj` para `ar`/`he`; Ink carece de soporte RTL nativo | Documentar explicitamente como fuera de alcance en README si el mercado objetivo no incluye RTL |

---

## 18.1 Pre-release tecnico

### Checklist

* [x] **Build Release limpia** — No se detectaron `fatalError()` / `preconditionFailure()` en rutas de produccion TS. Los tres `TODO` en `src/lib/` (SEG-003 legacy key, version-check contract) estan comentados con tracking numbers y no bloquean funcionalidad. `set -euo pipefail` en `release.sh` garantiza fallo explicito.
* [ ] **Archive correcto** — `release.sh` existe y ejecuta `tuist clean && tuist generate` antes del archive (corrige el bug de MARKETING_VERSION stale documentado en commit `cd1c7f6`). Sin embargo, no hay workflow de GitHub Actions para release automatizado; todo el pipeline post-validate es manual. No hay verificacion previa de salud del perfil notary antes de iniciar el archive.
* [x] **Firma correcta** — `Project.swift:74`: Release usa `CODE_SIGN_STYLE=Manual`, `CODE_SIGN_IDENTITY=Developer ID Application`, `ENABLE_HARDENED_RUNTIME=YES`, `--timestamp`. Debug usa `CODE_SIGN_STYLE=Automatic`, `Apple Development`, Hardened Runtime desactivado. `exportOptions.plist` declara `method=developer-id`, `signingStyle=manual`, `teamID=GD6M44DYPQ`. Consistente con distribucion fuera de la MAS via notarizacion.
* [x] **Assets correctos** — `AppIcon.appiconset/Contents.json` declara los 10 tamanhos requeridos para macOS (16x16@1x, 16x16@2x, 32x32@1x, 32x32@2x, 128x128@1x, 128x128@2x, 256x256@1x, 256x256@2x, 512x512@1x, 512x512@2x). `LSUIElement=true` correcto para menubar app (sin icono en Dock).
* [x] **Configuracion entorno correcta** — `src/lib/license/polar-api.ts:5` apunta a `https://api.polar.sh/v1/...` (produccion). `src/lib/license/promo.ts:11` apunta a `https://api.molinesdesigns.com/api/promo` (produccion). No se detectaron URLs de staging ni credenciales hardcodeadas en rutas de release.
* [x] **Feature flags revisadas** — `src/lib/license/feature-gate.ts` define `PRO_VIEWS` y `TEAM_VIEWS` como `Set<ViewId>` estatico. No hay flags de LaunchDarkly, Firebase Remote Config ni similares. `app.tsx:42-47` comprueba `isPro()` e `isTeam()` antes de renderizar vistas gatekeadas. Estado determinista: ninguna vista pro queda en estado ambiguo.
* [x] **Logs verbosos eliminados o controlados** — `src/utils/logger.ts` canaliza todo el logging a traves de niveles controlados por `LOG_LEVEL` env. No se detectaron `console.*` en `src/views/` ni `src/stores/` ni `src/lib/` fuera del logger. Las excepciones en `src/index.tsx` son salidas de CLI documentadas como canal usuario en CLAUDE.md.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `release.sh` no verifica salud del perfil notary antes de archivar | No conforme | Media | El script comprueba que `$NOTARY_PROFILE` no este vacio (`release.sh:29-35`) pero no ejecuta `xcrun notarytool history --keychain-profile $NOTARY_PROFILE` para validar que las credenciales son validas antes de gastar ~10 min de build+archive. CLAUDE.md documenta este paso como prerequisito manual | Anadir step de preflight al inicio de `release.sh` antes del `tuist generate`: `xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" --limit 1 > /dev/null || { echo "✘ Perfil notary invalido o expirado"; exit 1; }` |
| `release.sh` no bloquea si MARKETING_VERSION en `.app` != `package.json` post-archive | No conforme | Baja | Aunque `Project.swift` + `tuist clean` previenen drift en generate-time, no hay verificacion post-archive que confirme `CFBundleShortVersionString == $(jq -r .version package.json)`. El script imprime el path del zip pero no valida el contenido del `.app` | Anadir tras el export: `APP_VER=$(plutil -extract CFBundleShortVersionString raw "$APP_PATH/Contents/Info.plist")` + comparar con `jq -r .version ../package.json`, abortar si difieren |
| `CURRENT_PROJECT_VERSION` hardcodeado `"1"` en `Project.swift:40` | Informativo | Baja | El build number no incrementa entre releases; solo `MARKETING_VERSION` avanza. Para Developer ID fuera de MAS es aceptable, pero impide migracion futura a MAS sin cambios adicionales | Documentar la decision; si se plantea MAS en el futuro, implementar incremento automatico (ej. contar commits, usar timestamp) |
| No existe release workflow en GitHub Actions | Informativo | Baja | Solo `ci.yml` (validate). Todo el pipeline post-push es manual; no hay gatekeeping automatico de que el release fue notarizado antes de crear la GH Release | Considerar un workflow `release.yml` disparado por `push: tags: ['v*']` que al menos valide el tag contra `package.json` |
| `TODOs` con tracking SEG-003 no resueltos | Informativo | Baja | `src/lib/license/license-manager.ts:101` y `src/lib/sync/crypto.ts:31` marcan migracion de legacy key pendiente desde v0.6.3; actualmente en v1.2.1 | Evaluar si la telemetria confirma cero uso de `_legacyKey` para eliminar el codigo de transicion |

---

## 18.2 Producto

### Checklist

* [ ] **Flujos criticos aprobados** — Los flujos principales (install, upgrade, uninstall, activate license, BrewBar handoff via `last-action.json`) no tienen UI tests. Los tests de `src/` cubren parsers, license manager, API validation y stores, pero no rendering de vistas. `ink-testing-library` esta en devDependencies pero sin tests de componentes activos aun.
* [x] **Bugs criticos resueltos** — No se detectaron comentarios `// BUG:`, `// KNOWN ISSUE:`, `// WORKAROUND:` en las rutas de produccion. Los `TODO` existentes tienen tracking numbers y no corresponden a bugs visibles al usuario.
* [ ] **Crash-free threshold aceptable** — TUI: no hay SDK de crash reporting activo (ni Crashlytics, ni Sentry, ni PostHog). `src/lib/analytics.ts:82` tiene un comentario explicitamente notando que la integracion es un stub. BrewBar: `CrashReporter.swift` implementa reporte a NAS propio y el protocolo `CrashReportingSDK` como seam para un SDK externo (QA-007), pero sin SDK activo por defecto. No es posible medir crash-free rate en produccion.
* [ ] **Metricas minimas cubiertas** — `src/lib/analytics.ts` existe como modulo pero su implementacion es un stub (sin eventos reales a un backend de analytics). No hay PostHog, Plausible, Mixpanel ni equivalente activo. No se pueden medir funnels de activacion, uso de features pro ni tasa de upgrade.
* [x] **Privacidad revisada** — `PrivacyInfo.xcprivacy`: `NSPrivacyTracking=false`, `NSPrivacyCollectedDataTypes=[]`, `NSPrivacyAccessedAPITypes` declara `NSPrivacyAccessedAPICategoryUserDefaults` con reason `1C8F.1` (valor correcto para acceso propio de la app). `FileManager.setAttributes(.posixPermissions:)` en `SettingsView.swift:248` y `PopoverView.swift:333` no requiere declaracion de file timestamp API. Manifest completo para las APIs usadas.
* [ ] **Accesibilidad minima validada** — BrewBar: 16 usos de `accessibilityLabel`/`accessibilityHint`/`accessibilityValue` en Swift, centrados en el boton del menu bar y algunos controles de la popover. TUI: Ink/terminal no tiene equivalente nativo de VoiceOver; la accesibilidad de la TUI depende del lector de pantalla del sistema operativo sobre la salida de texto. No existe test plan de accesibilidad documentado para ninguno de los dos componentes.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Crash reporting no activo en produccion | No conforme | Media | `CrashReporter.swift:27` (QA-007): seam para SDK externo definido pero no conectado. `src/lib/analytics.ts:82`: stub sin implementacion real. No hay forma de detectar regresiones de estabilidad en usuarios reales post-release | Integrar Sentry (Sentry-Cocoa para BrewBar + Sentry/Node para TUI) o equivalente; alternativamente habilitar el reporte al NAS para builds propios y documentar que el conteo de crashes viene de App Store Connect (Developer ID no tiene esta facilidad) |
| Analytics stub — metricas de uso no disponibles | No conforme | Media | `src/lib/analytics.ts` es un placeholder sin destino real; no hay eventos de activacion, retention ni feature usage. Imposible medir la salud del producto en produccion | Implementar Plausible o PostHog self-hosted (ya mencionados en el comentario del stub) con eventos minimos: `app.launched`, `license.activated`, `upgrade.completed`, `pro.feature.used` |
| Flujos criticos sin UI tests | No conforme | Media | `ink-testing-library` disponible pero sin tests de componentes (`CLAUDE.md` lo documenta: "UI tests: ink-testing-library available but not yet in use"). Los flujos install/upgrade/uninstall solo se validan via test de store y parser, no end-to-end en la UI | Crear al menos tests de humo para `<InstalledView>`, `<OutdatedView>` y `<AccountView>` usando `ink-testing-library`; `src/test/render-at.tsx` ya provee la infraestructura |
| Accesibilidad de BrewBar parcialmente cubierta | No conforme | Baja | 16 labels de accesibilidad presentes, concentrados en controles criticos. Vistas complejas como `SettingsView` y secciones de `PopoverView` no auditadas sistematicamente. Sin test automatizado de accesibilidad | Ejecutar Accessibility Inspector sobre las vistas principales; anadir `accessibilityLabel` a tablas y filas del popover; registrar resultados en un test plan |

---

## 18.3 Store / distribucion

### Checklist

* [x] **Metadata correcta** — `package.json`: `name=brewtui-bar`, `version=1.2.1`, `description`, `repository.url=github.com/MoLinesDesigns/BrewTUI-Bar`, `author=MoLines Designs`, `license=MIT`. README completo con badge de Homebrew apuntando a `MoLinesDesigns/homebrew-tap`. No hay metadata de App Store Connect porque el app se distribuye por Developer ID, no MAS.
* [ ] **Capturas correctas** — No hay automatizacion de screenshots (no Fastlane `snapshot`, no UI test screenshot capture). Los screenshots en el repo son imagenes PNG estaticas en el directorio raiz, fuera de cualquier flujo automatico. No aplica para npm/Developer ID, pero si el app llega a MAS en el futuro este gap se vuelve bloqueante.
* [x] **Privacy manifest / nutrition labels correctos** — `PrivacyInfo.xcprivacy` presente y correcto para distribucion Developer ID. `NSPrivacyTracking=false`, `NSPrivacyCollectedDataTypes` vacio (sin recoleccion de datos del usuario), `NSPrivacyAccessedAPITypes` declara UserDefaults con reason `1C8F.1`. Cross-referencia con codigo: no se detectaron otros accessed API types sin declarar.
* [ ] **Notas de revision correctas** — `CHANGELOG.md` esta excluido del paquete npm via `.npmignore`. Los GitHub Releases no se crean con automatizacion (no hay `gh release create` en CI). No hay plantilla de release notes ni documentacion de proceso para redactar las notas de la GH Release antes de publicar.
* [x] **Deep links / universal links validados** — BrewTUI-Bar es una CLI sin URL scheme. BrewBar es una menubar app sin URL scheme registrado ni `Associated Domains` en `Project.swift`. No hay `onOpenURL` en las vistas SwiftUI. No aplica para la arquitectura actual; marcado como conforme por ausencia de necesidad.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `.github/CODEOWNERS:1` → `* @MoLinesGitHub` (handle legacy) | No conforme | Alta | `CODEOWNERS` usa el handle de la org anterior `@MoLinesGitHub`; la org fue renombrada a `MoLinesDesigns`. Las solicitudes de review automatico en PRs se enrutan a un handle inactivo o inexistente, fallando silenciosamente. Commits recientes confirman que `MoLinesDesigns` es el owner actual | Cambiar `.github/CODEOWNERS:1` a `* @MoLinesDesigns` (o al usuario/equipo correcto dentro de la org) |
| `homebrew/Formula/brewtui-bar.rb` y `homebrew/Casks/brewbar.rb` desactualizados en repo | No conforme | Media | Archivos trackeados en git (`git ls-files homebrew/`) declaran version `0.7.0`; version actual es `1.2.1`. El tap canonico real en `/opt/homebrew/Library/Taps/molinesdesigns/homebrew-tap/` esta en 1.2.1. Contribuidores o scripts que lean estos archivos en el repo principal obtendran datos incorrectos | Opcion A (recomendada): eliminar `homebrew/Formula/` y `homebrew/Casks/` del repo principal — el source of truth es `MoLinesDesigns/homebrew-tap`, no aqui. Opcion B: anadir un comentario prominente en el directorio indicando que son mirrors historicos y actualizar a la version actual |
| `homebrew/macports/brewtui-bar.tcl` obsoleto con referencias legacy y checksums invalidos | No conforme | Media | `brewtui-bar.tcl:7`: `version 0.1.0`; `brewtui-bar.tcl:12`: `@MoLinesGitHub`; `brewtui-bar.tcl:20`: `https://github.com/MoLinesGitHub/BrewTUI-Bar`; `brewtui-bar.tcl:22-24`: checksums `sha256 4fa58...`, `rmd160 00000...` (rmd160 es cero, invalido). MacPorts no figura como canal activo en el pipeline de CLAUDE.md | Si MacPorts no es un canal activo: eliminar el archivo del repo o moverlo a un directorio `archive/`. Si es activo: actualizar version, homepage, maintainer y recalcular checksums antes de enviar al MacPorts port tree |
| `CHANGELOG.md` excluido del paquete npm | Informativo | Baja | `.npmignore` excluye `CHANGELOG.md`; usuarios que instalen via `npm install -g brewtui-bar` no tienen acceso al changelog desde el paquete | Considerar incluir `CHANGELOG.md` en `files[]` de `package.json`; es un documento estandar esperado en paquetes npm. `SECURITY.md` tambien esta excluido — mismo razonamiento |
| Proceso de release notes no documentado ni automatizado | Informativo | Baja | No hay plantilla para la descripcion de la GH Release ni script que pre-rellene la descripcion desde `CHANGELOG.md` al crear la release. El pipeline de CLAUDE.md asume que el desarrollador redacta las notas manualmente en `gh release create` | Documentar en CLAUDE.md el paso de extraer el ultimo bloque del CHANGELOG como body de la GH Release, o crear un script auxiliar `scripts/extract-changelog-entry.sh` |
| No hay release workflow automatizado en GitHub Actions | Informativo | Baja | Solo existe `ci.yml`; el pipeline de notarizacion, GH Release y tap bump son enteramente manuales. El pre-push + `prepublishOnly` mitigan errores en el npm publish, pero no hay gatekeeping automatico para la GH Release ni el tap bump | Crear `.github/workflows/release.yml` disparado en `push: tags: ['v*']` que valide al menos que el tag coincide con `package.json` y que la GH Release incluye los assets esperados; la notarizacion puede quedar manual por depender de credenciales locales |
| `src/index.tsx:133-172`: varios `console.log` con strings hardcodeados | Aceptable | Baja | Lineas 133, 135, 147, 158, 172: literales de estado de maquina (numero de snapshots, fecha de sync, score de Brewfile, etc.) en el subcomando `status`. Segun CLAUDE.md son "intended user-facing channel" en CLI handlers; no son strings de UI | Ninguna urgente; si se quiere consistencia total con i18n, mover estos literales a claves `cli_*` en `en.ts`/`es.ts` |
