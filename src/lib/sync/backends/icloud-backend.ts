import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../../../utils/logger.js';
import type { SyncEnvelope } from '../types.js';

const ICLOUD_BASE = join(
  homedir(),
  'Library', 'Mobile Documents', 'com~apple~CloudDocs',
);
export const ICLOUD_SYNC_DIR = join(ICLOUD_BASE, 'BrewTUI-Bar');
export const ICLOUD_SYNC_PATH = join(ICLOUD_SYNC_DIR, 'sync.json');

export async function isICloudAvailable(): Promise<boolean> {
  try {
    await stat(ICLOUD_BASE);
    return true;
  } catch {
    return false;
  }
}

function isValidEnvelope(v: unknown): v is SyncEnvelope {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    obj['schemaVersion'] === 1 &&
    typeof obj['encrypted'] === 'string' &&
    typeof obj['iv'] === 'string' &&
    typeof obj['tag'] === 'string' &&
    typeof obj['updatedAt'] === 'string'
  );
}

export async function readSyncEnvelope(): Promise<SyncEnvelope | null> {
  // BK-012: iCloud may leave an undownloaded placeholder at the path. Reading
  // returns 0 bytes (or ENOENT for the file but a sibling .icloud entry).
  // Treat empty / missing-but-pending as "not yet ready" without surfacing
  // a misleading "no remote state" to the caller.
  try {
    const info = await stat(ICLOUD_SYNC_PATH);
    if (info.size === 0) {
      logger.warn('sync: iCloud envelope exists but is empty (placeholder?)');
      return null;
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // First-sync case OR pending download — check for the placeholder sibling.
      try {
        const placeholder = ICLOUD_SYNC_PATH.replace(/sync\.json$/, '.sync.json.icloud');
        await stat(placeholder);
        logger.warn('sync: iCloud placeholder present, file not yet downloaded');
      } catch { /* genuinely absent */ }
      return null;
    }
    logger.warn('sync: could not stat iCloud envelope', { error: String(err) });
    return null;
  }

  try {
    const raw = await readFile(ICLOUD_SYNC_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidEnvelope(parsed)) {
      logger.warn('sync: invalid envelope structure in iCloud file');
      return null;
    }
    return parsed;
  } catch (err: unknown) {
    logger.warn('sync: could not read iCloud envelope', { error: String(err) });
    return null;
  }
}

export async function writeSyncEnvelope(envelope: SyncEnvelope): Promise<void> {
  // BK-007: explicito 0o700 — iCloud Drive hereda permisos del sistema y por
  // defecto pueden ser 0o755. Aunque el contenido del envelope va cifrado, el
  // listado del directorio no deberia ser legible por otros usuarios locales.
  await mkdir(ICLOUD_SYNC_DIR, { recursive: true, mode: 0o700 });
  const tmpPath = ICLOUD_SYNC_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(envelope, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  await rename(tmpPath, ICLOUD_SYNC_PATH);
}
