# 23. Veredicto final

> Auditor: report-consolidator | Fecha: 2026-05-21 | Versión auditada: 1.2.1 | Commit: 3e15a94

## Estado general del proyecto

Brew-TUI 1.2.1 es un producto con una arquitectura sólida, convenciones bien establecidas y una cobertura de tests razonable para el módulo de licencias. Sin embargo, presenta **1 hallazgo Crítico activo** (inyección de flags en compliance-remediator) y **14 Altos**, de los cuales 3 afectan directamente a seguridad/privacidad, 1 bloquea el pipeline de release y 2 rompen funcionalidades facturadas del tier Team. El estado actual no es apto para publicación sin resolver los bloqueantes listados.

| Área | Estado | Justificación |
|------|--------|---------------|
| Frontend (TUI) | Preocupante | Canal IPC roto, tier Team con funcionalidad rota, test suite fallando |
| Backend / persistencia | Preocupante | Dos rutas de inyección, path traversal, merge-union sin implementar, SyncMonitor siempre en 0 |
| UI / UX | Aceptable | Problemas de consistencia y localización; nada funcional crítico más allá del IPC y el tier Team |
| Arquitectura | Preocupante | Dead code en binario notariado, clave legacy 9 versiones de mora, PKG_PATTERN divergente |
| Seguridad | Crítico | Inyección activa (SEG-001) + PII en Unified Log + path traversal |
| Rendimiento | Aceptable | Un hallazgo medio de selectores; resto bajos |
| Accesibilidad | Preocupante | BlinkingText sin reduce-motion, BrewBar sin gate de accessibilityReduceMotion |

---

## Top 3 fortalezas

1. **Sistema de licencias robusto.** AES-256-GCM con HKDF-SHA256, machine-binding, rate limiting, canary functions y verificación de integridad del bundle. La cobertura de tests en `license-manager.test.ts` es extensa y cubre degradación, round-trip AES, rate limiting y built-in accounts.

2. **Arquitectura TUI bien estructurada.** La separación `brew-cli → parsers → brew-api → stores → views` está limpia. El patrón `useViewInput` para suprimir input durante el menu mode es correcto y está documentado. El design system de colores y spacing mediante tokens (`COLORS`, `BREAKPOINTS`) es coherente.

3. **i18n completo desde el día uno.** Cobertura 100 %: 479 claves en TUI (en+es, compilación tipada) y 109 strings en BrewBar con String Catalog. El `tp()` para plurales y el `t()` con interpolación evitan el antipatrón de concatenación de strings.

---

## Top 3 riesgos para producción

1. **Inyección de argumentos brew (SEG-001 + SEG-002).** Un PolicyFile JSON o Brewfile YAML artesanal puede instalar o actualizar paquetes arbitrarios con flags no auditados. El path de explotación requiere que el usuario abra un archivo de un tercero, pero es un vector real y la corrección es trivial (añadir `validatePackageName()` antes del spawn). Afecta a features de pago (Compliance, Brewfile).

2. **Pipeline de release bloqueado (QA-001).** El pre-push hook ejecuta `npm run validate`, que incluye la suite de tests. El test `confirm-dialog.test.tsx:44` falla por timeout con locale `es`. Ningún commit puede llegar al remoto sin `--no-verify`, lo que invalida el pre-push gate como mecanismo de calidad y obliga a un bypass manual en cada push.

3. **PII en Unified Log macOS (SEG-003).** `LicenseChecker.swift:205,212` registra email, clave de licencia e instanceId con `privacy: .public`. Cualquier proceso con permisos de log en el sistema — incluidas apps de terceros — puede leer estos datos desde Console.app sin privilegios adicionales.

---

## Recomendación

- [ ] Apto para continuar desarrollo sin restricciones
- [ ] Apto para beta interna
- [ ] Apto para TestFlight / staging
- [x] **NO apto para producción sin correcciones previas**

El proyecto tiene una base de calidad sólida, pero la combinación de un hallazgo Crítico activo (inyección de flags), dos rutas adicionales de inyección, PII expuesto en el Unified Log y un pipeline de release bloqueado por tests en rojo hace imposible un release con garantías. Las correcciones de los 4 hallazgos de mayor urgencia (SEG-001, SEG-002, SEG-003, QA-001) son todas de esfuerzo XS-S y deberían completarse en menos de un día de trabajo.

---

## Acciones inmediatas (≤ 7 días)

1. **[SEG-001 · Crítico]** Añadir `validatePackageName(v.packageName)` antes de cada `streamBrew` en `src/lib/compliance/compliance-remediator.ts:18,29`. Rechazar el PolicyFile en `isValidPolicy()` si algún packageName no supera la validación.

2. **[SEG-002 · Alta]** Añadir `validatePackageName(name)` antes del spawn en `brewfile-manager.ts applyDrift()`. Misma corrección que SEG-001, archivo distinto.

3. **[SEG-003 · Alta]** Cambiar las anotaciones `privacy: .public` de `LicenseChecker.swift:205,212` a `privacy: .private`, o implementar `CustomStringConvertible` en `LicenseStatus`/`LicenseData` con redacción de campos sensibles.

4. **[QA-001 · Alta]** Corregir el timeout en `confirm-dialog.test.tsx:44`: añadir `await new Promise(r => setImmediate(r))` entre el setState del locale y el `stdin.write('s')` para que el render procese el cambio antes de emitir la tecla.

5. **[BK-001 · Alta]** Añadir `writeLastAction({ action: 'install', ... })` en el `.then()` del stream en `src/views/search.tsx` y `writeLastAction({ action: 'uninstall', ... })` en `src/views/installed.tsx:212`.

6. **[UI-001 + UI-002 · Alta]** En `src/views/account.tsx:87-89`: añadir rama `else if (status === 'team')` con label `[Team]`. En `account.tsx:36`: cambiar condición a `(status === 'pro' || status === 'team')` para habilitar deactivate.

7. **[GOV-002 · Alta]** Ejecutar `git rm -r --cached .playwright-mcp/` y hacer commit. La regla `.gitignore:34` ya existe; solo falta eliminar los archivos del índice.

---

## Acciones cortas (1–2 sprints)

1. **[ARQ-005]** Mover `menubar/BrewBar/Sources/DesignExploration/` fuera del glob `Sources/**` en `Project.swift` o añadir exclusión explícita.

2. **[DS-001 + ACC-001]** Añadir gate de `NO_COLOR`/`REDUCE_MOTION` en `BlinkingText` (TUI) y patrón `@Environment(\.accessibilityReduceMotion)` en `PopoverView` (BrewBar).

3. **[BK-005]** Restringir `loadPolicy()` y `exportReport()` en `policy-io.ts` a rutas dentro de `~/.brew-tui/` usando `path.resolve` + guard contra `..`.

4. **[GOV-001 + GOV-003]** Actualizar `.github/CODEOWNERS` a `@MoLinesDesigns`. Eliminar o actualizar `homebrew/Formula/brew-tui.rb` y `homebrew/Casks/brewbar.rb` (versión `0.7.0` vs `1.2.1` actual).

5. **[REL-001]** Añadir preflight en `release.sh`: `xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" --limit 1 > /dev/null || exit 1` al inicio del script.

6. **[SEG-005]** Ejecutar `npm audit fix` y añadir `npm audit --audit-level=moderate` al gate de CI para `brace-expansion` y `ws`.

7. **[ARQ-001]** Verificar telemetría de zero fallback decrypts; eliminar rama `legacyEncryptionKey` scrypt en `license-manager.ts`, `sync/crypto.ts` y `LicenseChecker.swift:159-163`.

8. **[BK-004 + BK-003]** Añadir `status === 429` a `retryOn` en `fetchWithRetry` con backoff `Retry-After`-aware. Sustituir `fetchWithTimeout` por `fetchWithRetry` en `promo.ts`.

9. **[QA-002 + QA-003]** Añadir test unitario para `data-dir.ts` que valide atomicidad de `writeLastAction`. Añadir tests de transiciones `loading`/`error` para los 8 stores Pro.

10. **[BK-002]** Exponer `machineCount` en el plaintext del envelope JSON al escribirlo desde TypeScript, o eliminar `getKnownMachineCount()` de `SyncMonitor.swift` hasta que el dato sea accesible sin descifrar.

---

# 24. Checklist ultra resumido

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
| Pantallas | Parcial | — | writeLastAction en install/uninstall (BK-001) |
| Endpoints | Parcial | — | Retry Polar 429 (BK-004); retry promo 5xx (BK-003) |
