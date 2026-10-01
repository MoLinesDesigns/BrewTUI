#!/usr/bin/env bash
# brewpublish — release completa de BrewTUI-Bar (app + CLI) en los seis sitios
# que llevan la versión: los dos package.json, el tag, la GitHub Release con la
# app notarizada, npm y el tap (cask + formula).
#
#   brewpublish X.Y.Z [--notes-file FICHERO] [-y]
#   brewpublish --status
#
# Pasos (orden de docs/lessons-learned.md § Publicación):
#   1. version:set + commit + tag + push en los dos repos
#   2. scripts/release.sh de la app: firma, notariza y empaqueta (~10 min)
#   3. GitHub Release vX.Y.Z en MoLinesDesigns/BrewTUI-Bar con .zip + .sha256
#   4. npm publish del CLI (2FA web: lanzar desde una terminal nativa, dentro
#      de Claude Code la URL sale censurada)
#   5. tap: version:sync-tap + brew style + commit + push
#   6. version:status: los seis puntos en X.Y.Z
#
# Cada paso comprueba si ya está hecho y se lo salta: tras un fallo
# (notarización, 2FA, push) basta con relanzar el mismo comando.
#
# Sin --notes-file, la GitHub Release usa --generate-notes.
# Rutas sobrescribibles: BREWTUI_CLI_PATH, BREWTUI_APP_PATH, BREWTUI_TAP_PATH.

set -euo pipefail

CLI_DIR="${BREWTUI_CLI_PATH:-/Volumes/SSD/Projects/BrewTUI-Bar}"
APP_DIR="${BREWTUI_APP_PATH:-/Volumes/SSD/xCode_Projects/BrewTUI-Bar}"
TAP_DIR="${BREWTUI_TAP_PATH:-/opt/homebrew/Library/Taps/molinesdesigns/homebrew-tap}"
# version-sync.mjs lee estas dos para encontrar el CLI y el tap.
export BREWTUI_CLI_PATH="$CLI_DIR" BREWTUI_TAP_PATH="$TAP_DIR"
export NOTARY_PROFILE="${NOTARY_PROFILE:-brewbar-notary}"

APP_REPO="MoLinesDesigns/BrewTUI-Bar"
PKG="brewtui-bar"
ZIP="${APP_DIR}/build/BrewTUI-Bar.app.zip"
CASK="Casks/brewtui-bar.rb"
FORMULA="Formula/brewtui-bar.rb"

if [[ -t 1 ]]; then
  B=$'\e[1m' G=$'\e[32m' Y=$'\e[33m' R=$'\e[31m' D=$'\e[2m' N=$'\e[0m'
else
  B='' G='' Y='' R='' D='' N=''
fi

step() { printf '\n%s▶ %s%s\n' "$B" "$1" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$1"; }
skip() { printf '  %s↷ %s%s\n' "$D" "$1" "$N"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$1"; }
die()  { printf '\n  %s✘ %s%s\n\n' "$R" "$1" "$N" >&2; exit 1; }

usage() {
  cat <<'EOF'
Uso: brewpublish X.Y.Z [--notes-file FICHERO] [-y]
     brewpublish --status

  X.Y.Z          versión a publicar (app y CLI van siempre juntas)
  --notes-file   notas de la GitHub Release (sin él: --generate-notes)
  -y, --yes      no pedir confirmación
  --status       solo informa de los seis puntos de versión

Relanzar el mismo comando continúa desde el primer paso pendiente.
EOF
  exit "${1:-0}"
}

# ── Argumentos ────────────────────────────────────────────────────────────────
VERSION=''
NOTES_FILE=''
ASSUME_YES=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)     ASSUME_YES=true ;;
    --notes-file) [[ $# -ge 2 ]] || die '--notes-file necesita un fichero'; NOTES_FILE="$2"; shift ;;
    --status)     cd "$APP_DIR" && exec node scripts/version-sync.mjs status ;;
    -h|--help)    usage 0 ;;
    -*)           die "Opción desconocida: $1" ;;
    *)            [[ -z "$VERSION" ]] || die "Sobra el argumento: $1"; VERSION="$1" ;;
  esac
  shift
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage 1
TAG="v${VERSION}"
if [[ -n "$NOTES_FILE" ]]; then
  [[ -f "$NOTES_FILE" ]] || die "No existe el fichero de notas: $NOTES_FILE"
  NOTES_FILE="$(cd "$(dirname "$NOTES_FILE")" && pwd)/$(basename "$NOTES_FILE")"
fi

# ── Estado ────────────────────────────────────────────────────────────────────
pkg_version()     { node -p "require('$1/package.json').version"; }
cask_version()    { sed -nE 's/^[[:space:]]*version "([^"]+)".*/\1/p' "$TAP_DIR/$CASK" | head -1; }
formula_version() { sed -nE "s/.*${PKG}-([0-9]+\.[0-9]+\.[0-9]+)\.tgz.*/\1/p" "$TAP_DIR/$FORMULA" | head -1; }
tarball_url()     { echo "https://registry.npmjs.org/${PKG}/-/${PKG}-$1.tgz"; }
# El registro procesa las publicaciones de forma asíncrona: cuenta como
# publicada cuando el tarball se descarga, no cuando `npm publish` termina.
npm_published()   { curl -sfI "$(tarball_url "$1")" >/dev/null; }
zip_version() {
  [[ -f "$ZIP" ]] || return 0
  unzip -p "$ZIP" 'BrewTUI-Bar.app/Contents/Info.plist' 2>/dev/null \
    | plutil -extract CFBundleShortVersionString raw -o - - 2>/dev/null || true
}
release_assets() { gh release view "$TAG" -R "$APP_REPO" --json assets --jq '.assets[].name' 2>/dev/null || true; }
release_has_assets() {
  local assets
  assets="$(release_assets)"
  grep -qx 'BrewTUI-Bar.app.zip' <<<"$assets" && grep -qx 'BrewTUI-Bar.app.zip.sha256' <<<"$assets"
}
semver_gt() {
  node -e 'const [a, b] = process.argv.slice(1).map(v => v.split(".").map(Number));
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) process.exit(a[i] > b[i] ? 0 : 1);
    process.exit(1);' "$1" "$2"
}
# Ficheros con cambios sin commitear, quitando los que la release toca a propósito.
dirty_except() {
  local dir="$1"; shift
  local status allowed
  status="$(git -C "$dir" status --porcelain)"
  for allowed in "$@"; do
    status="$(grep -vxF " M ${allowed}" <<<"$status" || true)"
  done
  printf '%s' "$status"
}
ahead_of_origin() { [[ "$(git -C "$1" rev-list --count origin/main..HEAD)" != 0 ]]; }
remote_has_tag()  { git -C "$1" ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; }

# ── Comprobaciones previas ────────────────────────────────────────────────────
step "Comprobaciones previas · ${PKG} ${VERSION}"

for cmd in git gh npm node curl unzip plutil xcrun tuist brew; do
  command -v "$cmd" >/dev/null || die "Falta '$cmd' en el PATH"
done
for dir in "$CLI_DIR" "$APP_DIR" "$TAP_DIR"; do
  [[ -d "$dir/.git" ]] || die "No es un repo git: $dir"
done

# El tap legacy resuelve al mismo repo y rompe cada install con
# "Formulae found in multiple taps" (docs/lessons-learned.md).
[[ "$(brew tap)" != *molinesgithub/* ]] || die 'Está el tap legacy: brew untap molinesgithub/tap'

for pair in "CLI:$CLI_DIR" "app:$APP_DIR" "tap:$TAP_DIR"; do
  label="${pair%%:*}" dir="${pair#*:}"
  branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD)"
  [[ "$branch" == main ]] || die "$label: estás en '$branch', no en main"
  git -C "$dir" fetch -q origin main --tags || die "$label: git fetch falló"
  [[ "$(git -C "$dir" rev-list --count HEAD..origin/main)" == 0 ]] \
    || die "$label: va por detrás de origin/main (git -C $dir pull)"
done

# El CLI se publica tal cual está en disco: nada sin commitear salvo el propio
# bump de versión (si un intento anterior se cortó entre version:set y commit).
dirty="$(dirty_except "$CLI_DIR" package.json package-lock.json)"
[[ -z "$dirty" ]] || die "CLI: cambios sin commitear:"$'\n'"$dirty"
if ! git -C "$CLI_DIR" diff --quiet HEAD -- package.json && [[ "$(pkg_version "$CLI_DIR")" != "$VERSION" ]]; then
  die 'CLI: package.json modificado con otra versión'
fi
# En la app solo importa package.json: tuist generate deja cambios en el
# .pbxproj en cada release y el commit de versión no los incluye.
if ! git -C "$APP_DIR" diff --quiet HEAD -- package.json && [[ "$(pkg_version "$APP_DIR")" != "$VERSION" ]]; then
  die 'app: package.json modificado con otra versión'
fi
if ! git -C "$TAP_DIR" diff --quiet HEAD -- "$CASK" "$FORMULA" \
   && [[ "$(cask_version)" != "$VERSION" || "$(formula_version)" != "$VERSION" ]]; then
  die "tap: $CASK / $FORMULA modificados con otra versión"
fi

gh auth status >/dev/null 2>&1 || die 'gh sin sesión: gh auth login'
npm whoami >/dev/null 2>&1 || die 'npm sin sesión: npm login'

if ! npm_published "$VERSION"; then
  latest="$(npm view "$PKG" version 2>/dev/null || echo 0.0.0)"
  semver_gt "$VERSION" "$latest" || die "${VERSION} no es mayor que la publicada en npm (${latest})"
fi
ok 'herramientas, ramas, árboles y sesiones de gh y npm'

# ── Plan ──────────────────────────────────────────────────────────────────────
mark() { if "$@"; then printf '%shecho%s' "$D" "$N"; else printf '%spendiente%s' "$Y" "$N"; fi; }
versions_set()  { [[ "$(pkg_version "$APP_DIR")" == "$VERSION" && "$(pkg_version "$CLI_DIR")" == "$VERSION" ]] \
                  && remote_has_tag "$APP_DIR" && remote_has_tag "$CLI_DIR"; }
app_built()     { release_has_assets || [[ "$(zip_version)" == "$VERSION" ]]; }
tap_synced()    { [[ "$(cask_version)" == "$VERSION" && "$(formula_version)" == "$VERSION" ]] && ! ahead_of_origin "$TAP_DIR"; }

printf '\n'
printf '  1. versión + tag + push      %s\n' "$(mark versions_set)"
printf '  2. app notarizada            %s\n' "$(mark app_built)"
printf '  3. GitHub Release %-10s %s\n' "$TAG" "$(mark release_has_assets)"
printf '  4. npm publish               %s\n' "$(mark npm_published "$VERSION")"
printf '  5. tap (cask + formula)      %s\n' "$(mark tap_synced)"

if [[ "$ASSUME_YES" != true ]]; then
  [[ -t 0 ]] || die 'Sin TTY no se puede confirmar: usa -y'
  printf '\n'
  read -r -p "  ¿Publicar ${PKG} ${VERSION}? [s/N] " answer
  [[ "$answer" =~ ^[sSyY] ]] || { printf '  Cancelado.\n'; exit 0; }
fi

# ── 1. Versión, commit, tag y push ────────────────────────────────────────────
step "1/6 · ${VERSION} en los dos repos"

if [[ "$(pkg_version "$APP_DIR")" != "$VERSION" || "$(pkg_version "$CLI_DIR")" != "$VERSION" ]]; then
  (cd "$APP_DIR" && node scripts/version-sync.mjs set "$VERSION" >/dev/null)
  # version:set solo toca package.json; sin esto el lockfile se queda con la
  # versión anterior en su raíz.
  (cd "$CLI_DIR" && npm install --package-lock-only --ignore-scripts --no-audit --no-fund >/dev/null)
  ok "package.json de app y CLI + package-lock.json → ${VERSION}"
else
  skip "package.json ya en ${VERSION}"
fi

release_commit() {
  local dir="$1" label="$2"; shift 2
  if git -C "$dir" diff --quiet HEAD -- "$@"; then
    skip "$label: commit de versión ya hecho"
  else
    git -C "$dir" commit -q --only "$@" -m "chore(release): ${VERSION}"
    ok "$label: commit chore(release): ${VERSION}"
  fi
  if git -C "$dir" rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
    # No se exige que apunte a HEAD: tras la release puede haber commits
    # encima. Lo que importa es que el tag lleve la versión.
    [[ "$(git -C "$dir" show "${TAG}:package.json" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version')" == "$VERSION" ]] \
      || die "$label: el tag ${TAG} ya existe y su package.json no es ${VERSION}"
    skip "$label: tag ${TAG} ya creado"
  else
    git -C "$dir" tag "$TAG"
    ok "$label: tag ${TAG}"
  fi
  if ahead_of_origin "$dir" || ! remote_has_tag "$dir"; then
    [[ "$label" == CLI ]] && warn 'el pre-push del CLI ejecuta npm run validate (~1 min)'
    git -C "$dir" push -q origin main "$TAG" || die "$label: push falló"
    ok "$label: push de main + ${TAG}"
  else
    skip "$label: main y ${TAG} ya en origin"
  fi
}
release_commit "$APP_DIR" app package.json
release_commit "$CLI_DIR" CLI package.json package-lock.json

# ── 2. App firmada y notarizada ───────────────────────────────────────────────
step '2/6 · App firmada, notarizada y empaquetada'

if release_has_assets; then
  skip "los assets ya están en la GitHub Release ${TAG}"
elif [[ "$(zip_version)" == "$VERSION" ]]; then
  skip "build/BrewTUI-Bar.app.zip ya es ${VERSION}"
else
  warn 'release.sh tarda ~10 min (archive + notarización de Apple)'
  (cd "$APP_DIR" && bash scripts/release.sh) || die 'release.sh falló'
  [[ "$(zip_version)" == "$VERSION" ]] || die "el zip generado no lleva ${VERSION} (¿falta tuist clean?)"
  ok "BrewTUI-Bar.app.zip ${VERSION} notarizado"
fi

# ── 3. GitHub Release ─────────────────────────────────────────────────────────
step "3/6 · GitHub Release ${TAG} en ${APP_REPO}"

if release_has_assets; then
  skip "${TAG} ya tiene BrewTUI-Bar.app.zip y .sha256"
elif gh release view "$TAG" -R "$APP_REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" -R "$APP_REPO" --clobber "$ZIP" "${ZIP}.sha256"
  ok "assets subidos a la release ${TAG} existente"
else
  if [[ -n "$NOTES_FILE" ]]; then
    gh release create "$TAG" -R "$APP_REPO" --verify-tag --title "$TAG" --notes-file "$NOTES_FILE" "$ZIP" "${ZIP}.sha256" >/dev/null
  else
    gh release create "$TAG" -R "$APP_REPO" --verify-tag --title "$TAG" --generate-notes "$ZIP" "${ZIP}.sha256" >/dev/null
  fi
  ok "https://github.com/${APP_REPO}/releases/tag/${TAG}"
fi

# ── 4. npm publish ────────────────────────────────────────────────────────────
step "4/6 · npm publish ${PKG}@${VERSION}"

if npm_published "$VERSION"; then
  skip "${PKG}@${VERSION} ya está en el registro"
else
  [[ "$(git -C "$CLI_DIR" rev-parse HEAD)" == "$(git -C "$CLI_DIR" rev-parse "${TAG}^{commit}")" ]] \
    || die "CLI: HEAD no está en ${TAG}; se publicaría otro código"
  [[ -z "$(git -C "$CLI_DIR" status --porcelain)" ]] || die 'CLI: árbol sucio justo antes de publicar'
  warn 'npm pedirá la 2FA en el navegador (passkey / Touch ID)'
  if ! (cd "$CLI_DIR" && npm publish); then
    # Un publish aceptado que el registro aún está procesando no se ve en
    # `npm view`, pero un segundo publish lo rechaza: eso no es un fallo.
    # shellcheck disable=SC2012  # los logs de npm se nombran por timestamp ISO
    log="$(ls -t "$(npm config get cache)"/_logs/*-debug-0.log 2>/dev/null | head -1 || true)"
    if [[ -n "$log" ]] && grep -qi 'cannot publish over the previously published' "$log"; then
      warn "npm ya tiene ${VERSION} (un publish anterior sigue en proceso)"
    else
      die "npm publish falló. Relanza 'brewpublish ${VERSION}' para seguir desde aquí."
    fi
  fi
  # El paso 6 mira dist-tags.latest: se espera a que también se haya movido.
  printf '  %s… esperando a que el registro procese la publicación%s' "$D" "$N"
  for _ in $(seq 1 90); do
    npm_published "$VERSION" && [[ "$(npm view "$PKG" dist-tags.latest 2>/dev/null)" == "$VERSION" ]] && break
    printf '.'
    sleep 10
  done
  printf '\n'
  npm_published "$VERSION" \
    || die "el registro no sirve ${VERSION} tras 15 min. Relanza 'brewpublish ${VERSION}' más tarde."
  ok "${PKG}@${VERSION} publicado"
fi

# ── 5. Tap ────────────────────────────────────────────────────────────────────
step '5/6 · Tap molinesdesigns/tap (cask + formula)'

if [[ "$(cask_version)" != "$VERSION" || "$(formula_version)" != "$VERSION" ]]; then
  # sync-tap calcula los sha256 sobre los artefactos ya publicados.
  (cd "$APP_DIR" && node scripts/version-sync.mjs sync-tap >/dev/null) || die 'version:sync-tap falló'
  ok "cask y formula → ${VERSION} con los sha256 publicados"
else
  skip "cask y formula ya en ${VERSION}"
fi
if ! git -C "$TAP_DIR" diff --quiet HEAD -- "$CASK" "$FORMULA"; then
  # Sin --fix: reordena las stanzas del cask (docs/lessons-learned.md).
  (cd "$TAP_DIR" && brew style "$CASK" "$FORMULA" >/dev/null) \
    || die "brew style falla en el tap: revísalo a mano en $TAP_DIR"
  git -C "$TAP_DIR" commit -q --only "$CASK" "$FORMULA" -m "${PKG} ${VERSION}"
  ok "tap: commit ${PKG} ${VERSION}"
fi
if ahead_of_origin "$TAP_DIR"; then
  git -C "$TAP_DIR" push -q origin main || die 'tap: push falló'
  ok 'tap: push'
else
  skip 'tap: ya en origin'
fi

# ── 6. Comprobación final ─────────────────────────────────────────────────────
step '6/6 · Los seis puntos de versión'
(cd "$APP_DIR" && node scripts/version-sync.mjs status) || die 'version:status no cuadra'

printf '\n  %s✔ %s %s publicado en todos los canales.%s\n\n' "$G$B" "$PKG" "$VERSION" "$N"
