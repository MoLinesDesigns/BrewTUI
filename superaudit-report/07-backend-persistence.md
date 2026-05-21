# 11. Backend funcional

> Auditor: backend-auditor | Fecha: 2026-05-21

## Resumen ejecutivo

Brew-TUI no tiene servidor propio: su "backend" son seis capas de integracion externas (Polar API, OSV.dev, brewtui-api para promos, CLI de Homebrew, iCloud Drive y sistema de archivos local). La superficie es reducida pero presenta hallazgos relevantes de validacion de argumentos en operaciones de brew, un bug confirmado de campo incorrecto en `SyncMonitor.swift`, y varios gaps de resiliencia en reintentos y rate limiting. La persistencia local es solida en la mayoria de rutas, con cifrado AES-256-GCM, escrituras atomicas y permisos restrictivos.

---

## 11.1 Superficie API

### Checklist

* [x] Endpoints inventariados — seis endpoints externos activos documentados a continuacion
* [x] HTTPS obligatorio en todas las integraciones externas
* [x] Hostname validation en Polar y promo API (`validateApiUrl()`)
* [x] Contratos validados en tiempo de ejecucion en Polar activate, validate y OSV
* [x] Campos requeridos/opcionales reflejados en tipos TypeScript estrictos
* [x] Errores tipados: respuestas 4xx deserializadas y relanzadas como `Error`
* [ ] Status codes correctos — **Baja**: trailing slash ausente en Polar (`/activate` en lugar de `/activate/`); sin evidencia de fallo en produccion pero va contra la especificacion Polar (307 redirect pierde `Authorization`)
* [x] Recursos y acciones con semantica HTTP clara (POST para activate/validate/deactivate/redeem)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Trailing slash en endpoints Polar | No conforme | Baja | `polar-api.ts`: `${BASE_URL}/${endpoint}` produce `/activate` sin slash final; Polar especifica trailing slash | Anadir trailing slash al template o a cada literal de endpoint |
| Promo API sin retry en 5xx transiente | No conforme | Media | `promo.ts` usa `fetchWithTimeout`, no `fetchWithRetry`; un fallo puntual de `api.molinesdesigns.com` bloquea el canje sin reintento | Reemplazar `fetchWithTimeout` por `fetchWithRetry` con mismo `retryOn` que Polar |
| Polar 429 no cubierto por `retryOn` | No conforme | Media | `fetch-timeout.ts` `fetchWithRetry` por defecto solo reintenta `status >= 500`; un 429 de Polar pasa como error definitivo | Anadir `status === 429` a `retryOn` con backoff `Retry-After`-aware |

### Inventario de endpoints

| Endpoint | Metodo | Auth | Contrato | Errores | Idempotencia | Hallazgo |
|----------|--------|------|----------|---------|--------------|----------|
| `https://api.polar.sh/v1/customer-portal/license-keys/activate` | POST | Bearer token (license key) | `{ activation_url, label }` → `{ id, license_key }` validado en runtime | 4xx deserializado; `PolarApiError` lanzado | No (genera `instanceId` unico) | Trailing slash ausente; 429 no reintentado |
| `https://api.polar.sh/v1/customer-portal/license-keys/validate` | POST | Bearer token | `{ activation_url, label }` → `{ id, status, customer }` validado en runtime | Idem | Si (solo consulta estado) | Trailing slash ausente |
| `https://api.polar.sh/v1/customer-portal/license-keys/deactivate` | POST | Bearer token | `{ activation_id, activation_url }` | 4xx capturado | Si (idempotente por Polar) | Trailing slash ausente |
| `https://api.osv.dev/v1/querybatch` | POST | Sin auth | `{ queries: [{package:{name,ecosystem}}] }` → `{ results[] }` validado en runtime | Try/catch global; fallback silencioso | Si (consulta pura) | Sin rate limiting en la capa de la app salvo 75ms entre lotes |
| `https://api.molinesdesigns.com/api/promo/validate` | POST | Sin auth | `{ code }` → `{ valid, discount, description }` validado en runtime | try/catch | Si | Sin retry en 5xx |
| `https://api.molinesdesigns.com/api/promo/redeem` | POST | Sin auth | `{ code, idempotencyKey, licenseKey }` → `{ success, message }` | try/catch | Si (idempotency key UUID) | Sin retry en 5xx |

---

## 11.2 Autenticacion y autorizacion

### Checklist

* [x] Autenticacion con Polar via Bearer token (license key como credencial)
* [x] License key no almacenada en texto plano — cifrada con AES-256-GCM en `license.json`
* [x] Clave de cifrado derivada por HKDF-SHA256 con `machineId` como `info` (machine binding)
* [x] `getBuiltinAccountType()` siempre retorna `null` (SEG-009 — sin backdoors hardcoded)
* [x] Machine binding: `machineId` UUID enviado como `label` a Polar para vincular activacion
* [ ] Machine ID expuesto en claro — **Baja**: el UUID se envia como `label` sin hashear; es un identificador opaco pero podria vincularse al usuario en logs de Polar
* [x] Rate limiting de activacion: 30s cooldown, lockout 15 min tras 5 fallos consecutivos
* [ ] Rate limiting in-memory solamente — **Media**: el tracker de rate limit no se persiste; un `kill -9` o crash reinicia los contadores y un atacante local puede eludir el lockout relanzando el proceso
* [x] Revalidacion: 24h automatica con gracia de 7 dias offline
* [x] Degradacion en cuatro niveles: none / warning / limited / expired (alineado con TS y Swift)
* [x] Fallo cerrado en fechas corruptas (`isExpired()` trata `NaN` como expirado)
* [x] Errores de red vs. errores de contrato distinguidos correctamente en `revalidate()` (red → gracia, contrato → expired)

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Rate limit tracker en memoria | Parcial | Media | `license-manager.ts`: `rateLimitTracker` es variable de modulo; se pierde al reiniciar proceso | Persistir estado de lockout en `~/.brew-tui/rate-limit-state.json` con TTL o fecha de expiracion |
| Machine ID enviado sin hashear | Parcial | Baja | `polar-api.ts`: `label: machineId` — UUID raw en cuerpo de peticion Polar | Opcional: hashear (SHA-256 truncado) para reducir superficie de correlacion en logs externos |

---

## 11.3 Validacion y consistencia

### Checklist

* [x] Package name validation via `PKG_PATTERN = /^[\w@./+-]+$/` en `brew-api.ts` para operaciones directas
* [x] Tap validation via `TAP_PATTERN` en import de perfiles
* [x] Profile name validation via `validateProfileName()` con regex y max 100 chars
* [x] `basename()` como defensa adicional en rutas de perfil
* [x] Validacion en runtime de respuestas Polar (campos obligatorios) y OSV (count match)
* [x] Idempotency key UUID en promo redeem (header + body)
* [ ] Flag injection en `compliance-remediator.ts` — **Alta**: `streamBrew(['install', v.packageName])` y `streamBrew(['upgrade', v.packageName])` sin pasar por `validatePackageName()` (lineas 18 y 29); un policy file malicioso puede inyectar `--HEAD` u otros flags
* [ ] Flag injection en `brewfile-manager.ts` — **Alta**: `applyDrift()` llama `streamBrew(['install', name])` sin validacion (patron identico al anterior); un brewfile YAML manipulado puede inyectar flags en brew
* [ ] Path traversal en `policy-io.ts` — **Media**: `loadPolicy(filePath)` y `exportReport(report, outputPath)` aceptan rutas arbitrarias sin sanear; si el caller no sanitiza, un path relativo o con `..` accede fuera de `~/.brew-tui/`
* [x] Sanitizacion de terminos de busqueda: `safeTerm = term.replace(/^-+/, '')` en `brew-api.ts`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Flag injection en compliance-remediator | No conforme | Alta | `src/lib/compliance/compliance-remediator.ts:18,29` — `streamBrew(['install'/'upgrade', v.packageName])` sin `validatePackageName()` | Llamar `validatePackageName(v.packageName)` antes de spawn; igual que hace `brew-api.ts` |
| Flag injection en brewfile-manager | No conforme | Alta | `src/lib/brewfile/brewfile-manager.ts` `applyDrift()` — `streamBrew(['install', name])` sin validacion | Llamar `validatePackageName(name)` antes de spawn en `applyDrift()` |
| Path traversal en policy-io | No conforme | Media | `src/lib/compliance/policy-io.ts` `loadPolicy(filePath)` / `exportReport(report, outputPath)` — sin guard de `basename()` ni confinamiento a `DATA_DIR` | Restringir rutas de entrada/salida a un directorio permitido o validar que no contienen `..` |

---

## 11.4 Resiliencia operacional

### Checklist

* [x] Timeouts definidos: `execBrew()` 30s, `streamBrew()` 5min idle, `brewUpdate()` 120s explicito, BrewBar `BrewProcess` 60s
* [x] Retry en llamadas Polar y OSV via `fetchWithRetry` (3 intentos, backoff exponencial 500ms→4s)
* [ ] Retry ausente en promo API — **Media**: `promo.ts` usa `fetchWithTimeout`; ya descrito en 11.1
* [ ] 429 de Polar no reintentado — **Media**: ya descrito en 11.1
* [x] Manejo de errores externos en Polar: try/catch en activate/validate con distincion red vs. API
* [x] OSV: `queryOneByOne()` maneja 429 con 2s backoff + un reintento adicional
* [x] brew CLI: stderr capturado e incluido en mensajes de error; exit codes distintos de 0 relanzados
* [x] iCloud: maneja ENOENT, archivo vacio (placeholder iCloud), y placeholder `.sync.json.icloud`
* [x] Integridad de bundle: SHA-256 verificado al cargar modulo; fallo cerrado en produccion
* [ ] Clave legacy `scryptSync` aun presente — **Baja**: TODO(SEG-003) en comentario; la clave precomputada sigue en bundle en produccion; extiende superficie de ataque offline
* [ ] Ningun job background / cron en la capa TS — **No aplica**: la revalidacion se dispara on-demand desde la UI, no desde un scheduler; no hay workers ni colas
* [x] Canary functions always return `false` (anti-tamper)
* [x] BrewBar `OnceGuard` previene continuacion doble en callbacks de proceso

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Clave de cifrado legacy (`scrypt`) sin eliminar | Parcial | Baja | `license-manager.ts` — `legacyEncryptionKey` via `scryptSync` todavia activa; `LicenseChecker.swift` idem con hex hardcoded; TODO(SEG-003) | Eliminar rama legacy tras confirmar cero fallbacks en telemetria (SEG-003 ya planificado) |
| Promo API sin retry | No conforme | Media | `promo.ts` usa `fetchWithTimeout` | Reemplazar por `fetchWithRetry` |
| Polar 429 sin backoff | No conforme | Media | `fetch-timeout.ts` — `retryOn` no incluye 429 | Anadir 429 con respeto a `Retry-After` |

---

# 12. Persistencia y sincronizacion

## 12.1 Persistencia local

### Checklist

* [x] Sin Core Data ni SwiftData — BrewBar no persiste estado de dominio; lee archivos en `~/.brew-tui/`
* [x] Directorio de datos con modo 0o700 (`DATA_DIR` en `data-dir.ts`)
* [x] Archivos de datos con modo 0o600: `license.json`, `machine-id`, `last-action.json`, `promo.json`
* [x] Escrituras atomicas via tmp + rename en `writeLastAction()`, `saveSyncConfig()`, perfil, historia
* [x] Cifrado AES-256-GCM para `license.json` (payload sensible)
* [x] Keychain: BrewBar no necesita almacenar tokens (lee archivos cifrados locales); no aplica
* [x] `UserDefaults` en BrewBar solo para `updatedAt` (string ISO 8601 no sensible de `SyncMonitor`)
* [x] Bloqueo de fichero en `history-logger.ts` via `open(lockPath, 'wx')` con TTL de 30s para stale locks
* [x] Rotacion de historial: MAX_ENTRIES = 1000
* [ ] Directorio iCloud sin modo restrictivo — **Media**: `mkdir(ICLOUD_SYNC_DIR, { recursive: true })` en `icloud-backend.ts` sin `mode: 0o700`; a diferencia de `DATA_DIR`, el directorio en iCloud Drive hereda permisos del sistema, pero es recomendable ser explicito
* [x] `machine-id` mode 0o600, generacion UUID con serializacion de promesa para evitar race condition en primer launch
* [x] BrewBar lee `license.json` de forma sincrona en `checkLicense()` — aceptable solo en startup; no en hot path de UI

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Directorio iCloud sin modo 0o700 | Parcial | Media | `src/lib/sync/backends/icloud-backend.ts` — `mkdir(ICLOUD_SYNC_DIR, { recursive: true })` sin `mode` | Anadir `mode: 0o700` al `mkdir` de `ICLOUD_SYNC_DIR` |
| Lectura sincrona de license.json en BrewBar (startup) | Parcial | Baja | `LicenseChecker.swift:checkLicense()` — `FileManager.default.contents(atPath:)` es sincrono; aceptable en startup pero bloquearia MainActor si se reutiliza en hot path | Documentar restriccion; si se llama mas alla de startup, mover a actor background |

---

## 12.2 Sincronizacion

### Checklist

* [x] Estrategia definida: iCloud Drive filesystem sync via `SyncEnvelope` cifrado
* [x] Deteccion de disponibilidad iCloud: `isAvailable()` via `stat()` del directorio
* [x] Manejo de placeholder iCloud (`.sync.json.icloud`) — descartado correctamente en `readEnvelope()`
* [x] Manejo de archivo vacio (race condition de sincronizacion iCloud)
* [x] `schemaVersion` validado en `isValidEnvelope()`
* [x] Cifrado AES-256-GCM antes de upload a iCloud (license key como HKDF input)
* [x] Escritura atomica del envelope (tmp + rename, 0o600)
* [ ] Bug: `SyncMonitor.swift` accede a `machines` en el envelope exterior — **Alta**: `readEnvelope()` en `SyncMonitor.swift` hace `json["machines"]` sobre el JSON exterior que solo contiene `{schemaVersion, encrypted, iv, tag, updatedAt}`; `machines` esta dentro del payload cifrado; `getKnownMachineCount()` siempre retorna 0; la UI muestra "0 dispositivos" permanentemente
* [ ] `merge-union` no implementado — **Media**: `ConflictResolution` en `src/lib/sync/types.ts` exporta `'merge-union'` pero `applyConflictResolutions()` en `sync-engine.ts` nunca procesa este valor; si un caller lo usa, la resolucion se descarta silenciosamente
* [x] `use-remote` y `use-local` implementados correctamente
* [x] `updatedAt` en plaintext del envelope (correcto — permite mostrar timestamp sin descifrar)
* [ ] Hostname expuesto en payload cifrado sin anonimizar — **Baja**: `machineName = hostname()` en `sync-engine.ts`; aunque va cifrado, el hostname puede ser un dato personal; considerar hash o alias configurable

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Bug `SyncMonitor.getKnownMachineCount()` retorna siempre 0 | No conforme | Alta | `menubar/BrewBar/Sources/Services/SyncMonitor.swift` — `json["machines"]` sobre JSON exterior; `machines` esta en payload AES cifrado, inaccesible sin descifrar | Eliminar o no exponer `getKnownMachineCount()` desde Swift (requeriria descifrar); o exponer `machineCount` en el plaintext del envelope al escribirlo desde TS |
| `merge-union` declarado pero no implementado | No conforme | Media | `src/lib/sync/types.ts:ConflictResolution` incluye `'merge-union'`; `sync-engine.ts:applyConflictResolutions()` no tiene rama para este valor | Eliminar `'merge-union'` del tipo hasta implementarlo, o anadir la logica; documentar la omision como `// not yet implemented` para evitar silencio |
| Hostname raw en payload sync | Parcial | Baja | `src/lib/sync/sync-engine.ts` — `machineName: hostname()` en el payload cifrado | Considerar alias o hash truncado del hostname; documentar como dato personal en politica de privacidad |

---

## 12.3 Calidad del dato

### Checklist

* [x] Fechas ISO 8601 en todos los campos de tiempo (`activatedAt`, `expiresAt`, `lastValidatedAt`, `timestamp`)
* [x] Parsing de fechas con fallback: `ISO8601DateFormatter` con y sin fracciones de segundo (Swift); `new Date()` + `isNaN` guard en TS
* [x] Fallo cerrado en fechas invalidas: `degradationLevel()` retorna `.expired` si `parseDate()` falla; `isExpired()` trata `NaN` como expirado
* [x] Serializacion robusta: `Codable` en Swift con campos opcionales correctos (`expiresAt: String?`); `JSONDecoder`/`JSONEncoder` en TS con validacion post-decode
* [x] `LicenseFile` admite formato legacy (`license: LicenseData?`) y cifrado (`encrypted`, `iv`, `tag`) — ambos opcionales, decision de parsing explicita
* [x] `LastAction` en Swift: todos los campos `Decodable`; tipos primitivos sin forzado de cast
* [x] Unicidad de `machineId`: race condition en primera escritura resuelta con `pendingResolution` en `getMachineId()`
* [x] `history.json` con rotacion a 1000 entradas y bloqueo de escritura
* [x] Validacion de conteo en OSV: `data.results.length !== queries.length` detectado y rechazado
* [ ] Sin constraint de unicidad en historial — **Baja**: `history-logger.ts` no deduplicara entradas con el mismo paquete + timestamp si se llaman dos veces; sin embargo el lock previene escrituras concurrentes; el riesgo es bajo
* [x] `promo.json` atomico y versionado implicitamente por estructura de tipo

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Sin deduplicacion en historial | Parcial | Baja | `src/lib/history/history-logger.ts` — no verifica si la ultima entrada tiene el mismo `packageName` + `timestamp`; doble llamada rapida inserta duplicado | Antes de `push()`, verificar si la ultima entrada es identica (mismo nombre, mismo timestamp truncado a segundo) |
| Zona horaria no normalizada explicitamente en TS | Parcial | Baja | `new Date().toISOString()` en varios puntos produce UTC correcto por spec JS; en Swift `ISO8601DateFormatter` con `.withInternetDateTime` es UTC — conforme; pero no hay test que valide round-trip de zonas horarias no-UTC | Anadir test de round-trip con fecha en timezone local para asegurar que la deserializacion produce el mismo instante |
