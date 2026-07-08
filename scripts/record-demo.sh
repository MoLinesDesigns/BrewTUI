#!/usr/bin/env bash
# Records the BrewTUI-Bar demo as an asciinema cast and converts it to a GIF
# suitable for the README hero. Output: assets/demo.cast + assets/demo.gif
#
# Requirements: asciinema, agg, brewtui-bar (installed globally via npm or brew)
# Install with: brew install asciinema agg

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS="$ROOT/assets"
CAST="$ASSETS/demo.cast"
GIF="$ASSETS/demo.gif"

# ── Recording dimensions tuned for README rendering on GitHub ──
COLS=120
ROWS=36
# ── Playback speed multiplier (1.0 = realtime, 1.5 = 50% faster) ──
SPEED=1.4
# ── Long pauses in the recording get capped to this many seconds ──
IDLE_LIMIT=1.5
# ── Color theme for agg: monokai | dracula | github | nord | solarized-dark ──
THEME="dracula"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✘ Missing dependency: $1"
    echo "  Install with: brew install asciinema agg"
    exit 1
  }
}

require asciinema
require agg
require brewtui-bar

mkdir -p "$ASSETS"

cat <<'INSTRUCTIONS'

══════════════════════════════════════════════════════════════════════
  RECORDING SCRIPT — follow these key presses in order
══════════════════════════════════════════════════════════════════════

After this banner, asciinema starts. Then:

  1.  Type:          brewtui-bar
      Press:         Enter
      Wait:          ~2 seconds for the dashboard to render

  2.  Press 4        → Outdated view
      Wait:          1.5s for the list to appear
      Press j j j    → scroll three rows
      Wait:          1s

  3.  Press 6        → Services view
      Wait:          1s
      Press k k      → scroll back

  4.  Press 7        → Doctor
      Wait:          2s for results

  5.  Press 9        → Smart Cleanup (Pro)
      Wait:          1.5s

  6.  Press 0        → Security Audit (Pro)
      Wait:          2s

  7.  Press q        → Quit BrewTUI-Bar

  8.  Press Ctrl+D   → Stop the asciinema recording

══════════════════════════════════════════════════════════════════════

Total target length: ~25-30 seconds.

Press Enter when ready to start recording...
INSTRUCTIONS

read -r

rm -f "$CAST" "$GIF"

asciinema rec \
  "$CAST" \
  --cols "$COLS" \
  --rows "$ROWS" \
  --idle-time-limit "$IDLE_LIMIT" \
  --overwrite \
  --quiet

echo ""
echo "→ Converting cast to GIF (theme: $THEME, speed: ${SPEED}x)..."

agg \
  --cols "$COLS" \
  --rows "$ROWS" \
  --speed "$SPEED" \
  --theme "$THEME" \
  --font-size 14 \
  "$CAST" \
  "$GIF"

SIZE_KB=$(du -k "$GIF" | awk '{print $1}')

echo ""
echo "✔ Done."
echo "  Cast: $CAST"
echo "  GIF:  $GIF (${SIZE_KB} KB)"
echo ""

if [ "$SIZE_KB" -gt 5000 ]; then
  echo "⚠ GIF is over 5 MB. Consider:"
  echo "  - Re-recording with fewer / faster steps"
  echo "  - Lower SPEED setting in this script"
  echo "  - Using gifsicle: gifsicle -O3 --lossy=80 -o $GIF $GIF"
fi
