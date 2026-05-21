# 22. Priorizacion ejecutiva

> Auditor: report-consolidator | Fecha: 2026-05-01

---

## Distribucion de hallazgos

| Severidad | Cantidad | % del total |
|-----------|----------|-------------|
| Critica | 2 | 2.0% |
| Alta | 22 | 22.4% |
| Media | 38 | 38.8% |
| Baja | 36 | 36.7% |
| **Total** | **98** | **100%** |

---

## Criticos — Accion inmediata requerida

Estos hallazgos representan riesgos de caida, fuga de datos, perdida de negocio o bloqueo de uso. Deben resolverse **antes de cualquier release**.

| ID | Hallazgo | Riesgo | Accion inmediata |
|----|----------|--------|------------------|
| SEG-001 | Dos tokens npm en `.claude/settings.local.json:56,58` en texto plano | Publicacion maliciosa del paquete `brew-tui` en npmjs.com comprometeria a todos los usuarios del CLI | Revocar ambos tokens en npmjs.com ahora. Agregar `.claude/` al `.gitignore` del repo. Crear token de scope `publish` restringido |
| BK-001 | `ecosystem: 'Homebrew'` en `osv-api.ts:125,143,181` → OSV HTTP 400 silenciado → 0 CVEs siempre | El feature Pro Security Audit esta completamente roto: devuelve falsa sensacion de seguridad a todos los usuarios Pro | Cambiar las tres ocurrencias de `'Homebrew'` a `'Bitnami'` en `osv-api.ts`; publicar hotfix npm |

### Ranking de urgencia para Criticos

1. **SEG-001** — Impacto externo inmediato: un token activo es explotable en cualquier momento. La accion de revocacion no requiere codigo.
2. **BK-001** — El feature Pro mas visible esta silenciosamente roto. La correccion es un cambio de 3 lineas pero requiere una publicacion npm.

---

## Altos — Accion recomendada antes de release

Estos hallazgos afectan flujos clave, calidad percibida, seguridad del modelo de negocio o mantenibilidad de forma severa.

| ID | Hallazgo | Riesgo | Accion recomendada |
|----|----------|--------|--------------------|
| SEG-002 | `ENCRYPTION_SECRET` y `SCRYPT_SALT` en bundle npm publicado (`license-manager.ts:78-79`, `sync/crypto.ts:6-7`) | Elusibilidad del sistema de licencias: cualquier usuario puede fabricar un `license.json` valido localmente | Incorporar `machineId` como salt adicional en `scryptSync`; documentar la limitacion en `SECURITY.md` |
| SEG-003 | Clave AES precomputada como hex literal en `LicenseChecker.swift:50-53` | Recuperable via `strings BrewBar.app/Contents/MacOS/BrewBar` sin herramienta especializada | Eliminar el literal hex; rederivarlo en runtime desde las constantes de texto |
| GOV-001 | Sin CI Swift — BrewBar nunca validado automaticamente | Regresiones Swift llegan a produccion sin deteccion | Agregar job `test-swift` con runner `macos-latest` y `xcodebuild test -scheme BrewBar` |
| GOV-002 | Homebrew Cask URL con usuario `MoLinesGitHub` → HTTP 404 | Canal de distribucion BrewBar completamente roto; instalacion via Homebrew falla siempre | Corregir URL a `MoLinesDesigns`, actualizar version a `0.6.1` y SHA256 |
| GOV-003 | Homebrew Formula en version `0.5.3` vs `0.6.1` publicado | Usuarios que instalan via `brew install brew-tui` reciben version sin fixes de seguridad | Actualizar URL y SHA256 a `0.6.1` en `brew-tui.rb` |
| GOV-004 | `jsr.json` version `0.5.2` vs `0.6.1` | Proximo ciclo de release publicaria `0.5.2` en JSR | Sincronizar `jsr.json` con `package.json`; agregar sincronizacion automatica en `prepublishOnly` |
| GOV-005 | BrewBar no notarizado — `method: none` en `exportOptions.plist` | Gatekeeper bloquea o advierte a usuarios que descargan BrewBar directamente | Agregar `xcrun notarytool submit --wait` y `xcrun stapler staple` al script de release |
| GOV-006 | `PrivacyInfo.xcprivacy` declara `NSPrivacyAccessedAPICategoryFileTimestamp` sin codigo que lo justifique | Riesgo de rechazo en Apple Review / pipeline de notarizacion | Eliminar el bloque del manifest o identificar el uso real |
| ARQ-001 | Schemas de licencia duplicados entre TS y Swift sin test de contrato | Un cambio de campo rompe silenciosamente la lectura en el otro codebase | Anadir test de contrato en `BrewBarTests` con fixture JSON generado por TS |
| ARQ-002 | Politica de degradacion de licencia divergente: 7 dias TS vs 30 dias Swift | Usuario entre dias 7-30 ve estados contradictorios en TUI y BrewBar | Extraer especificacion compartida; alinear umbrales en ambos lados |
| BK-002 | `readDataToEndOfFile()` sincrono en `terminationHandler` de `BrewProcess.swift:99` | Deadlock potencial con buffers > 64 KB; BrewBar puede quedar bloqueado 60s | Migrar a lectura incremental con `availableData` o `AsyncStream` |
| BK-003 | Snapshots sin poda en `~/.brew-tui/snapshots/` | Crecimiento ilimitado del directorio; degradacion de rendimiento | Implementar `pruneSnapshots(maxCount = 20)` tras cada `saveSnapshot` |
| UI-001 | Brewfile reconcile sin `ConfirmDialog` (`brewfile.tsx:155`) | Instalacion/desinstalacion masiva de paquetes sin confirmacion | Agregar `ConfirmDialog` con resumen de paquetes afectados |
| UI-002 | SyncView `syncNow` sin confirmacion (`sync.tsx:232`) | Sync puede sobrescribir estado local sin confirmacion; accion irreversible | Agregar `ConfirmDialog` antes de `syncNow` |
| UI-003 | ComplianceView remediacion sin `ConfirmDialog` (`compliance.tsx:198`) | Remediacion destructiva sin confirmacion en contexto Team | Agregar `ConfirmDialog` con numero de violaciones accionables |
| QA-001 | 16 vistas TUI sin tests de renderizado; `ink-testing-library` instalada sin uso | Regresiones de UI invisibles | Crear tests para `DashboardView`, `OutdatedView`, `AccountView` y `ViewRouter` |
| QA-002 | `ViewRouter` y componentes comunes (`ConfirmDialog`, `UpgradePrompt`) sin tests | Cambios en gate Pro/Team pueden llegar a produccion sin verificacion | Agregar `app.test.tsx` con casos free/pro/team |
| QA-003 | Tests Swift nunca ejecutados en CI (ubuntu-only) | Regresiones Swift sin deteccion automatica | Agregar job CI con `macos-latest` |
| QA-006 | `OutdatedPackage` cask sin campo `pinned` sin test de regresion | Regresion en parsing de `pinned` no detectada | Agregar test: JSON sin clave `pinned` debe decodificar con `pinned=false` |
| UX-001 | Notificaciones CVE/Sync con identificadores fijos en `SchedulerService.swift:184,253` | Notificaciones CVE subsiguientes nunca aparecen como banner | Usar identificadores unicos con timestamp |
| UX-002 | Onboarding ausente — usuario nuevo llega al Dashboard sin contexto | Alto abandono en primera sesion | Agregar flujo de bienvenida condicional a `hasLaunchedKey` |
| BK-004 | `isExpired()` retorna `false` cuando la fecha es `undefined` o NaN | Licencias corruptas o manipuladas con fecha invalida nunca expiran | `isExpired` debe retornar `true` cuando la fecha es invalida |
| BK-005 | Cuatro implementaciones de `getMachineId` con fallbacks divergentes; `sync-engine.ts` cae a `hostname()` | Race condition en primera ejecucion; colision entre maquinas con mismo hostname | Extraer funcion unica a `data-dir.ts` con mutex; eliminar fallback a `hostname()` |
| DS-001 | `SPACING` tokens definidos pero nunca usados — 165+ magic numbers en vistas | Inconsistencia visual; refactors de layout requieren busqueda manual | Migrar padding/gap/margin a `SPACING.xs/sm/md/lg` progresivamente |
| ACC-001 | `NO_COLOR` no implementado en `src/utils/colors.ts` | Usuarios con terminales sin color reciben ANSI aunque lo hayan desactivado | Retornar tokens vacios si `process.env.NO_COLOR` esta definido |
| QA-008 | Sin analytics en TUI ni BrewBar — conversion y uso de features invisibles | Imposible medir conversion, retencion ni impacto de UX | Definir taxonomia minima e integrar SDK con consentimiento |

### Ranking por palanca (impacto x esfuerzo) — Top 10 Altos

| Posicion | ID | Impacto | Esfuerzo | Razon |
|----------|----|---------|----------|-------|
| 1 | GOV-002 | Muy alto | Muy bajo | 1 linea de URL + SHA256; restaura canal de distribucion completo |
| 2 | GOV-003 + GOV-004 | Alto | Muy bajo | 2 archivos, cambio mecanico de version y hash |
| 3 | UX-001 | Alto | Muy bajo | Reemplazar string fijo por `UUID().uuidString + timestamp` |
| 4 | BK-001 | Critico (ya en Criticos) | Muy bajo | 3 lineas `'Homebrew'` → `'Bitnami'` |
| 5 | BK-004 | Alto | Bajo | Guard al inicio de `isExpired()` |
| 6 | UI-001/002/003 | Alto | Bajo | Patron ya existe en el codebase (`ConfirmDialog`) |
| 7 | ARQ-001 | Alto | Medio | Test de contrato con fixture JSON |
| 8 | GOV-005 | Alto | Medio | Configuracion de notarytool; requiere Apple notarization profile |
| 9 | SEG-002/003 | Alto | Alto | Requiere cambio de arquitectura de clave o Keychain |
| 10 | QA-001/002/003 | Alto | Alto | Crear suite de tests de render desde cero |

### Plan "Proximas 5 PRs" para Criticos y Altos

#### PR 1 — Hotfix de seguridad inmediato (< 2 horas)

- Revocar tokens npm SEG-001 (accion en npmjs.com, no requiere PR)
- Agregar `.claude/` a `.gitignore` del repo
- Cambiar `'Homebrew'` → `'Bitnami'` en `osv-api.ts:125,143,181` (BK-001)
- **Publicar hotfix npm 0.6.2**

#### PR 2 — Release plumbing (< 4 horas)

- Corregir URL y usuario GitHub en `brewbar.rb` (GOV-002): `MoLinesGitHub` → `MoLinesDesigns`
- Actualizar version en `brewbar.rb` a `0.6.1` con SHA256 correcto
- Actualizar `brew-tui.rb` a `0.6.1` (GOV-003)
- Sincronizar `jsr.json` con `package.json` (GOV-004)
- Corregir URL del repositorio en `package.json` (GOV-007)

#### PR 3 — Confirmaciones y UX critica (< 1 dia)

- Agregar `ConfirmDialog` en `brewfile.tsx:155` (UI-001)
- Agregar `ConfirmDialog` en `sync.tsx:232` (UI-002)
- Agregar `ConfirmDialog` en `compliance.tsx:198` (UI-003)
- Corregir identificadores de notificacion fijos en `SchedulerService.swift:184,253` (UX-001)
- Corregir `isExpired()` para devolwer `true` en fecha invalida (BK-004)
- Eliminar bloque `FileTimestamp` de `PrivacyInfo.xcprivacy` (GOV-006)

#### PR 4 — Robustez de backend y contratos (< 2 dias)

- Extraer funcion unica `getMachineId()` a `data-dir.ts` con mutex; eliminar fallback a `hostname()` (BK-005)
- Leer `readDataToEndOfFile()` → lectura incremental en `BrewProcess.swift:99` (BK-002)
- Agregar `pruneSnapshots(maxCount = 20)` en `snapshot.ts` y `rollback-engine.ts` (BK-003)
- Agregar test de contrato en `BrewBarTests` con fixture `license.json` TS (ARQ-001)
- Agregar `macos-latest` job a `.github/workflows/ci.yml` con `xcodebuild test` (GOV-001 / QA-003)

#### PR 5 — Tests de renderizado y design tokens (< 3 dias)

- Crear `app.test.tsx` con casos free/pro/team usando `ink-testing-library` (QA-001, QA-002)
- Crear tests de render para `DashboardView`, `OutdatedView`, `AccountView`
- Agregar test de regresion `OutdatedPackage` sin `pinned` (QA-006)
- Implementar `NO_COLOR` en `src/utils/colors.ts` (ACC-001)
- Iniciar migración `SPACING.*` en las 3 vistas mas usadas (DS-001)

---

## Medios — Planificar en proximas iteraciones

Estos hallazgos afectan consistencia, deuda tecnica o UX de forma relevante.

| ID | Hallazgo | Riesgo | Accion recomendada |
|----|----------|--------|--------------------|
| ARQ-003 | `SyncMonitor` sin protocolo de DI | Sin cobertura de test para comportamiento de sync | Crear protocolo `SyncMonitoring: Sendable`; inyectar en `SchedulerService` |
| ARQ-004 | Estados de carga ad-hoc en `brew-store` | Estados inconsistentes posibles | Introducir `AsyncState<T>` discriminado |
| ARQ-005 | Cache CVE no compartida entre TUI y BrewBar | Usuarios ven resultados diferentes | Decidir contrato de cache; documentar la decision |
| BK-006 | `decryptLicenseData` sin type guard post-descifrado | Acceso a propiedades de objeto con forma incorrecta | Agregar `isLicenseData()` type guard |
| BK-007 | Lock de historial sin TTL — posible bloqueo permanente | Historial inaccesible si el proceso muere con lockfile huerfano | Verificar `mtime` del lockfile; eliminar si tiene mas de 30s |
| BK-008 | `decryptPayload` sin type guard en sync | Corrupcion silenciosa del estado de sync | Agregar validacion de forma de `SyncPayload` tras parseo |
| BK-009 | Fallback a `hostname()` en sync-engine | Colision entre maquinas en redes de empresa | Crear `machine-id` en `ensureDataDirs()` (ver BK-005) |
| BK-010 | Watermark con `consent = true` por defecto | Incrustacion de datos personales sin consentimiento explicito | Cambiar a `consent = false`; requerir parametro explicito |
| BK-011 | Token crash reporter en `UserDefaults` en texto claro | Token legible por cualquier proceso del mismo usuario | Mover a Keychain |
| BK-012 | iCloud: no se verifica estado de descarga del archivo | Sync falla silenciosamente o lee datos obsoletos | Verificar tamanyo > 0 antes de leer |
| BK-013 | `SyncMonitor.swift` lee `sync.json` sincronamente | Bloqueo del actor durante operaciones de iCloud | Migrar a lectura asincrona |
| BK-014 | Formato de severidad CVE incompatible entre TS y Swift | Si se unifica el cache, el decodificado fallaria silenciosamente | Unificar convencion de casing |
| BK-015 | Promo API sin validacion de host | Token de autenticacion podria enviarse por HTTP si URL se modifica | Aplicar `validateApiUrl` en `promo.ts` |
| BK-016 | `brewUpdate()` sin timeout | `brew update` puede colgar indefinidamente | Refactorizar para usar `execBrew` o agregar timeout |
| BK-017 | `PrivacyInfo.xcprivacy` potencialmente incompleto | Riesgo de rechazo en notarizacion | Ejecutar `xcodebuild -generatePrivacyReport` |
| QA-004 | Sin medicion de cobertura de codigo | Imposible detectar regresiones en cobertura | Agregar `@vitest/coverage-v8` y configurar en `vitest.config.ts` |
| QA-005 | `SecurityMonitor.swift` — `URLSession.shared` no inyectable | Flujo CVE sin tests de integracion | Refactorizar para aceptar `URLSession` como parametro init |
| QA-007 | BrewBar sin crash reporting SDK | Crashes de produccion invisibles para el equipo | Integrar Sentry Swift SDK o Firebase Crashlytics |
| QA-009 | `brewbar-installer.ts` — camino feliz sin test | Happy path del instalador sin verificacion | Agregar test con SHA-256 correcto mockeando `fetch` y `fs.promises` |
| QA-010 | Tests de persistencia — solo mocks de `fs` | Bugs en interaccion real con filesystem escapan a tests | Agregar tests de integracion con `os.tmpdir()` |
| QA-011 | Sin snapshot testing | Regresiones visuales en componentes sin deteccion | Integrar `swift-snapshot-testing` y `lastFrame()` de `ink-testing-library` |
| UX-003 | Strings hardcodeados en `sync.tsx:127` y `brewfile.tsx:70,261` | Localizacion rota segun locale | Extraer a claves i18n en `en.ts`/`es.ts` |
| UX-004 | Rate-limit de activacion solo en memoria | Barrera anti-abuso se resetea al reiniciar | Persistir intentos en disco |
| UX-005 | Modelo de degradacion desincronizado (UX) | Mensajes contradictorios entre TUI y BrewBar | Alinear umbrales (ver ARQ-002) |
| UX-006 | Sin accion de revalidacion dentro del TUI | Usuario degradado debe salir del TUI para revalidar | Agregar accion `revalidate` en `AccountView` con keybind |
| UX-007 | `UpgradePrompt` sin claves para `rollback` y `brewfile` | Vista en blanco en lugar de prompt de upgrade | Agregar entradas en `FEATURE_KEYS` |
| UI-004 | `SearchView` fuera del ciclo Tab/Shift-Tab | Usuarios que navegan por Tab no descubren Search | Agregar `'search'` al array `VIEWS` |
| UI-005 | `DashboardView` sin retry en error de carga | Usuario no puede recuperarse sin salir y volver | Agregar hint `r` para reintentar con `fetchAll()` |
| UI-006 | `ProgressLog` key inestable provoca re-renders completos | Re-renders costosos durante streaming | Cambiar key a identificador estable basado en indice absoluto |
| UI-007 | `ServicesView` sin mensaje especifico de permisos root | Usuario no sabe por que la accion falla con `EACCES` | Detectar `EACCES`/`sudo` y mostrar mensaje especifico |
| UI-008 | `BrewBar PopoverView` — `refreshTask` no cancelada antes de nueva | Race condition: dos refreshes concurrentes | Cancelar `refreshTask?.cancel()` antes de crear nueva |
| UI-009 | `ServicesView` — logica de negocio en handler de `useInput` | Acoplamiento de presentacion; dificulta tests | Mover coordinacion de estado al store |
| SCR-12-O1 | Impact Analysis — fetches solapados sin cancelacion en `outdated.tsx:89-105` | Race condition en actualizacion del panel de Impact Analysis | Usar `AbortController` con cleanup en `useEffect` |
| SCR-12-I1 | Hint `esc:cancel` enganoso en `InstalledView` — Esc no cancela el stream | Usuario cree que puede cancelar con Esc pero navega hacia atras | Interceptar Esc durante `stream.isRunning` para llamar `stream.cancel()` |
| DS-002 | Contraste alto incompleto en BrewBar (5 colores sin rama `colorSchemeContrast`) | Usuarios con "Increase Contrast" activado ven colores con contraste insuficiente | Sustituir con colores adaptables del sistema |
| DS-003 | `GRADIENTS` hex desvinculados de `COLORS` | Cambios en tokens de color no se propagan a gradientes | Derivar `GRADIENTS` desde `COLORS.*` |
| DS-004 | MenuBarIcon apariencias invertidas en `Contents.json` | Icono del menu bar incorrecto en modo claro y oscuro | Intercambiar asignaciones de apariencia |
| DS-005 | Tema oscuro exclusivo en TUI | Ilegibilidad en terminales con fondo claro | Detectar `COLORFGBG` y degradar para terminales claros |
| GOV-007 | URL del repositorio erronea en `package.json` | URLs rotas en npm registry | Actualizar `package.json`, README, Formula y Cask |
| GOV-008 | `dist-standalone/brew-tui-bun` comprometido en git (65 MB) | Historial git inflado; artefacto sin procedencia verificable | Agregar a `.gitignore` y ejecutar `git rm --cached` |
| EP-002 | Promo `/redeem` sin idempotency-key | Usuario puede canjear el mismo codigo dos veces si la conexion falla | Agregar `idempotencyKey: randomUUID()` al body |

---

## Bajos — Backlog de mejora continua

Mejoras recomendables sin impacto grave inmediato.

| ID | Hallazgo | Riesgo | Accion recomendada |
|----|----------|--------|--------------------|
| GOV-009 | `tsup target: node18` vs `engines: >=22` | Polyfills innecesarios en el bundle | Cambiar `target` a `'node22'` |
| GOV-010 | `exportOptions.plist` case mismatch con `.gitignore` | Archivo no excluido en Linux CI | Corregir la entrada `.gitignore` a minuscula |
| GOV-011 | `menubar/build/` no gitignoreado | Riesgo de commitear binarios accidentalmente | Anadir `menubar/build/` a `.gitignore` |
| GOV-012 | `xcarchive` en disco para version 0.6.0 | El zip publicado puede provenir de version anterior | Regenerar xcarchive tras cada bump de version |
| GOV-013 | `.gitattributes` ausente | Line endings inconsistentes entre plataformas | Crear `.gitattributes` con `* text=auto` y marcadores de binary |
| ARQ-006 | `CVE_CACHE_PATH` declarado pero nunca consumido en TS | Dead code exportado | Eliminar o documentar en `data-dir.ts` |
| ARQ-007 | `getBuiltinAccountType` export muerto | Dead code que aumenta superficie de mantenimiento | Eliminar la funcion y el comentario |
| ARQ-008 | `import SwiftUI` innecesario en `AppState.swift` | Difumina el limite Models/Views | Sustituir por `import Observation` |
| ARQ-009 | `SchedulerService` acumula 5 responsabilidades | Cohesion debil; dificil de testear | Extraer `NotificationSender` |
| ARQ-010 | Fire-and-forget tasks en `SchedulerService` sin handle de cancelacion | Tasks pendientes no cancelables al detener el scheduler | Almacenar handles; cancelar en `stop()` |
| ARQ-011 | Module-level singletons en stores TS contaminan entre tests | Contaminacion entre tests | Limpiar en `afterEach` o inicializar dentro del estado Zustand |
| UI-010 | Logo ASCII en header con `key={i}` | Antipatron React sin impacto real | Sustituir por `key={"logo-" + i}` |
| UI-011 | Tres `useInput` activos en `ProfilesView` | Interacciones inesperadas posibles | Consolidar en un unico `useInput` |
| UI-012 | `ProfilesView` dos `useEffect` de cleanup competidores | Modal puede quedar abierto al desmontar | Consolidar en un unico `useEffect` |
| UI-013 | `PackageInfoView` — conversion `CaskInfo`→`Formula`-shape en vista | Logica de negocio en capa de presentacion | Extraer a `formulaeFromCask()` en `brew-api.ts` |
| UI-014 | `SecurityAuditView` sin advertencia de cobertura parcial | Usuario puede creer que la ausencia de CVEs es seguridad total | Anadir nota `t('security_coverage_warning')` |
| UI-015 | `BrewBar PopoverView` `minHeight: 420` fijo | Contenido clipado con Dynamic Type activo | Cambiar a `minHeight: 0` |
| UX-008 | Onboarding de BrewBar incompleto — sin CTA de compra en modo degradado | Usuarios sin Pro no saben donde comprar desde BrewBar | Agregar boton "Renovar Pro" con URL de checkout |
| UX-009 | Tecla `d` de desactivacion invisible para Team users | Team users no descubren la opcion de desactivacion | Incluir `status === 'team'` en la condicion del hint |
| UX-010 | Clave `account_validating` nunca renderizada — dead code de traduccion | Confusion en mantenimiento de strings | Eliminar la clave muerta o conectarla correctamente |
| DS-006 | Colores locales no centralizados en BrewBar | Inconsistencia visual si se actualiza la paleta | Mover a `Theme.swift` |
| DS-007 | `StatCard` default `color='white'` con literal en lugar de `COLORS.white` | Inconsistencia semantica menor | Cambiar a `color = COLORS.white` |
| ACC-002 | Fila de paquete en BrewBar sin agrupacion VoiceOver | VoiceOver lee nombre, version y boton por separado | Agregar `.accessibilityElement(children: .combine)` |
| ACC-003 | Toggle de notificaciones sin `accessibilityLabel` explicito | VoiceOver puede no leer el label correctamente | Agregar `.accessibilityLabel` explicito |
| ACC-004 | Deteccion de capacidades de terminal ausente | Salida incorrecta en terminales con capacidades limitadas | Evaluar `COLORTERM === 'truecolor'` para degradar gradientes |
| PERF-002 | Polling de 100ms en `streamBrew` | Latencia perceptible en streaming; uso de CPU innecesario | Reemplazar con patron `Promise` desde `proc.stdout.on('data', ...)` |
| PERF-004 | `DashboardView` y `OutdatedView` desestructuran el store completo | Re-renders innecesarios durante cargas de datos | Aplicar selectores granulares o `useShallow` |
| PERF-005 | `allOutdated` recompuesto en cada render sin `useMemo` | Recalculo innecesario en cada cursor move | Envolver con `useMemo` |
| PERF-006 | `useStdout()` invocado tras returns tempranos en `history.tsx:101-104` | Violacion de rules of hooks; puede causar comportamiento indefinido | Mover al inicio del componente |
| PERF-007 | Impact Analysis — 2 spawns de `brew` por cursor move sin cache | 100+ subprocesos al navegar lista de 50 paquetes | Cache `Map<string, UpgradeImpact>` + debounce 400-500ms |
| PERF-011 | `AppState.refresh()` serializa `brew update` antes del paralelismo | Tiempo a primer dato = T(brew update) + T(outdated) | Lanzar `updateIndex()` como `async let` |
| PERF-014 | `readDataToEndOfFile()` sincrono (cross-ref BK-002) | Ver BK-002 | Ver BK-002 |
| PERF-015 | `SyncMonitor` parsea `sync.json` dos veces por tick | Dos lecturas y parseos innecesarios del mismo archivo | Refactor a un unico `checkSync() -> (Bool, Int)` |
| EP-001 | Double retry en desactivacion de licencia (9 solicitudes posibles) | Carga innecesaria sobre Polar API | Eliminar el loop externo o pasar `retry: { attempts: 1 }` |

---

## Mapa de calor por dominio

| Dominio | Critica | Alta | Media | Baja | Total | Estado general |
|---------|---------|------|-------|------|-------|----------------|
| Seguridad | 1 | 2 | 0 | 0 | 3 | Critico |
| Backend / Persistencia | 1 | 4 | 10 | 0 | 15 | Critico |
| Gobierno / Release | 0 | 6 | 3 | 5 | 14 | Preocupante |
| Testing / Calidad | 0 | 4 | 5 | 0 | 9 | Preocupante |
| UX funcional | 0 | 2 | 5 | 3 | 10 | Preocupante |
| Arquitectura | 0 | 2 | 2 | 6 | 10 | Preocupante |
| UI estructural | 0 | 3 | 6 | 6 | 15 | Preocupante |
| Design system | 0 | 1 | 3 | 3 | 7 | Aceptable |
| Accesibilidad | 0 | 1 | 0 | 3 | 4 | Aceptable |
| Pantallas | 0 | 0 | 2 | 0 | 2 | Aceptable |
| Rendimiento | 0 | 1* | 6 | 5 | 12 | Aceptable |
| Endpoints | 0 | 0 | 1 | 1 | 2 | Bueno |

*PERF-014 es cross-referencia a BK-002; no contabilizado como hallazgo adicional.

### Leyenda de estado general

- **Critico**: Al menos un hallazgo Critico en el dominio
- **Preocupante**: Sin Criticos pero con multiples Altos o una Alta de impacto directo en el usuario
- **Aceptable**: Sin Criticos ni Altos (o un solo Alto con mitigacion); mayoria Media/Baja
- **Bueno**: Sin Criticos ni Altos; hallazgos de mantenimiento menor
