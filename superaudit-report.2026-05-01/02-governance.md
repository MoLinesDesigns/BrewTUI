# 2. Gobierno del proyecto

> Auditor: governance-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto tiene una base de gobierno razonablemente solida: `package.json` incluye un allowlist de `files` que limita el contenido publicado a npm, el pipeline de pre-push ejecuta la suite de validacion completa, y BrewBar configura correctamente Developer ID Application, Hardened Runtime y timestamp para Release. Sin embargo, se identifican **siete hallazgos de severidad Alta**: cuatro son accionables e inmediatos — (1) la pipeline de release de BrewBar es enteramente manual sin ningun step de CI que compile, archive, firme ni notarice la app; (2) los canales Homebrew Formula (`0.5.3`) y Homebrew Cask (`0.1.0`) apuntan a versiones dramaticamente desactualizadas respecto a la version publicada `0.6.1`; (3) `jsr.json` esta en la version `0.5.2` mientras el proyecto es `0.6.1`, lo que publicaria una version obsoleta en JSR en el proximo ciclo; y (4) el `PrivacyInfo.xcprivacy` declara `NSPrivacyAccessedAPICategoryFileTimestamp` sin ninguna llamada a APIs de timestamps de fichero en el codigo Swift. Los tres Alta restantes corresponden a la limitacion arquitectonica documentada de las claves AES de cifrado hardcodeadas en el bundle npm y en `LicenseChecker.swift`, con mitigaciones activas (server-side revalidation + machine binding); se referencian a la seccion 13 para evaluacion completa del modelo de amenaza. La licencia del proyecto es MIT (verificado: `LICENSE:1`).

---

## 2.1 Targets, schemes y configuracion

### Checklist

* [x] Todos los targets tienen proposito claro
* [x] No existen targets obsoletos
* [x] Los schemes estan alineados con los entornos reales
* [x] Debug y Release estan separados correctamente (no se requiere Staging en este proyecto)
* [x] No hay flags inconsistentes entre entornos
* [ ] La configuracion de testing no contamina produccion — **Baja**: `exportOptions.plist` comprometido en git con `method: none` (sin firmar)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Target `BrewBar` (Release) | Conforme | — | `Project.swift:44-65`: Developer ID Application, `ENABLE_HARDENED_RUNTIME=YES`, `--timestamp`, `CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO` | — |
| Target `BrewBar` (Debug) | Conforme | — | `Project.swift:56-63`: Automatic / Apple Development, Hardened Runtime desactivado para Xcode Previews; documentado en comentario inline | — |
| Target `BrewBarTests` | Conforme | — | `Project.swift:67-74`: unit tests target separado, `CODE_SIGN_IDENTITY="-"` | — |
| Target `brew-tui` (npm CLI) | Conforme | — | `package.json`: bin, main, files, engines, prepublishOnly todos correctamente configurados | — |
| Schemes BrewBar | Conforme | — | Solo Debug y Release; proyecto sin entorno Staging; el CLAUDE.md confirma este modelo de dos configuraciones | — |
| `exportOptions.plist` en git con `method: none` | No conforme | Baja | `menubar/exportOptions.plist:6`: `<string>none</string>` — comentario indica que se debe cambiar a `developer-id` antes de archivar para distribucion | Cambiar `method` a `developer-id` y anadir `teamID` para release real; o excluir del repo si se genera en CI |
| CI pipeline Swift (BrewBar) | No conforme | Alta | `.github/workflows/ci.yml`: unico workflow, `ubuntu-latest`, sin ningun step Swift, xcodebuild, archive, codesign ni notarize. La release de BrewBar es completamente manual sin ninguna automatizacion en este repo | Anadir un workflow `release-brewbar.yml` en GitHub Actions con runner `macos-latest` que ejecute `tuist generate`, `xcodebuild archive`, `xcodebuild -exportArchive`, notarizacion con `notarytool` y carga del `.zip` a GitHub Releases |
| Swift nunca gatillado en CI ni en pre-push | No conforme | Media | `.husky/pre-push`: solo ejecuta `npm run validate`; `ci.yml` ubuntu-only. Cambios en `menubar/` nunca son validados automaticamente | Anadir job macOS al CI con `tuist generate && xcodebuild build -workspace BrewBar.xcworkspace -scheme BrewBar` |

---

## 2.2 Build settings

### Checklist

* [x] Swift language version correcta (6.0)
* [x] Strict concurrency activada segun politica del proyecto (`SWIFT_STRICT_CONCURRENCY=complete`)
* [x] Warnings relevantes tratados como errores donde proceda (`GCC_WARN_ABOUT_RETURN_TYPE=YES_ERROR`, `CLANG_WARN_DIRECT_OBJC_ISA_USAGE=YES_ERROR`, `CLANG_WARN_OBJC_ROOT_CLASS=YES_ERROR`)
* [x] Optimizacion de Release correcta (`SWIFT_OPTIMIZATION_LEVEL=-O`, `SWIFT_COMPILATION_MODE=wholemodule`)
* [x] No hay linker flags heredados innecesarios
* [x] No hay paths hardcodeados locales
* [x] Arquitecturas configuradas correctamente (sin restriccion `ARCHS`; el compilador selecciona arm64/x86_64 segun el SDK)
* [ ] tsup target alineado con engines.node — **Baja**: `tsup.config.ts:9` declara `target: 'node18'`; `package.json:45` declara `engines.node >=22`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SWIFT_VERSION=6.0` (Release y Debug) | Conforme | — | `project.pbxproj:514,613` | — |
| `SWIFT_STRICT_CONCURRENCY=complete` (Release y Debug) | Conforme | — | `project.pbxproj:513,612` | — |
| `SWIFT_OPTIMIZATION_LEVEL=-O` Release, `-Onone` Debug | Conforme | — | `project.pbxproj:546,674` | — |
| `SWIFT_COMPILATION_MODE=wholemodule` Release, `singlefile` Debug | Conforme | — | `project.pbxproj:545,673` | — |
| `ENABLE_USER_SCRIPT_SANDBOXING=YES` (ambas configuraciones) | Conforme | — | `project.pbxproj:499,591` | — |
| `DEAD_CODE_STRIPPING=YES` | Conforme | — | `project.pbxproj:495,587` | — |
| `VALIDATE_PRODUCT=YES` (Release) | Conforme | — | `project.pbxproj:515` | — |
| `GCC_OPTIMIZATION_LEVEL=0` en Debug (nivel base) | Conforme | — | `project.pbxproj:595`; es el valor correcto para Debug | — |
| `tsup target: node18` vs `engines.node >=22` | No conforme | Baja | `tsup.config.ts:9`: `target: 'node18'`; `package.json:45`: `"node": ">=22"`. La desincronizacion puede emitir polyfills/downleveling innecesarios | Alinear: cambiar `target` a `'node22'` en `tsup.config.ts` |
| `OTHER_LDFLAGS` (todos los targets) | Conforme | — | `project.pbxproj:440,538,629,662`: unicamente `$(inherited)` y `-L$(DT_TOOLCHAIN_DIR)/usr/lib/swift/$(PLATFORM_NAME)` — flag estandar del toolchain Swift | — |
| `ARCHS` / `EXCLUDED_ARCHS` | Conforme | — | No declarados; se delega al SDK. Sin restricciones que bloqueen arm64 en dispositivos o simuladores | — |

---

## 2.3 Info.plist, entitlements y capabilities

### Checklist

* [x] Info.plist minimal y coherente
* [x] No hay permisos de sistema innecesarios (`NS*UsageDescription`) — BrewBar no necesita camara, microfono, contactos ni ubicacion
* [ ] Entitlements minimales — **Baja**: no hay `.entitlements` explicito; configuracion valida para Developer ID sin sandbox, pero no documentada en el repo
* [x] Capabilities activadas solo si se usan
* [x] Universal Links / Associated Domains — No aplica (BrewBar no tiene dominio web)
* [x] App Groups — No aplica (`UserDefaults.standard` sin suiteName; no hay App Groups)
* [x] Keychain Sharing — No aplica (sin `kSecAttrAccessGroup` en fuentes Swift)
* [x] Background modes — No aplica; `SMAppService` + `SchedulerService` gestionan el scheduler sin entitlement `background-modes`
* [ ] `NSPrivacyAccessedAPICategoryFileTimestamp` justificado — **Alta**: declarado en `PrivacyInfo.xcprivacy` sin API de timestamps de fichero en el codigo

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `LSUIElement=true` | Conforme | — | `Project.swift:34`, `build/.../Info.plist:52`: sin icono Dock, solo menu bar | — |
| `CFBundleIdentifier=com.molinesdesigns.brewbar` | Conforme | — | `project.pbxproj:542,666` | — |
| `NSHumanReadableCopyright` | Conforme | — | `Project.swift:41`: `"MoLines Designs"` | — |
| `CFBundleShortVersionString` | Conforme | — | `Project.swift:38`: `"$(MARKETING_VERSION)"` — valor correcto para produccion | — |
| `CFBundleShortVersionString` en xcarchive en disco | No conforme | Baja | `menubar/build/BrewBar.xcarchive/Products/.../Info.plist:26`: `0.6.0`; `Project.swift:13` tiene `default=0.6.1`. El xcarchive en disco no fue regenerado tras el bump de version (directorio no esta en git, pero confirma que el ultimo release firmado fue `0.6.0`) | Excluir `menubar/build/` via `.gitignore`; regenerar xcarchive y firmarlo en CI para cada release |
| `NSPrivacyAccessedAPICategoryFileTimestamp` (razon `C617.1`) | No conforme | Alta | `PrivacyInfo.xcprivacy:14-21`: declara acceso a timestamps de fichero. Busqueda exhaustiva en `menubar/BrewBar/Sources/**`: no se encontro ninguna llamada a `attributesOfItem`, `creationDate`, `modificationDate`, `contentModificationDate` ni `resourceValues(forKeys:)`. Los usos de `Date()` en el codigo son operaciones de tiempo puro, no acceso al filesystem | Eliminar el bloque `NSPrivacyAccessedAPICategoryFileTimestamp` del `PrivacyInfo.xcprivacy`; o anadir la API correspondiente si hay un caso de uso real no detectado |
| `NSPrivacyAccessedAPICategoryUserDefaults` (razon `1C8F.1`) | Conforme | — | `PrivacyInfo.xcprivacy:7-13`. `UserDefaults.standard` extensamente usado en `SchedulerService.swift`, `AppDelegate.swift:90`, `AppState.swift:34` | — |
| `NSPrivacyTracking=false` | Conforme | — | `PrivacyInfo.xcprivacy:26`: correcto; BrewBar no hace tracking de usuarios | — |
| `NSPrivacyCollectedDataTypes=[]` | Conforme | — | `PrivacyInfo.xcprivacy:23-25`: array vacio; la app no declara recopilacion de datos | — |
| Ausencia de `.entitlements` file para Release | Parcial | Baja | `Project.swift`: no hay `entitlementsPath` definido; `CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO` en Release. Para Developer ID sin sandbox es configuracion valida. Sin embargo, la ausencia de un archivo `.entitlements` explicito impide auditar capabilities. `SMAppService` en `AppDelegate.swift:94-95` puede requerir `com.apple.developer.login-items` — verificar si Developer ID lo negocia automaticamente | Crear `BrewBar/BrewBar.entitlements` con la lista explicita (aunque minima) y vincularlo en `Project.swift` via el parametro `entitlements:` |
| `SMAppService` (Login Item) | Conforme | — | `AppDelegate.swift:94-95`, `SettingsView.swift:62-64`: uso correcto de `SMAppService.mainApp` para launch-at-login. API recomendada por Apple desde macOS 13 | — |
| App Groups | No aplica | — | No hay uso de `UserDefaults(suiteName:)` ni `containerURL(forSecurityApplicationGroupIdentifier:)` | — |
| Keychain Sharing | No aplica | — | No hay uso de `kSecAttrAccessGroup` en fuentes Swift | — |
| UserNotifications | Conforme | — | `SchedulerService.swift:2`: import `UserNotifications`; `requestNotificationPermission()` y `UNUserNotificationCenter` en uso; notificaciones con identifier timestamped (fix en `0.6.1`) | — |

---

## 2.4 Gestion de entornos y secretos

### Checklist

* [ ] Secrets fuera del codigo fuente — **Alta**: `ENCRYPTION_SECRET` y `SCRYPT_SALT` hardcodeados en bundle npm; clave AES derivada hardcodeada en Swift
* [x] Variables por entorno bien separadas (separacion estructural via build configs; no hay variables de entorno en el sentido clasico)
* [ ] Configuracion local no filtrada al repo — **Media**: `dist-standalone/brew-tui-bun` (65 MB, binario Mach-O arm64) comprometido en git y no gitignoreado
* [x] Feature flags auditados (implementacion interna via `feature-gate.ts`; sin servicios externos como LaunchDarkly)
* [ ] Canales de distribucion sincronizados — **Alta**: Homebrew Formula en `0.5.3`, Homebrew Cask en `0.1.0`, JSR en `0.5.2`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `ENCRYPTION_SECRET='brew-tui-license-aes256gcm-v1'` en bundle npm | No conforme | Alta | `src/lib/license/license-manager.ts:78-79`: constantes literales compiladas en el bundle npm. Mitigado por revalidacion server-side (24h, Polar) y machine binding. Limitacion arquitectonica documentada en `license-manager.ts:71-77` y en `00-ficha.md` | Migrar a macOS Keychain (elimina el literal del bundle); ver seccion 13 para evaluacion completa del modelo de amenaza |
| `ENCRYPTION_SECRET='brew-tui-sync-aes256gcm-v1'` en `sync/crypto.ts` | No conforme | Alta | `src/lib/sync/crypto.ts:6-7`: mismo patron que licencias pero sin machine binding (necesidad de diseno: las maquinas del mismo usuario deben compartir la clave). Cualquier usuario con el bundle puede intentar descifrar archivos de sync de iCloud si los conoce | Documentar explicitamente la limitacion de seguridad del sync. Alternativa: derivar la clave desde una passphrase del usuario o desde el Keychain en macOS |
| Clave AES derivada hardcodeada en `LicenseChecker.swift:50` | No conforme | Alta | `menubar/BrewBar/Sources/Services/LicenseChecker.swift:50`: `let hex = "5c3b2ae2a3066bca28773f36db347d8c8a0a396d4b9fab628331446acd6d4126"` — clave AES-256-GCM pre-derivada incrustada como hex literal en el binario Swift. Recuperable via `strings BrewBar \| grep 5c3b` sin necesidad del bundle npm | Si la migracion a Keychain no es inmediata, eliminar el valor pre-computado: re-derivar desde los literales en runtime (misma exposicion teorica, pero elimina el hex directo del binario) |
| `POLAR_ORGANIZATION_ID` en `polar-api.ts:13` | Conforme | — | Comentario GOV-004 confirma que es un ID publico de organizacion Polar, no un secreto API | — |
| `POLAR_CHECKOUT_URLS` en `polar-api.ts:27-31` y `en.ts:316-317` | Conforme | — | URLs de checkout publicas; exposicion intencional (mostradas al usuario en la UI) | — |
| `dist-standalone/brew-tui-bun` comprometido en git | No conforme | Media | `git ls-files dist-standalone/brew-tui-bun`: archivo tracked. Binario Mach-O arm64 de 65 MB. No figura en `.gitignore` ni en `.npmignore`. No documentado en README. No hay fuga incremental de secretos (el bundle npm contiene los mismos literales), pero el artefacto ocupa 65 MB en el historial git sin procedencia verificable | Anadir `dist-standalone/` a `.gitignore` y `.npmignore`. Ejecutar `git rm --cached dist-standalone/brew-tui-bun`. Si se distribuye, hacerlo via GitHub Releases con SHA256 verificable |
| `menubar/build/` no gitignoreado | Parcial | Media | `menubar/build/` contiene `BrewBar.xcarchive` y `derived/` en disco pero no esta comprometido actualmente (`git ls-files menubar/build/` vacio). `.gitignore:14` excluye `menubar/Derived/` y `menubar/DerivedData/` pero no `menubar/build/` — sin barrera para un commit accidental | Anadir `menubar/build/` a `.gitignore` |
| Homebrew Formula `brew-tui.rb` en version `0.5.3` | No conforme | Alta | `homebrew/Formula/brew-tui.rb:3`: `url` apunta a `brew-tui-0.5.3.tgz`. Desincronizacion de 2 versiones menores respecto a `0.6.1`. Usuarios que instalen via `brew install` reciben version sin los fixes de `0.6.0` y `0.6.1` | Actualizar `url`, `sha256` y el test en `brew-tui.rb` a `0.6.1`. Incluir este paso en el checklist de `publish-all.sh` |
| Homebrew Cask `brewbar.rb` en version `0.1.0` | No conforme | Alta | `homebrew/Casks/brewbar.rb:2`: `version "0.1.0"`. Brecha de 5 versiones menores respecto a `0.6.1`. Los usuarios del Cask instalan una version dramaticamente obsoleta | Actualizar `version` y `sha256` en `brewbar.rb` a `0.6.1`; verificar que el asset `BrewBar.app.zip` para `v0.6.1` existe en GitHub Releases con el SHA256 correcto |
| `jsr.json` en version `0.5.2` | No conforme | Alta | `jsr.json:3`: `"version": "0.5.2"`. `publish-all.sh:26-33` ejecuta `jsr publish` o `deno publish` si el binario esta disponible. En el proximo release, JSR publicaria `0.5.2` mientras npm publicaria `0.6.1` | Sincronizar `jsr.json` version con `package.json`. Incluir esta sincronizacion en el script de release o automatizarla en `prepublishOnly` |
| Repositorio URL mismatch | No conforme | Media | `package.json:17`: `"url": "git+https://github.com/MoLinesGitHub/Brew-TUI.git"`; `git remote -v`: `origin https://github.com/MoLinesDesigns/Brew-TUI.git`. URL en `package.json` apunta a usuario GitHub diferente al del remote real. Tambien afecta a `bugs.url` y `homepage` | Unificar el usuario GitHub (elegir entre `MoLinesGitHub` y `MoLinesDesigns`) y actualizar `package.json`, README, Formula, Cask y cualquier referencia hardcodeada |
| Token npm en `/Users/molinesmac/Documents/Secrets/npm token.md` | Parcial | Media | `CLAUDE.md (global)` documenta la ubicacion del token npm en texto plano fuera del repositorio. El token no esta en el repo (correcto), pero almacenarlo en Markdown sin cifrar es suboptimo. Si el token expira sin aviso, `npm publish` falla silenciosamente | Almacenar el token en el Keychain de macOS (`security add-generic-password`) o en un gestor de secretos (1Password CLI, Bitwarden) |
| Feature flags internos en `feature-gate.ts` | Conforme | — | `src/lib/license/feature-gate.ts`: `PRO_VIEWS` y `TEAM_VIEWS` son `Set<ViewId>` estaticos; sin servicio externo ni valores runtime | — |
| `.env` excluido de git y npm | Conforme | — | `.gitignore:6-8`: `.env`, `.env.*`. `.npmignore:14`: `.env`, `.env.*` | — |
| Certificados de firma excluidos de git | Conforme | — | `.gitignore:17-21`: `*.p12`, `*.cer`, `*.mobileprovision`, `AuthKey_*.p8` | — |
| Licencia MIT verificada | Conforme | — | `LICENSE:1`: `MIT License`; `package.json:44`: `"license": "MIT"`; `homebrew/Formula/brew-tui.rb:6`: `license "MIT"` — coherentes | — |
| `SECURITY.md` presente | Conforme | — | `SECURITY.md`: documenta scope, canal de reporte (GitHub private vulnerability reporting) y proceso de disclosure coordinado | Considerar anadir nota sobre el modelo de amenaza de las claves AES para que investigadores no lo reporten como vulnerabilidad nueva |
| `.gitattributes` ausente | No conforme | Baja | `find /Volumes/SSD/Projects/Brew-TUI -maxdepth 2 -name ".gitattributes"`: no encontrado. Sin `.gitattributes`, no hay normalizacion de line endings, ni marcadores de binary para PNG, ni `export-ignore` para tarballs de GitHub | Crear `.gitattributes` con: `* text=auto`, binarios (`*.png`, `*.p12`) como `binary`, `export-ignore` para `scripts/`, `superaudit-report/`, `screenshots/` |
| `exportOptions.plist` case mismatch con `.gitignore` | No conforme | Baja | `menubar/exportOptions.plist` (minuscula `e`) comprometido en git. `.gitignore:21` excluye `ExportOptions.plist` (mayuscula `E`). En filesystem macOS case-insensitive coinciden, pero en Linux CI (case-sensitive) el archivo se rastrea igualmente. Contenido actual (`method: none`) no filtra secretos pero crea confusion | Renombrar a `ExportOptions.plist` para coincidir con la regla del `.gitignore`, o excluir la variante en minuscula explicitamente |
| `scripts/launch-posts.md` comprometido en git | Parcial | Baja | `git ls-files scripts/launch-posts.md`: tracked. Contiene `<your-jsr-token>` como placeholder (linea 232), no un token real. Es contenido operacional/marketing | Anadir `scripts/launch-posts.md` a `.gitignore` si se considera contenido privado |

---

## Resumen de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| Critica | 0 |
| Alta | 7 |
| Media | 4 |
| Baja | 6 |

**Total hallazgos no conformes o parciales:** 17

### Detalle hallazgos Alta (prioridad)

Los 7 hallazgos de severidad Alta, distribuidos entre las secciones 2.1, 2.3 y 2.4:

1. **CI pipeline BrewBar inexistente** (seccion 2.1) — `.github/workflows/ci.yml` ubuntu-only, sin ningun step Swift. La release de BrewBar es 100% manual.
2. **`NSPrivacyAccessedAPICategoryFileTimestamp` sin justificacion** (seccion 2.3) — `PrivacyInfo.xcprivacy:14-21`: declarado sin ninguna llamada a APIs de timestamps de fichero en `menubar/BrewBar/Sources/**`.
3. **`ENCRYPTION_SECRET` AES en bundle npm (licencias)** (seccion 2.4) — `src/lib/license/license-manager.ts:78-79`. Limitacion documentada; evaluar migracion a Keychain.
4. **`ENCRYPTION_SECRET` AES en bundle npm (sync)** (seccion 2.4) — `src/lib/sync/crypto.ts:6-7`. Sin machine binding por diseno; limitacion de confidencialidad del sync iCloud.
5. **Clave AES derivada hex en binario Swift** (seccion 2.4) — `menubar/BrewBar/Sources/Services/LicenseChecker.swift:50`. Recuperable via `strings` en el binario sin necesidad del bundle npm.
6. **Homebrew Formula y Cask desactualizados** (seccion 2.4) — `brew-tui.rb:3` en `0.5.3` y `brewbar.rb:2` en `0.1.0` vs version publicada `0.6.1`.
7. **`jsr.json` desactualizado** (seccion 2.4) — `jsr.json:3`: version `0.5.2` vs `0.6.1`; riesgo de publicacion de version obsoleta en proximo ciclo de release.
