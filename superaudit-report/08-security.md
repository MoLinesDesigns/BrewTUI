# 13. Seguridad y privacidad

> Auditor: security-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

El proyecto BrewTUI-Bar + BrewBar presenta una base criptografica solida: AES-256-GCM con derivacion HKDF-SHA256 machine-bound, escrituras atomicas con permisos restrictivos, arquitectura anti-tamper multicapa (canary, anti-debug, integridad de bundle, pro-guard) y ausencia de secretos en el repositorio rastreado. Se detectan dos hallazgos de severidad Alta activos: una fuga de PII (email y clave de licencia) al log del sistema macOS desde `LicenseChecker.swift` con `privacy: .public`, y ausencia de validacion de `PKG_PATTERN` en `compliance-remediator.ts` que permite inyeccion de argumentos a `brew`. La deuda de migracion de la clave scrypt legacy (TODO pendiente desde v0.6.3, proyecto en v1.2.0) y dos vulnerabilidades moderadas de dependencias npm completan el cuadro de riesgo, todo ello manejable con acciones concretas descritas en este reporte.

---

## 13.1 App y cliente

### Checklist

* [x] Ausencia de secretos hardcodeados en archivos rastreados por git
* [x] `.gitignore` cubre `.env`, `*.p12`, `*.cer`, `AuthKey_*.p8`, `menubar/build/`
* [x] Tokens de autenticacion no almacenados en `UserDefaults`
* [x] Token del crash-reporter almacenado en Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`)
* [x] `UserDefaults` usado solo para preferencias de UI no sensibles (`BadgePreferences`, login-item flag)
* [x] Transporte exclusivamente HTTPS para todas las APIs externas (Polar, OSV, promo, crash)
* [x] Sin excepciones `NSAllowsArbitraryLoads` en ATS
* [x] Sin URL schemes registrados en `CFBundleURLTypes`
* [x] `NSPasteboard` usado solo para comandos CLI no sensibles ("npm install -g brewtui-bar", "brewtui-bar install-brewbar --force")
* [x] Hardened Runtime habilitado en Release (`ENABLE_HARDENED_RUNTIME: YES`)
* [x] Developer ID + notarizacion (`CODE_SIGN_IDENTITY: Developer ID Application`, `--timestamp`)
* [x] `spawn` en BrewBar usa rutas absolutas (`/opt/homebrew/bin/brew`, `/usr/local/bin/brew`)
* [x] Args de `spawn`/`Process` pasados como array — sin `shell: true`
* [x] `PKG_PATTERN` aplicado en `brew-api.ts` para todos los paquetes que llegan a CLI
* [x] Anti-tamper multicapa: canary (siempre `false`), anti-debug, integridad de bundle SHA-256, `verifyStoreIntegrity()`
* [x] SEG-009 conforme: `getBuiltinAccountType()` retorna `null` incondicionalmente; test de regresion en `license-manager.test.ts:505-525`
* [x] HKDF-SHA256 machine-bound como clave primaria (`machineId` como `info`)
* [x] Escrituras atomicas (tmp+rename) con modo `0o600`/`0o700` en todos los archivos de datos
* [x] Rate limiter documentado: cooldown 30 s + lockout 15 min tras 5 fallos consecutivos
* [x] Degradacion gradual conforme: 0-7 d none, 7-14 d warning, 14-30 d limited, 30 d+ expired; `isExpired()` falla cerrado en fechas NaN
* [ ] Log de estado de licencia sin PII — **Alta**: `LicenseChecker.swift` lineas 205 y 212 exponen `LicenseStatus.pro(LicenseData)` con `privacy: .public`, filtrando email y clave al Unified Log del sistema
* [ ] Validacion de `PKG_PATTERN` en todos los paths de ejecucion brew — **Alta**: `compliance-remediator.ts` lineas 18 y 29 pasan `v.packageName` a `streamBrew` sin validar
* [ ] Clave scrypt legacy eliminada (SEG-003) — **Media**: TODO referencia v0.6.3; proyecto en v1.2.0; fallback activo en `license-manager.ts:104` y `sync/crypto.ts`
* [ ] `brew` resuelto con ruta absoluta en TUI — **Media**: `brew-cli.ts` invoca `spawn('brew', ...)` via PATH heredado, sin ruta absoluta
* [ ] Dependencias npm sin vulnerabilidades conocidas — **Media**: `npm audit` reporta 2 vulnerabilidades moderadas (brace-expansion DoS, ws memory disclosure)
* [ ] `embedInvisibleWatermark` implementado en flujos de exportacion — **Baja**: funcion presente pero sin llamadores en produccion; el watermark invisible no se aplica realmente
* [ ] Rate limit persistente entre reinicios — **Baja**: tracker en memoria (documentado como UX-004); reinicio limpia el contador
* [ ] Entitlements file explicitamente gestionado en repo — **Baja**: `codesign` muestra dict vacio; no hay archivo `.entitlements` en el manifiesto Tuist
* [ ] `checkBundleIntegrity()` detecta parches pre-carga — **Baja**: solo detecta modificaciones en disco post-carga; parches en memoria o pre-ejecucion son indetectables

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| PII en Unified Log (LicenseStatus) | No conforme | Alta | `LicenseChecker.swift:205,212` — `privacy: .public` con `String(describing: status)` expone `key`, `instanceId`, `customerEmail`, `customerName` | Implementar `CustomStringConvertible` en `LicenseStatus`/`LicenseData` que redacte campos sensibles, o cambiar a `privacy: .private` |
| Inyeccion de argumentos en compliance | No conforme | Alta | `compliance-remediator.ts:18,29` — `streamBrew(['install', v.packageName])` sin validar; `isValidPolicy()` en `policy-io.ts` no filtra valores de paquetes | Importar `validatePackageName` de `brew-api.ts` y llamarla antes de cada `streamBrew` en `compliance-remediator.ts`; anadir validacion de paquetes en `isValidPolicy()` |
| Clave scrypt legacy activa (SEG-003) | Parcial | Media | `license-manager.ts:104`, `sync/crypto.ts` — `scryptSync(ENCRYPTION_SECRET, HKDF_SALT, 32)` como fallback; TODO marcado para v0.6.3, proyecto en v1.2.0 | Eliminar rama `legacyKey` tras confirmar telemetria de zero fallback decrypts; el auto-upgrade a HKDF ya existe en ambos modulos |
| `brew` via PATH en TUI | Parcial | Media | `brew-cli.ts` — `spawn('brew', args, ...)` sin ruta absoluta; PATH heredado del entorno del usuario | Buscar brew en rutas canonicas (`/opt/homebrew/bin/brew`, `/usr/local/bin/brew`) antes de hacer spawn, igual que BrewBar |
| Vulnerabilidades npm (brace-expansion, ws) | No conforme | Media | `npm audit`: brace-expansion < 3.0.3 (ReDoS, CVSS 5.3) y ws < 8.17.1 (memory disclosure, CVSS 5.3); ambas con fix disponible | Ejecutar `npm audit fix`; verificar que no haya breaking changes en dependencias transitivas |
| `embedInvisibleWatermark` sin llamadores | No conforme | Baja | `watermark.ts` exporta la funcion; busqueda en `src/` devuelve zero referencias productivas; solo `getWatermark()` (watermark visible) se usa en `profile-manager.ts:119` | Implementar llamada en el flujo de exportacion de perfiles con `consent=true`, o documentar explicitamente como funcionalidad diferida y eliminar del surface publico |
| Rate limit volatil (UX-004) | Parcial | Baja | `license-manager.ts` — objeto `tracker` en memoria; reinicio del proceso limpia lockout | Persistir el estado del lockout en `~/.brewtui-bar/rate-limit.json` con modo `0o600`; leer en inicio para resistir reinicios rapidos |
| Entitlements sin archivo explicitamente versionado | Parcial | Baja | `codesign --display --entitlements - BrewBar.app` → `<dict/>`; `Project.swift` no define `entitlements:` en `.target()` | Crear `BrewBar/BrewBar.entitlements` con el conjunto minimo y referenciarlo en `Project.swift` para auditabilidad y control deliberado |
| `checkBundleIntegrity` limitado a post-carga | Parcial | Baja | `integrity.ts` — baseline capturado al cargar el modulo; parches aplicados antes de `require` o en memoria no son detectados | Documentar la limitacion en comentario; considerar firma de codigo como complemento (ya existe via Developer ID) |

---

## 13.2 Backend y transporte

### Checklist

* [x] Todas las URLs de API validadas como HTTPS antes de uso (`validateApiUrl()` en `polar-api.ts`, `validatePromoApiUrl()` en `promo.ts`, `isHttpsOrLocal()` en crash-reporter)
* [x] Hostname de Polar fijado: solo `polar.sh` aceptado
* [x] Hostname de promo fijado: solo `molinesdesigns.com` aceptado
* [x] Validacion en runtime de respuestas de Polar (activacion, validacion) — no `as Type` a ciegas
* [x] Validacion en runtime de respuestas de promo (`validatePromoCode` lineas 106-116; `redeemPromoCode` lineas 162-173)
* [x] Validacion en runtime de respuestas de OSV.dev (`data.results` es array y longitud coincide)
* [x] Clave de licencia nunca registrada en logs de la capa TypeScript
* [x] `POLAR_ORGANIZATION_ID` y `POLAR_PRODUCT_IDS` son identificadores publicos, no secretos
* [x] OSV.dev: solo nombre + version + ecosistema enviados; sin PII
* [x] Promo API: envia `{ code, machineId, idempotencyKey }` — sin email, sin clave de licencia; idempotency key previene doble consumo (EP-002)
* [x] Trailing slash en endpoints Polar para evitar 307 + perdida de `Authorization` en redirect
* [x] `isValidEnvelope()` type guard antes de consumir datos de sync iCloud
* [x] iCloud sync cifrado AES-256-GCM con clave derivada del license key (HKDF)
* [x] Escritura atomica en `icloud-backend.ts` (tmp+rename, modo `0o600`)
* [ ] Clave scrypt legacy en sync eliminada (SEG-003) — **Media**: `sync/crypto.ts` mismo TODO que license-manager (detalle en 13.1)
* [x] Sin backend propio expuesto; superficie de ataque de transporte limitada a APIs de terceros (Polar, OSV, molinesdesigns.com)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Clave scrypt legacy en sync/crypto.ts | Parcial | Media | `sync/crypto.ts` — fallback `scryptSync` activo; misma deuda que license-manager (SEG-003); TODO referencia v0.6.3, proyecto en v1.2.0 | Eliminar junto con la rama equivalente en license-manager; asegurar migracion automatica (ya presente) antes de eliminar |

---

## 13.3 Privacidad

### Checklist

* [x] Analytics doble-gate: `cachedConsent === 'granted'` Y `registeredSink !== null` — sin sink remoto por defecto
* [x] Taxonomia de eventos fija; sin eventos ad-hoc con datos arbitrarios
* [x] Crash reporter opt-in (variable de entorno o archivo de configuracion explicitamente creado)
* [x] Reporte de crash: `app`, `version`, `platform`, `os`, `arch`, `machineId`, `timestamp`, `level`, `message`, `stack`, `context` — sin email, sin clave de licencia
* [x] `NSPrivacyTracking: false` en `PrivacyInfo.xcprivacy`
* [x] `NSPrivacyCollectedDataTypes: []` en `PrivacyInfo.xcprivacy`
* [x] `NSPrivacyAccessedAPITypes` declara UserDefaults con razon `1C8F.1`
* [x] Sin `requestTrackingAuthorization` (ATT) — no tracking publicitario
* [x] Sin permisos de sistema solicitados en `Info.plist` (camara, microfono, ubicacion, fotos, contactos, calendario)
* [x] Watermark visible requiere parametro `consent` explicitamente `true` en la llamada
* [x] `delete-account` / `deleteAccount()` subcomando documentado y disponible
* [x] Datos almacenados localmente en `~/.brewtui-bar/` (sin servidor central de datos de usuario)
* [x] Machine-id es UUID anonimo generado localmente; no vinculado a identidad real del usuario
* [ ] `PrivacyInfo.xcprivacy` declara APIs de timestamp de archivo y espacio en disco si se usan — **Baja**: BrewBar usa `FileManager` para leer `~/.brewtui-bar/` y el directorio iCloud; las razones de acceso a file timestamp y disk space no estan declaradas si los frameworks subyacentes las requieren
* [ ] Watermark invisible efectivamente desplegado — **Baja**: `embedInvisibleWatermark` no tiene llamadores en produccion (ver 13.1)
* [ ] Politica de retencion de datos definida formalmente — **Baja**: `history.json` y `sync.json` crecen sin limite explicito de registros/tiempo documentado

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Razones de API de filesystem no declaradas en PrivacyInfo.xcprivacy | Parcial | Baja | `PrivacyInfo.xcprivacy` — solo UserDefaults declarado; `FileManager` accede a timestamps de archivos en `~/.brewtui-bar/` y al directorio iCloud; Apple puede requerir razon `C617.1` (file timestamp) y `E174.1` (disk space) | Auditar llamadas a `FileManager` en BrewBar; anadir las razones faltantes al array `NSPrivacyAccessedAPITypes` |
| Politica de retencion de datos no definida | No conforme | Baja | `history.json` no tiene limite de entradas; `sync.json` en iCloud no tiene TTL; no hay documentacion de retencion | Definir y documentar limite de entradas en `history.json` (p.ej. max 500); anadir TTL o compactacion periodica en sync |

---

## Registro de riesgos de seguridad

| Riesgo | Superficie | Severidad | Evidencia | Mitigacion |
|--------|------------|-----------|-----------|------------|
| PII (email, license key) expuesta en Unified Log del sistema macOS | App / BrewBar | Alta | `menubar/BrewBar/Sources/Services/LicenseChecker.swift:205,212` — `privacy: .public` con `String(describing: status)` imprime todos los campos de `LicenseData` en plaintext | Agregar `CustomStringConvertible` a `LicenseStatus` que redacte `key`, `instanceId`, `customerEmail`; o cambiar anotacion a `privacy: .private` |
| Inyeccion de argumentos a `brew` desde policy JSON de compliance | App / TUI | Alta | `src/lib/compliance/compliance-remediator.ts:18,29` — `streamBrew(['install'/'upgrade', v.packageName])` sin aplicar `PKG_PATTERN`; `isValidPolicy()` en `policy-io.ts` no valida strings de paquetes | Importar `validatePackageName` de `brew-api.ts` y llamarla antes de cada `streamBrew` en `compliance-remediator.ts`; anadir validacion de paquetes en `isValidPolicy()` |
| Clave scrypt legacy activa 6+ versiones despues del TODO de eliminacion (SEG-003) | App / TUI + BrewBar | Media | `src/lib/license/license-manager.ts:104` y `src/lib/sync/crypto.ts` — TODO referencia v0.6.3; version actual v1.2.0 | Confirmar telemetria de zero fallback decrypts en produccion; eliminar rama legacy en license-manager y sync/crypto; el auto-upgrade ya implementado facilita la transicion |
| `brew` resuelto via PATH heredado — riesgo de PATH hijack | App / TUI | Media | `src/lib/brew-cli.ts` — `spawn('brew', args, ...)` sin ruta absoluta | Buscar brew en rutas canonicas (`/opt/homebrew/bin/brew`, `/usr/local/bin/brew`) antes del spawn, con fallback al resultado de `which brew` solo si la ruta es absoluta y el archivo es ejecutable |
| Vulnerabilidades moderadas en dependencias npm (brace-expansion, ws) | Supply Chain | Media | `npm audit` — brace-expansion < 3.0.3 (ReDoS, CVSS 5.3), ws < 8.17.1 (memory disclosure, CVSS 5.3); fix disponible via `npm audit fix` | Ejecutar `npm audit fix`; verificar compatibilidad de semver antes de merge; anadir `npm audit --audit-level=moderate` al gate de CI/pre-push |
| `embedInvisibleWatermark` no desplegado en produccion | App / TUI | Baja | `src/lib/license/watermark.ts` — funcion exportada sin llamadores en `src/`; solo `getWatermark()` (texto visible) se usa en `profile-manager.ts:119` | Implementar llamada en exportacion de perfiles con `consent` del usuario, o retirar del API publica y marcar como `@internal` hasta implementacion real |
| Rate limit de activacion volatil — reinicio limpia lockout | App / TUI | Baja | `src/lib/license/license-manager.ts` — `tracker` en memoria (UX-004 documentado); reinicio del proceso elimina el contador de fallos | Persistir estado del lockout en `~/.brewtui-bar/rate-limit.json` con modo `0o600`; leer y aplicar al iniciar el modulo |
| Entitlements de BrewBar no versionado explicitamente en el repositorio | App / BrewBar | Baja | `menubar/Project.swift` — sin `entitlements:` en la llamada a `.target()`; `codesign --display` muestra `<dict/>` en runtime | Crear `menubar/BrewBar/BrewBar.entitlements` con las capacidades minimas necesarias y referenciarlo en `Project.swift`; facilita auditorias y evita regresiones por cambios en defaults de Tuist |
| `checkBundleIntegrity` no detecta parches pre-carga o en memoria | App / TUI | Baja | `src/lib/license/integrity.ts` — baseline capturado al importar el modulo; modificaciones previas al primer `require` son indetectables | Documentar la limitacion como comentario en el codigo; la firma Developer ID + Hardened Runtime es la defensa complementaria real para parches en disco |
| Razones de API de filesystem no declaradas en `PrivacyInfo.xcprivacy` | Privacidad / BrewBar | Baja | `menubar/BrewBar/Resources/PrivacyInfo.xcprivacy` — solo UserDefaults (`1C8F.1`) declarado; accesos a timestamps de archivos (`C617.1`) y disk space (`E174.1`) potencialmente ausentes | Auditar uso de `FileManager` en BrewBar; anadir las razones requeridas; Apple Submission valida esto desde macOS 14.4 |
| Ausencia de politica de retencion de datos para history.json y sync.json | Privacidad | Baja | `~/.brewtui-bar/history.json` crece sin limite; `sync.json` en iCloud sin TTL; sin documentacion de retencion | Definir limite de entradas maximas en `history.json` (sugerido: 500 entradas); implementar compactacion o TTL en sync; documentar en README |
