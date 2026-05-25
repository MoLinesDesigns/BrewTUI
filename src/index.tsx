import React from 'react';
import { createInterface } from 'node:readline/promises';
import { rm } from 'node:fs/promises';
import { render } from 'ink';
import { App } from './app.js';
import { activate, deactivate, loadLicense, revalidate } from './lib/license/license-manager.js';
import { ensureDataDirs, DATA_DIR } from './lib/data-dir.js';
import { t } from './i18n/index.js';
import { useLicenseStore } from './stores/license-store.js';
import { formatDate } from './utils/format.js';
import { installCrashReporter, reportError } from './lib/crash-reporter.js';

const [,, command, arg] = process.argv;

async function runCli() {
  // --version / -v: print and exit before any TUI/Ink/data-dir setup so that
  // Brew-TUI-Bar (and any tooling) can read the version cheaply via execFile.
  if (command === '--version' || command === '-v' || command === 'version') {
    process.stdout.write((process.env.APP_VERSION ?? '0.0.0') + '\n');
    return;
  }

  await ensureDataDirs();
  await installCrashReporter();

  if (command === 'activate') {
    const key = arg?.trim() ?? '';
    if (!key) {
      console.error(t('cli_usageActivate'));
      process.exit(1);
    }
    try {
      const license = await activate(key);
      console.log(t('cli_activated', { email: license.customerEmail }));
      console.log(t('cli_planPro'));
      if (license.expiresAt) {
        console.log(t('cli_expires', { date: formatDate(license.expiresAt) }));
      }
    } catch (err) {
      console.error(t('cli_activationFailed', { error: err instanceof Error ? err.message : String(err) }));
      process.exit(1);
    }
    return;
  }

  if (command === 'deactivate') {
    const license = await loadLicense();
    if (!license) {
      console.log(t('cli_noLicense'));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(t('cli_confirmDeactivate'));
    rl.close();
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 's') {
      console.log(t('cli_deactivateCancelled'));
      return;
    }
    const { remoteSuccess } = await deactivate(license);
    console.log(t('cli_deactivated'));
    if (!remoteSuccess) {
      console.warn(t('cli_deactivateRemoteFailed'));
    }
    return;
  }

  if (command === 'revalidate') {
    const license = await loadLicense();
    if (!license) {
      console.log(t('cli_noLicense'));
      process.exit(1);
    }

    const result = await revalidate(license);
    if (result === 'expired') {
      console.error(t('cli_revalidateFailed'));
      process.exit(1);
    }

    const updated = await loadLicense();
    if (result === 'grace') {
      console.warn(t('cli_revalidateGrace'));
    } else {
      console.log(t('cli_revalidated'));
    }
    if (updated?.expiresAt) {
      console.log(t('cli_expires', { date: formatDate(updated.expiresAt) }));
    }
    return;
  }

  if (command === 'status') {
    await useLicenseStore.getState().initialize();
    const { status, license, degradation } = useLicenseStore.getState();
    const isPro = useLicenseStore.getState().isPro();

    if (status === 'free') {
      console.log(t('cli_planFree'));
      console.log(t('cli_upgradeHint'));
    } else {
      const planLabel = status === 'expired' ? t('cli_planExpired') : t('cli_planPro');
      console.log(planLabel);
      if (license) {
        console.log(t('cli_email', { email: license.customerEmail }));
      }

      const statusText = status === 'pro'
        ? (degradation === 'none' ? (license?.status ?? 'active') : degradation)
        : status;
      console.log(t('cli_status', { status: statusText }));

      if (license?.expiresAt) {
        console.log(t('cli_expires', { date: formatDate(license.expiresAt) }));
      }
      if (status === 'expired') {
        console.log(t('cli_revalidateHint'));
      }
      if (status === 'pro' && degradation !== 'none' && license) {
        const days = Math.floor((Date.now() - new Date(license.lastValidatedAt).getTime()) / (24 * 60 * 60 * 1000));
        console.log(t('license_offlineWarning', { days }));
        console.log(t('cli_revalidateHint'));
      }
    }

    // Pro-only status sections
    if (isPro) {
      // Snapshots
      try {
        const { loadSnapshots } = await import('./lib/state-snapshot/snapshot.js');
        const snapshots = await loadSnapshots();
        if (snapshots.length > 0) {
          const latest = snapshots[0];
          console.log(`\nSnapshots: ${snapshots.length} (latest: ${latest ? formatDate(latest.capturedAt) : '—'})`);
        } else {
          console.log('\nSnapshots: none');
        }
      } catch {
        // Non-fatal: snapshot dir may not exist yet
      }

      // Brewfile drift
      try {
        const { loadBrewfile, computeDrift } = await import('./lib/brewfile/brewfile-manager.js');
        const schema = await loadBrewfile();
        if (schema) {
          const drift = await computeDrift(schema);
          console.log(`Brewfile: ${drift.score}% compliant (${drift.missingPackages.length} missing, ${drift.extraPackages.length} extra)`);
        }
      } catch {
        // Non-fatal
      }

      // Sync last sync date
      try {
        const { loadSyncConfig } = await import('./lib/sync/sync-engine.js');
        const syncConfig = await loadSyncConfig();
        if (syncConfig?.lastSync) {
          console.log(`Sync: last sync ${formatDate(syncConfig.lastSync)}`);
        }
      } catch {
        // Non-fatal
      }

      // Compliance score
      try {
        const { loadPolicy } = await import('./lib/compliance/policy-io.js');
        const { checkCompliance } = await import('./lib/compliance/compliance-checker.js');
        // Try loading from default location
        const policy = await loadPolicy(`${process.env['HOME'] ?? '~'}/.brew-tui/policy.yaml`).catch(() => null);
        if (policy) {
          const report = await checkCompliance(policy, true);
          console.log(`Compliance: ${report.score}% (${report.violations.length} violation(s))`);
        }
      } catch {
        // Non-fatal: no policy loaded
      }
    }

    return;
  }

  if (command === 'install-brew-tui-bar' || command === 'install-brewbar') {
    if (command === 'install-brewbar') {
      // Legacy alias kept for one minor version (slated for removal in 2.1.0).
      console.warn(t('cli_brewtuibarLegacyAlias', { legacy: command, current: 'install-brew-tui-bar' }));
    }
    await useLicenseStore.getState().initialize();
    const isPro = useLicenseStore.getState().isPro();
    const { installBrewTUIBar } = await import('./lib/brew-tui-bar-installer.js');
    try {
      console.log(t('cli_brewtuibarInstalling'));
      await installBrewTUIBar(isPro, arg === '--force');
      console.log(t('cli_brewtuibarInstalled'));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (command === 'uninstall-brew-tui-bar' || command === 'uninstall-brewbar') {
    if (command === 'uninstall-brewbar') {
      console.warn(t('cli_brewtuibarLegacyAlias', { legacy: command, current: 'uninstall-brew-tui-bar' }));
    }
    const { uninstallBrewTUIBar } = await import('./lib/brew-tui-bar-installer.js');
    try {
      await uninstallBrewTUIBar();
      console.log(t('cli_brewtuibarUninstalled'));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  // SEG-007: delete-account subcommand
  if (command === 'delete-account') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(t('delete_account_confirm') + ' (y/N): ');
    rl.close();
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 's') {
      console.log(t('cli_deactivateCancelled'));
      return;
    }
    await rm(DATA_DIR, { recursive: true, force: true });
    console.log(t('delete_account_success'));
    return;
  }

  // Auto-install + auto-launch Brew-TUI-Bar for Pro users on macOS.
  // Runs before the TUI clears the screen so progress messages are visible on cold install.
  await ensureBrewTUIBarRunning();

  // Default: launch TUI. Mark TUI mode so the logger redirects to a file
  // instead of stdout/stderr (which would corrupt the Ink-rendered frame).
  process.env.BREW_TUI_TUI_MODE = '1';
  process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
  render(<App />);
}

async function ensureBrewTUIBarRunning() {
  if (process.platform !== 'darwin') return;

  await useLicenseStore.getState().initialize();
  if (!useLicenseStore.getState().isPro()) return;

  const { isBrewTUIBarInstalled, installBrewTUIBar, launchBrewTUIBar } = await import('./lib/brew-tui-bar-installer.js');
  const { checkBrewTUIBarVersion } = await import('./lib/version-check.js');

  try {
    if (!await isBrewTUIBarInstalled()) {
      console.log(t('cli_brewtuibarInstalling'));
      await installBrewTUIBar(true, false);
      console.log(t('cli_brewtuibarInstalled'));
    } else {
      // Cross-platform contract: Brew-TUI-Bar must match Brew-TUI's version so
      // license decryption and any future IPC stay compatible. If the user's
      // Brew-TUI-Bar is older than this CLI (e.g. they upgraded brew-tui via
      // Homebrew/npm but never re-ran install-brew-tui-bar), reinstall in place.
      const status = await checkBrewTUIBarVersion();
      if (status.kind === 'outdated') {
        console.log(t('cli_brewtuibarUpdating', { installed: status.installed, expected: status.expected }));
        await installBrewTUIBar(true, true);
        console.log(t('cli_brewtuibarInstalled'));
      }
    }
    await launchBrewTUIBar();
  } catch (err) {
    // Non-fatal: log a single line and continue to TUI so brew-tui stays usable.
    console.warn(t('cli_brewtuibarAutoFailed', { error: err instanceof Error ? err.message : String(err) }));
  }
}

runCli().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  void reportError(err, { kind: 'runCli-rejection' }).finally(() => process.exit(1));
});
