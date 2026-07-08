import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, stat } from 'node:fs/promises';
import { homedir, arch } from 'node:os';
import { join } from 'node:path';
import { useLicenseStore } from '../stores/license-store.js';
import { bundleIdAt, isBrewTUIBarInstalled, isBrewTUIBarRunning } from './brewtui-bar-installer.js';
import { readBrewTUIBarVersion, checkBrewTUIBarVersion } from './version-check.js';

const execFileAsync = promisify(execFile);

const EXPECTED_BUNDLE_ID = 'com.molinesdesigns.brewtuibar';
const APP_PATH = '/Applications/BrewTUI-Bar.app';
const LEGACY_APP_PATH = '/Applications/BrewBar.app';

type Line = { label: string; value: string; ok?: boolean | null };

function format(section: string, lines: Line[]): string {
  const out: string[] = [`=== ${section} ===`];
  const maxLabel = lines.reduce((m, l) => Math.max(m, l.label.length), 0);
  for (const l of lines) {
    const pad = ' '.repeat(maxLabel - l.label.length);
    const mark = l.ok === true ? ' ✓' : l.ok === false ? ' ✘' : '';
    out.push(`  ${l.label}${pad}  ${l.value}${mark}`);
  }
  return out.join('\n');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function findBrewBinary(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', ['brew']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/// Plain-text diagnostic dump for the user / support. No Ink, no colors —
/// users will paste this into bug reports. Each section is best-effort:
/// individual probes can fail without aborting the whole report.
export async function runDoctor(): Promise<void> {
  const cliVersion = process.env.APP_VERSION ?? '0.0.0';

  // ── BrewTUI-Bar ──────────────────────────────────────────────────────────
  console.log(format('BrewTUI-Bar', [
    { label: 'CLI version', value: cliVersion },
    { label: 'Platform', value: `${process.platform} (${arch()})` },
    { label: 'Node', value: process.version },
  ]));
  console.log('');

  // ── BrewTUI-Bar (macOS only) ─────────────────────────────────────────
  if (process.platform === 'darwin') {
    const lines: Line[] = [];
    try {
      const installed = await isBrewTUIBarInstalled();
      if (!installed) {
        lines.push({ label: 'Installed', value: 'no' });
      } else {
        lines.push({ label: 'Installed at', value: APP_PATH, ok: true });
        const appVersion = await readBrewTUIBarVersion();
        lines.push({ label: 'App version', value: appVersion ?? '(unreadable)' });
        const status = await checkBrewTUIBarVersion();
        const statusLabel = status.kind === 'ok' ? 'in sync'
          : status.kind === 'outdated' ? `outdated (expected ${status.expected})`
          : status.kind === 'newer' ? `app is newer than CLI (CLI expects ${status.expected})`
          : status.kind === 'not-installed' ? 'not installed'
          : `unknown (${status.reason})`;
        lines.push({ label: 'Version status', value: statusLabel, ok: status.kind === 'ok' });
        const bundleId = await bundleIdAt(APP_PATH);
        lines.push({
          label: 'Bundle ID',
          value: bundleId ?? '(unreadable)',
          ok: bundleId === EXPECTED_BUNDLE_ID ? true : bundleId ? false : null,
        });
        const running = await isBrewTUIBarRunning();
        lines.push({ label: 'Process running', value: running ? 'yes' : 'no' });
      }
    } catch (err) {
      lines.push({ label: '(probe error)', value: err instanceof Error ? err.message : String(err) });
    }
    console.log(format('BrewTUI-Bar (macOS companion)', lines));
    console.log('');

    // Legacy bundle from the BrewBar era. As of 3.0.0 we no longer auto-clean
    // it (the cask `brewbar` is `disable!` and the in-process cleanup helper
    // was retired); the doctor still reports it so users can wipe it manually.
    if (await pathExists(LEGACY_APP_PATH)) {
      const legacyId = await bundleIdAt(LEGACY_APP_PATH);
      console.log(format('Legacy BrewBar.app', [
        { label: 'Path', value: LEGACY_APP_PATH },
        { label: 'Bundle ID', value: legacyId ?? '(unreadable)' },
        {
          label: 'Note',
          value: legacyId === 'com.molinesdesigns.brewbar'
            ? 'remove manually: rm -rf /Applications/BrewBar.app'
            : 'foreign app — not ours, not touching',
        },
      ]));
      console.log('');
    }
  }

  // ── License ───────────────────────────────────────────────────────────
  const licLines: Line[] = [];
  try {
    await useLicenseStore.getState().initialize();
    const { status, license, degradation } = useLicenseStore.getState();
    const tierLabel = status === 'pro' ? 'Pro' : status === 'expired' ? 'Expired' : 'Free';
    licLines.push({ label: 'Tier', value: tierLabel });
    if (license) {
      licLines.push({ label: 'Email', value: license.customerEmail });
      licLines.push({ label: 'Activated at', value: license.activatedAt });
      if (license.expiresAt) licLines.push({ label: 'Expires at', value: license.expiresAt });
      licLines.push({ label: 'Last validated', value: license.lastValidatedAt });
    }
    licLines.push({ label: 'Degradation', value: degradation });
  } catch (err) {
    licLines.push({ label: '(probe error)', value: err instanceof Error ? err.message : String(err) });
  }
  console.log(format('License', licLines));
  console.log('');

  // ── Environment ───────────────────────────────────────────────────────
  const dataDir = join(homedir(), '.brewtui-bar');
  const machineIdPath = join(dataDir, 'machine-id');
  const machineIdPresent = await stat(machineIdPath).then(() => true).catch(() => false);
  console.log(format('Environment', [
    { label: 'brew binary', value: (await findBrewBinary()) ?? '(not on PATH)' },
    { label: 'Data directory', value: dataDir },
    { label: 'machine-id', value: machineIdPresent ? 'present' : '(not created — appears after first activate)' },
  ]));
}
