# 2. Gobierno del proyecto

> Auditor: governance-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

El proyecto presenta una base de gobierno solida: CI dual (Ubuntu para TypeScript + macOS para Swift), hook pre-push con validate completo, firma y notarizacion correctamente configuradas para BrewBar, y gestion de secretos sin tokens hardcodeados. Los hallazgos principales son la desincronizacion critica entre la version publicada (1.2.1) y los descriptores del tap local (0.7.0), 198 archivos de artefactos Playwright trackeados en git que deberian eliminarse del indice, y referencias al nombre de organizacion legacy `MoLinesGitHub` activas en `CODEOWNERS` y en el descriptor MacPorts.

---

## 2.1 Targets, schemes y configuracion

### Checklist

* [x] Todos los targets tienen proposito claro
* [x] No existen targets obsoletos
* [x] Los schemes estan alineados con los entornos reales
* [x] Debug, Release y Staging estan separados correctamente
* [ ] No hay flags inconsistentes entre entornos — **Baja**: `ENABLE_HARDENED_RUNTIME` se desactiva en Debug para permitir Xcode Preview JIT; comportamiento correcto pero divergente respecto a Release; esta documentado en comentario del manifest
* [x] La configuracion de testing no contamina produccion

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Target `BrewBar` (app menubar macOS 14+) | Conforme | — | `menubar/Project.swift:53` | — |
| Target `BrewBarTests` (XCTest) | Conforme | — | `menubar/Project.swift:93` | — |
| Target `brewtui-bar` (npm CLI binary) | Conforme | — | `package.json:6-8`, `bin/brewtui-bar.js` | — |
| Configuraciones Debug / Release en Project.swift | Conforme | — | `menubar/Project.swift:47-50` | — |
| Debug desactiva `ENABLE_HARDENED_RUNTIME` | Parcial | Baja | `menubar/Project.swift:83-89` — deliberado para Xcode Preview; documentado en comentario | Mantener el comentario; verificar periodicamente que no se filtre a Release |
| Separacion testing / produccion | Conforme | — | `BrewBarTests` usa `bundleId` propio y depende del target `BrewBar` como dependencia de test | — |
| CI job `brewbar` usa `CODE_SIGN_IDENTITY="-"` | Conforme | — | `.github/workflows/ci.yml:51,63` — correcto para CI sin certificados de firmado | — |
| Tuist no esta pinado en CI | Parcial | Media | `.github/workflows/ci.yml:38` — `curl -Ls https://install.tuist.io | bash` descarga la version mas reciente sin pinado; un breaking release de Tuist rompe el job `brewbar` silenciosamente | Pinnar Tuist en CI mediante `mise` o `asdf`, o especificando version en el comando curl; documentar version esperada |

---

## 2.2 Build settings

### Checklist

* [x] Swift language version correcta — `SWIFT_VERSION=6.0` (`menubar/Project.swift:37`)
* [x] Strict concurrency activada segun politica del proyecto — `SWIFT_STRICT_CONCURRENCY=complete` (`menubar/Project.swift:45`)
* [ ] Warnings relevantes tratados como errores donde proceda — **Baja**: ESLint sobre TypeScript usa `warn` (no `error`) para `@typescript-eslint/no-unused-vars`; Swift no expone `SWIFT_TREAT_WARNINGS_AS_ERRORS` en el manifest
* [x] Optimizacion de Release correcta — Swift Release usa configuracion `.release(name: "Release")` con `DEAD_CODE_STRIPPING=YES`; TypeScript bundlea con tsup target `node22` en modo produccion (`process.env.NODE_ENV=production`)
* [x] No hay linker flags heredados innecesarios — `OTHER_CODE_SIGN_FLAGS` se limpia a `""` en Debug (`menubar/Project.swift:88`); ningun `OTHER_LDFLAGS` inusual detectado
* [x] No hay paths hardcodeados locales — `/home/linuxbrew/.linuxbrew/bin/brew` en `BrewProcess.swift:29` es ruta canonica de Homebrew Linux (fallback documentado), no una ruta de desarrollador
* [x] Arquitecturas configuradas correctamente — `destinations: .macOS` en Tuist; `target: 'node22'` en tsup; no se detectan exclusiones de arquitectura inconsistentes

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `SWIFT_VERSION=6.0` | Conforme | — | `menubar/Project.swift:37` | — |
| `SWIFT_STRICT_CONCURRENCY=complete` | Conforme | — | `menubar/Project.swift:45` | — |
| `DEAD_CODE_STRIPPING=YES` | Conforme | — | `menubar/Project.swift:42` | — |
| `ENABLE_USER_SCRIPT_SANDBOXING=YES` | Conforme | — | `menubar/Project.swift:43` — buena practica de seguridad de build | — |
| TypeScript `strict: true` en tsconfig | Conforme | — | `tsconfig.json:8` | — |
| TypeScript target `ES2022` + `NodeNext` | Conforme | — | `tsconfig.json:4-6` | — |
| `@typescript-eslint/no-unused-vars` como `warn` (no `error`) | Parcial | Baja | `eslint.config.js:36` — variables no usadas no bloquean el build | Elevar a `error` o mantener politica documentada de forma consciente |
| `tsup` sourcemap `hidden` en produccion | Conforme | — | `tsup.config.ts:12` — sourcemaps generados pero no referenciados en el bundle; correcto para debugging sin exposicion publica | — |
| `__TEST_MODE__` y `APP_VERSION` definidos en build | Conforme | — | `tsup.config.ts:14-18`; `process.env.APP_VERSION` inyectado desde `package.json` | — |
| `SWIFT_TREAT_WARNINGS_AS_ERRORS` no declarado | Parcial | Baja | `menubar/Project.swift` — la configuracion por defecto de Tuist no activa esta flag en Release; aumenta el riesgo de warnings silenciados | Valorar `"SWIFT_TREAT_WARNINGS_AS_ERRORS": "YES"` en la configuracion Release |

---

## 2.3 Info.plist, entitlements y capabilities

### Checklist

* [x] Info.plist minimo y coherente — generado por Tuist via `infoPlist: .extendingDefault(with:)`; contiene solo claves necesarias
* [x] Permisos del sistema justificados — BrewBar no declara claves `NS*UsageDescription`; no accede a camara, microfono, ubicacion ni contactos
* [x] Entitlements minimos necesarios — no existe archivo `.entitlements` separado; app Developer ID no-sandboxed; correcto para el caso de uso
* [x] Capabilities activadas solo si se usan — `UNUserNotificationCenter` y `SMAppService` no requieren entitlements para apps Developer ID no-sandboxed en macOS
* [x] Universal Links / Associated Domains — no aplica; no se usa
* [x] App Groups — no se usan (`UserDefaults(suiteName:)` y `containerURL(forSecurityApplicationGroupIdentifier:)` ausentes en el codebase Swift)
* [x] Keychain Sharing — no se usa (`kSecAttrAccessGroup` ausente en Swift sources)
* [x] Background modes — no aplica; `LSUIElement: true` con polling propio; sin BGTaskScheduler

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `LSUIElement: true` | Conforme | — | `menubar/Project.swift:60` — app sin icono en Dock; correcto para menubar | — |
| `LSApplicationCategoryType: developer-tools` | Conforme | — | `menubar/Project.swift:61` | — |
| Ausencia de `.entitlements` en app no-sandboxed | Conforme | — | `find menubar/ -name "*.entitlements"` retorna vacio; Developer ID no-sandboxed no requiere entitlements para `UNUserNotificationCenter` ni `SMAppService` | — |
| `PrivacyInfo.xcprivacy` presente | Conforme | — | `menubar/BrewBar/Resources/PrivacyInfo.xcprivacy` — declara `NSPrivacyAccessedAPICategoryUserDefaults` con razon `1C8F.1`; `NSPrivacyTracking: false`; `NSPrivacyCollectedDataTypes: []` | — |
| `NSHumanReadableCopyright` sin anio | Parcial | Baja | `menubar/Project.swift:67` — valor `"MoLines Designs"` sin anio de copyright; convenciones de App Store recomiendan incluir anio | Actualizar a `"© 2025 MoLines Designs"` o similar |
| `ENABLE_HARDENED_RUNTIME=YES` en Release | Conforme | — | `menubar/Project.swift:76` — obligatorio para notarizacion; correcto | — |
| `CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO` en Release | Conforme | — | `menubar/Project.swift:77` — correcto para Developer ID Manual signing | — |
| `--timestamp` en `OTHER_CODE_SIGN_FLAGS` | Conforme | — | `menubar/Project.swift:78` — timestamp de Apple embebido; requerido para notarizacion | — |
| `exportOptions.plist` existente localmente | Parcial | Baja | Archivo presente en disco pero gitignoreado; un clone limpio no puede ejecutar `release.sh` sin recrearlo manualmente. Contiene `teamID: GD6M44DYPQ` y `method: developer-id` | Documentar la estructura del archivo en `menubar/scripts/release.sh` o proporcionar una plantilla `exportOptions.plist.example` en el repo |

---

## 2.4 Gestion de entornos y secretos

### Checklist

* [x] Secrets fuera del codigo fuente — no se encuentran API keys, tokens de autenticacion ni passwords hardcodeados en `src/`
* [ ] Variables por entorno bien separadas — **Media**: no hay `.xcconfig`, `.env.example` ni separacion formal de configuracion por entorno; las URLs de produccion (Polar, promo API) estan hardcodeadas en el codigo fuente como constantes
* [ ] Configuracion local no filtrada al repo — **Alta**: 198 archivos en `.playwright-mcp/` (110 snapshots YAML, 60 PNG, 26 logs, 2 MD) trackeados en git a pesar de estar listados en `.gitignore`; la regla se agregó despues del commit inicial
* [x] Feature flags auditados — no se usa sistema de feature flags externo (LaunchDarkly, Firebase Remote Config); el gating de features se implementa via `PRO_VIEWS`/`TEAM_VIEWS` en `src/lib/license/feature-gate.ts` (codigo estatico compilado); no hay flags en runtime con estado mutable
* [ ] Fallbacks seguros cuando falta configuracion — **Baja**: umbrales de cobertura en `vitest.config.ts` (50/60%) no se activan en CI porque `npm run validate` no invoca `--coverage`; configuracion declarada pero sin efecto real

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `.playwright-mcp/` — 198 archivos trackeados en git | No conforme | Alta | `git ls-files .playwright-mcp/` — 110 archivos `.yml` (page snapshots), 60 `.png`, 26 `.log`, 2 `.md`; la regla en `.gitignore:34` existe pero no surte efecto sobre archivos ya indexados | Ejecutar `git rm -r --cached .playwright-mcp/` y hacer commit; la regla `.gitignore` ya existe, solo falta limpiar el indice |
| `ENCRYPTION_SECRET` y `HKDF_SALT` en bundle publicado | Conforme | — | `src/lib/license/license-manager.ts:82-83` — documentado explicitamente (GOV-004, SEG-002): son publicos; el secreto real es el `machineId` local que nunca sale del dispositivo; la derivacion HKDF mezcla ambos | — |
| URLs produccion hardcodeadas en codigo fuente | Parcial | Media | `src/lib/license/polar-api.ts:5` (`https://api.polar.sh/v1/...`), `src/lib/license/promo.ts:11` (`https://api.molinesdesigns.com/api/promo`) — constantes en el bundle publicado; no hay mecanismo de override sin recompilar | Aceptable para proyecto open-source sin entornos de staging; documentar que las URLs son constantes de produccion sin override en runtime |
| No hay `.env.example` ni documentacion de variables de entorno | Parcial | Media | `find . -name ".env.example"` retorna vacio; el unico mecanismo de configuracion de entorno es `NOTARY_PROFILE` (env variable para `release.sh`) y `LOG_LEVEL` (para el logger), ambos sin documentacion de referencia centralizada | Crear `docs/env-vars.md` o seccion en README enumerando las variables de entorno reconocidas |
| `NOTARY_PROFILE` gestionado via keychain (no env file) | Conforme | — | `menubar/scripts/release.sh:27` — requiere `xcrun notarytool store-credentials`; no se almacena en archivo plano | — |
| Polar `ORGANIZATION_ID` y `PRODUCT_IDS` publicos en codigo | Conforme | — | `src/lib/license/polar-api.ts:10-19` — comentario GOV-004 los marca explicitamente como publicos (no secretos); son IDs de organizacion del dashboard de Polar | — |
| Checkout URLs de Polar en codigo | Conforme | — | `src/lib/license/polar-api.ts:24-29` — URLs de checkout publicas; no son secretos | — |
| npm token almacenado fuera del repo | Conforme | — | Referenciado en `CLAUDE.md` como `/Users/molinesmac/Documents/Secrets/npm token.md`; no trackeado en git | — |
| `_legacyKey` (scrypt) pendiente de eliminar | Parcial | Baja | `src/lib/license/license-manager.ts:103-106` — comentario `TODO(SEG-003, 0.6.3)` indica que debia eliminarse cuando telemetria confirmara cero fallbacks; la version actual es 1.2.1 y el codigo sigue presente | Verificar telemetria y eliminar `_legacyKey` + `deriveLegacyKey()` si se confirman cero fallbacks; reduce superficie de ataque |
| Umbrales de cobertura inactivos en CI | Parcial | Baja | `vitest.config.ts:24-31` — umbrales declarados (50/60%) pero `npm run validate` no pasa `--coverage`; el comentario `QA-004` documenta la intencion; el gate nunca dispara | Considerar job separado en CI con `--coverage` o remover los umbrales si no hay plan de activarlos |
| Feature flags estaticos en `feature-gate.ts` | Conforme | — | `src/lib/license/feature-gate.ts` — `PRO_VIEWS` y `TEAM_VIEWS` como conjuntos estaticos compilados; sin estado mutable en runtime; modelo simple y auditado | — |
| `.gitignore` excluye correctamente secretos de firma | Conforme | — | `.gitignore:13-29` — excluye `*.p12`, `*.cer`, `*.mobileprovision`, `AuthKey_*.p8`, `BrewBar.app.zip`, `BrewBar.app.zip.sha256`, `exportOptions.plist` | — |

---

## 2.5 Coherencia de versiones y canales de publicacion

> Seccion adicional requerida por el contexto del proyecto dual (TypeScript + Swift) y multiples canales de distribucion.

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Version coherente entre `package.json`, CHANGELOG y git tag | Conforme | — | `package.json:4` → `1.2.1`; `CHANGELOG.md:3` → `[1.2.1] - 2026-05-18`; ultimo tag → `v1.2.1` | — |
| `MARKETING_VERSION` de BrewBar leido de `package.json` | Conforme | — | `menubar/Project.swift:11-27` — `readMarketingVersion()` parsea `package.json` en generate-time; fuente unica de verdad entre ambos productos | — |
| `homebrew/Formula/brewtui-bar.rb` desactualizado | No conforme | Alta | `homebrew/Formula/brewtui-bar.rb:4` → version `0.7.0`; version publicada → `1.2.1`; diferencia de 9 releases. Este archivo es una copia local del tap canonical (`MoLinesDesigns/homebrew-tap`), no el archivo publicado, pero induce a error a cualquier contribuidor | Actualizar a 1.2.1 con el SHA256 del tarball publicado, o eliminar el directorio `homebrew/` del repo y documentar que el tap canonical esta en `MoLinesDesigns/homebrew-tap` |
| `homebrew/Casks/brewbar.rb` desactualizado | No conforme | Alta | `homebrew/Casks/brewbar.rb:2` → version `0.7.0`; version publicada → `1.2.1`; diferencia de 9 releases | Misma accion que Formula: actualizar o eliminar la copia local |
| `homebrew/macports/brewtui-bar.tcl` obsoleto y con referencias legacy | No conforme | Media | `homebrew/macports/brewtui-bar.tcl:7` → version `0.1.0`; checksums invalidos (`0000...`); `homebrew/macports/brewtui-bar.tcl:12` → `@MoLinesGitHub` (org legacy); `homebrew/macports/brewtui-bar.tcl:20` → `https://github.com/MoLinesGitHub/BrewTUI-Bar` | Si MacPorts no es un canal activo, eliminar el archivo. Si lo es, actualizar version, checksums, maintainer y homepage |
| `brewtui-bar` `DOWNLOAD_URL` en `brewbar-installer.ts` apunta a org correcta | Conforme | — | `src/lib/brewbar-installer.ts:14` → `https://github.com/MoLinesDesigns/BrewTUI-Bar/releases/latest/download/BrewBar.app.zip` | — |
| `.github/CODEOWNERS` usa handle legacy `@MoLinesGitHub` | No conforme | Alta | `.github/CODEOWNERS:1` → `* @MoLinesGitHub`; la org fue renombrada a `MoLinesDesigns`; las solicitudes de review automaticas fallan silenciosamente o se enrutan a un usuario que puede no tener acceso | Actualizar a `* @MoLinesDesigns` o al usuario/equipo correcto en la organizacion actual |
| Dependabot no cubre Swift/Tuist | Parcial | Baja | `.github/dependabot.yml` — solo configura el ecosistema `npm`; no hay entrada para `swift` ni para la version de Tuist en CI | Valorar agregar monitoreo de actualizaciones de Tuist; Swift sin SPM externos actualmente no aplica |
| `release.sh` no tiene paso de actualizacion del tap local | Parcial | Baja | `menubar/scripts/release.sh:91-95` — los "Next steps" son comentarios manuales; no hay automatizacion de bump de version en `homebrew/Formula/` ni `homebrew/Casks/` | Agregar instruccion explicita en release.sh o script auxiliar; mitigacion parcial si se elimina el directorio `homebrew/` local |

---

## Resumen de hallazgos

| Severidad | Cantidad |
|-----------|----------|
| Critica | 0 |
| Alta | 4 |
| Media | 3 |
| Baja | 8 |

**Total hallazgos no conformes o parciales:** 15

### Hallazgos Alta por orden de prioridad

1. `.playwright-mcp/` — 198 archivos trackeados en git (sesiones internas Playwright); accion: `git rm -r --cached .playwright-mcp/`
2. `.github/CODEOWNERS` → `* @MoLinesGitHub`; handle legacy inactivo; reviews automaticos no funcionan
3. `homebrew/Formula/brewtui-bar.rb` en repo a version 0.7.0 (publicada: 1.2.1); copia local 9 releases atrasada
4. `homebrew/Casks/brewbar.rb` en repo a version 0.7.0 (publicada: 1.2.1); copia local 9 releases atrasada
