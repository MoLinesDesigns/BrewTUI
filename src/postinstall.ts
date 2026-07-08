#!/usr/bin/env node
// Runs after `npm install -g brewtui-bar` (which is what `brew install brewtui-bar`
// does internally). Auto-installs and launches BrewTUI-Bar so that users get
// the menu bar app without needing a separate `brew install --cask` step.
//
// Non-fatal by design: any failure here only logs a warning and exits 0. We
// never want a transient network / disk / permissions issue to break the npm
// install itself.
import { syncAndLaunchBrewTUIBar } from './lib/brewtui-bar-installer.js';
import { t } from './i18n/index.js';

/// Exported so vitest can drive the gate logic without spawning the script.
/// The entry-point guard below invokes this only when the file is executed
/// directly (i.e. `node build/postinstall.js`).
export async function runPostinstall(): Promise<void> {
  // Only run on global installs. `brew install` calls `npm install --global`
  // (which sets npm_config_global=true), and `npm install -g <pkg>` does the
  // same. Local installs in dev (`npm install` from the repo) skip this so
  // cloning the repo does not silently touch /Applications.
  if (process.env['npm_config_global'] !== 'true') {
    return;
  }

  // macOS only — the bundle is a .app, no equivalent on Linux/Windows.
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    // Shared with the CLI cold-start path: installs when missing, reinstalls
    // when outdated, then launches. So upgrading `brewtui-bar` (formula or npm)
    // also brings BrewTUI-Bar.app up to the matching version automatically.
    await syncAndLaunchBrewTUIBar();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(t('postinstall_skipped', { error: message }));
    console.warn(t('postinstall_manualHint'));
  }
}

// Entry point: only invoke when this module is the script being executed
// (not when a vitest test imports it). Compares the file URL against argv[1]
// resolved via pathToFileURL to handle macOS volume paths and symlinks.
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runPostinstall().catch(() => {
    // Belt-and-suspenders: never propagate a failure to npm.
  });
}
