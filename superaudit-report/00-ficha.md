# 0. Ficha de auditoria

> Auditor: project-scanner | Fecha: 2026-05-21

## Datos del proyecto

* **Nombre del proyecto:** BrewTUI-Bar + BrewBar
* **Version actual:** 1.2.1 (fuente de verdad: `package.json`; BrewBar lee la misma version via `Project.swift → readMarketingVersion()`)
* **Plataformas:** CLI macOS (Node ≥22, terminal TUI) + App macOS menubar (Swift 6, macOS 14+)
* **Stack principal:**
  * TUI: TypeScript strict, React 19.2.5, Ink 7.0.1, Zustand 5.0.12, ESM-only, tsup, Vitest
  * BrewBar: Swift 6, SwiftUI, macOS 14+, Tuist, `SWIFT_STRICT_CONCURRENCY=complete`
  * Ambos llaman `brew` directamente; IPC via `~/.brewtui-bar/last-action.json` (atomic write + `DispatchSourceFileSystemObject`)
* **Repositorio:** `https://github.com/MoLinesDesigns/BrewTUI-Bar.git`
* **Commit auditado:** `3e15a94`
* **Fecha de auditoria:** 2026-05-21
* **Auditor responsable:** super-audit (automated, project-scanner)
* **Entorno auditado:** Debug (rama `main`); configuraciones `Debug` y `Release` definidas en `Project.swift`

## Objetivo de la auditoria

* **Objetivo principal:** Auditoria exhaustiva 100% del proyecto — TUI TypeScript y companion app Swift
* **Riesgo principal del producto:** Producto freemium con licencia AES-256-GCM machine-bound almacenada en `~/.brewtui-bar/license.json`; fallo en validacion, fuga de clave derivada del bundle o corrupcion del archivo puede bloquear usuarios Pro o exponer el mecanismo de activacion
* **Areas prioritarias:** Seguridad y privacidad (licencia, cifrado, canaries), calidad y cobertura de tests, gobierno del repo (bloat trackeado), arquitectura y limites de modulos, IPC TUI↔BrewBar
* **Alcance excluido:** Ninguno (auditoria completa)

## Nota de procedencia

Tres secciones (`10-performance.md`, `12-screens.md`, `13-endpoints.md`) fueron redactadas por el orquestador con verificacion directa (Read/Grep), no por sus agentes especializados (`super-audit:performance-auditor`, `screen-auditor`, `endpoint-auditor`). Causa: el plugin `super-audit` registra el campo `Tools` de esos tres agentes en formato JSON-string (`["Read", ...]`) en lugar de lista plana, lo que les deja sin herramientas de lectura en runtime. Los reportes resultantes son verificados — no inferidos — pero conviene corregir el plugin para uniformizar el flujo en futuras auditorias. Bug pendiente.

Una verificacion adicional post-consolidacion confirmo que SEG-001 del baseline (tokens npm en `.claude/settings.local.json`) **sigue activo** con 4 tokens explotables en lineas 56, 58, 140, 242. El delta (`99-delta-2026-05-01.md`) refleja esa correccion.

## Escala de severidad

* **Critica**: riesgo de caida, fuga de datos, perdida de negocio o bloqueo de uso
* **Alta**: afecta flujos clave, calidad percibida o mantenibilidad severamente
* **Media**: afecta consistencia, deuda tecnica o UX de forma relevante
* **Baja**: mejora recomendable sin impacto grave inmediato

## Estado por hallazgo

* Pendiente
* Revisado
* Conforme
* No conforme
* Parcial
* Bloqueado
* No aplica

---

## Nota sobre version de stack

El contexto del encargo menciona "Ink 5.x" y "React 18". Los valores reales en `package.json` / `package-lock.json` son `ink` 7.0.1 y `react` 19.2.5. El `CLAUDE.md` del proyecto no ha sido actualizado para reflejar estas versiones. Este delta se registra aqui para que el auditor de gobierno lo evalue en la seccion 2.
