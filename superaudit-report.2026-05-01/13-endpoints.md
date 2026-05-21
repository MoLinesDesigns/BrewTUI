# 13. Endpoints (HTTP externos, CLI subcommands y subprocesos brew)

> Auditor: endpoint-auditor (rerun manual) | Fecha: 2026-05-01

## Resumen ejecutivo

El proyecto carece de servidor HTTP propio: las "endpoints" auditables se reducen a (1) cuatro integraciones HTTP salientes (Polar, OSV.dev, Promo backend propio en `api.molinesdesigns.com`, y descarga de release de GitHub), (2) ocho subcomandos del binario `brew-tui` y (3) ~25 invocaciones distintas de `brew` repartidas en el TUI TypeScript y la app Swift BrewBar. La superficie HTTP esta razonablemente protegida en Polar y en GitHub Releases (TLS sistema, validacion de host, validacion runtime de respuestas, timeouts agresivos, SHA-256 obligatorio del binario), pero conserva tres defectos que se mantienen desde la auditoria original sin estar corregidos: (a) el ecosistema enviado al endpoint OSV es `'Homebrew'` en TypeScript (`osv-api.ts:125,143,181`), valor que la API rechaza con HTTP 400 — la version Swift ya migro a `'Bitnami'` (`SecurityMonitor.swift:119`), de modo que el feature Security Audit del TUI devuelve resultados vacios sistematicamente; (b) `promo.ts` no aplica `validateApiUrl` a su URL base; (c) `brewUpdate()` ejecuta `spawn('brew', ['update'])` sin timeout. La capa de subprocesos `brew` valida nombres de paquete con `PKG_PATTERN` antes de pasar a `spawn` con array (sin shell), por lo que no hay riesgo de inyeccion de comandos. El subcomando `install-brewbar` impone validacion estricta del binario descargado (limite duro de 200 MB con corte en stream, SHA-256 obligatorio fail-closed). Hay un hallazgo de severidad Critica heredada (TS osv-api ecosystem='Homebrew') y dos Medias (validateApiUrl ausente en promo, brewUpdate sin timeout).

---

## A. Integraciones HTTP externas

### A.1 Polar API — License key activate / validate / deactivate

* **Cliente:** `src/lib/license/polar-api.ts`
* **Base URL:** `https://api.polar.sh/v1/customer-portal/license-keys` (`polar-api.ts:8`)
* **Validacion de URL:** `validateApiUrl()` en `polar-api.ts:51-59` — exige `protocol === 'https:'` y `hostname.endsWith('polar.sh')`. Se invoca en cada `post()` (linea 83). Si alguien manipula `BASE_URL` en codigo o en un fork, la guardia rechaza HTTP o un dominio extrano.
* **Transporte comun:** `fetchWithRetry(url, init, 15_000)` (`polar-api.ts:85`). Retries: 3 intentos, base 500 ms, max 4 s, exponencial — por defecto solo en respuestas 5xx y errores transitorios de red (`fetch-timeout.ts:22-27,29-32`). 4xx no se reintenta.
* **Auth:** ninguna cabecera `Authorization`. El `key` (license key) viaja en el body JSON. El `organization_id` es publico (`polar-api.ts:13`).
* **Headers:** `Content-Type: application/json` unicamente.
* **Cache:** ninguna; cada operacion hace round-trip.

| Endpoint | Metodo | Body | Validacion runtime | Idempotente | Notas |
|----------|--------|------|--------------------|-------------|-------|
| `/activate` | POST | `{ key, organization_id, label: machineId }` (`polar-api.ts:111-115`) | `polar-api.ts:118-120` exige `activation.id: string` y `activation.license_key` | No (un retry tras parcial puede provocar doble activacion / consumir slot del limite) | Tras activar hace un `validate` extra para recuperar email/nombre del cliente (`polar-api.ts:126-133`); si ese validate falla se devuelve `customerEmail=''`, no se cancela la activacion |
| `/validate` | POST | `{ key, organization_id, activation_id }` (`polar-api.ts:154-158`) | `polar-api.ts:161-163` exige `id: string`, `status: string`, `customer` presentes | Si (semantica GET) | Mapea `status === 'granted' && notExpired` a `valid: true` |
| `/deactivate` | POST | `{ key, organization_id, activation_id }` (`polar-api.ts:181-186`) | `expectEmpty=true`, acepta 204 (`polar-api.ts:104`) | Si (deactivar dos veces = no-op para Polar) | **Hallazgo heredado**: `license-manager.ts:354-362` envuelve la llamada en un loop de hasta 3 intentos, pero `apiDeactivate` ya pasa por `fetchWithRetry` (3 intentos por defecto) — total maximo 9 requests |

* **Mapeo de errores HTTP:** `polar-api.ts:91-101` lee `detail`, `error` o `message` del cuerpo JSON; si no es JSON, mensaje generico `Request failed with status N`. La clasificacion network-vs-contrato la hace el caller en `license-manager.ts:319-322` (regex `fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|timeout|abort`).
* **Rate limiting client-side:** verificado en `license-manager.ts:23-69`:
  - `ACTIVATION_COOLDOWN_MS = 30_000` (linea 23)
  - `MAX_ATTEMPTS = 5` (linea 24)
  - `LOCKOUT_MS = 15 * 60 * 1000` (linea 25)
  - `checkRateLimit()` se invoca antes de cada `activate` (`license-manager.ts:282`) y `recordAttempt(success)` se ejecuta en `finally` (linea 308). Coincide con la documentacion.
  - Limitacion: el `tracker` es variable de modulo en memoria; reiniciar el proceso resetea contadores (mitigacion documentada en `license-manager.ts:33`).

#### Hallazgos seccion A.1

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| Doble retry en deactivate | Baja | `license-manager.ts:354-362` + `fetchWithRetry` por defecto = hasta 9 POST a `/deactivate` | Pasar `retry: { attempts: 1 }` en `apiDeactivate` o eliminar el loop externo |
| `/activate` no idempotente y sin idempotency-key | Baja | `polar-api.ts:111` — un retry tras timeout intermedio puede consumir un slot adicional del activation limit | Generar `Idempotency-Key: randomUUID()` y enviarlo como header; requiere soporte server-side |

---

### A.2 OSV.dev — `/v1/querybatch`

#### A.2.a Cliente TypeScript (TUI Security Audit)

* **Archivo:** `src/lib/security/osv-api.ts`
* **URL:** `https://api.osv.dev/v1/querybatch` (`osv-api.ts:5`) — constante hardcodeada, sin `validateApiUrl`. Aceptable: hostname fijo, esquema HTTPS hardcodeado.
* **Metodo / headers:** POST con `Content-Type: application/json` (`osv-api.ts:69-71`).
* **Body:** `{ queries: [{ package: { name, ecosystem: 'Homebrew' }, version }] }` — batch de hasta `BATCH_SIZE = 100` (`osv-api.ts:60`) ensamblado en `osv-api.ts:180-184`.
* **Auth:** ninguna (la API es publica).
* **Timeout:** `15_000 ms` via `fetchWithRetry(..., 15_000, { retryOn: status>=500 && <600 })` (`osv-api.ts:68-74`).
* **Reintentos:** 3 intentos por defecto solo en 5xx; 400 NO se reintenta.
* **Validacion runtime:** `osv-api.ts:87-92` exige `data.results` array y `results.length === packages.length`.
* **Mapeo de errores:** HTTP 400 con `queries.length > 1` cae a `queryOneByOne()` (`osv-api.ts:78-80`) para aislar el paquete problematico. 429 se maneja con backoff de 2 s y un solo retry (`osv-api.ts:136-149`).
* **Rate limit defensivo:** `await sleep(75)` entre requests individuales (`osv-api.ts:157`).
* **Cache:** TTL de 30 min en TUI segun convencion (no implementado en `osv-api.ts` — debe vivir en `audit-runner.ts` o `security-store.ts`; no auditado aqui).

##### Hallazgo critico heredado A.2.a

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| `ecosystem: 'Homebrew'` rechazado por OSV | **Critica** | `osv-api.ts:125`, `osv-api.ts:143`, `osv-api.ts:181` — la API responde HTTP 400 a este ecosystem. El comentario en `SecurityMonitor.swift:114-116` lo confirma: `OSV no soporta "Homebrew" como ecosystem (devuelve HTTP 400)`. Resultado: el batch falla con 400, cae a `queryOneByOne`, cada paquete devuelve 400 individual, todos se descartan via `errors.push` (`osv-api.ts:131-134`) y la funcion retorna un `Map` vacio. El feature Security Audit del TUI NO encuentra ningun CVE | Cambiar las tres ocurrencias de `'Homebrew'` a `'Bitnami'` en `osv-api.ts:125,143,181`, alinear con la implementacion Swift y documentar la decision en el comentario justo encima de la constante |

#### A.2.b Cliente Swift (BrewBar)

* **Archivo:** `menubar/BrewBar/Sources/Services/SecurityMonitor.swift`
* **URL:** `https://api.osv.dev/v1/querybatch` (`SecurityMonitor.swift:13`).
* **Metodo / headers:** POST con `Content-Type: application/json` (`SecurityMonitor.swift:129-130`).
* **Body:** mismo shape que TS pero `ecosystem: 'Bitnami'` (`SecurityMonitor.swift:119`) — corregido.
* **Timeout:** `request.timeoutInterval = 15` segundos (`SecurityMonitor.swift:132`).
* **Transporte:** `URLSession.shared.data(for:)` (`SecurityMonitor.swift:134`) — TLS sistema, sin delegate custom, sin reintentos manuales.
* **Validacion runtime:** `SecurityMonitor.swift:144-152` exige `results: [[String: Any]]` y `results.count == packages.count`. Ante mismatch lanza `SecurityMonitorError.responseMismatch`.
* **Mapeo de errores:** enum `SecurityMonitorError` (`SecurityMonitor.swift:288-303`): `invalidURL`, `invalidResponse`, `httpError(Int)`, `invalidResponseFormat`, `responseMismatch`, todos `LocalizedError`.
* **Cache:** archivo `~/.brew-tui/cve-cache.json`, TTL `cacheMaxAge = 3600` segundos (1 h) — distinto al TUI (30 min). Si el cache es fresco no se hace request (`SecurityMonitor.swift:27-31`).
* **Idempotente:** si — la API es read-only.

##### Hallazgo Informativa A.2.b

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| TTL de cache divergente entre TUI (30 min) y BrewBar (60 min) sobre el mismo archivo `~/.brew-tui/cve-cache.json` | Informativa | `SecurityMonitor.swift:11` vs convencion TUI documentada en CLAUDE.md y `01-inventario.md:294` | Unificar TTL o documentar la divergencia explicitamente; el archivo se comparte y el primero que escriba con su TTL prevalece |

---

### A.3 Promo backend propio (`api.molinesdesigns.com/api/promo`)

* **Archivo:** `src/lib/license/promo.ts`
* **Base URL:** `const PROMO_API_URL = 'https://api.molinesdesigns.com/api/promo'` (`promo.ts:25`) — hardcodeada, HTTPS, sin guardia de URL.
* **Endpoints consumidos:**

| Endpoint | Metodo | Body | Validacion runtime | Idempotente |
|----------|--------|------|--------------------|-------------|
| `/validate` | POST | `{ code: normalized }` (`promo.ts:97`) | `promo.ts:106-115`: exige `type: string`, `durationDays: number` y luego type ∈ `'trial'\|'discount'\|'full'` | Si |
| `/redeem` | POST | `{ code: normalized, machineId }` (`promo.ts:145`) | `promo.ts:153-167`: extrae `data.data` (envoltorio anidado) y exige `expiresAt: string`, `type: string` | **No garantizada server-side** — sin `Idempotency-Key` |

* **Auth:** ninguna en headers; `machineId` actua como factor de identidad en `/redeem`.
* **Timeout:** `10_000 ms` en ambos (`promo.ts:98, 146`) via `fetchWithTimeout`.
* **Reintentos:** ninguno — `fetchWithTimeout` no envuelve `fetchWithRetry`. Un retry manual tras timeout puede provocar doble redencion server-side.
* **Mapeo de errores HTTP:** lee `body.error` del JSON; si no, mensaje generico `'Invalid or expired promo code'` o `'Could not reach promo server.'`. Catch de excepciones logguea via `logger.error(...)` y devuelve un objeto de fallo (`promo.ts:122-125, 169-172`).
* **Persistencia local tras canje:** `~/.brew-tui/promo.json` con escritura atomica (`promo.ts:198-200`, tmp + `rename`), permisos 0o600. Comprobacion local de duplicado en `promo.ts:191`.

#### Hallazgos seccion A.3

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| `validateApiUrl` ausente en promo | Media | `promo.ts:94, 142` no aplican la guardia que si existe en `polar-api.ts:51-59` | Refactorizar `validateApiUrl` a `fetch-timeout.ts` y reusarla; o duplicar la guardia en promo |
| Promo `/redeem` sin `Idempotency-Key` | Media | `promo.ts:142-172` — un timeout intermedio en cliente seguido de retry manual del usuario podria doble-canjear | Anadir `idempotencyKey: randomUUID()` al body; el servidor debe deduplicar |
| Promo sin reintentos automaticos | Baja | `fetchWithTimeout` no es `fetchWithRetry`; un blip de red devuelve fallo inmediato | Migrar a `fetchWithRetry` con `attempts: 2` |

---

### A.4 GitHub Releases — descarga de `BrewBar.app.zip`

* **Archivo:** `src/lib/brewbar-installer.ts`
* **URL del binario:** `https://github.com/MoLinesGitHub/Brew-TUI/releases/latest/download/BrewBar.app.zip` (`brewbar-installer.ts:14`).
* **URL del checksum:** `${DOWNLOAD_URL}.sha256` (`brewbar-installer.ts:89`).
* **Cadena de redirects:** `fetchWithTimeout` usa el `fetch` nativo de Node 22, que sigue redirects HTTP automaticamente con limite por defecto (Undici, 20 redirects). GitHub redirige `/latest/download/...` a `objects.githubusercontent.com` con TLS — la cadena queda dentro de HTTPS.
* **Timeout:** `120_000 ms` (2 min) para el binario (`brewbar-installer.ts:48`); `15_000 ms` para el checksum (`brewbar-installer.ts:89`).
* **Limite de tamano:**
  - Pre-check: `Content-Length` > 200 MB → rechazo (`brewbar-installer.ts:54-57`).
  - In-stream: contador `downloadedBytes` por chunk; al rebasar 200 MB se aborta el `ReadableStream` con `controller.error(...)` (`brewbar-installer.ts:71-75`). Esto cubre el caso de un servidor que omita `Content-Length` o lo mienta.
* **Verificacion SHA-256:** OBLIGATORIA y fail-closed (`brewbar-installer.ts:103-114`). Si el archivo `.sha256` no esta disponible o el formato es invalido, se borra el zip temporal y se lanza un error con mensaje `'SHA-256 checksum unavailable — cannot verify download integrity'`. Validacion regex del hash: `/^[0-9a-f]{64}$/i` (`brewbar-installer.ts:95`).
* **Auth:** ninguna (assets publicos).
* **Idempotente:** si — la URL `latest/download` apunta al asset publicado.
* **Side effects:** descarga a `tmpdir() + 'BrewBar-' + randomUUID() + '.zip'` (path unico, `brewbar-installer.ts:45`); descomprime con `ditto -xk` a `/Applications/`; limpia el zip en `finally`.

#### Hallazgos seccion A.4

Sin hallazgos nuevos. La verificacion SHA-256 obligatoria y el corte por chunk son una correccion ya aplicada (NUEVO-003 en el comentario `brewbar-installer.ts:111`). Lo unico observable:

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| Sin verificacion de firma de codigo del `.app` post-descarga | Informativa | `brewbar-installer.ts:122-129`: tras `ditto -xk` no se invoca `codesign --verify --deep --strict /Applications/BrewBar.app`. La SHA-256 garantiza integridad de transporte pero no que el binario este firmado por el Developer ID esperado | Anadir `await execFileAsync('codesign', ['--verify', '--deep', '--strict', BREWBAR_APP_PATH])` antes de devolver exito; opcionalmente `spctl --assess --type execute` para Gatekeeper |

---

### A.5 Crash reporter (TS y Swift) — opt-in

Aunque no estaba en el alcance original, ambos clients hacen network calls condicionales que merecen mencion breve.

#### A.5.a TypeScript

* **Archivo:** `src/lib/crash-reporter.ts`
* **Endpoint:** configurable via env `BREW_TUI_CRASH_ENDPOINT` o config `~/.brew-tui/crash-reporter.json` (`crash-reporter.ts:11-13`).
* **Validacion de host:** `isHttpsOrLocal(url)` (`crash-reporter.ts:77-90`) acepta HTTPS o HTTP unicamente para loopback / LAN privada (10/8, 192.168/16, 172.16-31/12). Cierra fail-closed.
* **Auth:** opcional `Authorization: Bearer <token>` (`crash-reporter.ts:99`). Token se lee del env `BREW_TUI_CRASH_TOKEN` o del config file.
* **Timeout:** 5 s (`crash-reporter.ts:15`).
* **Body:** `CrashReport` con `app, version, platform, os, arch, machineId, timestamp, level, message, stack, context` (`crash-reporter.ts:23-35`). Stack trace incluido — puede contener rutas absolutas con username.
* **Idempotente:** si (server debe deduplicar por timestamp+stack si lo desea).

#### A.5.b Swift

* **Archivo:** `menubar/BrewBar/Sources/Services/CrashReporter.swift`
* **Endpoint:** UserDefaults `crashReporterEndpoint` (`CrashReporter.swift:19, 38-43`).
* **Validacion de host:** `isAllowedHost(URL)` (`CrashReporter.swift:114-133`) — misma logica que TS (HTTPS o HTTP loopback/LAN privada).
* **Auth:** Bearer opcional desde UserDefaults `crashReporterToken` (`CrashReporter.swift:103`).
* **Timeout:** 5 s (`CrashReporter.swift:22`).
* **Hallazgo heredado:** `08-security.md` documenta que el token Bearer en `UserDefaults` (en lugar de Keychain) es severidad Media.

---

## B. CLI subcommands (`src/index.tsx`)

Todos comparten parsing trivial: `process.argv[2]` = `command`, `process.argv[3]` = `arg`. Sin libreria de argv ni ayuda formal (`brew-tui --help` no esta implementado). Cada handler imprime mensajes via `console.log/console.error` (la unica excepcion documentada al uso obligatorio del `logger`).

| Subcomando | Args | Validaciones | Side effects | Exit codes | Output | Riesgo |
|------------|------|--------------|--------------|-----------|--------|--------|
| `activate <key>` (`index.tsx:19-37`) | `key` requerida; rechazo si vacia | `validateLicenseKey` (`license-manager.ts:257-267`): longitud 10-100, regex `/^[\w-]+$/`. `checkRateLimit()` antes de la red | Red: `POST /activate` + `POST /validate` (Polar). Disco: escribe `~/.brew-tui/license.json` cifrado AES-GCM y `~/.brew-tui/machine-id` si no existe. Mutex: actualiza `tracker` en memoria | 0 = ok; 1 = key vacia o `apiActivate` lanza | Stdout: `cli_activated`, `cli_planPro`, `cli_expires`. Stderr: `cli_activationFailed{error}` | Medio — operacion remota; bloquea cuenta tras 5 fallos durante 15 min |
| `revalidate` (`index.tsx:60-83`) | Ninguno | `loadLicense()` debe devolver licencia | Red: `POST /validate`. Disco: reescribe `license.json` con `lastValidatedAt` actualizado o `status='expired'` | 0 = valid o grace; 1 = no hay licencia o `expired` | Stdout segun resultado: `cli_revalidated`, `cli_revalidateGrace` (warn), `cli_revalidateFailed` (error) | Bajo |
| `deactivate` (`index.tsx:39-58`) | Ninguno | Confirmacion interactiva via readline (`y`/`s`/`Y`/`S`) | Red: `POST /deactivate` (Polar) — hasta 3 reintentos × 3 reintentos internos = 9. Disco: borra `~/.brew-tui/license.json` siempre (incluso si remoto falla) | 0 siempre (remoto fallido es warning, no error) | Stdout: `cli_deactivated`. Warn: `cli_deactivateRemoteFailed` si remoto fallo | Medio — irreversible localmente |
| `status` (`index.tsx:85-173`) | Ninguno | Ninguna | Side effects de lectura: inicializa `useLicenseStore`, lee `~/.brew-tui/snapshots/`, `policy.yaml`, `Brewfile`, `sync-config.json` (todos best-effort, sin throw). Para Pro tambien invoca `checkCompliance` que ejecuta `brew leaves`/`brew list` indirectamente | 0 siempre | Stdout estructurado: plan, email, status, expires, snapshots count, brewfile drift, sync date, compliance score | Bajo |
| `install-brewbar [--force]` (`index.tsx:175-187`) | `--force` opcional | Inicializa store; comprueba `isPro()`; macOS only (lanza si no); rechaza si ya instalado salvo `--force` | Red: GET zip + GET .sha256. Disco: zip a `tmpdir()`, `ditto -xk` a `/Applications/`, opcionalmente `rm` previo de `/Applications/BrewBar.app`. Subproceso: `ditto` | 0 = ok; 1 = error de cualquier validacion | Stdout: `cli_brewbarInstalling`, `cli_brewbarInstalled`. Stderr: mensaje del error | Alto — escribe en `/Applications/`, requiere permisos correctos |
| `uninstall-brewbar` (`index.tsx:189-199`) | Ninguno | `isBrewBarInstalled()` debe devolver true | Disco: `rm -rf /Applications/BrewBar.app` | 0 = ok; 1 = no instalado o error | Stdout: `cli_brewbarUninstalled`. Stderr: mensaje | Medio |
| `delete-account` (`index.tsx:201-213`) | Ninguno | Confirmacion interactiva `y`/`s` | Disco: `rm -rf ~/.brew-tui/` (toda la data del usuario, incluyendo licencia, snapshots, history, profiles, machine-id, logs) | 0 siempre | Stdout: `delete_account_success` o `cli_deactivateCancelled` | Critico — destructivo e irreversible. **No** desactiva licencia en Polar previamente: el slot queda consumido server-side hasta soporte manual |
| Default (sin args) (`index.tsx:215-224`) | — | — | Auto-instala+lanza BrewBar para Pro en macOS (`ensureBrewBarRunning`); pinta pantalla en blanco; `render(<App />)` | 0 hasta `q` | TUI completo | Bajo (la TUI tiene su propia logica de errores) |

#### Hallazgos seccion B

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| `delete-account` no desactiva en Polar antes de borrar la licencia local | Media | `index.tsx:201-213`: `rm(DATA_DIR, ...)` borra `license.json` directamente sin invocar `apiDeactivate`. El usuario pierde la licencia local pero el slot sigue ocupado en el servidor; al reactivar en otra maquina puede toparse con `activation_limit_reached` | Antes de `rm`, intentar `loadLicense()` + `apiDeactivate(license.key, license.instanceId)` con timeout corto (5 s) y continuar aunque falle. Documentar el comportamiento en la confirmacion |
| Confirmaciones via `readline.question` sin TTY check | Baja | `index.tsx:45, 203`: si stdin no es TTY, `rl.question` devuelve `''` y la condicion `!== 'y' && !== 's'` cancela — fail-safe. Sin embargo no hay mensaje claro de "no TTY" | Detectar `!process.stdin.isTTY` y emitir un error explicito o anadir flag `--yes` |
| Sin `brew-tui --help`, `--version` ni manejo de subcomando desconocido | Baja | `index.tsx`: si el comando no coincide con ninguno de los `if`, cae al default que renderiza la TUI. `brew-tui foo` lanza la TUI sin warning | Anadir parser minimo (yargs/commander o switch explicito) que detecte comando desconocido y emita ayuda |

---

## C. Invocaciones de subprocesos `brew`

Tabla maestra. Todas las invocaciones TS pasan por `spawn('brew', args, { env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' } })` con array de argumentos (sin shell). Las Swift pasan por `BrewProcess.run(args)` que resuelve la ruta absoluta del ejecutable (`/opt/homebrew/bin/brew` con fallback a `/usr/local/bin/brew` o linuxbrew, `BrewProcess.swift:25-34`). No hay riesgo de inyeccion de comandos en ninguno: ambos usan API que no interpola shell.

### C.1 TypeScript — `execBrew` (timeout 30 s) y `streamBrew` (idle 5 min)

Definidos en `src/lib/brew-cli.ts`.

| Comando | Llamador | Args exactos | Wrapper | Notas |
|---------|----------|--------------|---------|-------|
| `brew update` | `brew-api.ts:19` | `['update']` | `spawn` directo, **sin timeout** ni `HOMEBREW_NO_AUTO_UPDATE` | **Hallazgo Media** heredado: ver tabla abajo |
| `brew info --json=v2 --installed` | `brew-api.ts:29` | `['info', '--json=v2', '--installed']` | execBrew (30 s) | Stdout JSON; parseado por `parseInstalledJson` |
| `brew outdated --json=v2 --greedy` | `brew-api.ts:34` | `['outdated', '--json=v2', '--greedy']` | execBrew | JSON; `parseOutdatedJson` |
| `brew services list --json` | `brew-api.ts:39` | `['services', 'list', '--json']` | execBrew | JSON; `parseServicesJson` |
| `brew info --json=v2 <name>` | `brew-api.ts:45` | `['info', '--json=v2', name]` | execBrew | `validatePackageName(name)` previo (`PKG_PATTERN = /^[\w@./+-]+$/`) |
| `brew info --json=v2 --cask <name>` | `brew-api.ts:53` | `['info', '--json=v2', '--cask', name]` | execBrew | Idem; `try/catch` swallowing — devuelve `null` ante error |
| `brew search <term>` | `brew-api.ts:66` | `['search', safeTerm]` | execBrew | Saneo: `term.replace(/^-+/, '')` (solo guiones iniciales). Texto, no JSON |
| `brew doctor` | `brew-api.ts:72` | `['doctor']` | execBrew | El stdout/stderr de error tambien se parsea (es output esperado) |
| `brew config` | `brew-api.ts:81` | `['config']` | execBrew | Texto |
| `brew leaves` | `brew-api.ts:86` | `['leaves']` | execBrew | Texto |
| `brew install <name>` | `brew-api.ts:92`, `profile-manager.ts:172`, `brewfile-manager.ts:107,120`, `compliance-remediator.ts:18` | `['install', name]` | streamBrew (idle 5 min) | `validatePackageName` o `PKG_PATTERN` segun caller. En `profile-manager.ts:167` y `:180` se valida con `PKG_PATTERN` antes del stream |
| `brew install --cask <name>` | `profile-manager.ts:185` | `['install', '--cask', name]` | streamBrew | PKG_PATTERN previo |
| `brew install <versionedFormula>` | `rollback-engine.ts:171,189` | `['install', action.versionedFormula]` | streamBrew | `versionedFormula` proviene de snapshot serializado; sin validacion regex explicita en este punto |
| `brew install --force-bottle <name>` | `rollback-engine.ts:178,194` | `['install', '--force-bottle', action.packageName]` | streamBrew | Sin validacion explicita |
| `brew upgrade <name>` | `brew-api.ts:97`, `compliance-remediator.ts:29` | `['upgrade', name]` | streamBrew | validatePackageName |
| `brew upgrade` (todas) | `brew-api.ts:101` | `['upgrade']` | streamBrew | |
| `brew uninstall <name>` | `brew-api.ts:106` | `['uninstall', name]` | execBrew | validatePackageName |
| `brew services <action> <name>` | `brew-api.ts:111` | `['services', action, name]` | execBrew | `action: 'start'\|'stop'\|'restart'` (union literal); validatePackageName |
| `brew pin <name>` | `brew-api.ts:117`, `rollback-engine.ts:199` | `['pin', name]` | execBrew | validatePackageName |
| `brew unpin <name>` | `brew-api.ts:122` | `['unpin', name]` | execBrew | validatePackageName |
| `brew tap` | `profile-manager.ts:102`, `state-snapshot/snapshot.ts:64` | `['tap']` | execBrew | Texto |
| `brew tap <tap>` | `profile-manager.ts:160` | `['tap', tap]` | execBrew | `TAP_PATTERN = /^[a-z0-9][-a-z0-9]*\/[a-z0-9][-a-z0-9]*$/` previo |
| `brew --cellar <name>` | `cleanup-analyzer.ts:22` | `['--cellar', name]` | execBrew | `name` es nombre de paquete; no validado explicitamente con `PKG_PATTERN` aqui — viene de `getInstalled()` que ya lo dio Homebrew |
| `brew --cache` | `rollback-engine.ts:34` | `['--cache']` | execBrew | Sin args dinamicos |
| `brew deps --1 <name>` | `impact-analyzer.ts:81` | `['deps', '--1', packageName]` | execBrew | validatePackageName previo en `brew-api.ts:148` |
| `brew uses --installed <name>` | `impact-analyzer.ts:88` | `['uses', '--installed', packageName]` | execBrew | Idem |
| `brew list --versions --formula` | `state-snapshot/snapshot.ts:62` | `['list', '--versions', '--formula']` | execBrew | |
| `brew list --cask --versions` | `state-snapshot/snapshot.ts:63` | `['list', '--cask', '--versions']` | execBrew | |
| `brew list --pinned` | `state-snapshot/snapshot.ts:65` | `['list', '--pinned']` | execBrew | |
| `brew info --json=v2 <versionedFormula>` | `rollback-engine.ts:25` | `['info', '--json=v2', versionedFormula]` | execBrew | |

* **Env shared:** `HOMEBREW_NO_AUTO_UPDATE: '1'` se inyecta en `execBrew` (`brew-cli.ts:8`) y `streamBrew` (`brew-cli.ts:41`). Excepcion intencional: `brewUpdate()` (`brew-api.ts:18-26`).
* **Stdout/stderr:** `execBrew` acumula ambos por separado (`brew-cli.ts:20-21`), devuelve `stdout` en exito y `stderr.trim() || 'exited with code N'` en error. `streamBrew` mezcla stdout y stderr en una sola cola de lineas (`brew-cli.ts:61-62`) — intencional para mostrar progreso al usuario.
* **Timeout exacto:** `DEFAULT_TIMEOUT_MS = 30_000` (`brew-cli.ts:3`); `STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000` (`brew-cli.ts:4`). El streaming mata el proceso si pasan 5 min sin output (linea 83-86).
* **Cleanup:** `proc.kill()` en `finally` si el generador no termino (`brew-cli.ts:90-93`).

### C.2 Swift — `BrewProcess.run` (timeout default 60 s) y `BrewChecker`

Definidos en `menubar/BrewBar/Sources/Services/BrewProcess.swift` y `BrewChecker.swift`.

| Comando | Llamador | Args | Timeout | Notas |
|---------|----------|------|---------|-------|
| `brew update --quiet` | `BrewChecker.swift:14-18` (`updateIndex`) | `['update', '--quiet']` | **120 s** (`updateTimeout`); **suppressAutoUpdate=false** (es la unica llamada que necesita actualizar el indice) | Errores no fatales: log warning y continua |
| `brew outdated --json=v2 --greedy` | `BrewChecker.swift:27` | `['outdated', '--json=v2', '--greedy']` | 60 s default | `JSONDecoder().decode(OutdatedResponse.self, from: data)` |
| `brew services list --json` | `BrewChecker.swift:35` | `['services', 'list', '--json']` | 60 s | `JSONDecoder().decode([BrewService].self, from: data)` |
| `brew upgrade <name>` | `BrewChecker.swift:43` | `['upgrade', name]` | 60 s | **No hay validacion de `name`** en BrewBar — se asume input desde la lista de outdated parseada de Homebrew |
| `brew upgrade` | `BrewChecker.swift:49` | `['upgrade']` | 60 s | |
| `brew list --versions --formula` | `SecurityMonitor.swift:63` | `['list', '--versions', '--formula']` | 60 s | Via `BrewProcess.runString` |
| `brew list --cask --versions` | `SecurityMonitor.swift:64` | `['list', '--cask', '--versions']` | 60 s | |

* **Env:** `HOMEBREW_NO_AUTO_UPDATE=1` por defecto (`BrewProcess.swift:95`); excepcion `brew update --quiet` con `suppressAutoUpdate: false`.
* **stderr:** descartado a `FileHandle.nullDevice` (`BrewProcess.swift:92`). Solo stdout se devuelve.
* **Concurrencia:** `OnceGuard` (`BrewProcess.swift:55-75`) garantiza que `continuation.resume(...)` se invoca exactamente una vez aunque compitan terminationHandler y timeout Task. Bien resuelto.
* **Cleanup:** `process.terminate()` ante timeout (`BrewProcess.swift:130`); el timer Task se cancela cuando el proceso termina antes (`BrewProcess.swift:106`).

### C.3 Swift — invocaciones que NO usan `brew`

* `/usr/bin/which brew-tui` en `AppDelegate.swift:121-141` — chequeo unico al lanzar BrewBar para verificar que el CLI esta disponible. Sin timeout (rapido). Stdout/stderr a `nullDevice`.

#### Hallazgos seccion C

| Elemento | Severidad | Evidencia | Accion |
|----------|-----------|-----------|--------|
| `brewUpdate()` sin timeout | Media (heredada) | `brew-api.ts:18-26` — `spawn('brew', ['update'], { stdio: 'ignore' })` sin timer ni `AbortController`; un `brew update` colgado bloquea indefinidamente el proceso TUI | Reutilizar `execBrew(['update'])` (con env `HOMEBREW_NO_AUTO_UPDATE` borrado) o anadir timeout explicito (60-120 s). Alinear con BrewBar que usa 120 s |
| `BrewChecker.upgradePackage` no valida el nombre | Baja | `BrewChecker.swift:41-45` — el nombre llega desde la lista de outdated (parseada de Homebrew, presumiblemente confiable), pero no hay regex equivalente a `PKG_PATTERN`. Si la lista se contamina por un payload malformado del JSON, `Process` con array no permite inyeccion shell pero si argumentos inesperados | Anadir validacion regex `^[a-z0-9][-a-z0-9_.@+]*$` en BrewChecker antes de pasar al Process |
| `rollback-engine` invoca `streamBrew(['install', action.versionedFormula])` y `['install', '--force-bottle', action.packageName])` sin validatePackageName explicito | Baja | `rollback-engine.ts:171,178,189,194,199` — los nombres provienen de snapshots serializados en `~/.brew-tui/snapshots/` (escritos por la propia app), pero un usuario con permisos puede editar el JSON. Spawn con array sigue sin permitir inyeccion shell | Anadir `validatePackageName(action.packageName)` y verificacion de `versionedFormula` (regex con `@` y version) en el engine antes de cada `streamBrew` |
| `brew --cellar <name>` sin validacion explicita | Informativa | `cleanup-analyzer.ts:22` — `name` viene de `getInstalled()` (output de Homebrew, confiable) | Aceptable; opcional: validar por consistencia |
| stderr descartado en BrewProcess Swift | Informativa | `BrewProcess.swift:92` — `process.standardError = FileHandle.nullDevice`. En errores, solo se sabe el exit code, no el mensaje real | Capturar stderr en un Pipe separado y devolverlo en `BrewProcessError.processExited(code, stderr)` para diagnostico |

---

## Registro de hallazgos (consolidado)

| Severidad | ID | Descripcion | Archivo:linea | Estado |
|-----------|----|-----|---------------|--------|
| Critica | EP-A2-01 | TS osv-api envia `ecosystem: 'Homebrew'` → HTTP 400 sistematico | `osv-api.ts:125,143,181` | Heredado, sin corregir |
| Media | EP-A3-01 | `validateApiUrl` ausente en promo | `promo.ts:94,142` | Heredado |
| Media | EP-A3-02 | Promo `/redeem` sin Idempotency-Key | `promo.ts:142-172` | Heredado |
| Media | EP-B-01 | `delete-account` no llama a Polar `/deactivate` antes de borrar | `index.tsx:201-213` | Nuevo |
| Media | EP-C-01 | `brewUpdate()` sin timeout | `brew-api.ts:18-26` | Heredado |
| Baja | EP-A1-01 | Doble retry (3×3=9) en deactivate | `license-manager.ts:354-362` | Heredado |
| Baja | EP-A1-02 | `/activate` sin Idempotency-Key | `polar-api.ts:111-115` | Nuevo |
| Baja | EP-A3-03 | Promo sin reintentos automaticos | `promo.ts:94,142` | Nuevo |
| Baja | EP-B-02 | Confirmaciones sin TTY check | `index.tsx:45,203` | Nuevo |
| Baja | EP-B-03 | Sin `--help`/`--version`; subcomando desconocido lanza TUI | `index.tsx` | Nuevo |
| Baja | EP-C-02 | BrewChecker.upgradePackage sin validar nombre | `BrewChecker.swift:41-45` | Nuevo |
| Baja | EP-C-03 | rollback-engine sin validatePackageName | `rollback-engine.ts:171,178,189,194,199` | Nuevo |
| Informativa | EP-A2-02 | TTL CVE cache TUI=30 min vs BrewBar=60 min, archivo compartido | `SecurityMonitor.swift:11`, CLAUDE.md | Nuevo |
| Informativa | EP-A4-01 | Sin `codesign --verify` ni `spctl --assess` post-descarga BrewBar.app | `brewbar-installer.ts:122-129` | Nuevo |
| Informativa | EP-C-04 | stderr descartado en BrewProcess Swift dificulta diagnostico | `BrewProcess.swift:92` | Nuevo |
| Informativa | EP-C-05 | `brew --cellar <name>` sin validacion explicita | `cleanup-analyzer.ts:22` | Nuevo |
