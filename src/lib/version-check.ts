import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const BREWTUIBAR_INFO_PLIST = '/Applications/Brew-TUI-Bar.app/Contents/Info.plist';

// CONTRACT_VERSION is bumped only when the cross-platform contract changes
// (license schema, encryption scheme, IPC). Marketing version drifts often;
// contract version drifts rarely. Brew-TUI-Bar must embed the same number.
// TODO: surface this number from a shared file once the next contract bump lands.
export const CONTRACT_VERSION = 1;

export type BrewTUIBarVersionStatus =
  | { kind: 'ok'; installed: string; expected: string }
  | { kind: 'outdated'; installed: string; expected: string }
  | { kind: 'newer'; installed: string; expected: string }
  | { kind: 'not-installed' }
  | { kind: 'unknown'; reason: string };

export function expectedVersion(): string {
  return process.env.APP_VERSION ?? '0.0.0';
}

export async function readBrewTUIBarVersion(): Promise<string | null> {
  try {
    await access(BREWTUIBAR_INFO_PLIST);
  } catch {
    return null;
  }
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/defaults',
      ['read', BREWTUIBAR_INFO_PLIST.replace(/\.plist$/, ''), 'CFBundleShortVersionString'],
      { timeout: 5000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Lexicographic semver compare, no pre-release support. Returns:
 *   < 0 if a < b, 0 if equal, > 0 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkBrewTUIBarVersion(): Promise<BrewTUIBarVersionStatus> {
  if (process.platform !== 'darwin') {
    return { kind: 'unknown', reason: 'not-macos' };
  }
  const installed = await readBrewTUIBarVersion();
  if (installed === null) {
    // Distinguish "not present" from "present but unreadable"
    try {
      await access(BREWTUIBAR_INFO_PLIST);
      return { kind: 'unknown', reason: 'plist-unreadable' };
    } catch {
      return { kind: 'not-installed' };
    }
  }
  const expected = expectedVersion();
  const cmp = compareSemver(installed, expected);
  if (cmp === 0) return { kind: 'ok', installed, expected };
  if (cmp < 0) return { kind: 'outdated', installed, expected };
  return { kind: 'newer', installed, expected };
}
