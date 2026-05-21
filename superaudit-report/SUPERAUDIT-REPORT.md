# SUPERAUDIT-REPORT — Brew-TUI + BrewBar

> Generado por: report-consolidator | Fecha: 2026-05-21

---

## Portada

| Campo | Valor |
|-------|-------|
| Producto | Brew-TUI + BrewBar |
| Versión auditada | 1.2.1 |
| Commit | 3e15a94 |
| Fecha | 2026-05-21 |
| Auditor | super-audit (automatizado) |
| Plataformas | CLI macOS (Node ≥22, TUI) · App macOS menubar (Swift 6, macOS 14+) |
| Repositorio | https://github.com/MoLinesDesigns/Brew-TUI.git |

---

## Resumen ejecutivo

Brew-TUI 1.2.1 es un gestor visual de Homebrew con modelo freemium (Free / Pro / Team) compuesto por una TUI React/Ink en TypeScript y la companion app BrewBar en Swift 6/SwiftUI. La auditoría cubre 14 dominios técnicos y produce 61 hallazgos únicos (deduplicados): 1 Crítico, 14 Altos, 22 Medios y 24 Bajos.

El punto más grave es la inyección de argumentos brew en el módulo de compliance Team (SEG-001, Crítico): paquetes arbitrarios pueden instalarse desde un PolicyFile JSON artesanal sin validación. Le siguen dos vectores de inyección adicionales, PII expuesta en el Unified Log de macOS, y un test de CI que falla bloqueando todo `git push`. Funcionalmente, el canal IPC TUI↔BrewBar está roto para instalaciones y desinstalaciones, y el tier Team tiene dos funcionalidades rotas en `account.tsx`.

La base del proyecto es sólida: sistema de licencias AES-256-GCM bien diseñado, i18n completo al 100 %, arquitectura de capas coherente, convenciones de código consistentes y 444 casos de test pasando. El veredicto es **NO apto para producción sin correcciones previas**. Los 4 bloqueantes de mayor urgencia (SEG-001, SEG-002, SEG-003, QA-001) son todos de esfuerzo XS-S y resolución estimada inferior a un día de trabajo.

---

## Estadísticas globales

| Métrica | Valor |
|---------|-------|
| Total hallazgos (deduplicados) | 61 |
| Críticos | 1 |
| Altos | 14 |
| Medios | 22 |
| Bajos | 24 |
| Dominios auditados | 14 de 14 |
| Reportes faltantes | Ninguno |
| Archivos TypeScript auditados | 178 (118 fuente + 60 test) |
| Archivos Swift auditados | 27 fuente + 2 test |
| Vistas TUI auditadas | 17 (16 vistas + WelcomeView) |
| Vistas BrewBar auditadas | 3 |
| Endpoints auditados | 9 |
| Tests TS pasando | 443 de 444 (1 fallo: QA-001) |
| Tests Swift | 30 métodos con Swift Testing |

---

## Tabla de severidad por sección

| Sección | Título | Crítica | Alta | Media | Baja | Total |
|---------|--------|---------|------|-------|------|-------|
| 0 | Ficha de auditoría | — | — | — | — | 0 |
| 1 | Inventario maestro | — | — | — | — | 0 |
| 2 | Gobierno del proyecto | — | 3 | 2 | 2 | 7 |
| 3 | Arquitectura | — | 1 | 4 | 6 | 11 |
| 4 | Concurrencia y estado | — | — | — | — | 0 |
| 5 | UI estructural | — | 2 | — | 6 | 8 |
| 6 | UX funcional | — | — | 1 | 5 | 6 |
| 7 | Design system | — | 1 | 1 | 2 | 4 |
| 8 | Accesibilidad | — | — | — | 2 | 2 |
| 11 | Backend y persistencia | — | 2 | 5 | 3 | 10 |
| 13 | Seguridad y privacidad | 1 | 2 | 3 | — | 6 |
| 14–15 | Testing y observabilidad | — | 1 | 4 | 1 | 6 |
| 16 | Rendimiento | — | — | 1 | — | 1 |
| 17–18 | Localización y release | — | 1 | 1 | 2 | 4 |
| 19 | Auditoría por pantalla | (ver hallazgos unificados) | — | — | — | — |
| 20 | Auditoría por endpoint | (ver hallazgos unificados) | — | — | — | — |

*Nota: las secciones 19 y 20 producen hallazgos unificados con otras secciones; no generan IDs propios en el registro final.*

---

## Tabla de contenidos

1. [0. Ficha de auditoría](#0-ficha-de-auditoria)
2. [1. Inventario maestro](#1-inventario-maestro-de-cobertura)
3. [2. Gobierno del proyecto](#2-gobierno-del-proyecto)
4. [3-4. Arquitectura y concurrencia](#3-4-arquitectura-y-concurrencia)
5. [5. UI estructural](#5-ui-estructural)
6. [6. UX funcional](#6-ux-funcional)
7. [7-8. Design system y accesibilidad](#7-8-design-system-y-accesibilidad)
8. [11-12. Backend y persistencia](#11-12-backend-y-persistencia)
9. [13. Seguridad y privacidad](#13-seguridad-y-privacidad)
10. [14-15. Testing y observabilidad](#14-15-testing-y-observabilidad)
11. [16. Rendimiento](#16-rendimiento)
12. [17-18. Localización y release readiness](#17-18-localizacion-y-release-readiness)
13. [19. Auditoría por pantalla](#19-auditoria-por-pantalla)
14. [20. Auditoría por endpoint](#20-auditoria-por-endpoint)
15. [21. Registro central de hallazgos](#21-registro-central-de-hallazgos)
16. [22. Priorización ejecutiva](#22-priorizacion-ejecutiva)
17. [23. Veredicto final y acciones](#23-veredicto-final-y-acciones)
18. [24. Checklist ultra resumido](#24-checklist-ultra-resumido)

---

## 0. Ficha de auditoría

**Producto:** Brew-TUI + BrewBar — **Versión:** 1.2.1 — **Commit:** 3e15a94 — **Fecha:** 2026-05-21

Stack TUI: TypeScript strict, React 19.2.5, Ink 7.0.1, Zustand 5.0.12, ESM-only, tsup, Vitest. Stack BrewBar: Swift 6, SwiftUI, macOS 14+, Tuist, `SWIFT_STRICT_CONCURRENCY=complete`. IPC entre ambos: `~/.brew-tui/last-action.json` (escritura atómica tmp+rename en TS; `DispatchSourceFileSystemObject` en Swift). Modelo freemium con tiers Free, Pro y Team; licencia AES-256-GCM machine-bound en `~/.brew-tui/license.json`. Alcance: auditoría completa sin exclusiones.

*Nota de versión de stack: `CLAUDE.md` menciona Ink 5.x y React 18; los valores reales son Ink 7.0.1 y React 19.2.5 — delta registrado para auditoría de gobierno.*

---

## 1. Inventario maestro de cobertura

El codebase TypeScript suma 178 archivos `.ts`/`.tsx` (118 fuente + 60 test) con 19.951 LOC. El codebase Swift comprende 27 archivos de producción más 2 de test con 4.918 LOC. Hay 16 vistas TUI, 13 módulos de librería Pro/Team, 12 stores Zustand y 9 endpoints externos/IPC identificados.

Brechas de cobertura relevantes: `data-dir.ts` (canal IPC), `anti-tamper.ts`, `icloud-backend.ts` y `use-brew-stream.ts` carecen de test directo. Los 8 stores Pro no tienen archivo `.test.ts` propio. BrewBar tiene 30 tests con Swift Testing (documentación de CLAUDE.md incorrecta en este punto). Sin hallazgos formales en esta sección — las brechas se registran en QA.

---

## 2. Gobierno del proyecto

**Hallazgos: 7 (0 Críticos · 3 Altos · 2 Medios · 2 Bajos)**

La CI dual (Ubuntu para TS + macOS para Swift), el pre-push hook con `npm run validate` y la firma/notarización de BrewBar están correctamente configurados. Sin secretos hardcodeados en el repositorio rastreado.

Hallazgos principales: `.playwright-mcp/` contiene 198 artefactos (YAML, PNG, logs) commiteados en el historial a pesar de la regla `.gitignore:34` — requiere `git rm -r --cached` (GOV-002, Alta). `CODEOWNERS:1` apunta a `@MoLinesGitHub` (org renombrada), desactivando reviews automáticos (GOV-001, Alta). `homebrew/Formula/brew-tui.rb` y `homebrew/Casks/brewbar.rb` en el repo declaran versión `0.7.0` cuando la publicada es `1.2.1` (GOV-003, Alta). El descriptor MacPorts tiene checksums `rmd160` con zeros inválidos (GOV-004, Media).

---

## 3-4. Arquitectura y concurrencia

**Hallazgos: 11 (0 Críticos · 1 Alto · 4 Medios · 6 Bajos)**

La arquitectura TUI sigue el modelo de capas documentado (Views → Stores → brew-api → brew-cli) de forma coherente. BrewBar implementa DI explícita con protocolos, aislamiento `@MainActor` correcto y concurrencia Swift 6 estricta. No se detectaron race conditions ni violaciones de `Sendable`.

El hallazgo Alto más relevante es `DesignExploration/BrewBarDesignVariants.swift` (991 LOC) incluido en el binario notariado vía glob `Sources/**` en `Project.swift` (ARQ-005). Entre los Medios: `PKG_PATTERN` divergente entre `brew-api.ts` y `profile-manager.ts` (ARQ-004); clave `legacyEncryptionKey` scrypt activa como fallback 9 versiones después del TODO de eliminación (ARQ-001); `async-state.ts` sin importadores de producción (ARQ-006). El `ConfirmDialog` usa `useInput` directo en lugar de `useViewInput` — funcionalmente correcto pero sin comentario explicativo (ARQ-011, Baja).

Concurrencia (sección 4): sin hallazgos. Swift Concurrency usada correctamente en todo el codebase Swift.

---

## 5. UI estructural

**Hallazgos: 8 (0 Críticos · 2 Altos · 0 Medios · 6 Bajos)**

La jerarquía de componentes TUI es sólida: tokens de color y spacing respetados sin excepciones, patrón `TextInput` uncontrolled correcto en todo el código, separación layout/comportamiento bien ejecutada, `useViewInput` usado correctamente en las 16 vistas.

Hallazgos Altos: `account.tsx:87-89` no tiene rama para el tier `team` — los usuarios Team ven el estado de licencia vacío (UI-001). `account.tsx:36` excluye `team` del deactivate — botón visible pero inoperante para ese tier (UI-002). Entre los Bajos: `compliance.tsx` (348 LOC) y `sync.tsx` (347 LOC) superan el umbral de mantenibilidad con máquinas de estado internas colocalizadas (UI-003); `stat-card.tsx` usa `useTerminalSize` en lugar de `useContainerSize` (UI-004); `pro-badge.tsx` sin importadores (UI-006); `welcome.tsx` con `useEffect` vacío (UI-008).

---

## 6. UX funcional

**Hallazgos: 6 (0 Críticos · 0 Altos · 1 Medio · 5 Bajos)**

Los flujos principales (instalación, upgrade, limpieza, seguridad, rollback) siguen patrones consistentes de confirmación, feedback de progreso y resultado. El onboarding con `WelcomeView` es correcto. No se detectaron flujos críticos rotos ni pérdidas de datos.

El único hallazgo Medio es el rollback en fase `executing`: Esc queda suprimido sin mensaje que informe al usuario de que la operación no puede cancelarse, lo que en una operación destructiva genera confusión crítica (UX-001). Bajos: literales `(errors)` y `(warnings)` hardcodeados en inglés en `compliance.tsx:80,91` fuera del sistema `t()` (UX-002); perfiles creados/editados sin `ResultBanner` de éxito (UX-003); `sync.tsx:246-250` con Enter silencioso cuando quedan conflictos (UX-004); `upgrade-prompt.tsx` sin atajo a AccountView (UX-005); BrewBar usa `.destructive` role en "Upgrade All" (UX-006).

---

## 7-8. Design system y accesibilidad

**Hallazgos: 6 (0 Críticos · 1 Alto · 1 Medio · 2 Bajos design · 2 Bajos accesibilidad)**

**Design system (sección 7):** Tokens de color (`DARK_PALETTE`/`LIGHT_PALETTE`, 20 tokens), spacing (`SPACING`) y breakpoints (`BREAKPOINTS`) bien definidos y respetados. Soporte `NO_COLOR` y detección de tema claro/oscuro correctos. i18n cubierto al 100 %. Carencias: ausencia de motion tokens en el sistema de diseño y `BlinkingText` titila siempre a 600 ms sin gate de `NO_COLOR`/`REDUCE_MOTION` (DS-001, Alta). `SettingsView.swift:77` con `.frame(height: 540)` fijo rompe Dynamic Type AX1+ (DS-002, Media). Magic number `columns < 60` en `dashboard.tsx:161` fuera de `BREAKPOINTS` (DS-003, Baja).

**Accesibilidad (sección 8):** BrewBar adapta correctamente High Contrast y Bold Text. Sin embargo, ninguna vista consulta `@Environment(\.accessibilityReduceMotion)` — gate preventivo ausente (ACC-001, Alta). `OutdatedListView` sin `.accessibilityAction` para upgrade individual con VoiceOver (ACC-002, Baja). `PrivacyInfo.xcprivacy` sin razones de filesystem `C617.1`/`E174.1` (ACC-003, Baja).

---

## 11-12. Backend y persistencia

**Hallazgos: 10 (0 Críticos · 2 Altos · 5 Medios · 3 Bajos)**

La capa `brew-api.ts` es robusta: timeouts diferenciados, `PKG_PATTERN` en el path principal, parsers testeados. Las escrituras atómicas en `data-dir.ts` (tmp+rename, `0o600`) son correctas.

Altos: `writeLastAction()` no se llama en `search.tsx` (install) ni en `installed.tsx` (uninstall), rompiendo el canal IPC TUI↔BrewBar para esas operaciones (BK-001). `SyncMonitor.getKnownMachineCount()` siempre retorna 0 porque intenta leer `machines` del JSON exterior del envelope AES-256-GCM sin descifrar (BK-002). Medios: path traversal en `policy-io.ts` sin sanitización de `..` (BK-005); `ConflictResolution.merge-union` declarado pero sin implementar — fallos silenciosos (BK-006); Polar 429 no reintentado con backoff (BK-004); `promo.ts` sin retry en 5xx (BK-003); directorio iCloud sin `mode: 0o700` (BK-007).

---

## 13. Seguridad y privacidad

**Hallazgos: 6 (1 Crítico · 2 Altos · 3 Medios · 0 Bajos)**

La base criptográfica es sólida: AES-256-GCM con HKDF-SHA256, machine-binding, escrituras atómicas `0o600`, anti-tamper multicapa (canary, anti-debug, integridad de bundle SHA-256, pro-guard), ausencia de secretos en el repositorio, HTTPS exclusivo para APIs externas.

Hallazgo Crítico: `compliance-remediator.ts:18,29` pasa `v.packageName` extraído de un PolicyFile JSON controlado por el usuario directamente a `streamBrew(['install'/'upgrade', ...])` sin `validatePackageName()`. Un PolicyFile artesanal puede instalar paquetes arbitrarios (SEG-001). Altos: `LicenseChecker.swift:205,212` usa `privacy: .public` exponiendo email, clave e instanceId al Unified Log del sistema (SEG-003); patrón idéntico a SEG-001 en `brewfile-manager.ts applyDrift()` (SEG-002). Medios: clave scrypt legacy activa (ARQ-001); `brew` resuelto via PATH heredado (SEG-004); 2 vulnerabilidades npm moderadas con fix disponible (SEG-005).

---

## 14-15. Testing y observabilidad

**Hallazgos: 6 (0 Críticos · 1 Alto · 4 Medios · 1 Bajo)**

Suite Vitest con 60 archivos de test, 444 casos ejecutados, `passWithNoTests: false` como gate, e `ink-testing-library` para vistas. Cobertura sólida en licencias, parsers, stores principales y vistas Pro.

Hallazgo Alto: `confirm-dialog.test.tsx:44` falla por timeout en locale `es` — `npm run validate` falla, bloqueando `git push` vía pre-push hook (QA-001). Medios: `data-dir.ts` sin test (canal IPC crítico, QA-002); 8 stores Pro sin tests unitarios directos (QA-003); `icloud-backend.ts` sin tests (QA-004); `analytics.ts` con 0 call sites en producción — KPIs inobservables (QA-005). El módulo de logging (structured, multi-level) y el crash reporter (opt-in, Keychain) están bien estructurados. BrewBar tiene 30 tests con Swift Testing — documentados incorrectamente en CLAUDE.md como "no tests written yet" (QA-006, Baja).

---

## 16. Rendimiento

**Hallazgos: 1 (0 Críticos · 0 Altos · 1 Medio · 0 Bajos)**

El rendimiento general es aceptable para una TUI. `fetchAll()` ejecuta fetches en paralelo al arranque. `streamBrew()` con AsyncGenerator evita bloqueos. `impactCache` con LRU-lite (64 entradas) reduce llamadas redundantes a brew.

El único hallazgo formal es que `services.tsx:34`, `doctor.tsx:15` y `outdated.tsx:65` desestructuran `useBrewStore()` completo sin selector, causando re-renders en cualquier cambio del store — patrón ya corregido en `dashboard.tsx:88-96` que sirve de referencia (PERF-001, Media). Los 6 hallazgos Bajos del reporte original (BlinkingText con 3 timers separados, impactCache sin TTL, etc.) quedaron unificados con hallazgos de otras secciones (DS-001, ARQ-002).

---

## 17-18. Localización y release readiness

**Hallazgos: 4 (0 Críticos · 1 Alto · 1 Medio · 2 Bajos)**

**Localización:** 100 % de cobertura en ambos stacks. TUI: 479 claves en `en.ts` + `es.ts`, verificadas en tiempo de compilación por el tipo `Translations`. BrewBar: 109 strings en `Localizable.xcstrings` con variantes de plurales. Ningún string de usuario hardcodeado fuera del sistema i18n, salvo los dos literales `(errors)`/`(warnings)` en `compliance.tsx` (UX-002, Baja — registrado en UX).

**Release readiness:** Los tres canales públicos (npm, GitHub Release, homebrew-tap canónico) están sincronizados en v1.2.1. Firma y notarización de BrewBar correctas. Hallazgo Alto: `release.sh` no verifica salud del perfil notary antes de iniciar el archive — un perfil expirado se descubre tras ~10 min de build (REL-001). Hallazgo Medio: crash reporting no activo en producción (REL-002). Bajos: `release.sh` sin verificación de `MARKETING_VERSION` post-archive (REL-003); `exportOptions.plist` gitignoreado sin plantilla documentada (GOV-006).

---

## 19. Auditoría por pantalla

**Pantallas auditadas:** 17 vistas TUI (DashboardView, InstalledView, OutdatedView, SearchView, ServicesView, DoctorView, AccountView, WelcomeView, ProfilesView, SmartCleanupView, HistoryView, SecurityAuditView, RollbackView, BrewfileView, SyncView, ComplianceView, SettingsView-TS) + 3 vistas BrewBar (PopoverView/OutdatedListView, SettingsView.swift).

Hallazgos clave detectados en esta sección (todos unificados con secciones primarias): inyección de flags en ComplianceView → SEG-001; `writeLastAction()` ausente en InstalledView uninstall → BK-001; tier Team roto en AccountView → UI-001 / UI-002; `SettingsView.swift:77` altura fija → DS-002; `.destructive` role en OutdatedListView BrewBar → UX-006. No se generaron IDs propios — todos los hallazgos se unificaron con sus secciones de origen.

---

## 20. Auditoría por endpoint

**Endpoints auditados: 9**

| # | Endpoint | Tipo |
|---|----------|------|
| 1 | Polar API (activate, validate, deactivate) | HTTPS REST |
| 2 | brewtui-api promo (POST /redeem) | HTTPS REST |
| 3 | OSV.dev (batch query) | HTTPS REST |
| 4 | brew CLI subprocess | Proceso local |
| 5 | IPC last-action.json | Filesystem local |
| 6 | iCloud sync envelope | Filesystem + CloudKit |

Hallazgos clave (todos unificados con secciones primarias): inyección de flags en brew subprocess → SEG-001 / SEG-002; `writeLastAction()` ausente para install/uninstall → BK-001; `SyncMonitor` siempre retorna 0 → BK-002; Polar 429 sin retry → BK-004; `brew` via PATH sin ruta canónica → SEG-004; promo sin retry 5xx → BK-003.

---

## 21. Registro central de hallazgos

*Para el registro completo de los 61 hallazgos ver `/superaudit-report/21-findings.md`.*

**Resumen:** 61 hallazgos únicos deduplicados · 1 Crítico · 14 Altos · 22 Medios · 24 Bajos · 17 unificaciones de duplicados entre secciones · Todos en estado Pendiente.

| Severidad | IDs representativos |
|-----------|---------------------|
| Crítica (1) | SEG-001 |
| Alta (14) | SEG-002, SEG-003, UI-001, UI-002, BK-001, BK-002, ARQ-005, QA-001, GOV-001, GOV-002, GOV-003, DS-001, ACC-001, REL-001 |
| Media (22) | ARQ-001..007, SEG-004..006, BK-003..007, DS-002, UX-001, PERF-001, QA-002..005, GOV-004..005, REL-002 |
| Baja (24) | ARQ-008..011, UI-003..008, UX-002..006, DS-003..004, ACC-002..003, BK-008..009, QA-006, REL-003, GOV-006..007, ARQ-003 |

---

## 22. Priorización ejecutiva

*Para el detalle completo ver `/superaudit-report/22-prioritization.md`.*

### Bloqueante release (10 acciones)

| # | ID | Hallazgo | Esfuerzo |
|---|-----|----------|----------|
| 1 | SEG-001 | Inyección flags brew en `compliance-remediator.ts` | S |
| 2 | SEG-002 | Inyección flags brew en `brewfile-manager.ts` | XS |
| 3 | SEG-003 | PII en Unified Log macOS (`LicenseChecker.swift:205,212`) | XS |
| 4 | QA-001 | Test `confirm-dialog.test.tsx:44` falla, bloquea `git push` | XS |
| 5 | BK-001 | `writeLastAction()` ausente en search (install) e installed (uninstall) | S |
| 6 | UI-001 | `account.tsx` sin rama `team`; estado vacío para usuarios Team | XS |
| 7 | UI-002 | `account.tsx` deactivate bloqueado para tier Team | XS |
| 8 | BK-002 | `SyncMonitor.getKnownMachineCount()` siempre retorna 0 | M |
| 9 | GOV-001 | `CODEOWNERS` apunta a org legacy `@MoLinesGitHub` | XS |
| 10 | GOV-002 | 198 archivos `.playwright-mcp/` trackeados en git | S |

### Mapa de calor por dominio

| Dominio | Crítica | Alta | Media | Baja | Estado |
|---------|---------|------|-------|------|--------|
| Seguridad | 1 | 2 | 3 | 0 | Crítico |
| Testing / QA | 0 | 1 | 4 | 1 | Preocupante |
| Arquitectura | 0 | 1 | 4 | 6 | Preocupante |
| Backend | 0 | 2 | 5 | 3 | Preocupante |
| Gobierno | 0 | 3 | 2 | 2 | Preocupante |
| UI | 0 | 2 | 0 | 6 | Preocupante |
| Design system | 0 | 1 | 1 | 2 | Preocupante |
| Accesibilidad | 0 | 1 | 0 | 2 | Preocupante |
| UX | 0 | 0 | 1 | 5 | Aceptable |
| Performance | 0 | 0 | 1 | 0 | Aceptable |
| Release | 0 | 1 | 1 | 2 | Preocupante |

---

## 23. Veredicto final y acciones

*Para el veredicto completo ver `/superaudit-report/23-verdict.md`.*

### Estado general

| Área | Estado |
|------|--------|
| Frontend (TUI) | Preocupante |
| Backend / persistencia | Preocupante |
| UI / UX | Aceptable |
| Arquitectura | Preocupante |
| Seguridad | **Crítico** |
| Rendimiento | Aceptable |
| Accesibilidad | Preocupante |

### Recomendación

**[x] NO apto para producción sin correcciones previas**

El proyecto tiene una base sólida, pero la combinación de 1 hallazgo Crítico activo (inyección de flags brew), 2 rutas adicionales de inyección, PII expuesta en el Unified Log macOS y un pipeline de release bloqueado por tests en rojo hace imposible un release con garantías. Las correcciones de los 4 hallazgos de mayor urgencia (SEG-001, SEG-002, SEG-003, QA-001) son todas de esfuerzo XS-S y resolubles en menos de un día de trabajo.

### Acciones inmediatas (≤ 7 días)

1. **[SEG-001 · Crítico]** Añadir `validatePackageName(v.packageName)` antes de cada `streamBrew` en `compliance-remediator.ts:18,29`; rechazar PolicyFile malformado en `isValidPolicy()`.
2. **[SEG-002 · Alta]** Añadir `validatePackageName(name)` en `brewfile-manager.ts applyDrift()`.
3. **[SEG-003 · Alta]** Cambiar `privacy: .public` a `privacy: .private` en `LicenseChecker.swift:205,212`.
4. **[QA-001 · Alta]** Añadir `await new Promise(r => setImmediate(r))` en `confirm-dialog.test.tsx:44` entre el setState del locale y el `stdin.write('s')`.
5. **[BK-001 · Alta]** Añadir `writeLastAction()` en `search.tsx` (install) e `installed.tsx:212` (uninstall).
6. **[UI-001 + UI-002 · Alta]** Añadir rama `team` en `account.tsx:87-89`; cambiar condición a `(status === 'pro' || status === 'team')` en `account.tsx:36`.
7. **[GOV-002 · Alta]** Ejecutar `git rm -r --cached .playwright-mcp/` y hacer commit.

---

## 24. Checklist ultra resumido

| Área | Estado | Hallazgos | Acción prioritaria |
|------|--------|-----------|--------------------|
| Inventario y ficha | Conforme | 0 | Ninguna |
| Gobierno | Parcial | 7 | Eliminar `.playwright-mcp/` del índice git (GOV-002); actualizar CODEOWNERS (GOV-001) |
| Arquitectura | Parcial | 11 | Excluir DesignExploration del binario (ARQ-005); eliminar clave scrypt legacy (ARQ-001) |
| Concurrencia | Conforme | 0 | Ninguna |
| UI estructural | Parcial | 8 | Añadir rama `team` y fix deactivate en `account.tsx` (UI-001, UI-002) |
| UX funcional | Parcial | 6 | Mensaje en rollback fase `executing` (UX-001) |
| Design system | Parcial | 4 | Gate de reduce-motion en `BlinkingText` (DS-001) |
| Accesibilidad | Parcial | 3 | Añadir `@Environment(\.accessibilityReduceMotion)` en BrewBar (ACC-001) |
| Backend | Parcial | 10 | Sanitizar rutas en `policy-io.ts` (BK-005); fix SyncMonitor (BK-002) |
| Seguridad | No conforme | 6 | Corregir inyección de flags (SEG-001, SEG-002); PII en Unified Log (SEG-003) |
| Testing | Parcial | 6 | Corregir test rojo `confirm-dialog.test.tsx:44` (QA-001); tests para stores Pro (QA-003) |
| Pantallas | Parcial | — | `writeLastAction` en install/uninstall (BK-001) |
| Endpoints | Parcial | — | Retry Polar 429 (BK-004); retry promo 5xx (BK-003) |

---

> Fin del reporte. Generado automáticamente por super-audit — report-consolidator — 2026-05-21.
