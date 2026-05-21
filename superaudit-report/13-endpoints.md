# 13. Endpoints

> Auditor: endpoint-auditor (verificacion directa) | Fecha: 2026-05-21

## Resumen ejecutivo

Brew-TUI no expone endpoints propios; consume seis endpoints externos (tres en Polar, dos en `api.molinesdesigns.com` para promos, uno en OSV.dev) ademas de un canal IPC local con BrewBar via filesystem watcher. Esta seccion auditia cada endpoint individualmente: contrato, autenticacion, errores, idempotencia y rate-limiting. La superficie es pequena, los contratos estan tipados y validados en runtime en su mayoria, y los principales gaps son: trailing slash ausente en Polar, ausencia de retry en `promo.ts`, ausencia de manejo 429 en Polar y un patron de inyeccion de argumentos `brew` (no shell injection, sino flag injection) que escala desde `compliance-remediator.ts` y `brewfile-manager.ts`.

---

## 13.1 Inventario consolidado

| # | Endpoint | Metodo | Auth | Llamado desde | Idempotencia | Rate limit cliente |
|---|----------|--------|------|---------------|--------------|--------------------|
| 1 | `https://api.polar.sh/v1/customer-portal/license-keys/activate` | POST | Bearer (license key) | `polar-api.ts:92` | No (`activation_id` unico) | 30 s cooldown + 15 min lockout/5 fallos |
| 2 | `https://api.polar.sh/v1/customer-portal/license-keys/validate` | POST | Bearer (license key) | `polar-api.ts:107` | Si | idem |
| 3 | `https://api.polar.sh/v1/customer-portal/license-keys/deactivate` | POST | Bearer (license key) | `polar-api.ts` | Si | idem |
| 4 | `https://api.molinesdesigns.com/api/promo/validate` | POST | Sin auth | `promo.ts:94` | Si (solo consulta) | Sin rate limit cliente |
| 5 | `https://api.molinesdesigns.com/api/promo/redeem` | POST | Sin auth | `promo.ts:146` | Si (`idempotencyKey` UUID) | Sin rate limit cliente |
| 6 | `https://api.osv.dev/v1/querybatch` | POST | Sin auth | `lib/security/osv-client.ts` | Si (consulta pura) | 75 ms entre lotes + retry tras 429 |
| 7 | `brew` CLI subprocess (local) | spawn | n/a | `brew-cli.ts:8,40` | depende del comando | Sin techo de stdout |
| 8 | `~/.brew-tui/last-action.json` (IPC) | write | n/a | `data-dir.ts:writeLastAction` | Sobreescribe atomicamente | n/a |

---

## 13.2 Endpoint 1 — Polar activate

**Ruta:** `POST https://api.polar.sh/v1/customer-portal/license-keys/activate`

### Contrato
- Request: `{ key, organization_id, label }` (label = machineId UUID — SEG-004)
- Response: `{ id, license_key }` validado en runtime (`polar-api.ts:99-101`)
- Headers: `Content-Type: application/json`

### Hallazgos

| ID | Severidad | Evidencia | Accion |
|----|-----------|-----------|--------|
| EP-1.1 | Baja | `polar-api.ts:63` — `${BASE_URL}/${endpoint}` produce `/activate` sin trailing slash; CLAUDE.md indica que Polar especifica trailing slash; sin evidencia de fallo en produccion pero contraria a spec (307 + Authorization drop con curl -L) | Anadir trailing slash al template o por endpoint |
| EP-1.2 | Media | `fetch-timeout.ts` `fetchWithRetry` por defecto solo reintenta `status >= 500`; un 429 con `Retry-After` no se respeta | Anadir `status === 429` a `retryOn` con backoff `Retry-After`-aware |
| EP-1.3 | Baja | `polar-api.ts:95` — `machineId` UUID enviado en `label` sin hashear; identificador opaco pero correlacionable en logs Polar | Hash truncado SHA-256 antes de enviar como label |
| EP-1.4 | Media (heredado de 11.2) | rate limiter en memoria — `kill -9` reinicia el contador | Persistir lockout en `~/.brew-tui/rate-limit-state.json` |

### Conforme
- HTTPS obligatorio, hostname validado (`validateApiUrl`)
- Validacion runtime de campos requeridos
- Bearer token unico = license key
- `instanceId` UUID generado por activacion → idempotencia natural

---

## 13.3 Endpoint 2 — Polar validate

**Ruta:** `POST https://api.polar.sh/v1/customer-portal/license-keys/validate`

### Contrato
- Request: `{ key, organization_id, label }`
- Response: `{ id, status, customer: { email, name } }` validado en runtime

### Hallazgos
Mismos EP-1.1 (trailing slash) y EP-1.2 (429).

### Conforme
- Consulta pura — idempotente
- Distincion red vs API en `revalidate()` (red → gracia, contrato → expired)
- Fallo cerrado en fechas corruptas (`isExpired()` trata `NaN` como expirado)

---

## 13.4 Endpoint 3 — Polar deactivate

**Ruta:** `POST https://api.polar.sh/v1/customer-portal/license-keys/deactivate`

### Contrato
- Request: `{ activation_id, key, organization_id }`
- Response: 204 No Content (`expectEmpty = true`)

### Hallazgos
EP-1.1 + EP-1.2.

### Conforme
- 204 manejado con guard explicito (`polar-api.ts:85`)
- Idempotente por Polar — segundo deactivate del mismo `activation_id` no falla

---

## 13.5 Endpoint 4 — Promo validate

**Ruta:** `POST https://api.molinesdesigns.com/api/promo/validate`

### Contrato
- Request: `{ code }`
- Response: `{ valid, discount, description }` validado en runtime (`promo.ts:106-116`)

### Hallazgos

| ID | Severidad | Evidencia | Accion |
|----|-----------|-----------|--------|
| EP-4.1 | Media | `promo.ts:94` usa `fetchWithTimeout` (sin retry), no `fetchWithRetry`. Un 5xx puntual aborta la validacion sin reintento | Sustituir por `fetchWithRetry` con mismo `retryOn` que Polar |

### Conforme
- Hostname validado (`validateApiUrl`)
- Validacion runtime de campos
- Sin auth — endpoint publico que solo expone validez sin secretos

---

## 13.6 Endpoint 5 — Promo redeem

**Ruta:** `POST https://api.molinesdesigns.com/api/promo/redeem`

### Contrato
- Request: `{ code, idempotencyKey, licenseKey }` + header `Idempotency-Key: <UUID>`
- Response: `{ success, message }` validado en runtime (`promo.ts:162-173`)

### Hallazgos
EP-4.1 aplica.

### Conforme
- Doble idempotencyKey: header + body — robusto frente a reintentos
- UUID generado client-side antes de fetch
- license key incluida para vincular promo al cliente activo

---

## 13.7 Endpoint 6 — OSV.dev querybatch

**Ruta:** `POST https://api.osv.dev/v1/querybatch`

### Contrato
- Request: `{ queries: [{ package: { name, ecosystem: 'Homebrew' } }] }`
- Response: `{ results[] }` — un objeto por query; cada result puede tener `vulns[]`
- Validacion runtime: `data.results.length === queries.length` rechazado si no coincide

### Hallazgos

| ID | Severidad | Evidencia | Accion |
|----|-----------|-----------|--------|
| EP-6.1 | Baja | sin proxy/CDN configurable — si OSV.dev cae, no hay fallback en este canal | Considerar fallback a cache local con `staleAfter` para escenarios offline |

### Conforme
- HTTPS, sin auth (publico)
- 75 ms entre lotes para no ser agresivo
- 429 manejado con 2 s backoff + un reintento adicional
- Cache de 30 min via `security-audit-store`
- Fallback silencioso si la llamada falla (no rompe la UI; mostrar "no data")
- No data leakage: solo se envia nombre de paquete

---

## 13.8 Endpoint 7 — `brew` CLI subprocess

**Comando:** `spawn('brew', args, { env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' } })`

### Contrato
- Args como array (no shell), sin `shell: true` (verificado en `brew-cli.ts:8,40`)
- `HOMEBREW_NO_AUTO_UPDATE=1` para evitar `brew update` automatico
- Timeouts: `execBrew` 30 s, `streamBrew` 5 min idle
- Subcomandos consumidos: `info`, `list`, `outdated`, `search`, `install`, `uninstall`, `upgrade`, `services`, `doctor`, `config`, `cleanup`, `pin`, `unpin`, `tap`, `untap`, `--cache`

### Hallazgos

| ID | Severidad | Evidencia | Accion |
|----|-----------|-----------|--------|
| EP-7.1 | Alta | `src/lib/compliance/compliance-remediator.ts:18,29` — `streamBrew(['install'/'upgrade', v.packageName])` sin pasar por `validatePackageName()`; PolicyFile JSON malicioso puede inyectar `--HEAD` u otros flags | Llamar `validatePackageName(v.packageName)` antes del spawn |
| EP-7.2 | Alta | `src/lib/brewfile/brewfile-manager.ts` `applyDrift()` — `streamBrew(['install', name])` sin validacion; brewfile YAML manipulado puede inyectar flags | Llamar `validatePackageName(name)` antes del spawn |
| EP-7.3 | Media | `brew-cli.ts:8,40` — `brew` se resuelve via PATH. Un PATH hijack desde un dotfile o entorno comprometido podria suplantar `brew` | Usar ruta absoluta (`/opt/homebrew/bin/brew` o detectada al inicio) |
| EP-7.4 | Baja | `execBrew` acumula stdout sin techo (`brew-cli.ts:20`) | Anadir guard de tamaño (32 MB) o cambiar a stream para `brew info --json` masivos |

### Conforme
- Sin `shell: true` — no shell injection clasica
- `PKG_PATTERN` aplicado en `brew-api.ts` (operaciones directas)
- `safeTerm = term.replace(/^-+/, '')` antes de pasar a `brew search`
- stderr capturado e incluido en mensajes de error
- Exit codes != 0 propagados

---

## 13.9 Endpoint 8 — IPC last-action

**Canal:** `~/.brew-tui/last-action.json` (write atomic TS, watch DispatchSourceFileSystemObject Swift)

### Contrato
- Escritura: TS via `writeLastAction({ timestamp, action, packages, remainingOutdated, source: 'brew-tui' })` con tmp + rename atomico
- Lectura: Swift `LastActionMonitor` observa el **directorio padre** (no el fichero — rename invalida fd a fichero)
- Schema: `LastAction` Decodable Swift coherente con interface TS

### Hallazgos

| ID | Severidad | Evidencia | Accion |
|----|-----------|-----------|--------|
| EP-8.1 | Media (heredado de FE-3 / SCR-INST-01) | `src/views/search.tsx:201` (install) y `src/views/installed.tsx:212` (uninstall) NO llaman `writeLastAction()`. BrewBar no recibe la senal | Añadir llamadas tras los streams en ambas views |
| EP-8.2 | Baja | sin schemaVersion en `LastAction` payload — un cambio breaking de TS sin coordinar con Swift rompe la lectura silenciosamente | Añadir `schemaVersion: 1` al payload y guard en Swift |

### Conforme
- Atomic write (tmp + rename + fsync directorio implicito en macOS)
- Modo 0o600 al escribir
- Swift observa directorio (correcto para sobrevivir renames)
- Coherencia tipos TS ↔ Swift Decodable

---

## 13.10 Endpoint 9 — iCloud sync envelope

**Canal:** `~/Library/Mobile Documents/iCloud~.../sync.json`

### Contrato
- Schema exterior plaintext: `{ schemaVersion, encrypted, iv, tag, updatedAt }`
- Payload cifrado AES-256-GCM (incluye `machines[]`, perfiles, brewfile, etc.)
- Lectura: TS `sync-engine.ts` descifra con HKDF derivado de license key; Swift `SyncMonitor.swift` lee solo plaintext

### Hallazgos

| ID | Severidad | Evidencia | Accion |
|----|-----------|-----------|--------|
| EP-9.1 | Alta (heredado de backend) | `menubar/BrewBar/Sources/Services/SyncMonitor.swift` — `getKnownMachineCount()` lee `json["machines"]` sobre el JSON exterior; ese campo esta en el payload cifrado; siempre retorna 0 | Eliminar el metodo o exponer `machineCount` en plaintext del envelope al escribir desde TS |
| EP-9.2 | Media (heredado) | `merge-union` declarado en `ConflictResolution` pero no implementado en `applyConflictResolutions()` — caller silenciosamente ignorado | Eliminar del tipo hasta implementarlo o anadir la logica |
| EP-9.3 | Baja | hostname raw en payload cifrado — dato personal | Hash truncado o alias configurable |
| EP-9.4 | Media | `mkdir(ICLOUD_SYNC_DIR)` sin `mode: 0o700` | Anadir mode explicito |

### Conforme
- AES-256-GCM con HKDF derivado de license key
- `schemaVersion` validado en `isValidEnvelope()`
- Manejo de placeholder iCloud (`.sync.json.icloud`)
- Manejo de archivo vacio (race condition normal en iCloud)
- Watermark zero-width Unicode con consent (en exports de profile, no en sync)

---

## 13.11 Tabla consolidada hallazgos

| ID | Severidad | Endpoint | Descripcion |
|----|-----------|----------|-------------|
| EP-7.1 | Alta | brew spawn | Flag injection en compliance-remediator |
| EP-7.2 | Alta | brew spawn | Flag injection en brewfile-manager |
| EP-9.1 | Alta | iCloud sync | getKnownMachineCount() siempre retorna 0 |
| EP-7.3 | Media | brew spawn | PATH hijack via PATH inseguro |
| EP-8.1 | Media | IPC last-action | writeLastAction ausente en search/installed |
| EP-9.2 | Media | iCloud sync | merge-union no implementado |
| EP-9.4 | Media | iCloud sync | Directorio iCloud sin modo 0o700 |
| EP-1.2 | Media | Polar (todos) | 429 sin retry |
| EP-1.4 | Media | Polar | Rate limit volatil entre reinicios |
| EP-4.1 | Media | Promo (ambos) | Sin retry en 5xx transiente |
| EP-1.1 | Baja | Polar (todos) | Trailing slash ausente |
| EP-1.3 | Baja | Polar | Machine ID sin hashear como label |
| EP-6.1 | Baja | OSV | Sin fallback offline |
| EP-7.4 | Baja | brew spawn | Sin techo de stdout en execBrew |
| EP-8.2 | Baja | IPC last-action | Sin schemaVersion |
| EP-9.3 | Baja | iCloud sync | Hostname raw en payload |

**Total: 3 Alta · 7 Media · 6 Baja**

---

## 13.12 Prioridades

1. **EP-7.1 + EP-7.2** — corte de flag injection en `compliance-remediator` y `brewfile-manager` (mismo fix: `validatePackageName`).
2. **EP-9.1** — bug confirmado en BrewBar `getKnownMachineCount()`.
3. **EP-8.1** — handoff IPC roto en search/installed.
4. **EP-7.3** — PATH hijack mitigable con ruta absoluta.
5. **EP-1.2 + EP-1.4** — robustez Polar (429 + lockout persistente).
6. **EP-4.1** — retry en promo.
