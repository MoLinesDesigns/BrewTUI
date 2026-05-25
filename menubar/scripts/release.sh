#!/usr/bin/env bash
# Brew-TUI-Bar release pipeline — sign, archive, export and notarize.
#
# Status: SCAFFOLD. Fill in the credentials section before first use; the
# notarytool calls below intentionally fail loudly if NOTARY_PROFILE is
# empty, so this never silently ships an unsigned build to users.
#
# One-time setup (per maintainer machine):
#
#   xcrun notarytool store-credentials brewbar-notary \
#     --apple-id "you@example.com" \
#     --team-id  "GD6M44DYPQ" \
#     --password "app-specific-password-from-appleid.apple.com"
#
# Then export NOTARY_PROFILE=brewbar-notary in your shell rc.
# The profile name is kept as `brewbar-notary` for backwards compatibility
# with existing maintainer keychains — it's a credential alias, not branding.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
SCHEME="Brew-TUI-Bar"
WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)/Brew-TUI-Bar.xcworkspace"
BUILD_DIR="$(cd "$(dirname "$0")/.." && pwd)/build"
ARCHIVE_PATH="${BUILD_DIR}/Brew-TUI-Bar.xcarchive"
EXPORT_DIR="${BUILD_DIR}/export"
EXPORT_OPTIONS="$(cd "$(dirname "$0")/.." && pwd)/exportOptions.plist"
TEAM_ID="GD6M44DYPQ"
NOTARY_PROFILE="${NOTARY_PROFILE:-}" # set via env or store-credentials profile name

if [[ -z "$NOTARY_PROFILE" ]]; then
  echo "✘ NOTARY_PROFILE is unset. Configure once with:"
  echo "    xcrun notarytool store-credentials brewbar-notary \\"
  echo "      --apple-id <email> --team-id ${TEAM_ID} --password <app-pwd>"
  echo "  then export NOTARY_PROFILE=brewbar-notary"
  exit 1
fi

# REL-001: preflight check del perfil notary ANTES de archivar.
# Un 401 aqui significa que el keychain profile ha desaparecido o las
# credenciales caducaron — vale mas detectarlo en 2 s que tras ~10 min de
# build + archive.
echo "→ Verificando salud de NOTARY_PROFILE=${NOTARY_PROFILE}..."
if ! xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then
  echo "✘ notarytool history fallo con NOTARY_PROFILE=${NOTARY_PROFILE}."
  echo "  Probable causa: el keychain profile expiro o se borro."
  echo "  Re-ejecuta: xcrun notarytool store-credentials ${NOTARY_PROFILE} ..."
  exit 1
fi
echo "✓ notary profile listo."

# ── Step 1: regenerate workspace ──────────────────────────────────────────
# Tuist caches the compiled manifest (not just the workspace). Without an
# explicit clean, `readMarketingVersion()` is NOT re-run when package.json
# changes — so the .app keeps shipping the previous release's version while
# the npm tarball already advanced. This breaks the cross-platform version
# contract silently (the user sees a stale Brew-TUI-Bar even after `brew upgrade`).
# Always `tuist clean` before `tuist generate` during release.
( cd "$(dirname "$0")/.." && tuist clean && tuist generate --no-open )

# ── Step 2: archive ───────────────────────────────────────────────────────
# Note: exportOptions.plist must declare method=developer-id (not "none")
# for a signed export. Update before running this script for real releases.
rm -rf "$ARCHIVE_PATH"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  archive

# ── Step 3: export signed .app ────────────────────────────────────────────
rm -rf "$EXPORT_DIR"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS"

APP_PATH="${EXPORT_DIR}/${SCHEME}.app"
ZIP_PATH="${BUILD_DIR}/${SCHEME}.app.zip"

# ── Step 4: zip and notarize ──────────────────────────────────────────────
# notarytool wants a flat archive for upload; it staples back onto the .app.
( cd "$EXPORT_DIR" && ditto -c -k --keepParent "${SCHEME}.app" "$ZIP_PATH" )

xcrun notarytool submit "$ZIP_PATH" \
  --keychain-profile "$NOTARY_PROFILE" \
  --wait

xcrun stapler staple "$APP_PATH"

# ── Step 5: re-zip the stapled app and report SHA256 ──────────────────────
rm -f "$ZIP_PATH"
( cd "$EXPORT_DIR" && ditto -c -k --keepParent "${SCHEME}.app" "$ZIP_PATH" )

shasum -a 256 "$ZIP_PATH" | tee "${ZIP_PATH}.sha256"

echo ""
echo "✓ Release artefact ready:"
echo "    $ZIP_PATH"
echo "  SHA256: $(awk '{print $1}' "${ZIP_PATH}.sha256")"
echo ""
echo "Next steps (manual):"
echo "  1. Upload \$ZIP_PATH to GitHub Release v\$(plutil -extract CFBundleShortVersionString raw \"\$APP_PATH/Contents/Info.plist\")"
echo "  2. Update homebrew/Casks/brew-tui-bar.rb with the new version + SHA256"
echo "  3. Open PR against MoLinesDesigns/homebrew-tap"
