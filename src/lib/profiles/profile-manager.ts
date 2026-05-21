import { readFile, writeFile, readdir, rm, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { PROFILES_DIR, ensureDataDirs } from '../data-dir.js';
import { execBrew, streamBrew } from '../brew-cli.js';
import { getInstalled, getLeaves } from '../brew-api.js';
import { t } from '../../i18n/index.js';
import { getWatermark } from '../license/watermark.js';
import type { LicenseData } from '../license/types.js';
import type { Profile, ProfileFile } from './types.js';

function proCheck(isPro: boolean): void {
  if (!isPro) throw new Error('Pro license required');
}

/**
 * Validate a profile name to prevent path traversal.
 * Only allows alphanumeric characters, hyphens, underscores, and spaces.
 * Throws if the name contains path separators or traversal sequences.
 */
const MAX_PROFILE_NAME_LENGTH = 100;

function validateProfileName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error('Profile name cannot be empty');
  }
  if (name.length > MAX_PROFILE_NAME_LENGTH) {
    throw new Error(`Profile name is too long (max ${MAX_PROFILE_NAME_LENGTH} characters)`);
  }
  if (!/^[\w\s-]+$/.test(name)) {
    throw new Error(`Invalid profile name: "${name}". Only letters, numbers, spaces, hyphens, and underscores are allowed.`);
  }
}

function profilePath(name: string): string {
  validateProfileName(name);
  // Use basename as an additional defense-in-depth guard: strips any directory
  // component that might survive the regex check on edge-case OS behavior.
  return join(PROFILES_DIR, `${basename(name)}.json`);
}

export async function listProfiles(isPro: boolean): Promise<string[]> {
  proCheck(isPro);
  await ensureDataDirs();
  try {
    const files = await readdir(PROFILES_DIR);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

export async function loadProfile(isPro: boolean, name: string): Promise<Profile> {
  proCheck(isPro);
  const raw = await readFile(profilePath(name), 'utf-8');
  let file: ProfileFile;
  try {
    file = JSON.parse(raw) as ProfileFile;
  } catch (err) {
    throw new Error(`Profile "${name}" is corrupted: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (file.version !== 1) {
    // Future: add migration logic here
    throw new Error('Unsupported data version');
  }
  if (!file.profile) {
    throw new Error(`Profile "${name}" is missing required data`);
  }
  return file.profile;
}

export async function saveProfile(isPro: boolean, profile: Profile): Promise<void> {
  proCheck(isPro);
  await ensureDataDirs();

  // BK-002: Atomic write via temp file + rename
  const filePath = profilePath(profile.name);
  const tmpPath = filePath + '.tmp';
  const file: ProfileFile = { version: 1, profile };
  await writeFile(tmpPath, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, filePath);
}

export async function deleteProfile(isPro: boolean, name: string): Promise<void> {
  proCheck(isPro);
  try {
    await rm(profilePath(name));
  } catch { /* may not exist */ }
}

export async function exportCurrentSetup(isPro: boolean, name: string, description: string, license: LicenseData | null = null, consent = true): Promise<Profile> {
  proCheck(isPro);

  // BK-007: Check if profile already exists
  const existingNames = await listProfiles(isPro);
  if (existingNames.includes(name)) {
    throw new Error('Profile already exists: ' + name);
  }

  const [installed, leaves, tapsRaw] = await Promise.all([
    getInstalled(),
    getLeaves(),
    execBrew(['tap']),
  ]);

  const taps = tapsRaw.split('\n').map((l) => l.trim()).filter(Boolean);
  const casks = installed.casks
    .filter((c) => c.installed)
    .map((c) => c.token);

  const now = new Date().toISOString();
  const profile: Profile = {
    name,
    description,
    createdAt: now,
    updatedAt: now,
    formulae: leaves,
    casks,
    taps,
    exportedBy: getWatermark(license, consent), // BK-014: explicit consent required (default false)
  };

  await saveProfile(isPro, profile);
  return profile;
}

export async function updateProfile(isPro: boolean, oldName: string, newName: string, newDescription: string): Promise<void> {
  proCheck(isPro);
  const profile = await loadProfile(isPro, oldName);
  if (oldName !== newName) {
    await deleteProfile(isPro, oldName);
  }
  const updated: Profile = {
    ...profile,
    name: newName,
    description: newDescription,
    updatedAt: new Date().toISOString(),
  };
  await saveProfile(isPro, updated);
}

// ARQ-004: divergencia INTENCIONAL respecto al PKG_PATTERN canonico de
// `brew-api.ts` (que es permisivo `/^[\w@./+-]+$/`). Aqui validamos paquetes
// importados desde un Profile externo (no controlado por nuestra UI), por lo
// que aplicamos un patron mas estricto: minusculas, sin `/`, sin mayusculas.
// Razon: un Profile artesanal no deberia poder instalar formulae con nombres
// poco canonicos. El tradeoff es que algunos nombres validos para brew (taps
// que incluyen `/`, paquetes con mayusculas) seran rechazados — uso voluntario.
const TAP_PATTERN = /^[a-z0-9][-a-z0-9]*\/[a-z0-9][-a-z0-9]*$/;
const PKG_PATTERN = /^[a-z0-9][-a-z0-9_.@+]*$/;

export async function* importProfile(isPro: boolean, profile: Profile): AsyncGenerator<string> {
  proCheck(isPro);

  const installed = await getInstalled();
  const installedFormulae = new Set(installed.formulae.map((f) => f.name));
  const installedCasks = new Set(installed.casks.filter((c) => c.installed).map((c) => c.token));

  // Add missing taps (validated)
  for (const tap of profile.taps) {
    if (!TAP_PATTERN.test(tap)) {
      yield `Skipping invalid tap name: ${tap}`;
      continue;
    }
    yield t('profileMgr_tapping', { name: tap });
    try {
      await execBrew(['tap', tap]);
    } catch { /* may already be tapped */ }
  }

  // Install missing formulae (validated)
  const missingFormulae = profile.formulae.filter((f) => !installedFormulae.has(f));
  for (const name of missingFormulae) {
    if (!PKG_PATTERN.test(name)) {
      yield `Skipping invalid formula name: ${name}`;
      continue;
    }
    yield t('profileMgr_installing', { name });
    for await (const line of streamBrew(['install', name])) {
      yield line;
    }
  }

  // Install missing casks (validated)
  const missingCasks = profile.casks.filter((c) => !installedCasks.has(c));
  for (const name of missingCasks) {
    if (!PKG_PATTERN.test(name)) {
      yield `Skipping invalid cask name: ${name}`;
      continue;
    }
    yield t('profileMgr_installingCask', { name });
    for await (const line of streamBrew(['install', '--cask', name])) {
      yield line;
    }
  }

  const totalInstalled = missingFormulae.length + missingCasks.length;
  yield t('profileMgr_importDone', { count: totalInstalled });
}
