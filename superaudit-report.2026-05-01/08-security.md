# 13. Seguridad y privacidad

> Auditor: security-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto tiene una postura de seguridad activa y documentada: AES-256-GCM sobre el archivo de licencia, machine binding via UUID persistente, rate limiting en activaciones, canary functions, comprobacion de integridad del bundle y Hardened Runtime en BrewBar. Sin embargo, persiste una limitacion arquitectonica estructural — la clave AES de cifrado de licencias (y de sync) esta derivada de constantes literales embebidas tanto en el bundle npm como en el binario Swift, lo que permite a cualquier usuario extraer la clave y fabricar licencias validas localmente; la mitigacion activa (revalidacion server-side cada 24h) reduce pero no elimina el riesgo. Se identifican ademas hallazgos de severidad Critica (tokens npm con credenciales reales de publicacion en `.claude/settings.local.json`) y Alta (constantes AES literales en bundle npm y clave hex precomputada en binario Swift). El consentimiento para la funcion de marca de agua (watermark) tiene un defecto de diseno: el parametro `consent` tiene `true` como valor por defecto y `embedInvisibleWatermark` no recibe parametro de consentimiento, lo que permite incrustar datos de email silenciosamente. La privacidad es correcta en lo demas: sin telemetria involuntaria, sin permisos innecesarios, con `PrivacyInfo.xcprivacy` presente y crash reporter opt-in.

---

## 13.1 App y cliente

### Checklist

* [ ] Secretos hardcodeados ausentes del bundle distribuido — **Alta**: `ENCRYPTION_SECRET` y `SCRYPT_SALT` literales en `src/lib/license/license-manager.ts:78-79` (bundle npm publicado) y en `src/lib/sync/crypto.ts:6-7`
* [ ] Clave AES precomputada ausente del binario Swift — **Alta**: hex literal de 64 caracteres en `menubar/BrewBar/Sources/Services/LicenseChecker.swift:50-53`
* [ ] Tokens de publicacion npm ausentes de archivos locales — **Critica**: tokens npm reales presentes en `.claude/settings.local.json` (no rastreado por git gracias a gitignore global del usuario, pero en disco sin cifrar; blast radius: publicacion maliciosa del paquete npm)
* [x] Almacenamiento seguro de tokens de autenticacion — `license.json` escrito con permisos `0o600`, directorio con `0o700`; no se usa Keychain (documentado como limitacion conocida)
* [x] No hay tokens almacenados en `UserDefaults` — confirmado en BrewBar: solo configuracion no sensible (intervalo, preferencias)
* [x] ATS sin excepciones — no se encontro `NSAllowsArbitraryLoads` ni `NSExceptionDomains` en ninguna fuente fuera de `build/`
* [x] URLs HTTPS en codigo fuente — no se encontraron URLs `http://` en produccion; crash reporter y OSV usan HTTPS o validan host antes de HTTP local
* [x] Sin pinning de certificados — ausente, pero las llamadas a `api.polar.sh` y `api.osv.dev` usan TLS del sistema sin overrides; aceptable para el perfil de riesgo de un CLI
* [x] Logs sin PII sensible — el `logger` redirige a `~/.brew-tui/logs/brew-tui.log` en modo TUI; `console.log` en CLI solo muestra email al usuario como respuesta intencional del comando (`brew-tui activate`, `brew-tui status`)
* [x] No hay `print()` desnudos fuera de `#if DEBUG` en Swift — BrewBar usa `Logger(subsystem:category:)` de `os.log` con `privacy: .public` explicitamente donde se loguea informacion variable
* [x] Deep links / URL schemes ausentes — no se declaran `CFBundleURLTypes` ni `applinks:` en ninguna fuente
* [x] Clipboard sin datos sensibles — el unico uso de `NSPasteboard` es para copiar el comando de instalacion `npm install -g brew-tui` (no datos del usuario)
* [ ] Canary functions correctamente conectadas a codepaths protegidos — **Informativa**: `checkCanaries()` detecta parches masivos, pero las tres funciones canary (`isProUnlocked`, `hasProAccess`, `isLicenseValid`) son tan obvias en nombre que un atacante selectivo las omitira
* [x] `verifyPro()` compone todas las capas — `pro-guard.ts`: debugger detection + bundle integrity + store integrity + canaries + status directo + indirecto + degradation
* [x] `checkBundleIntegrity()` falla cerrado en produccion — `integrity.ts:44`: `return !_isProduction` cuando baseline es null; en produccion retorna `false`
* [x] `decryptLicenseData()` usa GCM auth tag — `license-manager.ts:113`: `decipher.setAuthTag(...)` antes de `.final()`; modificacion del ciphertext detectada
* [ ] Cast sin validacion post-desencriptado — **Baja**: `license-manager.ts:120`: `JSON.parse(...) as LicenseData` sin type guard; sin embargo, el GCM auth tag ya autentica el ciphertext antes de llegar a este punto — un atacante que llegue aqui ya tiene la clave, por lo que el type guard no constituye una capa de seguridad independiente; el riesgo principal es de corrupcion accidental de datos, no de escalada de privilegios
* [x] Built-in accounts eliminados — `getBuiltinAccountType` siempre retorna `null` (`license-manager.ts:15-17`); comentario SEG-009 documenta la vulnerabilidad previa
* [x] Machine binding presente en envelope — `saveLicense` incluye `machineId` en el JSON cifrado (`license-manager.ts:201`); `loadLicense` comprueba coincidencia (`license-manager.ts:173-176`)
* [x] Machine ID generado con `randomUUID()` — `polar-api.ts:43`: UUID v4 aleatorio, no determinista
* [x] Validacion de URL de API Polar — `polar-api.ts:51-58`: rechaza cualquier URL que no sea `https:` y cuyo hostname no termine en `polar.sh`
* [ ] Watermark con consentimiento explicito y opt-in — **Media**: `watermark.ts`: `getWatermark(license, consent = true)` tiene `consent` con valor por defecto `true`, de modo que cualquier llamador que omita el parametro incrusta el email del usuario silenciosamente; ademas `embedInvisibleWatermark(text, email)` no recibe parametro de consentimiento y codifica el email directamente
* [x] Notarizacion configurada para Release — Hardened Runtime habilitado (`ENABLE_HARDENED_RUNTIME: YES`), `CODE_SIGN_IDENTITY: "Developer ID Application"`, `--timestamp` declarado en `Project.swift`. **Nota**: la pipeline de release de BrewBar es completamente manual (confirmado en 02-governance.md); no hay automatizacion de notarizacion en CI — se asume uso de `notarytool submit` manualmente antes de distribuir

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `ENCRYPTION_SECRET` literal en bundle npm | No conforme | Alta | `src/lib/license/license-manager.ts:78`: `'brew-tui-license-aes256gcm-v1'`; `src/lib/sync/crypto.ts:6`: `'brew-tui-sync-aes256gcm-v1'` — bundle publicado en npm, cualquier usuario puede extraer la constante y la salt, derivar la clave con scrypt y descifrar/fabricar `license.json` | Derivar la clave combinando la constante con el machine-id del usuario (HKDF o scrypt con `machineId` como salt adicional); la clave resultante seria especifica por maquina y no exportable. Alternativa: migrar a Keychain para almacenar la clave derivada |
| Hex AES precomputada en binario Swift | No conforme | Alta | `menubar/BrewBar/Sources/Services/LicenseChecker.swift:50-53`: `let hex = "5c3b2ae2a3066bca28773f36db347d8c8a0a396d4b9fab628331446acd6d4126"` — la clave de 256 bits esta literalmente en el binario Mach-O; `strings BrewBar.app/Contents/MacOS/BrewBar` la expone sin herramienta especial | La clave TS y la Swift son equivalentes: cualquiera que derive una puede usar la otra. Misma solucion que el punto anterior: incluir machine-id como factor en la derivacion. Mientras tanto, el binario con Hardened Runtime dificulta la introspection en tiempo de ejecucion |
| Tokens npm con credenciales reales en `.claude/settings.local.json` | No conforme | Critica | `settings.local.json:56,58`: dos tokens `npm_*` en texto plano con capacidad de publicar el paquete `brew-tui` en npm. El archivo es excluido por gitignore global del usuario (`~/.config/git/ignore`) pero NO por el `.gitignore` del repo; un colaborador sin esa regla global los expondria. Blast radius: un atacante podria publicar una version maliciosa de `brew-tui` en npm, afectando a todos los usuarios del paquete | Revocar ambos tokens en npmjs.com de inmediato. Agregar `.claude/` al `.gitignore` del repositorio. Usar credenciales via `npm token create` con scope `publish` restringido al paquete. Considerar GitHub Actions OIDC para publicacion sin tokens persistentes |
| `JSON.parse(...) as LicenseData` sin type guard | Parcial | Baja | `src/lib/license/license-manager.ts:120`: cast directo sin validacion de campos. El riesgo de escalada de privilegios es minimo porque el GCM auth tag ya autentica el ciphertext antes de llegar aqui; el riesgo real es corrupcion accidental de datos por migracion de schema | Agregar un type guard `isValidLicenseData(data: unknown): data is LicenseData` que verifique campos requeridos; util para detectar errores de migracion de schema, aunque no aporte una capa de seguridad independiente |
| Watermark: `consent = true` por defecto en `getWatermark` | No conforme | Media | `watermark.ts`: `getWatermark(license, consent = true)` — el parametro `consent` tiene `true` como valor por defecto; cualquier llamada que omita el segundo argumento incrusta el email del usuario en el texto exportado sin notificacion explicita. `embedInvisibleWatermark(text, email)` no tiene parametro de consentimiento | Cambiar el valor por defecto a `consent = false`. Agregar un parametro `consent: boolean` a `embedInvisibleWatermark` y propagar la verificacion. Revisar todos los sitios de llamada para asegurar que el consentimiento es explicito y trazable |
| `search()` strip de guiones incompleto | Parcial | Baja | `brew-api.ts:64`: `term.replace(/^-+/, '')` elimina guiones iniciales pero no filtra caracteres de shell como `;`, `&`, `\n`, `$()`. La funcion pasa el termino a `spawn('brew', ['search', safeTerm])` — `spawn` con array de argumentos NO interpola shell, por lo que no hay inyeccion de comandos real; el riesgo es solo argumentos inesperados para `brew search` | El uso de `spawn` con array de args es correcto y suficiente. Considerar agregar una allowlist de caracteres permitidos (`/^[\w@./+\-\s]+$/`) para sanear lo que llega a `brew search` y mejorar la experiencia de error |
| `isProUnlocked` / canaries demasiado obvios | Informativa | Baja | `canary.ts:15-28`: los nombres de funcion son exactamente los que un atacante buscaria para parchear con `return true`; la tecnica decoy funciona contra busquedas por patron (find-replace `return false`) pero no contra un atacante que entienda el mecanismo | Ofuscar los nombres de las funciones canary con identificadores sin semantica obvia o moverlas a un modulo con nombre neutro |

---

## 13.2 Backend y transporte

### Checklist

* [x] Sin backend propio en el repositorio — el proyecto delega en Polar.sh (SaaS) y `api.molinesdesigns.com/api/promo`
* [x] Llamadas HTTPS a Polar — `polar-api.ts:52-56` valida protocolo y hostname antes de cada POST
* [x] Respuesta de activacion validada en tiempo de ejecucion — `polar-api.ts:118-120`: comprueba `activation.id`, `activation.license_key` antes de usar
* [x] Respuesta de validacion validada en tiempo de ejecucion — `polar-api.ts:161-163`: comprueba `res.id`, `res.status`, `res.customer`
* [x] Respuesta de promo validada en tiempo de ejecucion — `promo.ts:105-114` y `promo.ts:153-167`: comprueba tipo y campos antes de usar
* [x] Rate limiting en activaciones — `license-manager.ts:40-69`: 30s cooldown, 15 min lockout tras 5 fallos; en memoria, reinicia con el proceso (limitacion documentada)
* [x] TLS sistema en Node.js fetch — `fetchWithRetry` usa `fetch` nativo de Node 22 sin agentes custom ni CA path modificado; TLS por defecto del OS
* [x] TLS sistema en URLSession Swift — `URLSession.shared` sin delegate ni `ServerTrustPolicy` custom; TLS por defecto de macOS
* [x] Crash reporter no envia a destinos externos involuntarios — ambas implementaciones (TS y Swift) verifican que el endpoint sea HTTPS o HTTP local/LAN antes de enviar; desactivado por defecto
* [ ] Token del crash reporter en UserDefaults (BrewBar) — **Media**: `CrashReporter.swift:45-46`: `UserDefaults.standard.string(forKey: tokenKey)` — `UserDefaults` es texto plano legible por cualquier proceso del mismo usuario; un token secreto deberia estar en Keychain
* [x] OSV batch URL validada — `SecurityMonitor.swift:124`: `guard let url = URL(string: Self.osvBatchURL)` con fallback a error enum
* [x] Respuesta OSV validada con count check — `SecurityMonitor.swift:149-152`: `guard results.count == packages.count` antes de procesar

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Token de crash reporter en `UserDefaults` (BrewBar) | No conforme | Media | `CrashReporter.swift:45-46`: el token Bearer se lee de `UserDefaults.standard.string(forKey: "crashReporterToken")`; `UserDefaults` persiste en `~/Library/Preferences/com.molinesdesigns.brewbar.plist` en texto claro, accesible por cualquier proceso del usuario | Mover el token a Keychain (`kSecClassGenericPassword`) con `kSecAttrService="com.molinesdesigns.brewbar"` y `kSecAttrAccount="crashReporterToken"` |
| Promo API endpoint sin validacion de host | Parcial | Baja | `promo.ts:26`: `const PROMO_API_URL = 'https://api.molinesdesigns.com/api/promo'` — la URL es HTTPS y fija, pero `fetchWithTimeout` no tiene validacion de dominio equivalente a `validateApiUrl` de `polar-api.ts`. Si la constante se modificara (o en un fork) podria apuntar a HTTP | Agregar validacion de URL similar a `validateApiUrl` antes de los fetches en `promo.ts` |
| Rate limiting de activaciones solo en memoria | Informativa | Baja | `license-manager.ts:34`: `const tracker: ActivationTracker` reinicia con cada invocacion del proceso. Un atacante puede reiniciar el CLI y saltarse el lockout de 15 minutos | La defensa real contra fuerza bruta esta en Polar server-side. Documentar que el rate limit local es un primer filtro, no la barrera definitiva |

---

## 13.3 Privacidad

### Checklist

* [x] Sin telemetria involuntaria — no hay llamadas a Firebase Analytics, Mixpanel ni servicios similares; las unicas llamadas de red son Polar (licencia), OSV (CVEs) y el crash reporter opt-in
* [x] Crash reporter opt-in por defecto — `CrashReporter.install()` en BrewBar y `installCrashReporter()` en TS son no-op si no hay endpoint configurado
* [x] Logger TS sin PII — `logger.ts` no registra email, key ni datos de usuario; las llamadas a `logger.error` en `promo.ts` solo loguean el error generico
* [x] `cli_activated` muestra email al usuario — `index.tsx:27`: `console.log(t('cli_activated', { email: license.customerEmail }))` es salida intencional e informativa al usuario en un comando CLI interactivo, no un log persistido
* [x] `Logger` de BrewBar con `privacy: .public` explicito — todas las llamadas a `logger.info/error` en los servicios Swift especifican `privacy: .public` solo para datos no sensibles (rutas del sistema, conteos)
* [x] Sin permisos de sistema innecesarios — BrewBar no declara `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSContactsUsageDescription` ni similares; solo invoca `brew` via `Process`/`BrewProcess`
* [x] Sin `ATTrackingManager` — no se usa el framework de seguimiento de anuncios de Apple en ninguna parte
* [x] `PrivacyInfo.xcprivacy` presente y declarado — `menubar/BrewBar/Resources/PrivacyInfo.xcprivacy` existe, declara `NSPrivacyTracking: false`, `NSPrivacyCollectedDataTypes: []`, y dos `NSPrivacyAccessedAPITypes`
* [ ] `NSPrivacyAccessedAPITypes` incompleto — **Media**: el manifest declara `UserDefaults (1C8F.1)` y `FileTimestamp (C617.1)`, pero no declara `NSPrivacyAccessedAPICategoryDiskSpace` (si `FileManager` accede a atributos de disco) ni `NSPrivacyAccessedAPICategorySystemBootTime` (si se usa `Date()` en combinacion con uptime); requiere verificacion
* [x] Eliminacion de cuenta implementada — `brew-tui delete-account` elimina `~/.brew-tui/` completo; documentado en CLAUDE.md y en `index.tsx`
* [ ] Watermark con consentimiento opt-in real — **Media**: `watermark.ts:getWatermark(license, consent = true)` — el valor por defecto del parametro `consent` es `true`; `embedInvisibleWatermark(text, email)` no recibe parametro de consentimiento; el email se puede incrustar silenciosamente si el llamador omite el argumento
* [x] Machine ID no vinculado a hardware — generado con `randomUUID()` (no MAC, no serial); el usuario puede reiniciarlo eliminando `~/.brew-tui/machine-id`
* [x] iCloud sync cifrado end-to-end — `sync/crypto.ts`: AES-256-GCM sobre el payload completo; `SyncMonitor.swift` solo lee `updatedAt` sin descifrar contenido
* [x] Retencion de datos definida implicitamente — no hay purga automatica, pero los datos son locales (`~/.brew-tui/`) y eliminables con `delete-account`
* [x] Datos personales en `license.json` cifrados — `customerEmail` y `customerName` forman parte del payload cifrado con AES-256-GCM; no estan en claro en disco

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `PrivacyInfo.xcprivacy` potencialmente incompleto | Parcial | Media | `PrivacyInfo.xcprivacy:5-28`: declara `UserDefaults` y `FileTimestamp`. `SchedulerService.swift` y `SyncMonitor.swift` leen timestamps de archivos iCloud; `SecurityMonitor.swift` escribe cache con `.atomic` que usa `FileManager`. Si el compilador detecta uso de APIs de disco no declaradas, App Store Review puede rechazar la app | Revisar con `xcodebuild -generatePrivacyReport` o la herramienta de Xcode (Product > Privacy Report) y anadir los tipos faltantes segun el resultado |
| Watermark: consentimiento opt-in no garantizado | No conforme | Media | `watermark.ts`: `getWatermark(license, consent = true)` tiene `true` como valor por defecto — cualquier llamador que omita el segundo argumento incrusta el email del usuario en texto exportado sin consentimiento explicito. `embedInvisibleWatermark(text, email)` no recibe parametro de consentimiento y codifica el email directamente | Cambiar `consent = true` a `consent = false`. Agregar `consent: boolean` como parametro requerido en `embedInvisibleWatermark`. Revisar todos los call-sites para garantizar consentimiento explicito y trazable |
| Datos de licencia en `~/.brew-tui/` sin sandbox | Informativa | Baja | `data-dir.ts:5`: `~/.brew-tui/` con permisos `0o700`. Sin app sandbox (ver seccion 13.2), cualquier proceso ejecutado por el usuario puede leer los archivos; la mitigacion es que el ciphertext requiere la clave AES para ser util | El modo `0o700` en el directorio es la proteccion disponible sin sandbox. Como mejoria futura, considerar Keychain para la clave derivada |

---

## Registro de riesgos de seguridad

| Riesgo | Superficie | Severidad | Evidencia | Mitigacion |
|--------|------------|-----------|-----------|------------|
| Tokens npm con credenciales reales de publicacion en `.claude/settings.local.json` | Supply chain / local | Critica | `settings.local.json:56,58`: dos tokens `npm_*` en texto plano; no excluidos por `.gitignore` del repo; blast radius: publicacion maliciosa del paquete `brew-tui` afectando a todos los usuarios | Revocar ambos tokens en npmjs.com de inmediato. Agregar `.claude/` al `.gitignore` del repositorio. Usar tokens con scope `publish` restringido. Considerar GitHub Actions OIDC para publicacion sin tokens persistentes |
| Constantes AES literales en bundle npm permiten fabricar licencias localmente | App / Distribucion npm | Alta | `license-manager.ts:78-79`: `ENCRYPTION_SECRET = 'brew-tui-license-aes256gcm-v1'`; `SCRYPT_SALT = 'brew-tui-salt-v1'`. La clave derivada puede ser reproducida por cualquier usuario con el bundle. La misma vulnerabilidad existe para el cifrado de sync (`sync/crypto.ts:6-7`) | (1) Incorporar `machineId` como salt adicional en `scryptSync` para que la clave sea especifica por maquina y no sea reutilizable entre dispositivos. (2) Almacenar la clave derivada en Keychain en lugar de rederivarse en cada proceso |
| Hex AES precomputada literal en binario Swift (`LicenseChecker.swift`) | App macOS (BrewBar) | Alta | `LicenseChecker.swift:50-53`: `let hex = "5c3b2ae2a3066bca28773f36db347d8c8a0a396d4b9fab628331446acd6d4126"` — `strings` sobre el binario expone la clave de 256 bits en texto plano | Mismo remedio que el punto anterior: incorporar machine-id como factor. Mientras se implementa, Hardened Runtime dificulta la introspection en ejecucion, pero no protege el binario en disco |
| Watermark: consentimiento opt-in no garantizado por diseno de API | App / Privacidad | Media | `watermark.ts:getWatermark(license, consent = true)` — valor por defecto `true`; `embedInvisibleWatermark(text, email)` sin parametro de consentimiento; cualquier llamador que omita el argumento incrusta el email silenciosamente | Cambiar valor por defecto a `consent = false`; agregar `consent: boolean` como parametro requerido en `embedInvisibleWatermark`; auditar todos los call-sites |
| Token Bearer del crash reporter en `UserDefaults` (BrewBar) | App macOS | Media | `CrashReporter.swift:45-46`: `UserDefaults.standard.string(forKey: "crashReporterToken")`; el plist de preferencias es legible por cualquier proceso del usuario sin elevacion de privilegios | Mover el token a Keychain con `kSecClassGenericPassword`; eliminar la entrada de `UserDefaults` si existe |
| `PrivacyInfo.xcprivacy` potencialmente incompleto para App Store Review | App macOS | Media | `PrivacyInfo.xcprivacy:5-28`: puede faltar declaracion de disk space APIs segun el uso real de `FileManager` | Ejecutar `xcodebuild -generatePrivacyReport` y anadir entradas faltantes |
| Pipeline de notarizacion de BrewBar completamente manual, sin CI | App macOS / Distribucion | Media | 02-governance.md confirma pipeline de release manual; no hay automatizacion de `notarytool` en CI; un error humano podria distribuir una version sin notarizar | Integrar `xcrun notarytool submit --wait` y `xcrun stapler staple` en un script de release o GitHub Actions; bloquear el upload si la notarizacion falla |
| `JSON.parse(...) as LicenseData` sin type guard post-desencriptado | App / Licencia | Baja | `license-manager.ts:120`: cast directo sin validacion de campos. El GCM auth tag ya autentica antes de llegar aqui; el riesgo es corrupcion accidental por migracion de schema, no escalada de privilegios | Agregar `isValidLicenseData(unknown): boolean` para detectar errores de migracion de schema |
| Rate limiting de activaciones solo en memoria (bypass por reinicio) | App / Licencia | Baja | `license-manager.ts:34-69`: el tracker reinicia con el proceso; 5 intentos fallidos no persisten entre invocaciones del CLI | La barrera definitiva es Polar server-side. Documentarlo; opcionalmente persistir el tracker en `~/.brew-tui/rate-limit.json` para resistir reinicios |
| `search()` acepta caracteres especiales (sin riesgo de inyeccion real por `spawn` con array) | App / CLI | Baja | `brew-api.ts:62-66`: solo se eliminan guiones iniciales; caracteres como `;`, `$()` pasan al argumento de `brew search`. `spawn` con array no interpola shell — no hay inyeccion de comandos | Agregar allowlist `term.replace(/[^\w@./+\-\s]/g, '')` para limitar a caracteres validos en nombres de paquetes Homebrew |
| App Sandbox desactivado en BrewBar (necesario para ejecutar `brew`) | App macOS | Informativa | `Project.swift`: sin `com.apple.security.app-sandbox`; BrewBar necesita ejecutar `/opt/homebrew/bin/brew` via `Process`, incompatible con sandbox | Documentar explicitamente la decision arquitectonica en el README de seguridad. Evaluar si un XPC helper podria aislar la ejecucion de brew |
| Machine binding debil: `machineId` legible y reemplazable en disco | App / Licencia | Informativa | `~/.brew-tui/machine-id` con permisos `0o600` — un administrador o root puede copiar el UUID a otra maquina y la comprobacion de machine binding fallaria | El machine-id no pretende ser infalsificable; es una capa de friccion. Documentarlo como tal. Para mayor robustez, combinar con un identificador hardware no copiable (IOKit serial) |
| `canary.ts`: nombres de funciones demasiado semanticos facilitan bypass selectivo | App / Licencia | Informativa | `canary.ts:15-28`: `isProUnlocked`, `hasProAccess`, `isLicenseValid` — nombres que un atacante buscaria deliberadamente para parchear | Ofuscar los nombres de las funciones canary o generarlos dinamicamente; usar identificadores sin semantica obvia |
