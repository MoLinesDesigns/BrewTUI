import { execBrew } from '../brew-cli.js';
import { logger } from '../../utils/logger.js';
import { t } from '../../i18n/index.js';
import type { UpgradeImpact, RiskLevel } from './types.js';

// Packages whose upgrade is always considered high risk
const HIGH_RISK_PACKAGES = new Set([
  'openssl', 'openssl@3', 'openssl@4', 'openssl@1.1',
  'python', 'python@3', 'python@3.11', 'python@3.12', 'python@3.13',
  'node', 'node@18', 'node@20', 'ruby', 'ruby@3',
  'sqlite', 'sqlite3', 'libpq', 'postgresql', 'postgresql@16',
  'glibc', 'gcc', 'llvm',
]);

function isMajorVersionBump(from: string, to: string): boolean {
  const fromMajor = parseInt(from.split('.')[0] ?? '0', 10);
  const toMajor = parseInt(to.split('.')[0] ?? '0', 10);
  return !isNaN(fromMajor) && !isNaN(toMajor) && toMajor > fromMajor;
}

function calculateRisk(
  name: string,
  reverseDeps: string[],
  fromVersion: string,
  toVersion: string,
): { risk: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];

  // HIGH_RISK packages are sticky — always 'high' regardless of other factors
  if (HIGH_RISK_PACKAGES.has(name)) {
    reasons.push(t('impact_reason_critical_package'));
    return { risk: 'high', reasons };
  }

  // >10 reverse deps forces high directly
  if (reverseDeps.length > 10) {
    reasons.push(t('impact_reason_many_deps', { count: reverseDeps.length }));
    return { risk: 'high', reasons };
  }

  let factorCount = 0;

  if (reverseDeps.length >= 3) {
    factorCount++;
    reasons.push(t('impact_reason_many_deps', { count: reverseDeps.length }));
  }

  if (isMajorVersionBump(fromVersion, toVersion)) {
    factorCount++;
    reasons.push(t('impact_reason_major_bump'));
  }

  const risk: RiskLevel = factorCount >= 2 ? 'high' : factorCount === 1 ? 'medium' : 'low';
  return { risk, reasons };
}

export async function analyzeUpgradeImpact(
  packageName: string,
  fromVersion: string,
  toVersion: string,
  packageType: 'formula' | 'cask',
): Promise<UpgradeImpact> {
  // Casks are self-contained — no dependency graph to analyze
  if (packageType === 'cask') {
    return {
      packageName,
      fromVersion,
      toVersion,
      packageType,
      directDeps: [],
      reverseDeps: [],
      risk: 'low',
      riskReasons: [],
    };
  }

  let directDeps: string[] = [];
  let reverseDeps: string[] = [];

  try {
    const depsOutput = await execBrew(['deps', '--1', packageName]);
    directDeps = depsOutput.split('\n').filter((l) => l.trim() !== '');
  } catch (err) {
    logger.warn(`impact-analyzer: deps failed for ${packageName}: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const usesOutput = await execBrew(['uses', '--installed', packageName]);
    reverseDeps = usesOutput.split('\n').filter((l) => l.trim() !== '');
  } catch (err) {
    logger.warn(`impact-analyzer: uses failed for ${packageName}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { risk, reasons } = calculateRisk(packageName, reverseDeps, fromVersion, toVersion);

  return {
    packageName,
    fromVersion,
    toVersion,
    packageType,
    directDeps,
    reverseDeps,
    risk,
    riskReasons: reasons,
  };
}

export { isMajorVersionBump };
