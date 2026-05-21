# 11. Backend funcional

> Auditor: backend-auditor | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto no tiene backend HTTP propio: toda la logica de servidor es externa (Polar API, OSV.dev, Promo API). La superficie HTTP consumida esta bien estructurada para Polar y OSV en cuanto a timeouts, reintentos con backoff exponencial y validacion de respuestas en runtime, pero presenta un bug critico de produccion: el TUI TypeScript envia `ecosystem: 'Homebrew'` a la API OSV.dev, valor que la propia API rechaza con HTTP 400 (segun el comentario en el codigo Swift que si fue corregido a `'Bitnami'`), lo que hace que el Security Audit devuelva resultados vacios en todos los escaneos del TUI. La persistencia local esta generalmente bien disenada (escrituras atomicas, permisos 0o600, cifrado AES-256-GCM), pero la clave de cifrado estatica embebida en el bundle y cuatro implementaciones divergentes de `getMachineId` con fallbacks inconsistentes representan riesgos de alta y media severidad respectivamente.

---

## 11.1 Superficie API

### Checklist

* [x] Endpoints inventariados (8 endpoints externos identificados)
* [x] HTTPS obligatorio validado para Polar API (`polar-api.ts:51-59`)
* [ ] HTTPS no validado para Promo API — **Media**: `promo.ts` no llama a ninguna funcion `validateApiUrl`
* [x] Contratos de respuesta validados en runtime para Polar y OSV
* [ ] Contrato de respuesta OSV ignorado con ecosystem incorrecto — **Critica**: ver hallazgos
* [x] Errores HTTP mapeados a mensajes utiles para el usuario
* [x] Timeouts definidos en todas las llamadas de red (15s para Polar/Promo, 15s para OSV)
* [ ] `brewUpdate()` sin timeout — **Media**: `brew-api.ts:18-26` usa `spawn` directo sin timer
* [x] Reintentos con backoff exponencial implementados en `fetchWithRetry`
* [ ] Double retry en deactivacion — **Baja**: `license-manager.ts:354-362` + `fetchWithRetry` = hasta 9 intentos

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Ecosystem 'Homebrew' en OSV API (TS) | No conforme | Critica | `src/lib/security/osv-api.ts:125,143,181` — OSV rechaza 'Homebrew' con 400; la correccion a 'Bitnami' solo se aplico en Swift (`SecurityMonitor.swift:119`) | Cambiar a `'Bitnami'` en `osv-api.ts` |
| Validacion de URL omitida en Promo API | No conforme | Media | `src/lib/license/promo.ts:94,142` usa `fetchWithTimeout` sin la funcion `validateApiUrl` que si existe en `polar-api.ts:51-59` | Aplicar la misma guardia de URL a la Promo API |
| `brewUpdate()` sin timeout | No conforme | Media | `src/lib/brew-api.ts:18-26` — `spawn('brew', ['update'])` sin timer ni `AbortSignal`; contrasta con `execBrew` que tiene 30s | Refactorizar para reutilizar `execBrew` o anadir timeout explicito |
| Double retry en deactivacion | No conforme | Baja | `src/lib/license/license-manager.ts:354-362` loop de 3 intentos; `apiDeactivate` ya usa `fetchWithRetry` con 3 intentos por defecto → hasta 9 solicitudes | Eliminar el loop externo o pasar `retry: {attempts: 1}` a `fetchWithRetry` dentro de `apiDeactivate` |

### Inventario de endpoints

| Endpoint | Metodo | Auth | Contrato | Errores | Idempotencia | Hallazgo |
|----------|--------|------|----------|---------|--------------|----------|
| `api.polar.sh/v1/customer-portal/license-keys/activate` | POST | — (license key en body) | Validado en runtime (`polar-api.ts:118-120`) | HTTP 4xx mapeado a mensaje (`polar-api.ts:91-101`) | No idempotente (doble activacion posible si primer intento queda en tránsito) | Conforme |
| `api.polar.sh/v1/customer-portal/license-keys/validate` | POST | — (license key + activation_id en body) | Validado en runtime (`polar-api.ts:161-163`) | Mapeado | Idempotente (GET semantics) | Conforme |
| `api.polar.sh/v1/customer-portal/license-keys/deactivate` | POST | — (license key + activation_id en body) | `expectEmpty = true`, status 204 aceptado | Mapeado | Idempotente si ya desactivado | Double retry (ver arriba) |
| `api.osv.dev/v1/querybatch` (TS) | POST | Ninguna | Validado: array.length, tipo results (`osv-api.ts:87-92`) | HTTP 400 fallback a queryOneByOne | Idempotente | **Critica**: ecosystem 'Homebrew' → 400 en todos los paquetes |
| `api.osv.dev/v1/querybatch` (Swift) | POST | Ninguna | Validado: count match (`SecurityMonitor.swift:149-151`) | `SecurityMonitorError` tipado | Idempotente | Conforme (usa 'Bitnami') |
| `api.molinesdesigns.com/api/promo/validate` | POST | — (code en body) | Validado en runtime (`promo.ts:106-115`) | HTTP !ok mapeado | Idempotente | Sin validacion de URL host |
| `api.molinesdesigns.com/api/promo/redeem` | POST | machineId en body | Validado en runtime (`promo.ts:155-164`) | HTTP !ok mapeado | Sin idempotency-key (dedup solo en cliente) | Un solo intento, sin retry |
| `github.com/MoLinesGitHub/Brew-TUI/releases/latest/download/BrewBar.app.zip` | GET | Ninguna | No validado (descarga y descomprime sin firma) | No especificado | N/A | No auditado en profundidad en este informe |

---

## 11.2 Autenticacion y autorizacion

### Checklist

* [x] Licencias almacenadas cifradas en disco (AES-256-GCM, `license-manager.ts:90-121`)
* [x] Machine binding en el envelope cifrado (`license-manager.ts:200-204`)
* [x] Validacion periodica contra servidor (cada 24h, `license-manager.ts:19`)
* [x] Grace period de 7 dias para uso offline (`license-manager.ts:21`)
* [x] Degradacion gradual tras 7/14/30 dias sin validacion (`license-manager.ts:243-254`)
* [x] Rate limiting client-side: 30s cooldown + lockout 15 min tras 5 intentos (`license-manager.ts:23-68`)
* [ ] Rate limiting solo en memoria — **Baja**: se resetea al reiniciar el proceso
* [x] Revocacion funcional: `deactivate()` elimina licencia local + notifica al servidor
* [x] Cuentas perennes eliminadas (`getBuiltinAccountType` siempre retorna null, `license-manager.ts:15`)
* [x] Deteccion de plan por prefijo de clave (`BTUI-T-` → team, `license-manager.ts:275-278`)
* [ ] Plan detectado por prefijo string, no por campo de servidor — **Baja**: fragil a cambios en formato de clave Polar
* [x] Gating de features Pro/Team en `feature-gate.ts` y comprobado antes de operaciones destructivas

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Clave AES derivada de secreto estatico en bundle | No conforme | Alta | `src/lib/license/license-manager.ts:78-79`; `src/lib/sync/crypto.ts:6-7`. El secreto es legible con `cat build/index.js`. Documentado como limitacion conocida; el binding de maquina es la defensa primaria | Considerar migrar a macOS Keychain para almacenar la clave derivada; mientras tanto, documentar limitacion en README de seguridad |
| Clave AES hardcodeada tambien en Swift (hex literal) | No conforme | Alta | `menubar/BrewBar/Sources/Services/LicenseChecker.swift:49-53` — la clave derivada de scrypt esta hardcodeada como string hex; cualquiera que extrae el binario la obtiene sin esfuerzo | Mover al Keychain de macOS o derivar en runtime desde un secreto en Keychain |
| Rate limit client-side solo en memoria | Parcial | Baja | `src/lib/license/license-manager.ts:34` — `tracker` es variable de modulo; se resetea al reiniciar el proceso | Persistir contador en archivo o aceptar la limitacion documentada |
| Deteccion de plan por prefijo de clave | Parcial | Baja | `src/lib/license/license-manager.ts:275-278` — si Polar cambia su esquema de prefijos, la deteccion falla silenciosamente en 'pro' | Validar plan contra el campo `productId` si Polar lo expone en validacion, o documentar dependencia del prefijo |

---

## 11.3 Validacion y consistencia

### Checklist

* [x] Nombres de paquetes validados con `PKG_PATTERN` antes de pasar a CLI (`brew-api.ts:10-13`)
* [x] Nombres de perfil validados contra regex + `basename()` para evitar path traversal (`profile-manager.ts:22-38`)
* [x] Nombres de tap validados con `TAP_PATTERN` antes de ejecutar (`profile-manager.ts:142-143`)
* [x] Entrada de la busqueda saneada: elimina guiones iniciales (`brew-api.ts:64`)
* [x] Respuestas de API externas validadas en runtime (Polar, OSV, Promo)
* [ ] `decryptLicenseData` usa `JSON.parse(...) as LicenseData` sin type guard posterior — **Media**: `license-manager.ts:121`
* [ ] `decryptPayload` usa `JSON.parse(...) as SyncPayload` sin type guard — **Media**: `sync/crypto.ts:53`
* [x] Timeouts en todas las llamadas fetch (excepto `brewUpdate`, ver 11.1)
* [ ] Idempotencia de promo/redeem no garantizada server-side — **Media**: `promo.ts:142-172`, sin idempotency key

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| `decryptLicenseData` sin type guard en dato descifrado | No conforme | Media | `src/lib/license/license-manager.ts:121` — `JSON.parse(plaintext).toString('utf-8')) as LicenseData` no verifica la forma; un archivo manipulado podria hacer crash en acceso posterior | Anadir type guard `isLicenseData(data)` antes de retornar |
| `decryptPayload` sin type guard en sync | No conforme | Media | `src/lib/sync/crypto.ts:53` — mismo patron; un envelope de iCloud corrupto podria producir un objeto con forma incorrecta sin error inmediato | Anadir validacion de forma de `SyncPayload` tras parseo |
| Promo redeem sin idempotency key | Parcial | Media | `src/lib/license/promo.ts:142-172` — el servidor no recibe ningun token de idempotencia; si el cliente hace retry tras timeout puede doble-canjear en servidor | Anadir `idempotencyKey: randomUUID()` al body de redeem; el servidor debe deduplicar por esa clave |
| `isExpired()` falla abierto en fecha corrupta | No conforme | Media | `src/lib/license/license-manager.ts:214-217` — `new Date(undefined).getTime()` → NaN; `NaN < Date.now()` es `false` → licencia no expira. Contrasta con `getDegradationLevel` (linea 245) que si retorna 'expired' en NaN | Unificar comportamiento: `isExpired` debe retornar `true` cuando la fecha es invalida |

---

## 11.4 Resiliencia operacional

### Checklist

* [x] Errores de red clasificados y diferenciados de errores de contrato (`license-manager.ts:319-322`)
* [x] Fallos de red en revalidacion activan grace period en lugar de expirar inmediatamente (`license-manager.ts:341-346`)
* [x] Fallos de red en OSV silenciados con log (no bloquean el escaneo, `osv-api.ts:151-153`)
* [x] Jobs periodicos (scheduler de BrewBar) con manejo de error y log (`SchedulerService.swift:136-139`)
* [x] Error del scheduler persistido en UserDefaults (`SchedulerService.swift:139`)
* [x] Backpressure no requerido (no hay colas ni workers dedicados)
* [ ] `readDataToEndOfFile()` en terminationHandler puede provocar deadlock — **Alta**: `BrewProcess.swift:99`
* [ ] Snapshot retention sin limite de poda — **Alta**: `snapshot.ts:95-107`
* [ ] Historia: lock de archivo sin TTL — **Media**: `history-logger.ts:13-24`

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Deadlock potencial en `BrewProcess.swift` | No conforme | Alta | `menubar/BrewBar/Sources/Services/BrewProcess.swift:99` — `readDataToEndOfFile()` se llama dentro del `terminationHandler`. Si el output de `brew list --versions` supera ~64 KB (buffer de Pipe en macOS), brew bloquea en escritura, `terminationHandler` nunca se ejecuta y la continuacion queda colgada. El timeout externo (linea 122) eventualmente lo mata, pero con latencia de 60s | Usar lectura incremental con `availableData` en un loop o migrar a `AsyncStream` consumiendo el `FileHandle` en un Task separado |
| Snapshots sin poda automatica | No conforme | Alta | `src/lib/state-snapshot/snapshot.ts:95-107` y `src/lib/rollback/rollback-engine.ts:204-209` — cada post-upgrade, post-rollback y post-reconcile crea un archivo nuevo; no hay `pruneSnapshots()`. Con uso intensivo del rollback view puede acumular cientos de archivos en `~/.brew-tui/snapshots/` | Implementar poda que retenga los N mas recientes (e.g. 20) o los mas antiguos de 30 dias |
| Lock de historial sin TTL | No conforme | Media | `src/lib/history/history-logger.ts:13-24` — si el proceso muere entre `open('wx', lockPath)` y `unlink(lockPath)`, el archivo `.lock` queda huerfano y bloquea todas las escrituras futuras permanentemente | Anadir comprobacion de `mtime` del lockfile: si tiene mas de N segundos, eliminar y reintentar |

---

### Inventario de endpoints (resumen)

| Endpoint | Metodo | Auth | Contrato | Errores | Idempotencia | Hallazgo |
|----------|--------|------|----------|---------|--------------|----------|
| `POST .../license-keys/activate` | POST | key en body | Validado en runtime | Mapeado | No idempotente | Conforme |
| `POST .../license-keys/validate` | POST | key+instanceId | Validado en runtime | Mapeado | Idempotente | Conforme |
| `POST .../license-keys/deactivate` | POST | key+instanceId | `expectEmpty=true` | Mapeado | Idempotente | Double retry |
| `POST api.osv.dev/v1/querybatch` (TS) | POST | — | Validado parcialmente | 400→fallback | Idempotente | **CRITICA**: ecosystem 'Homebrew' |
| `POST api.osv.dev/v1/querybatch` (Swift) | POST | — | Validado | Tipado | Idempotente | Conforme |
| `POST api.molinesdesigns.com/api/promo/validate` | POST | — | Validado | Mapeado | Idempotente | Sin host validation |
| `POST api.molinesdesigns.com/api/promo/redeem` | POST | machineId | Validado | Mapeado | Sin idempotency key | Baja resiliencia |
| `GET github.com/.../BrewBar.app.zip` | GET | — | Sin firma verificada | No especificado | N/A | Fuera de alcance |

---

# 12. Persistencia y sincronizacion

## 12.1 Persistencia local

### Checklist

* [x] Directorio `~/.brew-tui/` creado con `mode: 0o700` (`data-dir.ts:13`)
* [x] Archivos sensibles escritos con `mode: 0o600` (license, history, profiles, snapshots)
* [x] Escrituras atomicas via fichero `.tmp` + `rename()` en todos los modulos auditados
* [x] `license.json` cifrado AES-256-GCM (`license-manager.ts:90-104`)
* [x] Type guard sobre el archivo de licencia antes de descifrar (`isLicenseFile`, `license-manager.ts:124-125`)
* [ ] Sin type guard sobre datos descifrados de licencia — **Media**: ver 11.3
* [x] Migracion de formato legacy (unencrypted → encrypted) implementada (`license-manager.ts:183-193`)
* [x] Profiles: validacion de nombre + basename contra path traversal (`profile-manager.ts:22-38`)
* [x] Historial: cap de 1000 entradas (`history-logger.ts:91-93`)
* [ ] Snapshots: sin cap ni poda — **Alta**: ver 11.4
* [x] Permisos del directorio iCloud no forzados (iCloud gestiona sus propios permisos)
* [ ] Secretos en UserDefaults de BrewBar (no hay secretos; solo preferencias) — **No aplica**
* [x] Tokens y licencia NO en UserDefaults (estan en `~/.brew-tui/license.json` cifrado)
* [x] UserDefaults de BrewBar contiene solo preferencias: `checkInterval`, `notificationsEnabled`, `hasLaunchedBefore`, `didAutoRegisterLoginItem`, `lastSchedulerError`, `syncLastKnownUpdatedAt`
* [ ] `lastSchedulerError` en UserDefaults expone timestamp + mensaje de error de sistema — **Baja**: informacion de debug, no secreto

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Clave AES estatica embebida en bundle npm y binario Swift | No conforme | Alta | `src/lib/license/license-manager.ts:78-79`; `src/lib/sync/crypto.ts:6-7`; `menubar/.../LicenseChecker.swift:49-53` — la clave derivada de scrypt esta hardcoded en el bundle (TS) y como literal hex (Swift). Cualquier usuario puede extraerla y fabricar un `license.json` valido si no hay binding de maquina | Migrar derivacion de clave a macOS Keychain (SecItemAdd/SecItemCopyMatching) en ambas plataformas |
| Cuatro implementaciones de `getMachineId` con fallbacks divergentes | No conforme | Alta | `polar-api.ts:38-48` (crea UUID en miss), `license-manager.ts:137-147` (retorna null en miss), `sync-engine.ts:48-54` (cae a `hostname()` en miss), `promo.ts:11-20` (crea UUID en miss). En primera ejecucion pueden llamarse en paralelo y crear el archivo race; el fallback a `hostname()` en sync rompe la consistencia del machineId | Extraer funcion unica `getMachineId()` a `data-dir.ts` con mutex; eliminar duplicados |
| `cve-cache.json` escrito por Swift, leido por TUI: contrato de esquema no documentado | Parcial | Media | `menubar/.../SecurityMonitor.swift:269-280` escribe `CVECache` (Codable con `checkedAt: Date`, `alerts: [CVEAlert]`). El TUI no lee este archivo — la seguridad-store mantiene su resumen solo en memoria (Zustand). Hay dos caches separados: el de Swift (`cve-cache.json`) y el de TS (en memoria). Un usuario puede ver resultados diferentes en BrewBar y en el TUI | Documentar el contrato del cache compartido; o bien hacer que el TUI lea/escriba el mismo `cve-cache.json` que Swift para consistencia |
| Escritura de `cve-cache.json` en Swift sin permisos restringidos | Parcial | Baja | `SecurityMonitor.swift:278` usa `data.write(to:, options: .atomic)` sin especificar atributos POSIX; los permisos del archivo resultante dependen del umask del proceso (tipicamente 0o644) | Pasar atributos POSIX `[.posixPermissions: 0o600]` o usar `FileManager.createFile(atPath:contents:attributes:)` con permisos explicitos |

---

## 12.2 Sincronizacion

### Checklist

* [x] Estrategia definida: iCloud Drive como transporte, AES-256-GCM como cifrado en reposo
* [x] Disponibilidad de iCloud verificada antes de sync (`isICloudAvailable`, `icloud-backend.ts:14-21`)
* [x] Deteccion de conflictos implementada por paquete entre maquinas (`sync-engine.ts:58-101`)
* [x] Resolucion interactiva de conflictos disponible (`applyConflictResolutions`, `sync-engine.ts:220-267`)
* [ ] iCloud no verifica estado de descarga del archivo — **Media**: `icloud-backend.ts:35-55`
* [x] Escrituras atomicas en iCloud via `.tmp` + `rename()` (`icloud-backend.ts:57-65`)
* [ ] `sync.json` en iCloud no tiene permisos 0o600 — **Baja**: `icloud-backend.ts:57-64` especifica `mode: 0o600` en el `.tmp`, pero el rename puede que no conserve permisos en todos los sistemas de ficheros iCloud montados
* [x] Cola de cambios pendientes no necesaria (sync es manual/bajo demanda)
* [ ] Estado offline no previsto en SyncMonitor Swift — **Baja**: `SyncMonitor.swift:25` usa `Data(contentsOf:)` sincrono que puede bloquear el actor si el archivo iCloud esta en estado `evicted`
* [x] Conflicto de colision de dispositivos: el machineId es la clave del mapa `machines`; dos maquinas con el mismo hostname pero diferente machineId son tratadas como maquinas distintas
* [ ] Fallback de machineId a `hostname()` en sync — **Alta**: `sync-engine.ts:53` — si `machine-id` no existe al sincronizar, usa `hostname()` como clave. Dos maquinas con el mismo hostname sobrescribirian su estado en el payload sin deteccion de conflicto

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Fallback a `hostname()` como machineId en sync | No conforme | Alta | `src/lib/sync/sync-engine.ts:53` — si `~/.brew-tui/machine-id` no existe (usuario nuevo sin activar Polar), la clave del mapa de maquinas pasa a ser el hostname. Dos maquinas con el mismo hostname (comun en redes de empresa o usuarios con mismo nombre de equipo) colisionan en el payload AES y se sobrescriben mutuamente | Crear el `machine-id` en `ensureDataDirs()` como parte del setup inicial, no como efecto secundario de la activacion; eliminar el fallback a `hostname()` |
| iCloud: no se verifica `NSURLUbiquitousItemDownloadingStatusKey` | No conforme | Media | `src/lib/sync/backends/icloud-backend.ts:35-55` — `readFile(ICLOUD_SYNC_PATH)` puede fallar o leer datos parciales si el archivo esta en estado `placeholder` (no descargado) en iCloud. El error `ENOENT` se trata como "no existe todavia" en linea 47, enmascarando un placeholder no descargado | Antes de leer, llamar a `fs.stat()` y verificar que el archivo tiene tamanyo > 0; o usar `xattr` para comprobar `com.apple.quarantine` / estado iCloud |
| `SyncMonitor.swift` lee `sync.json` de forma sincrona | No conforme | Media | `menubar/.../SyncMonitor.swift:25` — `Data(contentsOf: syncPath)` es una llamada de I/O sincrona dentro de un `actor`; puede bloquear el hilo del actor si iCloud esta descargando el archivo | Migrar a `URLSession.dataTask` o `async let` con `url.resourceValues(forKeys:)` para lectura asincrona |

---

## 12.3 Calidad del dato

### Checklist

* [x] Unicidad de perfiles garantizada por nombre de fichero (`profilePath` usa `basename`, `profile-manager.ts:34-38`)
* [x] Deteccion de perfil duplicado en `exportCurrentSetup` (`profile-manager.ts:94-96`)
* [x] Historial con ID UUID por entrada (`history-logger.ts:84`)
* [x] Historial con file lock para evitar escrituras concurrentes (`withLock`, `history-logger.ts:15-24`)
* [ ] Lock de historial sin TTL ante crash — **Media**: ver 11.4
* [x] Fechas almacenadas como ISO 8601 UTC en todos los modulos TypeScript
* [x] `ISO8601DateFormatter` con fractional seconds en Swift para parsear fechas de Polar (`LicenseChecker.swift:154-163`)
* [ ] `isExpired()` falla abierto en fecha ISO invalida — **Media**: ver 11.3
* [x] Snapshots validados con `isValidSnapshot` antes de cargar (`snapshot.ts:15-24`)
* [x] Snapshots corruptos omitidos con warning en lugar de crashear (`snapshot.ts:124-126`)
* [x] Brewfile YAML serializado/parseado con manejo de errores (`brewfile-manager.ts:16-24`)
* [x] Drift score acotado entre 0 y 100 con `Math.max(0, Math.min(100, ...))` (`brewfile-manager.ts:78`)
* [x] Severity mapping en OSV robusto: prioriza `database_specific`, fallback a CVSS v3 (`osv-api.ts:29-47`)
* [ ] Severidades de OSV (TS) son uppercase (`'CRITICAL'`); las de Swift (`CVEAlert.Severity`) son lowercase raw values (`'critical'`). El `cve-cache.json` escrito por Swift usa lowercase; si el TUI llegara a leerlo, el type guard fallaria en silencio | Media |

### Hallazgos

| Elemento | Estado | Severidad | Evidencia | Accion |
|----------|--------|-----------|-----------|--------|
| Incompatibilidad de formato de severidad TS/Swift en cve-cache.json | No conforme | Media | `src/lib/security/types.ts:1` — `Severity = 'CRITICAL' \| 'HIGH' \| ...` (uppercase). `menubar/.../CVEAlert.swift:12-18` — `Severity: String, Codable` con raw values `case critical` (lowercase). Si el TUI llegara a leer el `cve-cache.json` escrito por Swift, el decodificado fallaria silenciosamente | Unificar convencion de casing; si el cache es compartido, definir un contrato de esquema JSON explicito con el mismo casing |
| Historial: lock sin TTL deja el archivo bloqueado si el proceso falla | No conforme | Media | `src/lib/history/history-logger.ts:13-24` — `open(lockPath, 'wx')` crea el lock; si el proceso muere antes de `unlink`, las escrituras futuras fallaran con "History file is locked by another process" indefinidamente | Comprobar `mtime` del lockfile: si tiene mas de 30s, eliminarlo como lock huerfano antes de reintentar |
| OSV TUI devuelve resultados vacios por ecosystem incorrecto | No conforme | Critica | `src/lib/security/osv-api.ts:181` — `ecosystem: 'Homebrew'` causa HTTP 400; `queryBatch` llama a `queryOneByOne` (linea 78); `queryOneByOne` tambien usa `'Homebrew'` (lineas 125, 143); la excepcion del 400 se captura y el paquete se omite (linea 131). Resultado: el Security Audit del TUI devuelve siempre 0 vulnerabilidades encontradas independientemente del estado real | Cambiar `'Homebrew'` por `'Bitnami'` en las tres ocurrencias de `osv-api.ts` |
| Snapshots sin poda: crecimiento ilimitado en disco | No conforme | Alta | `src/lib/state-snapshot/snapshot.ts:95-107` — cada operacion (post-upgrade, post-rollback, post-reconcile) genera un fichero nuevo. Sin limite ni poda, el directorio `~/.brew-tui/snapshots/` crece indefinidamente | Anadir funcion `pruneSnapshots(maxCount = 20)` llamada tras cada `saveSnapshot` |
