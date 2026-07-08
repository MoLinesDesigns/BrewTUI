import { readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execBrew } from '../brew-cli.js';
import { SNAPSHOTS_DIR, ensureDataDirs } from '../data-dir.js';
import { logger } from '../../utils/logger.js';

export interface BrewSnapshot {
  capturedAt: string;
  label?: string;
  formulae: Array<{ name: string; version: string; pinned: boolean }>;
  casks: Array<{ name: string; version: string }>;
  taps: string[];
}

function isValidSnapshot(v: unknown): v is BrewSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s['capturedAt'] === 'string' &&
    Array.isArray(s['formulae']) &&
    Array.isArray(s['casks']) &&
    Array.isArray(s['taps'])
  );
}

/** Parse `brew list --versions --formula` or `brew list --cask --versions`.
 *  Each line: `name version1 version2...` — last version is the current install. */
function parseVersionsList(output: string): Array<{ name: string; version: string }> {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const name = parts[0] ?? '';
      const version = parts[parts.length - 1] ?? '';
      return { name, version };
    })
    .filter((e) => e.name !== '');
}

/** Parse `brew tap` — one tap per line. */
function parseTapsList(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Parse `brew list --pinned` — one formula per line. */
function parsePinnedList(output: string): Set<string> {
  return new Set(
    output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

export async function captureSnapshot(): Promise<BrewSnapshot> {
  const [formulaeRaw, casksRaw, tapsRaw, pinnedRaw] = await Promise.all([
    execBrew(['list', '--versions', '--formula']),
    execBrew(['list', '--cask', '--versions']),
    execBrew(['tap']),
    execBrew(['list', '--pinned']),
  ]);

  const pinned = parsePinnedList(pinnedRaw);
  const formulae = parseVersionsList(formulaeRaw).map((f) => ({
    ...f,
    pinned: pinned.has(f.name),
  }));
  const casks = parseVersionsList(casksRaw);
  const taps = parseTapsList(tapsRaw);

  return {
    capturedAt: new Date().toISOString(),
    formulae,
    casks,
    taps,
  };
}

/** Sanitize a label for safe use in a filename. */
function sanitizeLabel(label: string): string {
  const clean = label.replace(/[^A-Za-z0-9_-]/g, '_');
  return clean.length > 0 ? clean : 'auto';
}

/** Convert an ISO 8601 timestamp to a filename-safe string by replacing `:` and `.` with `-`. */
function timestampToFilename(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/** Cap on retained snapshots. Older auto snapshots are pruned to keep
 *  the rollback feature from filling ~/.brewtui-bar/snapshots/ indefinitely.
 *  20 entries fits roughly 2-3 weeks of typical usage. */
export const SNAPSHOT_RETENTION_LIMIT = 20;

export async function saveSnapshot(s: BrewSnapshot, label?: string): Promise<void> {
  await ensureDataDirs();

  const effectiveLabel = label ? sanitizeLabel(label) : 'auto';
  const filename = `${timestampToFilename(s.capturedAt)}-${effectiveLabel}.json`;
  const filePath = join(SNAPSHOTS_DIR, filename);
  const tmpPath = filePath + '.tmp';

  const payload: BrewSnapshot = label ? { ...s, label } : s;

  await writeFile(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, filePath);

  await pruneSnapshots();
}

/** Delete the oldest auto-labelled snapshots beyond SNAPSHOT_RETENTION_LIMIT.
 *  Labelled snapshots (those the user explicitly named) are preserved — they
 *  represent intentional checkpoints. */
export async function pruneSnapshots(maxCount = SNAPSHOT_RETENTION_LIMIT): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(SNAPSHOTS_DIR);
  } catch {
    return 0;
  }

  const candidates: Array<{ filename: string; capturedAt: string }> = [];
  for (const filename of entries.filter((f) => f.endsWith('.json'))) {
    // Auto snapshots are named ...-auto.json. User-labelled ones get a slug
    // and stay regardless of count.
    if (!filename.endsWith('-auto.json')) continue;
    try {
      const raw = await readFile(join(SNAPSHOTS_DIR, filename), 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (isValidSnapshot(parsed)) {
        candidates.push({ filename, capturedAt: parsed.capturedAt });
      }
    } catch { /* skip unreadable */ }
  }

  if (candidates.length <= maxCount) return 0;

  candidates.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const toDelete = candidates.slice(maxCount);
  let removed = 0;
  for (const entry of toDelete) {
    try {
      await unlink(join(SNAPSHOTS_DIR, entry.filename));
      removed++;
    } catch (err) {
      logger.warn('Failed to prune snapshot', { filename: entry.filename, error: String(err) });
    }
  }
  if (removed > 0) {
    logger.info('Pruned snapshots', { removed, retained: maxCount });
  }
  return removed;
}

export async function loadSnapshots(): Promise<BrewSnapshot[]> {
  let entries: string[];
  try {
    entries = await readdir(SNAPSHOTS_DIR);
  } catch {
    return [];
  }

  const jsonFiles = entries.filter((f) => f.endsWith('.json'));
  const snapshots: BrewSnapshot[] = [];

  for (const filename of jsonFiles) {
    try {
      const raw = await readFile(join(SNAPSHOTS_DIR, filename), 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!isValidSnapshot(parsed)) {
        logger.warn('Skipping corrupt snapshot file', { filename });
        continue;
      }
      snapshots.push(parsed);
    } catch {
      logger.warn('Failed to read snapshot file', { filename });
    }
  }

  return snapshots.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function deleteSnapshot(capturedAt: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(SNAPSHOTS_DIR);
  } catch {
    return;
  }

  for (const filename of entries.filter((f) => f.endsWith('.json'))) {
    try {
      const raw = await readFile(join(SNAPSHOTS_DIR, filename), 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (isValidSnapshot(parsed) && parsed.capturedAt === capturedAt) {
        await unlink(join(SNAPSHOTS_DIR, filename));
        return;
      }
    } catch {
      // Skip unreadable files
    }
  }
}

export async function getLatestSnapshot(): Promise<BrewSnapshot | null> {
  const all = await loadSnapshots();
  return all[0] ?? null;
}
