#!/usr/bin/env bash
# BrewBar release pipeline — sign, archive, export and notarize.
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

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────
SCHEME="BrewBar"
WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)/BrewBar.xcworkspace"
BUILD_DIR="$(cd "$(dirname "$0")/.." && pwd)/build"
ARCHIVE_PATH="${BUILD_DIR}/BrewBar.xcarchive"
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

# ── Step 1: regenerate workspace ──────────────────────────────────────────
# Tuist caches the compiled manifest (not just the workspace). Without an
# explicit clean, `readMarketingVersion()` is NOT re-run when package.json
# changes — so the .app keeps shipping the previous release's version while
# the npm tarball already advanced. This breaks the cross-platform version
# contract silently (the user sees a stale BrewBar even after `brew upgrade`).
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
echo "  2. Update homebrew/Casks/brewbar.rb with the new version + SHA256"
echo "  3. Open PR against MoLinesDesigns/homebrew-tap"
