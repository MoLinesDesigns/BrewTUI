import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { captureSnapshot, loadSnapshots, saveSnapshot } from '../state-snapshot/snapshot.js';
import type { BrewSnapshot } from '../state-snapshot/snapshot.js';
import { diffSnapshots } from '../diff-engine/diff.js';
import { execBrew, streamBrew } from '../brew-cli.js';
import { validatePackageName } from '../brew-api.js';
import { logger } from '../../utils/logger.js';
import type { RollbackAction, RollbackPlan, RollbackStrategy } from './types.js';

async function detectStrategy(
  name: string,
  targetVersion: string,
  packageType: 'formula' | 'cask',
): Promise<{ strategy: RollbackStrategy; versionedFormula?: string }> {
  // Casks cannot be restored to a specific version
  if (packageType === 'cask') {
    return { strategy: 'pin-only' };
  }

  // Try versioned formula (e.g. node@20)
  try {
    const major = targetVersion.split('.')[0] ?? '';
    if (major !== '' && !isNaN(parseInt(major, 10))) {
      const versionedFormula = `${name}@${major}`;
      await execBrew(['info', '--json=v2', versionedFormula]);
      return { strategy: 'versioned-formula', versionedFormula };
    }
  } catch {
    // Not available — fall through
  }

  // Try bottle cache
  try {
    const brewCache = (await execBrew(['--cache'])).trim();
    const downloadsDir = join(brewCache, 'downloads');
    const entries = await readdir(downloadsDir);
    const found = entries.some(
      (entry) => entry.includes(name) && entry.includes(targetVersion),
    );
    if (found) {
      return { strategy: 'bottle-cache' };
    }
  } catch {
    // Cache not readable — fall through
  }

  return { strategy: 'pin-only' };
}

export async function buildRollbackPlan(
  snapshot: BrewSnapshot,
  isPro: boolean,
): Promise<RollbackPlan> {
  if (!isPro) throw new Error('Pro license required');

  const current = await captureSnapshot();
  const diff = diffSnapshots(snapshot, current);

  const actions: RollbackAction[] = [];
  const warnings: string[] = [];

  // Packages that were upgraded (current > snapshot) → need downgrade
  for (const entry of diff.upgraded) {
    const type = entry.type;
    const { strategy, versionedFormula } = await detectStrategy(entry.name, entry.from, type);
    actions.push({
      packageName: entry.name,
      packageType: type,
      action: 'downgrade',
      fromVersion: entry.to,   // current version
      toVersion: entry.from,   // snapshot (target) version
      strategy,
      versionedFormula,
    });
  }

  // Packages that were downgraded (current < snapshot) → need to restore up
  for (const entry of diff.downgraded) {
    const type = entry.type;
    const { strategy, versionedFormula } = await detectStrategy(entry.name, entry.from, type);
    actions.push({
      packageName: entry.name,
      packageType: type,
      action: 'downgrade',
      fromVersion: entry.to,   // current version
      toVersion: entry.from,   // snapshot (target) version
      strategy,
      versionedFormula,
    });
  }

  // Packages added since snapshot (in current, not in snapshot) → would need removal
  // Security: never auto-remove. Mark as unavailable with warning.
  for (const entry of diff.added) {
    if (entry.type === 'tap') continue;
    const type = entry.type;
    actions.push({
      packageName: entry.name,
      packageType: type,
      action: 'remove',
      fromVersion: entry.version,
      toVersion: '',
      strategy: 'unavailable',
    });
  }

  // Packages removed since snapshot (in snapshot, not in current) → need re-install
  for (const entry of diff.removed) {
    if (entry.type === 'tap') continue;
    const type = entry.type;
    const { strategy, versionedFormula } = await detectStrategy(entry.name, entry.version, type);
    actions.push({
      packageName: entry.name,
      packageType: type,
      action: 'install',
      fromVersion: '',
      toVersion: entry.version,
      strategy,
      versionedFormula,
    });
  }

  // Build warnings
  const caskPinCount = actions.filter(
    (a) => a.packageType === 'cask' && a.action !== 'remove' && a.strategy === 'pin-only',
  ).length;
  if (caskPinCount > 0) {
    warnings.push(`${caskPinCount} cask(s) will be pinned only (version restoration not supported)`);
  }

  const canExecute = actions.some((a) => a.strategy !== 'unavailable');

  const snapshotLabel = snapshot.label ?? 'Auto';
  const snapshotDate = new Date(snapshot.capturedAt).toLocaleString();

  logger.debug('Built rollback plan', { actionCount: actions.length, canExecute });

  return {
    snapshotLabel,
    snapshotDate,
    actions,
    warnings,
    canExecute,
  };
}

export async function* executeRollbackPlan(
  plan: RollbackPlan,
  isPro: boolean,
): AsyncGenerator<string> {
  if (!isPro) throw new Error('Pro license required');

  for (const action of plan.actions) {
    if (action.strategy === 'unavailable') {
      yield `[skip] ${action.packageName}: cannot restore automatically — manual action required`;
      continue;
    }

    if (action.action === 'remove') {
      yield `[skip] ${action.packageName}: removal skipped for safety — remove manually if needed`;
      continue;
    }

    // SEG-001 sister fix: el snapshot proviene de disco; un snapshot manipulado
    // podria contener nombres con flags. Validar antes de cualquier spawn.
    try {
      validatePackageName(action.packageName);
      if (action.versionedFormula) validatePackageName(action.versionedFormula);
    } catch (err) {
      yield `[reject] ${action.packageName}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    if (action.action === 'install') {
      if (action.strategy === 'pin-only') {
        yield `[warn] ${action.packageName}: cannot install specific version — skipping`;
        continue;
      }
      if (action.strategy === 'versioned-formula' && action.versionedFormula) {
        yield `[install] ${action.packageName} via ${action.versionedFormula}`;
        for await (const line of streamBrew(['install', action.versionedFormula])) {
          yield line;
        }
        continue;
      }
      if (action.strategy === 'bottle-cache') {
        yield `[install] ${action.packageName} from bottle cache`;
        for await (const line of streamBrew(['install', '--force-bottle', action.packageName])) {
          yield line;
        }
        continue;
      }
      continue;
    }

    // action === 'downgrade'
    if (action.strategy === 'versioned-formula' && action.versionedFormula) {
      yield `[downgrade] ${action.packageName}: ${action.fromVersion} → ${action.toVersion} via ${action.versionedFormula}`;
      for await (const line of streamBrew(['install', action.versionedFormula])) {
        yield line;
      }
    } else if (action.strategy === 'bottle-cache') {
      yield `[downgrade] ${action.packageName}: ${action.fromVersion} → ${action.toVersion} from bottle cache`;
      for await (const line of streamBrew(['install', '--force-bottle', action.packageName])) {
        yield line;
      }
    } else if (action.strategy === 'pin-only') {
      yield `[pin] ${action.packageName}: pinning at current version (target version not restorable)`;
      await execBrew(['pin', action.packageName]);
      yield `✓ Pinned ${action.packageName}`;
    }
  }

  // Capture post-rollback snapshot
  yield '[snapshot] Capturing post-rollback snapshot...';
  try {
    const postSnapshot = await captureSnapshot();
    await saveSnapshot(postSnapshot, 'post-rollback');
    yield '[snapshot] Snapshot saved.';
  } catch (err) {
    logger.warn('Failed to save post-rollback snapshot', { err });
    yield '[snapshot] Warning: could not save snapshot.';
  }
}

export { loadSnapshots };
