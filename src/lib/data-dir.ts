import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, access, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const LEGACY_DATA_DIR = join(homedir(), '.brew-tui');
export const DATA_DIR = join(homedir(), '.brewtui-bar');
export const PROFILES_DIR = join(DATA_DIR, 'profiles');
export const LICENSE_PATH = join(DATA_DIR, 'license.json');
export const HISTORY_PATH = join(DATA_DIR, 'history.json');
export const SNAPSHOTS_DIR = join(DATA_DIR, 'snapshots');
export const MACHINE_ID_PATH = join(DATA_DIR, 'machine-id');
export const ONBOARDING_FLAG_PATH = join(DATA_DIR, 'onboarding-completed');
export const ANALYTICS_CONSENT_PATH = join(DATA_DIR, 'analytics-consent');
// Cross-process notification surface for BrewTUI-Bar. BrewTUI-Bar writes here after a
// brew action completes; BrewTUI-Bar watches the file with DispatchSource and shows
// a banner with the result + remaining outdated count.
export const LAST_ACTION_PATH = join(DATA_DIR, 'last-action.json');

export interface LastAction {
  timestamp: string;        // ISO 8601
  action: 'upgrade' | 'install' | 'uninstall';
  packages: string[];       // names actually upgraded/installed/uninstalled
  remainingOutdated: number; // total outdated packages still pending after the action
  source: 'brewtui-bar';
}

// Atomic write: write to a temp sibling then rename so partial reads from the
// watcher cannot see a half-written file (rename is atomic on the same fs).
export async function writeLastAction(payload: LastAction): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const json = JSON.stringify(payload, null, 2);
  const tmp = `${LAST_ACTION_PATH}.tmp`;
  await writeFile(tmp, json, { encoding: 'utf-8', mode: 0o600 });
  await rename(tmp, LAST_ACTION_PATH);
}

async function migrateLegacyDataDirIfNeeded(): Promise<void> {
  try {
    await access(LEGACY_DATA_DIR);
  } catch {
    return;
  }
  try {
    await access(DATA_DIR);
    return;
  } catch {
    await rename(LEGACY_DATA_DIR, DATA_DIR);
  }
}

export async function ensureDataDirs(): Promise<void> {
  await migrateLegacyDataDirIfNeeded();
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await mkdir(PROFILES_DIR, { recursive: true, mode: 0o700 });
  await mkdir(SNAPSHOTS_DIR, { recursive: true, mode: 0o700 });
}

// In-memory cache + serializer to prevent multiple concurrent first-time
// creations from racing and producing different UUIDs on first launch.
let cachedMachineId: string | null = null;
let pendingResolution: Promise<string> | null = null;

export async function getMachineId(): Promise<string> {
  if (cachedMachineId) return cachedMachineId;
  if (pendingResolution) return pendingResolution;

  pendingResolution = (async () => {
    try {
      const id = (await readFile(MACHINE_ID_PATH, 'utf-8')).trim();
      if (id) {
        cachedMachineId = id;
        return id;
      }
    } catch { /* file does not exist yet */ }

    const id = randomUUID();
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await writeFile(MACHINE_ID_PATH, id, { encoding: 'utf-8', mode: 0o600 });
    cachedMachineId = id;
    return id;
  })();

  try {
    return await pendingResolution;
  } finally {
    pendingResolution = null;
  }
}
