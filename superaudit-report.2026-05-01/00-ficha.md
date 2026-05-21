# 0. Ficha de auditoria

> Auditor: project-scanner | Fecha: 2026-05-01

## Datos del proyecto

* **Nombre del proyecto:** Brew-TUI + BrewBar
* **Version actual:** 0.6.1 (npm / GitHub Release / BrewBar). Nota: la formula Homebrew tap (`homebrew/Formula/brew-tui.rb`) todavia apunta a 0.5.3 — desincronizacion documentada, pendiente de auditoria de release.
* **Plataformas:** macOS (CLI via Node.js, TUI en terminal) + macOS 14+ (BrewBar, app nativa en menu bar)
* **Stack principal:**
  * TUI: TypeScript 6, React 19, Ink 7 (terminal renderer), Zustand 5 — ESM-only, Node ≥ 22
  * BrewBar: Swift 6, SwiftUI + AppKit, macOS 14+ (Sonoma+), Observation (`@Observable`), async/await estricto, Swift strict concurrency
  * Build TUI: tsup 8 + tsx 4, vitest 4, ESLint 10
  * Build BrewBar: Tuist (Project.swift + Tuist.swift), xcodebuild
  * CI/CD: GitHub Actions (ubuntu-latest, Node 22), Husky pre-push
  * Licencias: Polar API (SaaS), AES-256-GCM para license.json en disco
  * Seguridad CVE: OSV.dev API (batch endpoint)
  * Sync: iCloud Drive con AES-256-GCM
* **Repositorio:** https://github.com/MoLinesDesigns/Brew-TUI.git (origin git remote) / https://github.com/MoLinesGitHub/Brew-TUI (referenciado en package.json, README y formula). Desincronizacion de usuario de GitHub documentada para auditoria de gobierno.
* **Commit auditado:** 72b6d84 (chore: release v0.6.1)
* **Rama auditada:** main
* **Fecha de auditoria:** 2026-05-01
* **Auditor responsable:** super-audit (project-scanner automatizado)
* **Entorno auditado:** Release (build de produccion). Configuraciones detectadas: Debug / Release (BrewBar via Tuist); NODE_ENV=production (tsup); test mode via `__TEST_MODE__` compile-time flag.

## Objetivo de la auditoria

* **Objetivo principal:** Auditoria exhaustiva 100% del proyecto — ambos codebases (TypeScript TUI y Swift BrewBar), modelo freemium/licencias, seguridad, calidad de tests, arquitectura, UX, i18n y release readiness.
* **Riesgo principal del producto:** Proyecto con modelo de negocio freemium activo (Polar API) y cifrado de licencias en disco con constantes hardcodeadas en el bundle npm. El riesgo critico reside en la elusibilidad del sistema de licencias y en bugs silenciosos en la cadena de integracion TUI-BrewBar (ya manifestado en v0.6.0 con el decoder JSON de paquetes outdated).
* **Areas prioritarias:** Seguridad y licencias (13), Arquitectura (3/4), Testing (14), Release readiness (18), Backend funcional — Polar/OSV APIs (11/20).
* **Alcance excluido:** Ninguno (auditoria completa). El backend de promo codes (`api.molinesdesigns.com`) es un servicio externo no incluido en este repositorio; se auditara como endpoint en seccion 20.

## Escala de severidad

* **Critica:** riesgo de caida, fuga de datos, perdida de negocio o bloqueo de uso
* **Alta:** afecta flujos clave, calidad percibida o mantenibilidad severamente
* **Media:** afecta consistencia, deuda tecnica o UX de forma relevante
* **Baja:** mejora recomendable sin impacto grave inmediato

## Estado por hallazgo

* Pendiente
* Revisado
* Conforme
* No conforme
* Parcial
* Bloqueado
* No aplica
