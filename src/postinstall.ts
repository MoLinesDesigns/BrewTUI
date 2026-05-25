#!/usr/bin/env node
// Runs after `npm install -g brew-tui` (which is what `brew install brew-tui`
// does internally). Auto-installs and launches Brew-TUI-Bar so that users get
// the menu bar app without needing a separate `brew install --cask` step.
//
// Non-fatal by design: any failure here only logs a warning and exits 0. We
// never want a transient network / disk / permissions issue to break the npm
// install itself.
import { installBrewTUIBar, isBrewTUIBarInstalled, launchBrewTUIBar } from './lib/brew-tui-bar-installer.js';
import { t } from './i18n/index.js';

async function main(): Promise<void> {
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
    if (!(await isBrewTUIBarInstalled())) {
      console.log(t('cli_brewtuibarInstalling'));
      await installBrewTUIBar(false, false);
      console.log(t('cli_brewtuibarInstalled'));
    }
    await launchBrewTUIBar();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(t('postinstall_skipped', { error: message }));
    console.warn(t('postinstall_manualHint'));
  }
}

main().catch(() => {
  // Belt-and-suspenders: never propagate a failure to npm.
});
