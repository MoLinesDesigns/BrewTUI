import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, ensureDataDirs } from '../data-dir.js';
import { captureSnapshot, saveSnapshot } from '../state-snapshot/snapshot.js';
import { diffDesiredActual } from '../diff-engine/diff.js';
import { serializeBrewfile, parseBrewfile } from './yaml-serializer.js';
import { streamBrew } from '../brew-cli.js';
import { validatePackageName } from '../brew-api.js';
import { logger } from '../../utils/logger.js';
import type { BrewfileSchema, DriftReport } from './types.js';

export const BREWFILE_PATH = join(DATA_DIR, 'brewfile.yaml');

export async function loadBrewfile(): Promise<BrewfileSchema | null> {
  try {
    const raw = await readFile(BREWFILE_PATH, 'utf-8');
    return parseBrewfile(raw);
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return null;
    }
    logger.warn('Failed to parse Brewfile', { error: String(err) });
    return null;
  }
}

export async function saveBrewfile(schema: BrewfileSchema): Promise<void> {
  await ensureDataDirs();
  const updated: BrewfileSchema = {
    ...schema,
    meta: { ...schema.meta, updatedAt: new Date().toISOString() },
  };
  const tmpPath = BREWFILE_PATH + '.tmp';
  await writeFile(tmpPath, serializeBrewfile(updated), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, BREWFILE_PATH);
}

export async function createDefaultBrewfile(name: string): Promise<BrewfileSchema> {
  const snapshot = await captureSnapshot();
  const now = new Date().toISOString();

  const schema: BrewfileSchema = {
    version: 1,
    meta: { name, createdAt: now, updatedAt: now },
    formulae: snapshot.formulae.map((f) => ({ name: f.name })),
    casks: snapshot.casks.map((c) => ({ name: c.name })),
    taps: [...snapshot.taps],
    strictMode: false,
  };

  return schema;
}

export async function computeDrift(schema: BrewfileSchema): Promise<DriftReport> {
  const snapshot = await captureSnapshot();
  const diff = diffDesiredActual(schema, snapshot);

  // missingPackages: in desired but not in actual (added in diff means "missing from actual")
  const missingPackages = diff.added
    .filter((e) => e.type !== 'tap')
    .map((e) => e.name);

  // extraPackages: in actual but not in desired (removed in diff means "extra in actual")
  const extraPackages = diff.removed
    .filter((e) => e.type !== 'tap')
    .map((e) => e.name);

  // wrongVersions: upgraded + downgraded entries
  const wrongVersions = [
    ...diff.upgraded.map((e) => ({ name: e.name, desired: e.to, actual: e.from })),
    ...diff.downgraded.map((e) => ({ name: e.name, desired: e.to, actual: e.from })),
  ];

  const penalty =
    missingPackages.length * 10 +
    extraPackages.length * 2 +
    wrongVersions.length * 5;

  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { diff, score, missingPackages, extraPackages, wrongVersions };
}

export async function* reconcile(
  schema: BrewfileSchema,
  isPro: boolean,
): AsyncGenerator<string> {
  if (!isPro) {
    yield 'Pro license required for reconcile.';
    return;
  }

  const report = await computeDrift(schema);

  if (
    report.missingPackages.length === 0 &&
    report.wrongVersions.length === 0 &&
    report.extraPackages.length === 0
  ) {
    yield 'Already in sync — nothing to do.';
    return;
  }

  // Install missing packages
  for (const name of report.missingPackages) {
    // SEG-002: validar antes del spawn — un Brewfile YAML artesanal puede
    // contener nombres con flags si no se rechaza aqui.
    try {
      validatePackageName(name);
    } catch (err) {
      yield `✗ Rejected ${name}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    yield `→ Installing ${name}...`;
    try {
      for await (const line of streamBrew(['install', name])) {
        yield line;
      }
    } catch (err) {
      yield `✗ Failed to install ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Fix wrong versions
  for (const { name, desired } of report.wrongVersions) {
    const target = `${name}@${desired}`;
    try {
      validatePackageName(target);
    } catch (err) {
      yield `✗ Rejected ${target}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    yield `→ Installing ${target}...`;
    try {
      for await (const line of streamBrew(['install', target])) {
        yield line;
      }
    } catch (err) {
      yield `✗ Failed to install ${target}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Extra packages (strict mode) — warn only, never auto-uninstall
  for (const name of report.extraPackages) {
    yield `⚠ Extra package not in Brewfile: ${name} (remove manually if desired)`;
  }

  // Save post-reconcile snapshot
  try {
    const postSnapshot = await captureSnapshot();
    await saveSnapshot(postSnapshot, 'post-reconcile');
  } catch (err) {
    logger.warn('Failed to save post-reconcile snapshot', { error: String(err) });
  }

  logger.info('Brewfile reconcile complete', {
    missing: report.missingPackages.length,
    extra: report.extraPackages.length,
    wrong: report.wrongVersions.length,
  });

  yield '✓ Reconciliation complete.';
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
