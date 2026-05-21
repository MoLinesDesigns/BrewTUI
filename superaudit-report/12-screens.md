# 12. Pantallas / Views

> Auditor: screen-auditor (verificacion directa) | Fecha: 2026-05-21

## Resumen ejecutivo

17 vistas TUI + 3 vistas BrewBar SwiftUI revisadas individualmente. La mayoria estan bien construidas (estados loading/error/contenido cubiertos, `useViewInput` adoptado universalmente, ConfirmDialog para acciones destructivas, Pro gating via `UpgradePrompt`). Los hallazgos repetidos son: ausencia de `writeLastAction()` en `installed.tsx` (uninstall) y `search.tsx` (install), que rompe el handoff IPC a BrewBar; vistas largas con responsabilidades colocalizadas (`compliance.tsx` 348 LOC, `sync.tsx` 347 LOC, `outdated.tsx` con 10+ `useState`); y dos huecos UX puntuales en `account.tsx` (tier `team` no etiquetado, no deactivable).

---

## 12.1 Tabla resumen TUI

| View | LOC | useViewInput | Pro gate | ConfirmDialog | writeLastAction | Estados completos | Hallazgos |
|------|-----|---------------|----------|---------------|-----------------|--------------------|-----------|
| dashboard.tsx | 252 | Sí | n/a | n/a | n/a | Sí | — |
| installed.tsx | 270+ | Sí | n/a | Sí (uninstall) | **No (uninstall)** | Sí | SCR-INST-01 |
| outdated.tsx | 320+ | Sí | n/a | Sí (upgrade all) | Sí | Sí | ARC-12 |
| search.tsx | 230+ | Sí | n/a | n/a (install directo) | **No (install)** | Sí | UX-SRC-01, FE-3 |
| services.tsx | ~190 | Sí | n/a | n/a | n/a | Sí | PERF-MED-01 |
| doctor.tsx | ~80 | Sí | n/a | n/a | n/a | Sí | PERF-MED-01 |
| account.tsx | 195 | Sí | n/a | Sí (deactivate) | n/a | Sí | UX-ACC-01, UX-ACC-02 |
| welcome.tsx | ~80 | Sí | n/a | n/a | n/a | Sí | FE-11 |
| package-info.tsx | ~200 | Sí | n/a | Sí (install) | Sí | Sí | — |
| profiles.tsx + subviews | 380+ | Sí (3×) | Sí | Sí | n/a | Sí | UX-PROF-01 |
| smart-cleanup.tsx | ~210 | Sí | Sí | Sí | n/a | Sí | UX-CLN-01 |
| history.tsx | ~250 | Sí | Sí | Sí (replay/clear) | depende replay | Sí | UX-HIS-01 |
| security-audit.tsx | ~180 | Sí | Sí | n/a | n/a | Sí | UX-SEC-01 |
| rollback.tsx | ~280 | Sí | Sí | Sí | n/a | Sí | UX-ROL-01 |
| brewfile.tsx | ~230 | Sí | Sí | Sí (reconcile) | n/a (lo dispara streamBrew interno) | Sí | UX-BWF-01 |
| sync.tsx | 347 | Sí | Sí | Sí (sync now) | n/a | Sí | UX-SYNC-01, UX-SYNC-02, FE-6 |
| compliance.tsx | 348 | Sí | Sí (Team) | Sí (remediate) | n/a | Sí | UX-CMP-01, ARC-01 |

---

## 12.2 Hallazgos consolidados por view

### dashboard.tsx
**Estado:** correcto. Selectors granulares, dashboard parte y panel Pro al final. **Sin hallazgos.**

### installed.tsx
**SCR-INST-01 — Media** | `src/views/installed.tsx:212` — `stream.run(['uninstall', name])` no llama `writeLastAction()`. BrewBar no recibe la notificacion IPC tras desinstalar, asi que el banner de "ultima accion" no se refresca y `remainingOutdated` no se actualiza si el paquete desinstalado estaba outdated.
*Accion:* Anadir `writeLastAction({ action: 'uninstall', packages: [name], ... })` en el `.then()` despues del stream.

### outdated.tsx
**ARC-12 — Baja** (arquitectura): >10 `useState` locales colocalizados con logica de impact + confirmacion + upgrade all. Refactor sugerido: extraer `useOutdatedFlow()`.
**Conforme:** `writeLastAction` presente (linea 102), debounce de cursor 150 ms, impact cache habilitado.

### search.tsx
**FE-3 — Alta** | `src/views/search.tsx:201` — install directo desde search sin `writeLastAction()`. Igual que `installed.tsx`.
**UX-SRC-01 — Baja** | mensajes raw del CLI brew en error (`search.tsx:74`).
**ARC-09 — Baja** | `void doSearch(query)` puede actualizar estado de componente desmontado.
**ARC-15 — Baja** | derivacion `allResults` + ventana de scroll colocalizadas — candidato a custom hook.

### services.tsx
**PERF-MED-01** | `useBrewStore()` sin selector (linea 34).
**Conforme** resto.

### doctor.tsx
**PERF-MED-01** | igual que services (linea 15).
**Conforme** resto.

### account.tsx
**UX-ACC-01 — Alta** (FE-1) | `src/views/account.tsx:87-89` — label de tier `team` ausente; solo cubre `pro`/`free`/`expired`. Usuarios Team ven status vacio.
**UX-ACC-02 — Alta** (FE-2) | `src/views/account.tsx:36` — condicion `status === 'pro'` excluye Team; footer ofrece `2:deactivate` para Team pero el handler no dispara.
**Conforme** resto: ConfirmDialog en deactivate, promo redemption flow, loading state.

### welcome.tsx
**FE-11 — Baja** | `useEffect(() => { return () => { /* cleanup */ }; }, [])` no-op (lineas 18-20).
**Conforme** resto. Solo se muestra primera vez via `onboarding.ts`.

### package-info.tsx
**Conforme.** writeLastAction (linea 94), Loading + ErrorMessage + Content, ConfirmDialog antes de install.

### profiles.tsx + subviews
**UX-PROF-01 — Baja** | sin feedback de exito al crear/editar; modo regresa a lista silenciosamente.
**ARC-06 — Media** | `PKG_PATTERN` divergente (restrictivo en profile-manager vs permisivo en brew-api).
**Conforme:** 3 `useViewInput` (list/detail/create-edit), watermark export, validacion de nombre.

### smart-cleanup.tsx
**UX-CLN-01 — Baja** | dry-run implicito (sin etiqueta explicita); doble confirmacion presente con aviso de herramientas del sistema.
**Conforme** Pro gate, ConfirmDialog destructivo, estimacion de espacio.

### history.tsx
**UX-HIS-01 — Baja** | estado de error sin hint de retry (FE-10).
**FE-9 — Baja** | logica de mapeo accion → brew args dentro del handler (extraer a `lib/history/replay.ts`).
**Conforme** Pro gate, debounce de busqueda 200 ms, ConfirmDialog en clear + replay.

### security-audit.tsx
**UX-SEC-01 — Baja** | duracion de cache (30 min) no comunicada en UI; ausencia de hint de retry tras error de red.
**Conforme** Pro gate, integracion OSV con validacion runtime.

### rollback.tsx
**UX-ROL-01 — Media** | fase `executing` suprime Esc sin mensaje al usuario; si una restauracion tarda mucho, parece colgado.
**Conforme** Pro gate, ConfirmDialog destructivo riguroso, snapshots con fecha + paquetes afectados.

### brewfile.tsx
**UX-BWF-01 — Baja** | ruta del archivo YAML no se muestra en overview ni en creating.
**Verificado:** Pro gate (linea 82), reconcile con ConfirmDialog (lineas 109-133), uso correcto de `useViewInput`.

### sync.tsx
**UX-SYNC-01 — Baja** | ConfirmDialog de sync now no menciona iCloud explicitamente.
**UX-SYNC-02 — Baja** | Enter silencioso si quedan conflictos pendientes.
**FE-6 — Media** | 347 LOC con state machine inline; extraer subcomponentes por fase.
**Verificado:** Pro gate, schemaVersion validado, AES-256-GCM antes de upload, consent UI presente.

### compliance.tsx
**ARC-01 — Crítica** | `compliance-remediator.ts` pasa `v.packageName` a `streamBrew` sin `validatePackageName()`. Policy file artesanal puede inyectar flags. Esta view es la entrada; mitigar en `compliance-remediator` y/o validar policy en import.
**UX-CMP-01 — Baja** | literales `(errors)` y `(warnings)` hardcoded en ingles fuera de `t()` (lineas 80, 91).
**FE-5 — Media** | 348 LOC, fases colocalizadas; refactor sugerido (`ComplianceScanPhase`, `ComplianceResultPhase`, `ComplianceFixPhase`).
**Verificado:** Team gate via `TEAM_VIEWS`, ConfirmDialog antes de remediar.

---

## 12.3 BrewBar (Swift)

### PopoverView.swift
**Verificado:**
- Localized via xcstrings (109 claves).
- `accessibilityLabel`/`Trait` en filas de paquete (BadgeIcon, NotificationsBell).
- Dark mode soportado (no hex hardcoded en filas).
- LastActionBanner reactivo a `LastActionMonitor`.

**Sin hallazgos accionables nuevos** (ver 06-design-accessibility para puntos transversales).

### SettingsView.swift
**DA-MED-01 — Media** | `.frame(height: 540)` fijo corta contenido con Dynamic Type AX1+.
*Accion:* Sustituir por `ScrollView` con `idealHeight`, o suprimir el `frame` height fijo y permitir resize.

### OutdatedListView.swift
**UX-BB-01 — Baja** | role `.destructive` en boton "Upgrade All" (no es una accion destructiva — envia señal de peligro incorrecta al asistivo).
*Accion:* Cambiar a role por defecto o `.prominent`.
**DA-LOW-01 — Baja** | sin `.accessibilityAction` alternativa por fila (lectores con interaccion limitada no pueden disparar upgrade individual).

---

## 12.4 Estados loading/error/empty — checklist global

| View | Loading | Error | Empty | Contenido | Streaming |
|------|---------|-------|-------|-----------|-----------|
| dashboard | Sí | Sí | n/a (Brewdata siempre tiene installed list o se inicializa) | Sí | n/a |
| installed | Sí | Sí | Sí (lista vacia) | Sí | Sí (uninstall) |
| outdated | Sí | Sí | Sí | Sí | Sí (upgrade) |
| search | n/a (input vacio = no fetch) | Sí | Sí (resultado vacio) | Sí | Sí (install) |
| services | Sí | Sí | Sí (lista vacia) | Sí | n/a |
| doctor | Sí | Sí | n/a (clean state explicito) | Sí | n/a |
| account | Sí | n/a | n/a | Sí | n/a |
| welcome | n/a | n/a | n/a | Sí | n/a |
| package-info | Sí | Sí | n/a | Sí | Sí (install) |
| profiles | Sí | n/a (errores inline) | Sí | Sí | n/a |
| smart-cleanup | n/a (computed) | Sí | Sí (nothing to clean) | Sí | Sí (cleanup) |
| history | Sí | Sí | Sí | Sí | Sí (replay) |
| security-audit | Sí | Sí | Sí (no vulns) | Sí | n/a |
| rollback | n/a | Sí | Sí (sin snapshots) | Sí | Sí (restore) |
| brewfile | Sí | Sí | Sí (no brewfile) | Sí | Sí (reconcile) |
| sync | Sí | Sí | Sí (no remote) | Sí | n/a |
| compliance | Sí | Sí | Sí (sin policy) | Sí | Sí (remediate) |

**Cobertura: 17/17 vistas con los estados relevantes representados.**

---

## 12.5 Modal + menuMode awareness

Todas las 17 vistas usan `useViewInput` (verificado por frontend-auditor) — el side menu suprime correctamente la entrada. `modal-store` usa contador de referencias.

**Excepcion intencional:** `ConfirmDialog` usa `useInput` directo (ARC-11 — Baja) para mantenerse activo mientras el view padre se suprime. Documentado pero no inline; riesgo de replicacion incorrecta en componentes nuevos.

---

## 12.6 Resumen de severidad por view

| Severidad | Cantidad |
|-----------|----------|
| Critica | 1 (ARC-01 — compliance) |
| Alta | 3 (UX-ACC-01, UX-ACC-02, FE-3) |
| Media | 7 |
| Baja | 14 |

---

## 12.7 Prioridades por view

1. **ARC-01** (compliance) — Critica.
2. **UX-ACC-01 + UX-ACC-02** — Account no soporta tier Team (rotura funcional para clientes Team).
3. **FE-3 + SCR-INST-01** — IPC handoff a BrewBar incompleto para install/uninstall desde search e installed.
4. **PERF-MED-01** — Selectors granulares en services/doctor/outdated.
5. **UX-ROL-01 + DA-MED-01** — Rollback executing sin feedback + Settings BrewBar corta con AX1.
