import { spawn } from 'node:child_process';
import { execBrew, streamBrew, BREW_BIN } from './brew-cli.js';
import { parseInstalledJson, parseOutdatedJson, parseServicesJson, parseFormulaInfoJson } from './parsers/json-parser.js';
import { parseSearchResults, parseDoctorOutput, parseBrewConfig, parseLeavesOutput } from './parsers/text-parser.js';
import type { Formula, Cask, OutdatedPackage, BrewService, BrewConfig, PackageListItem } from './types.js';
import { analyzeUpgradeImpact } from './impact/impact-analyzer.js';
import type { UpgradeImpact } from './impact/types.js';

// EP-011: Package name validation. Exportada para que cualquier modulo que
// llame a `streamBrew` con un nombre dinamico (compliance-remediator,
// brewfile-manager, rollback-engine) pueda blindar el spawn frente a flag
// injection. PKG_PATTERN sigue siendo el unico patron canonico — cualquier
// regex divergente en modulos clientes (ARQ-004) debe importarse desde aqui.
export const PKG_PATTERN = /^[\w@./+-]+$/;

export function validatePackageName(name: string): void {
  if (!PKG_PATTERN.test(name)) throw new Error('Invalid package name: ' + name);
}

export async function brewUpdate(): Promise<void> {
  // Run brew update WITHOUT HOMEBREW_NO_AUTO_UPDATE so it actually fetches.
  // BK-016: enforce a 120s ceiling — without one, a stalled brew tap fetch
  // could hang fetchAll() indefinitely.
  return new Promise((resolve, reject) => {
    const proc = spawn(BREW_BIN, ['update'], { stdio: 'ignore' });
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGTERM');
      reject(new Error('brew update timed out after 120s'));
    }, 120_000);
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`brew update exited with code ${code}`));
    });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function getInstalled(): Promise<{ formulae: Formula[]; casks: Cask[] }> {
  const raw = await execBrew(['info', '--json=v2', '--installed']);
  return parseInstalledJson(raw);
}

export async function getOutdated(): Promise<{ formulae: OutdatedPackage[]; casks: OutdatedPackage[] }> {
  // Match `brew outdated` exactly: skip `--greedy`. Auto-updating casks
  // (Firefox, Docker, Warp, …) carry stale Homebrew metadata and would
  // otherwise show as outdated even when the app already updated itself.
  const raw = await execBrew(['outdated', '--json=v2']);
  return parseOutdatedJson(raw);
}

export async function getServices(): Promise<BrewService[]> {
  const raw = await execBrew(['services', 'list', '--json']);
  return parseServicesJson(raw);
}

export async function getFormulaInfo(name: string): Promise<Formula | null> {
  validatePackageName(name);
  const raw = await execBrew(['info', '--json=v2', name]);
  return parseFormulaInfoJson(raw);
}

// SCR-008: Cask-specific info endpoint
export async function getCaskInfo(name: string): Promise<Cask | null> {
  validatePackageName(name);
  try {
    const raw = await execBrew(['info', '--json=v2', '--cask', name]);
    const data = JSON.parse(raw) as { casks?: Cask[] };
    return data.casks?.[0] ?? null;
  } catch {
    return null;
  }
}

// UI-013: cask → formula-shape adaptor lives next to the canonical Cask type
// instead of inside a view, so any future formula field added to the type is
// reflected here once and not in N callers.
export function formulaeFromCask(cask: Cask): Formula {
  return {
    name: cask.token,
    full_name: cask.full_token,
    tap: '',
    desc: cask.desc,
    license: '',
    homepage: cask.homepage,
    versions: { stable: cask.version, head: null, bottle: false },
    dependencies: [],
    build_dependencies: [],
    installed: cask.installed
      ? [{
          version: cask.installed,
          used_options: [],
          built_as_bottle: false,
          poured_from_bottle: false,
          time: cask.installed_time ?? 0,
          runtime_dependencies: [],
          installed_as_dependency: false,
          installed_on_request: true,
        }]
      : [],
    linked_keg: null,
    pinned: false,
    outdated: cask.outdated,
    deprecated: false,
    keg_only: false,
    caveats: null,
  };
}

export async function search(term: string): Promise<{ formulae: string[]; casks: string[] }> {
  // Strip leading dashes to prevent flag injection into `brew search`
  // (e.g. "--desc" would be parsed by brew as an option, not a search term).
  const safeTerm = term.replace(/^-+/, '');
  if (!safeTerm) return { formulae: [], casks: [] };
  const raw = await execBrew(['search', safeTerm]);
  return parseSearchResults(raw);
}

export async function getDoctor(): Promise<{ warnings: string[]; isClean: boolean }> {
  try {
    const raw = await execBrew(['doctor']);
    return parseDoctorOutput(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return parseDoctorOutput(msg);
  }
}

export async function getConfig(): Promise<BrewConfig> {
  const raw = await execBrew(['config']);
  return parseBrewConfig(raw);
}

export async function getLeaves(): Promise<string[]> {
  const raw = await execBrew(['leaves']);
  return parseLeavesOutput(raw);
}

export function installPackage(name: string): AsyncGenerator<string> {
  validatePackageName(name);
  return streamBrew(['install', name]);
}

export function upgradePackage(name: string): AsyncGenerator<string> {
  validatePackageName(name);
  return streamBrew(['upgrade', name]);
}

export function upgradeAll(): AsyncGenerator<string> {
  return streamBrew(['upgrade']);
}

export async function uninstallPackage(name: string): Promise<string> {
  validatePackageName(name);
  return execBrew(['uninstall', name]);
}

export async function serviceAction(name: string, action: 'start' | 'stop' | 'restart'): Promise<string> {
  validatePackageName(name);
  return execBrew(['services', action, name]);
}

// ARQ-008: Pin/unpin operations moved from outdated view
export async function pinPackage(name: string): Promise<string> {
  validatePackageName(name);
  return execBrew(['pin', name]);
}

export async function unpinPackage(name: string): Promise<string> {
  validatePackageName(name);
  return execBrew(['unpin', name]);
}

export function formulaeToListItems(formulae: Formula[]): PackageListItem[] {
  return formulae.map((f) => {
    const installed = f.installed[0];
    return {
      name: f.name,
      version: installed?.version ?? f.versions.stable,
      desc: f.desc,
      type: 'formula',
      outdated: f.outdated,
      pinned: f.pinned,
      kegOnly: f.keg_only,
      installedAsDependency: installed?.installed_as_dependency ?? false,
      installedTime: installed?.time ?? null,
    };
  });
}

// PERF-007: cache impact analyses keyed by name+version pair. Cursor moves
// in the OutdatedView debounce, but a stable list still re-runs deps/uses
// for the same package every time it gets focus. The version pair guarantees
// a fresh analysis when a refetch updates the outdated info.
// ARQ-002: TTL temporal para invalidar entradas si el usuario hace cambios
// fuera de la app (brew pin, brew upgrade desde otra terminal). Sin TTL un
// valor cacheado al inicio de la sesion puede quedar stale toda la sesion.
interface CachedImpact {
  result: UpgradeImpact;
  cachedAt: number;
}
const impactCache = new Map<string, CachedImpact>();
const IMPACT_CACHE_LIMIT = 64;
const IMPACT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function impactKey(name: string, from: string, to: string, type: 'formula' | 'cask'): string {
  return `${type}::${name}::${from}::${to}`;
}

export async function getUpgradeImpact(
  packageName: string,
  fromVersion: string,
  toVersion: string,
  packageType: 'formula' | 'cask',
): Promise<UpgradeImpact> {
  validatePackageName(packageName);
  const key = impactKey(packageName, fromVersion, toVersion, packageType);
  const cached = impactCache.get(key);
  if (cached && Date.now() - cached.cachedAt < IMPACT_CACHE_TTL_MS) {
    return cached.result;
  }
  if (cached) {
    // Entrada stale — eliminar para preservar el orden de insercion LRU.
    impactCache.delete(key);
  }

  const result = await analyzeUpgradeImpact(packageName, fromVersion, toVersion, packageType);

  if (impactCache.size >= IMPACT_CACHE_LIMIT) {
    const firstKey = impactCache.keys().next().value;
    if (firstKey !== undefined) impactCache.delete(firstKey);
  }
  impactCache.set(key, { result, cachedAt: Date.now() });
  return result;
}

// Test seam: drop cache between scenarios.
export function _resetImpactCacheForTests(): void {
  impactCache.clear();
}

export function casksToListItems(casks: Cask[]): PackageListItem[] {
  return casks.map((c) => ({
    name: c.token,
    version: c.installed ?? c.version,
    desc: c.desc,
    type: 'cask',
    outdated: c.outdated,
    pinned: false,
    kegOnly: false,
    installedAsDependency: false,
    installedTime: c.installed_time ?? null,
  }));
}
