# 22. Priorización ejecutiva

> Auditor: report-consolidator | Fecha: 2026-05-21 | Versión auditada: 1.2.1

## Distribución de hallazgos

| Severidad | Cantidad | % del total |
|-----------|----------|-------------|
| Crítica   | 1        | 1,6 %       |
| Alta      | 14       | 23,0 %      |
| Media     | 22       | 36,1 %      |
| Baja      | 24       | 39,3 %      |
| **Total** | **61**   | **100 %**   |

---

## Bloqueante release — Acción antes de cualquier publicación

Estos hallazgos representan riesgos de seguridad activos, funcionalidades rotas para tiers de pago, o un pipeline de release que no puede ejecutarse con garantías. Deben resolverse **antes de cualquier release a producción**.

| # | ID | Hallazgo | Esfuerzo | Riesgo si no se corrige | Owner sugerido |
|---|-----|----------|----------|------------------------|----------------|
| 1 | SEG-001 | Inyección de flags brew en `compliance-remediator.ts` — paquetes arbitrarios pueden instalarse desde un PolicyFile artesanal | S | Instalación/upgrade de software no autorizado en el entorno Homebrew del usuario | Backend dev |
| 2 | SEG-002 | Inyección de flags brew en `brewfile-manager.ts` — patrón idéntico a SEG-001 vía Brewfile YAML | XS | Instalación de paquetes con flags arbitrarios (`--HEAD`, taps privados) | Backend dev |
| 3 | SEG-003 | PII (email, clave, instanceId) en Unified Log macOS con `privacy: .public` en `LicenseChecker.swift:205,212` | XS | Email y clave de licencia del usuario expuestos en Console.app sin privilegios | iOS/macOS dev |
| 4 | QA-001 | Test `confirm-dialog.test.tsx:44` falla por timeout en locale `es`; `npm run validate` falla — bloquea todo `git push` | XS | Ningún commit puede llegar a remoto sin `--no-verify`; pipeline de release roto | QA lead |
| 5 | BK-001 | `writeLastAction()` no llamado en `search.tsx` (install) ni en `installed.tsx` (uninstall); canal IPC TUI↔BrewBar roto | S | BrewBar muestra datos obsoletos; feature clave del producto dual no funciona | Frontend dev |
| 6 | UI-001 | `account.tsx:87-89` sin rama `team`; usuarios Team ven estado vacío | XS | Tier Team aparece broken para ese segmento de pago | Frontend dev |
| 7 | UI-002 | `account.tsx:36` excluye `team` del deactivate; botón visible pero inoperante para Team | XS | Usuarios Team no pueden desactivar licencia; GDPR / expectativa de usuario rota | Frontend dev |
| 8 | BK-002 | `SyncMonitor.getKnownMachineCount()` siempre retorna 0 por leer fuera del envelope AES-256-GCM | M | Feature multi-dispositivo de BrewBar siempre muestra "0 dispositivos" | iOS/macOS dev |
| 9 | GOV-001 | `CODEOWNERS` apunta a `@MoLinesGitHub` (org legacy); reviews automáticos no asignan reviewer | XS | PRs externos sin revisión automática | Maintainer |
| 10 | GOV-002 | 198 archivos `.playwright-mcp/` trackeados en git; artefactos privados en historial público | S | Historial git contiene sesiones internas; clones incluyen 198 artefactos privados | Maintainer |

---

## Importante pre-1.3 — Planificar en próximas 1-2 iteraciones

Hallazgos que afectan seguridad adicional, deuda técnica con impacto de mantenimiento o UX de features pago. No bloquean el release si los Bloqueantes están resueltos, pero deben entrar en el sprint post-1.2.

| # | ID | Hallazgo | Esfuerzo | Riesgo si no se corrige | Owner sugerido |
|---|-----|----------|----------|------------------------|----------------|
| 1 | ARQ-005 | `DesignExploration/BrewBarDesignVariants.swift` (991 LOC) en binario de producción via glob `Sources/**` | XS | Dead code en binario notariado; engrosamiento de firma | iOS/macOS dev |
| 2 | DS-001 | `BlinkingText` titila siempre a 600 ms sin gate de `NO_COLOR`/`REDUCE_MOTION`; sin motion tokens | S | Usuarios con fotosensibilidad o preferencia reduce-motion no tienen opt-out | Frontend dev |
| 3 | ACC-001 | Ninguna vista de BrewBar consulta `@Environment(\.accessibilityReduceMotion)` | XS | Animaciones futuras ignorarán reduce-motion; regresión de accesibilidad garantizada | iOS/macOS dev |
| 4 | GOV-003 | `homebrew/Formula/brew-tui.rb` y `Casks/brewbar.rb` en repo con versión `0.7.0` (actual: `1.2.1`) | XS | Contribuidores y scripts obtienen versión 9 releases obsoleta | Maintainer |
| 5 | REL-001 | `release.sh` no verifica salud del perfil notary antes de iniciar; fallo tras ~10 min de build | XS | Waste de tiempo de build; release interrumpido tardíamente | Maintainer |
| 6 | SEG-004 | `brew-cli.ts` invoca `spawn('brew', ...)` via PATH heredado sin verificar ruta canónica | M | PATH hijack puede ejecutar un `brew` falso | Backend dev |
| 7 | SEG-005 | 2 vulnerabilidades npm moderadas: `brace-expansion` ReDoS (CVSS 5.3), `ws` memory disclosure (CVSS 5.3) | XS | Supply chain: exploits de CVSS 5.3 en dependencias con fix disponible | Maintainer |
| 8 | SEG-006 | Rate limit de activación de licencia es estado en memoria; reinicio del proceso resetea el lockout | M | Bypass del anti-brute-force con `kill -9` + relanzar proceso | Backend dev |
| 9 | BK-005 | Path traversal en `policy-io.ts` — `loadPolicy()`/`exportReport()` sin sanitización de `..` | S | Lectura/escritura de archivos arbitrarios fuera de `~/.brew-tui/` | Backend dev |
| 10 | ARQ-001 | Clave `legacyEncryptionKey` scrypt activa como fallback en `license-manager.ts`, `sync/crypto.ts` y `LicenseChecker.swift`; TODO marcado desde v0.6.3 | M | Superficie de clave fija conocida en bundle; 9 versiones de mora | Backend dev / iOS dev |
| 11 | BK-004 | Polar 429 no reintentado con backoff `Retry-After`; activaciones fallan en picos | S | Activaciones bloqueadas sin reintento cuando Polar limita por rate | Backend dev |
| 12 | BK-003 | `promo.ts` sin retry en 5xx — canje de código promo descartado en error transitorio | XS | Usuarios pierden acceso a códigos promo por errores de red momentáneos | Backend dev |
| 13 | BK-006 | `ConflictResolution.merge-union` declarado en tipos pero sin implementar; fallos silenciosos | S | Resolución de conflictos de sync ignorada sin error ni feedback | Backend dev |
| 14 | DS-002 | `SettingsView.swift:77` con `.frame(height: 540)` fijo; contenido cortado con Dynamic Type AX1+ | XS | Vista Settings inaccesible para usuarios con fuente grande | iOS/macOS dev |
| 15 | UX-001 | Rollback fase `executing` suprime Esc sin mensaje; parece colgado | XS | Confusión en operación destructiva; UX crítico para una feature de alta visibilidad | Frontend dev |
| 16 | PERF-001 | `services.tsx`, `doctor.tsx`, `outdated.tsx` desestructuran `useBrewStore()` entero sin selector | S | Re-renders innecesarios en vistas activas; parpadeos en terminales lentos | Frontend dev |
| 17 | QA-002 | `data-dir.ts` sin test; canal IPC `writeLastAction()` sin cobertura | S | Fallo silencioso en handoff IPC sin detección en CI | QA lead |
| 18 | QA-003 | 8 stores Pro sin tests unitarios | L | Regresiones en `loading`/`error` de stores Pro sin detección | QA lead |
| 19 | ARQ-004 | `PKG_PATTERN` divergente en `brew-api.ts` vs `profile-manager.ts` — comportamiento inconsistente | XS | Paquetes válidos para brew rechazados en perfiles; bug difícil de diagnosticar | Backend dev |
| 20 | ARQ-006 | `async-state.ts` sin importadores de producción — dead code | XS | Confusión para contribuidores; mantenimiento innecesario | n/a |
| 21 | GOV-004 | `homebrew/macports/brew-tui.tcl` en `0.1.0` con checksums zeros inválidos | XS | Canal MacPorts no funcional | Maintainer |
| 22 | GOV-005 | Tuist no pinado en CI — versión de Tuist indeterminada en `.github/workflows/ci.yml` | XS | CI puede romperse silenciosamente tras un breaking release de Tuist | DevOps |

---

## Backlog deuda técnica — Mejora continua

Hallazgos sin impacto inmediato grave. Entrar en backlog según capacidad.

| # | ID | Hallazgo | Esfuerzo | Riesgo si no se corrige | Owner sugerido |
|---|-----|----------|----------|------------------------|----------------|
| 1 | QA-004 | `icloud-backend.ts` sin tests | M | Fallo silencioso si el path de iCloud cambia en macOS futuro | QA lead |
| 2 | QA-005 | `analytics.ts` con 0 call sites — KPIs del producto inobservables | L | Imposible medir funnels de activación o retención Pro | Product |
| 3 | QA-006 | CLAUDE.md dice "BrewBar: no tests written yet" — realidad: 30 tests con Swift Testing | XS | Documentación incorrecta confunde a contribuidores | Maintainer |
| 4 | REL-002 | Crash reporting no activo en producción (TUI + BrewBar) | L | Regresiones de estabilidad indetectables en usuarios reales | DevOps |
| 5 | REL-003 | `release.sh` no verifica `MARKETING_VERSION` del `.app` vs `package.json` post-archive | XS | Version drift silenciosa en binario distribuido | Maintainer |
| 6 | GOV-006 | `exportOptions.plist` gitignoreado sin plantilla documentada | XS | Onboarding al pipeline de release requiere paso manual no documentado | Maintainer |
| 7 | GOV-007 | Umbrales de cobertura en `vitest.config.ts` sin gate activo en CI | XS | Degradación silenciosa de cobertura sin alertas | QA lead |
| 8 | ARQ-002 | `impactCache` sin TTL temporal — datos stale sin indicación de antigüedad | S | Análisis de impacto potencialmente obsoleto mostrado al usuario | Backend dev |
| 9 | ARQ-003 | `Data(contentsOf:)` síncrono en `@MainActor` en `LastActionMonitor.swift:120` | XS | I/O síncrono en main thread — riesgo bajo por tamaño del archivo | iOS/macOS dev |
| 10 | ARQ-007 | Cross-store coupling en 4 stores Pro — dificulta testing | M | Acoplamiento reduce testabilidad; no impacto funcional inmediato | Backend dev |
| 11 | ARQ-008 | `Task` fire-and-forget sin handle en `AppState.swift:116` — no cancelable | XS | Tarea no cancelable; riesgo bajo | iOS/macOS dev |
| 12 | ARQ-009 | `onSubmit` void en `search.tsx:179` — setState en componente potencialmente desmontado | XS | Warning silencioso de React sin impacto funcional visible | Frontend dev |
| 13 | ARQ-010 | `outdated.tsx` con >10 useState colocalizados | M | Mantenibilidad reducida; sin impacto funcional | Frontend dev |
| 14 | ARQ-011 | `confirm-dialog.tsx` usa `useInput` directo sin comentario explicativo | XS | Riesgo de replicación incorrecta en nuevos componentes | Frontend dev |
| 15 | BK-007 | `mkdir` en `icloud-backend.ts` sin `mode: 0o700` | XS | Directorio de sync con permisos más permisivos de lo necesario | Backend dev |
| 16 | BK-008 | Trailing slash ausente en endpoints Polar en `polar-api.ts:63` | XS | Posible fallo silencioso si Polar cambia comportamiento del redirect | Backend dev |
| 17 | BK-009 | Machine ID enviado en claro a Polar como `label` | XS | Correlación de identidad en logs de terceros | Backend dev |
| 18 | UI-003 | `compliance.tsx` y `sync.tsx` > 300 LOC con fases colocalizadas | M | Mantenibilidad reducida; sin impacto funcional | Frontend dev |
| 19 | UI-004 | `stat-card.tsx` usa `useTerminalSize` en lugar de `useContainerSize` | XS | Dimensionado incorrecto si el componente se reparenta | Frontend dev |
| 20 | UI-005 | `upgrade-prompt.tsx:46` — `width="80%"` hardcodeado fuera de tokens | XS | Incumplimiento menor del design system | Frontend dev |
| 21 | UI-006 | `pro-badge.tsx` sin importadores — dead code | XS | Dead code que confunde a contribuidores | Frontend dev |
| 22 | UI-007 | `history.tsx:114-115` — estado de error sin hint de retry | XS | UX inferior al estándar del producto | Frontend dev |
| 23 | UI-008 | `welcome.tsx:18-20` — `useEffect` vacío no-op | XS | Dead code menor | Frontend dev |
| 24 | UX-002 | `compliance.tsx:80,91` — literales `(errors)` y `(warnings)` en inglés sin `t()` | XS | Inconsistencia de localización en vista Compliance | Frontend dev |
| 25 | UX-003 | Perfiles creados/editados sin `ResultBanner` de éxito | XS | Confusión UX — el usuario puede creer que el guardado falló | Frontend dev |
| 26 | UX-004 | `sync.tsx:246-250` — Enter silencioso cuando quedan conflictos pendientes | XS | Usuario no sabe cuántos conflictos quedan | Frontend dev |
| 27 | UX-005 | `upgrade-prompt.tsx` sin atajo a AccountView | XS | Fricción en el camino de conversión Free→Pro | Frontend dev |
| 28 | UX-006 | BrewBar — `.destructive` role en "Upgrade All" (acción no destructiva) | XS | Señal visual incorrecta para VoiceOver y usuario visual | iOS/macOS dev |
| 29 | DS-003 | `dashboard.tsx:161` — `columns < 60` magic number fuera de `BREAKPOINTS` | XS | Punto de ruptura no documentado | Frontend dev |
| 30 | DS-004 | `section-header.tsx` — emoji sin fallback ASCII para terminales sin UTF-8 | XS | Caracteres rotos en terminales antiguas o SSH básico | Frontend dev |
| 31 | ACC-002 | `OutdatedListView` (BrewBar) sin `.accessibilityAction` alternativa para upgrade individual | XS | Upgrade individual inaccesible solo con VoiceOver | iOS/macOS dev |
| 32 | ACC-003 | `PrivacyInfo.xcprivacy` sin razones de filesystem (`C617.1`, `E174.1`) | S | Posible rechazo en futuras revisiones de Apple Submission | iOS/macOS dev |

---

## Mapa de calor por dominio

| Dominio | Crítica | Alta | Media | Baja | Total | Estado general |
|---------|---------|------|-------|------|-------|----------------|
| Seguridad | 1 | 2 | 3 | 0 | 6 | Crítico |
| Testing / QA | 0 | 1 | 4 | 1 | 6 | Preocupante |
| Arquitectura | 0 | 1 | 4 | 6 | 11 | Preocupante |
| Backend | 0 | 2 | 5 | 3 | 10 | Preocupante |
| Gobierno | 0 | 3 | 2 | 2 | 7 | Preocupante |
| UI | 0 | 2 | 0 | 6 | 8 | Preocupante |
| Design system | 0 | 1 | 1 | 2 | 4 | Preocupante |
| Accesibilidad | 0 | 1 | 0 | 2 | 3 | Preocupante |
| UX | 0 | 0 | 1 | 5 | 6 | Aceptable |
| Performance | 0 | 0 | 1 | 0 | 1 | Aceptable |
| Release | 0 | 1 | 1 | 2 | 4 | Preocupante |

**Criterio estado general:** Crítico = algún hallazgo Crítico · Preocupante = ningún Crítico pero hallazgo(s) Alto(s) o múltiples Medios · Aceptable = predominan Media/Baja · Bueno = sin hallazgos o solo Baja.
