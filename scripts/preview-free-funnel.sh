#!/usr/bin/env bash
# Preview the Brew-TUI-Bar Free funnel without losing your real Pro state.
#
#   ./scripts/preview-free-funnel.sh preview   → enter Free mode
#   ./scripts/preview-free-funnel.sh restore   → roll back
#   ./scripts/preview-free-funnel.sh status    → where are we?
#
# How it works:
#   preview  – stashes ~/.brew-tui/license.json into a timestamped .bak,
#              clears the migration flags so the app behaves like a fresh
#              install, and relaunches Brew-TUI-Bar. Writes a sentinel at
#              /tmp/.brew-tui-free-preview.json so `restore` knows what to
#              undo, and registers an EXIT trap that auto-restores if the
#              script is killed mid-run.
#   restore  – moves the stashed license back, relaunches the app, drops
#              the sentinel. Safe to run when no preview is active (no-op).
#   status   – prints whether a preview is currently in effect.
#
# Safe by design: the original license is preserved as a backup file with a
# timestamp; if anything goes sideways you can always re-locate the latest
# license.json.bak.* in ~/.brew-tui/ and rename it manually.

set -euo pipefail

DATA_DIR="$HOME/.brew-tui"
LICENSE_PATH="$DATA_DIR/license.json"
SENTINEL="/tmp/.brew-tui-free-preview.json"
APP_BUNDLE_ID="com.molinesdesigns.brewtuibar"
APP_NAME="Brew-TUI-Bar"

usage() {
  cat <<EOF
Usage: $0 <preview|restore|status>

  preview   stash your license, clear migration flags, relaunch the app
            into its Free-tier popover.
  restore   put the license back exactly as it was.
  status    print whether a preview is currently active.

If a preview is interrupted (Ctrl+C, kill), the EXIT trap rolls it back
automatically. If a sentinel survives a crash, you can re-run \`restore\`
to recover.
EOF
}

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m⚠\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }

require_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || die "macOS only — Brew-TUI-Bar is a .app bundle."
}

quit_app() {
  /usr/bin/osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
  # Wait up to 3s for the process to exit before relaunching.
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    /usr/bin/pgrep -x "$APP_NAME" >/dev/null 2>&1 || return 0
    sleep 0.2
  done
}

launch_app() {
  /usr/bin/open -a "$APP_NAME"
}

cmd_status() {
  if [[ -f "$SENTINEL" ]]; then
    local backup
    backup=$(/usr/bin/grep -m1 'backup_path' "$SENTINEL" | sed -E 's/.*"backup_path": *"([^"]+)".*/\1/')
    warn "Preview ACTIVE. Stashed license: $backup"
    warn "Run \`$0 restore\` to roll back."
  else
    ok "No preview active — your real state is intact."
  fi
}

cmd_preview() {
  require_macos

  if [[ -f "$SENTINEL" ]]; then
    warn "A preview is already active. Run \`$0 restore\` first."
    cmd_status
    exit 1
  fi

  if [[ ! -d "/Applications/$APP_NAME.app" ]]; then
    die "/Applications/$APP_NAME.app not found — install it first."
  fi

  local app_version
  app_version=$(/usr/bin/defaults read "/Applications/$APP_NAME.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?")
  log "Brew-TUI-Bar installed: $app_version"

  local backup=""
  if [[ -f "$LICENSE_PATH" ]]; then
    backup="$LICENSE_PATH.bak.$(date +%Y%m%d-%H%M%S)"
    /bin/mv "$LICENSE_PATH" "$backup"
    ok "License stashed: $backup"
  else
    log "No existing license — already in Free state, just clearing flags."
  fi

  # Migration flags live under the Brew-TUI-Bar bundle ID. Clearing them
  # makes the next launch behave like a fresh install (the migrator no-ops
  # because there's nothing to migrate; the popover sees tier=basic +
  # wasEverActive=false → renders the Free funnel).
  /usr/bin/defaults delete "$APP_BUNDLE_ID" didMigrateFromLegacyBrewBar 2>/dev/null || true
  /usr/bin/defaults delete "$APP_BUNDLE_ID" pendingLoginItemMigrationFromLegacyBrewBar 2>/dev/null || true

  # Write the sentinel BEFORE relaunching so restore knows what to undo
  # even if the relaunch itself fails.
  printf '{\n  "backup_path": "%s",\n  "stashed_at": "%s"\n}\n' "$backup" "$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)" > "$SENTINEL"

  # From here on, on any abrupt exit, roll back. The user can also `restore`
  # explicitly when they're done eyeballing the popover.
  trap 'warn "Aborted — rolling back."; cmd_restore' INT TERM

  quit_app
  launch_app
  ok "Free funnel is now visible — click the menu bar icon to inspect it."
  echo
  echo "When you're done, run:"
  printf '  \033[1m%s restore\033[0m\n' "$0"
  echo
  echo "If anything goes wrong, the original license is at:"
  echo "  $backup"
}

cmd_restore() {
  require_macos

  if [[ ! -f "$SENTINEL" ]]; then
    ok "No preview to restore — nothing to do."
    return 0
  fi

  local backup
  backup=$(/usr/bin/grep -m1 'backup_path' "$SENTINEL" | sed -E 's/.*"backup_path": *"([^"]+)".*/\1/')

  if [[ -n "$backup" && -f "$backup" ]]; then
    /bin/mv "$backup" "$LICENSE_PATH"
    ok "License restored from $backup → $LICENSE_PATH"
  elif [[ -n "$backup" ]]; then
    warn "Sentinel pointed at $backup but the file is missing."
    warn "Searching $DATA_DIR for the most recent license.json.bak.* …"
    local newest
    newest=$(/bin/ls -t "$DATA_DIR"/license.json.bak.* 2>/dev/null | /usr/bin/head -1 || true)
    if [[ -n "$newest" ]]; then
      /bin/mv "$newest" "$LICENSE_PATH"
      ok "Recovered from $newest → $LICENSE_PATH"
    else
      warn "No backup found. Your license is gone. Run \`brew-tui activate <key>\` to re-enter Pro."
    fi
  else
    log "No license was stashed (you were already Free) — nothing to put back."
  fi

  /bin/rm -f "$SENTINEL"
  quit_app
  launch_app
  ok "Restored — Brew-TUI-Bar relaunched with your real state."
}

main() {
  local action="${1:-}"
  case "$action" in
    preview)  cmd_preview ;;
    restore)  cmd_restore ;;
    status)   cmd_status ;;
    -h|--help|"") usage; exit 0 ;;
    *)        die "Unknown action: $action. Run \`$0 --help\`." ;;
  esac
}

main "$@"
