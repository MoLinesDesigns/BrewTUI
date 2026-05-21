# 23. Veredicto final

> Auditor: report-consolidator | Fecha: 2026-05-01

---

## Resumen ejecutivo por area

* **Estado general del frontend (TUI):** Preocupante — Tres vistas destructivas carecen de confirmacion (`ConfirmDialog`) antes de operaciones irreversibles; `ink-testing-library` esta instalada pero ninguna de las 16 vistas tiene tests de renderizado. Los componentes de UI y las capas de presentacion estan bien estructurados pero son fragiles frente a refactors no verificados.

* **Estado general del backend:** Critico — El feature Pro mas importante (Security Audit) devuelve sistematicamente cero CVEs debido al bug `ecosystem: 'Homebrew'` en `osv-api.ts`. La funcion `isExpired()` falla abierta en fechas invalidas. Cuatro implementaciones divergentes de `getMachineId` incluyen un fallback a `hostname()` que puede causar colision de datos en sync.

* **Estado general de UI/UX:** Preocupante — La ausencia de onboarding produce alto abandono potencial en primeros usuarios. Las notificaciones CVE/Sync con identificadores fijos en BrewBar estan silenciosamente inoperativas despues de la primera alerta. Strings hardcodeados en `sync.tsx` y `brewfile.tsx` rompen la localizacion segun el locale.

* **Estado general de arquitectura:** Preocupante — La politica de degradacion de licencia diverge entre TS (7 dias) y Swift (30 dias), con el mismo `license.json` produciendo estados contradictorios. Los schemas de licencia duplicados sin test de contrato representan una bomba de tiempo para futuros cambios de campo.

* **Estado general de seguridad:** Critico — Dos tokens npm activos en texto plano en disco son explotables ahora mismo. Las claves AES hardcodeadas en el bundle npm y en el binario Swift son recuperables sin herramientas especializadas. Ninguno de estos riesgos es invisible: son hallazgos conocidos con mitigaciones parciales pero sin solucion definitiva.

* **Estado general de rendimiento:** Aceptable — El patron de Impact Analysis (2 spawns de `brew` por cursor move sin cache) es el unico problema perceptible para el usuario Pro. `readDataToEndOfFile()` sincrono en `BrewProcess.swift` es un riesgo de deadlock pero solo se manifiesta con buffers muy grandes. El resto de issues de rendimiento son de bajo impacto.

* **Estado general de accesibilidad:** Aceptable — `NO_COLOR` no implementado es el gap mas importante (Alta) para usuarios con terminales sin soporte de color. Los issues de VoiceOver en BrewBar son menores. El tema oscuro exclusivo en el TUI es una limitacion conocida y documentada.

---

## Metricas clave

* **Total hallazgos:** 98
* **Hallazgos criticos:** 2
* **Hallazgos altos:** 22
* **Hallazgos medios:** 38
* **Hallazgos bajos:** 36
* **Dominios auditados:** 14 de 14
* **Pantallas auditadas:** 16 de 16 (todas las vistas TUI)
* **Endpoints auditados:** 5 (Polar activacion/validacion/desactivacion, OSV batch, Promo redeem)
* **Archivos TypeScript:** 141 (16.596 lineas)
* **Archivos Swift:** 22 (3.837 lineas)
* **Cobertura de tests TypeScript:** 35/141 archivos con tests (24.8%), concentrada en `lib/`; `views/` y `components/` sin cobertura de render
* **Cobertura de tests Swift:** 2 archivos de test (modelos y servicios); sin tests E2E ni de integracion con red

---

## Riesgos de salida a produccion

Los siguientes riesgos son bloqueantes o degradan significativamente la experiencia de produccion:

1. **Tokens npm activos en texto plano en disco** — Un acceso no autorizado al equipo del desarrollador permite publicar un paquete `brew-tui` malicioso en npmjs.com afectando a todos los usuarios del CLI. Ver SEG-001.

2. **Security Audit Pro completamente inoperativo** — Todos los usuarios Pro que ejecutan el Security Audit reciben "0 vulnerabilidades" sin importar su estado real. El canal de BrewBar funciona correctamente pero el TUI no. Ver BK-001.

3. **Canal de distribucion BrewBar roto por URL incorrecta** — `homebrew/Casks/brewbar.rb` tiene la URL con usuario GitHub incorrecto. Cualquier usuario que intente instalar BrewBar via Homebrew recibe HTTP 404. Ver GOV-002.

4. **BrewBar no notarizado** — Los usuarios que descargan BrewBar directamente o via Homebrew Cask (cuando se corrija la URL) son bloqueados por Gatekeeper en macOS Ventura y Sonoma sin posibilidad de ejecucion. Ver GOV-005.

5. **Formula y Cask desactualizados** — Usuarios de Homebrew Formula reciben `brew-tui` 0.5.3 (sin los fixes de seguridad y bugs de 0.6.x). Ver GOV-003.

6. **`isExpired()` falla abierta en fecha invalida** — Una licencia con fecha corrupta o manipulada nunca expira; potencialmente explotable en combinacion con SEG-002. Ver BK-004.

7. **Notificaciones CVE silenciadas despues de la primera** — El feature diferencial de seguridad de BrewBar (alerta cuando aparecen nuevos CVEs) esta silenciosamente inoperativo. Ver UX-001.

---

## Recomendacion

Seleccion del estado de release mas apropiado basado en la totalidad de los hallazgos:

* [ ] Apto para continuar desarrollo — El proyecto tiene buena base pero necesita correcciones antes de beta
* [ ] Apto para beta interna — Puede distribuirse a testers internos con las salvedades indicadas
* [ ] Apto para TestFlight / staging — Puede publicarse en TestFlight tras resolver hallazgos criticos
* [x] **No apto para produccion sin correcciones previas** — Requiere resolver hallazgos criticos y altos antes de release

**Justificacion:** El proyecto tiene dos hallazgos Criticos activos (tokens npm explotables en tiempo real, feature Pro Security Audit silenciosamente roto) y el canal de distribucion principal de BrewBar esta completamente inoperativo por una URL incorrecta. Con 24 hallazgos Criticos + Altos de los cuales siete afectan directamente a la experiencia del usuario en produccion, el codigo actual no cumple los estandares minimos de una release v0.6.1. La buena noticia es que los tres problemas mas urgentes (revocar tokens, corregir `osv-api.ts`, corregir URL del Cask) son cambios de menos de 5 lineas cada uno — el tiempo de correccion es bajo pero el impacto de no hacerlo es inaceptable.

---

## Proximas acciones

Acciones ordenadas por prioridad, con referencias a los hallazgos correspondientes:

1. **[Prioridad critica — ahora mismo]** Revocar ambos tokens npm en npmjs.com y agregar `.claude/` al `.gitignore` del repo — Ver SEG-001

2. **[Prioridad critica — PR inmediato]** Cambiar `'Homebrew'` → `'Bitnami'` en `osv-api.ts:125,143,181` y publicar hotfix npm 0.6.2 — Ver BK-001

3. **[Prioridad alta — PR 2]** Corregir URL del Cask (`MoLinesGitHub` → `MoLinesDesigns`), actualizar versiones en `brewbar.rb`, `brew-tui.rb` y `jsr.json` a 0.6.1 — Ver GOV-002, GOV-003, GOV-004

4. **[Prioridad alta — PR 3]** Agregar `ConfirmDialog` en `brewfile.tsx`, `sync.tsx` y `compliance.tsx`; corregir identificadores de notificacion en `SchedulerService.swift`; eliminar `FileTimestamp` de `PrivacyInfo.xcprivacy` — Ver UI-001, UI-002, UI-003, UX-001, GOV-006

5. **[Prioridad alta — PR 3]** Corregir `isExpired()` para retornar `true` en fecha invalida/indefinida — Ver BK-004

6. **[Prioridad alta — PR 4]** Extraer `getMachineId()` a funcion unica en `data-dir.ts`; eliminar fallback a `hostname()` en `sync-engine.ts` — Ver BK-005

7. **[Prioridad alta — PR 4]** Migrar `readDataToEndOfFile()` a lectura incremental en `BrewProcess.swift:99` — Ver BK-002

8. **[Prioridad alta — PR 4]** Implementar notarizacion con `xcrun notarytool submit --wait` en el script de release — Ver GOV-005

9. **[Prioridad alta — PR 4]** Agregar job `macos-latest` a `.github/workflows/ci.yml` con `tuist generate && xcodebuild test` — Ver GOV-001, QA-003

10. **[Prioridad alta — PR 5]** Crear tests de renderizado para `DashboardView`, `OutdatedView`, `AccountView` y `ViewRouter` con `ink-testing-library` — Ver QA-001, QA-002

11. **[Prioridad media — iteraciones siguientes]** Resolver divergencia de politica de degradacion de licencia entre TS (7 dias) y Swift (30 dias) con test de contrato — Ver ARQ-001, ARQ-002

12. **[Prioridad media — iteraciones siguientes]** Implementar `NO_COLOR` en `src/utils/colors.ts`; implementar `pruneSnapshots(maxCount=20)` — Ver ACC-001, BK-003

13. **[Prioridad media — backlog]** Agregar analytics minimos con consentimiento: `activation_started`, `feature_viewed`, `upgrade_prompt_shown` — Ver QA-008

14. **[Prioridad media — backlog]** Resolver las 38 hallazgos de severidad Media segun el plan de iteraciones del equipo

---

# 24. Checklist ultra resumido

| Area | Estado | Hallazgos | Accion prioritaria |
|------|--------|-----------|--------------------|
| Inventario y ficha | Conforme | 0 | Ninguna |
| Gobierno / Release | No conforme | 13 | Corregir URL Cask + bumps de version Formula/Cask/JSR |
| Arquitectura | Parcial | 9 | Alinear politica de degradacion de licencia TS/Swift |
| Concurrencia y estado | Parcial | 2 | Crear protocolo `SyncMonitoring`; tipo discriminado `AsyncState` |
| UI estructural | No conforme | 15 | Agregar `ConfirmDialog` en vistas destructivas |
| UX funcional | No conforme | 10 | Corregir identificadores de notificacion; agregar onboarding |
| Design system | Parcial | 7 | Adoptar `SPACING.*`; corregir icono de menu bar invertido |
| Accesibilidad | Parcial | 4 | Implementar `NO_COLOR` |
| Backend / Persistencia | Critico | 15 | Corregir `osv-api.ts` (`'Homebrew'` → `'Bitnami'`); `isExpired()` falla abierto |
| Seguridad | Critico | 3 | Revocar tokens npm; eliminar literal hex de `LicenseChecker.swift` |
| Testing / Calidad | No conforme | 9 | Crear tests de renderizado TUI; agregar CI macOS para Swift |
| Rendimiento | Parcial | 12 | Cache de Impact Analysis; serializar `brew update` |
| Pantallas | Parcial | 2 | AbortController en Impact Analysis; corregir hint Esc en InstalledView |
| Endpoints | Aceptable | 2 | Agregar idempotency-key a Promo `/redeem` |
