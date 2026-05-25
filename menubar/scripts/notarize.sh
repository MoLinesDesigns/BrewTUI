#!/usr/bin/env bash
# Notarize the already-built menubar/build/Brew-TUI-Bar.app.zip and publish it
# to the GitHub Release for the current package version. Re-run idempotently — if the .zip is
# already stapled this only updates the SHA on the cask.
#
# Required env vars:
#   APPLE_ID                — your Apple ID email
#   APPLE_TEAM_ID           — Developer Team ID (defaults to GD6M44DYPQ)
#   APPLE_APP_SPECIFIC_PWD  — app-specific password from appleid.apple.com
#
# Usage:
#   APPLE_ID="you@example.com" \
#   APPLE_APP_SPECIFIC_PWD="app-specific-password" \
#   ./menubar/scripts/notarize.sh

set -euo pipefail

APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-GD6M44DYPQ}"
APPLE_APP_SPECIFIC_PWD="${APPLE_APP_SPECIFIC_PWD:-}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${VERSION:-$(node -p "require('${REPO_ROOT}/package.json').version")}"

if [[ -z "$APPLE_ID" || -z "$APPLE_APP_SPECIFIC_PWD" ]]; then
  cat >&2 <<EOF
✘ Missing credentials. Set both:
    APPLE_ID
    APPLE_APP_SPECIFIC_PWD
EOF
  exit 1
fi

APP_PATH="${REPO_ROOT}/menubar/build/export/Brew-TUI-Bar.app"
ZIP_PATH="${REPO_ROOT}/menubar/build/Brew-TUI-Bar.app.zip"
EXPORT_DIR="${REPO_ROOT}/menubar/build/export"

if [[ ! -d "$APP_PATH" ]]; then
  echo "✘ $APP_PATH does not exist. Run the archive+export step first."
  exit 1
fi

# ── Step 1: notarize ──────────────────────────────────────────────────────
echo "→ Submitting to notarytool (this may take 1-3 minutes)..."
xcrun notarytool submit "$ZIP_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PWD" \
  --wait

# ── Step 2: staple ────────────────────────────────────────────────────────
echo "→ Stapling notarization to the .app..."
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

# ── Step 3: re-zip the stapled app ────────────────────────────────────────
echo "→ Re-zipping the stapled .app..."
rm -f "$ZIP_PATH"
( cd "$EXPORT_DIR" && ditto -c -k --keepParent Brew-TUI-Bar.app "$ZIP_PATH" )

# ── Step 4: SHA256 + upload ───────────────────────────────────────────────
SHA="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
echo "$SHA  $ZIP_PATH" > "${ZIP_PATH}.sha256"
echo ""
echo "✓ Notarized and stapled."
echo "  $ZIP_PATH"
echo "  SHA256: $SHA"
echo ""

echo "→ Uploading to GitHub Release v${VERSION}..."
gh release upload "v${VERSION}" "$ZIP_PATH" "${ZIP_PATH}.sha256" --clobber

# ── Step 5: bump cask ─────────────────────────────────────────────────────
update_cask() {
  local cask_file="$1"

  perl -i -pe "s/^  version \"[^\"]+\"/  version \"${VERSION}\"/" "$cask_file"
  perl -i -pe "s/^  sha256 \"[^\"]+\"/  sha256 \"${SHA}\"/" "$cask_file"
}

LOCAL_CASK_FILE="${REPO_ROOT}/homebrew/Casks/brew-tui-bar.rb"
if [[ -f "$LOCAL_CASK_FILE" ]]; then
  update_cask "$LOCAL_CASK_FILE"
fi

TAP_DIR="$(mktemp -d)/homebrew-tap"
git clone https://github.com/MoLinesDesigns/homebrew-tap "$TAP_DIR"
CASK_FILE="${TAP_DIR}/Casks/brew-tui-bar.rb"

update_cask "$CASK_FILE"

cd "$TAP_DIR"
git add Casks/brew-tui-bar.rb
git commit -m "chore: bump brew-tui-bar to ${VERSION} (notarized)

Stapled .app published to MoLinesDesigns/Brew-TUI release v${VERSION}.
SHA256: ${SHA}"
git push origin HEAD

echo ""
echo "✓ Done. Cask bumped on MoLinesDesigns/homebrew-tap. Users running"
echo "  'brew upgrade --cask brew-tui-bar' will pick up the notarized ${VERSION}."
