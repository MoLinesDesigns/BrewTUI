import { readFile } from 'node:fs/promises';
import { homedir, platform, release, arch } from 'node:os';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import { getMachineId } from './data-dir.js';

// Opt-in crash reporting. The TUI never sends data unless the user has
// configured an endpoint, either via the env var below or via the persisted
// config file at ~/.brewtui-bar/crash-reporter.json. The dashboard backend is
// expected to live on the user's own infrastructure (NAS).
const ENDPOINT_ENV = 'BREW_TUI_CRASH_ENDPOINT';
const TOKEN_ENV = 'BREW_TUI_CRASH_TOKEN';
const CONFIG_PATH = join(homedir(), '.brewtui-bar', 'crash-reporter.json');
const POST_TIMEOUT_MS = 5_000;

interface CrashReporterConfig {
  endpoint: string | null;
  token: string | null;
  enabled: boolean;
}

interface CrashReport {
  app: 'brewtui-bar';
  version: string;
  platform: string;
  os: string;
  arch: string;
  machineId: string;
  timestamp: string;
  level: 'fatal' | 'error';
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
}

let _installed = false;

async function loadConfigFromDisk(): Promise<CrashReporterConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<CrashReporterConfig>;
    return {
      endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : null,
      token: typeof parsed.token === 'string' ? parsed.token : null,
      enabled: parsed.enabled === true,
    };
  } catch {
    return { endpoint: null, token: null, enabled: false };
  }
}

async function resolveConfig(): Promise<CrashReporterConfig> {
  const envEndpoint = process.env[ENDPOINT_ENV]?.trim();
  const envToken = process.env[TOKEN_ENV]?.trim();
  if (envEndpoint) {
    return { endpoint: envEndpoint, token: envToken ?? null, enabled: true };
  }
  return loadConfigFromDisk();
}

function isHttpsOrLocal(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    // Allow plain http only for loopback/LAN destinations (NAS).
    if (parsed.protocol === 'http:') {
      const host = parsed.hostname;
      return /^(localhost|127\.\d+\.\d+\.\d+|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1$)/i.test(host);
    }
    return false;
  } catch {
    return false;
  }
}

async function postReport(report: CrashReport, config: CrashReporterConfig): Promise<void> {
  if (!config.endpoint || !isHttpsOrLocal(config.endpoint)) return;
  try {
    await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { 'Authorization': `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
  } catch (err) {
    // Never let the reporter itself crash the host process.
    logger.warn('crash-reporter: POST failed', { error: String(err) });
  }
}

function buildReport(level: 'fatal' | 'error', err: unknown, context: Record<string, unknown>, machineId: string, version: string): CrashReport {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && typeof err.stack === 'string' ? err.stack : null;
  return {
    app: 'brewtui-bar',
    version,
    platform: platform(),
    os: release(),
    arch: arch(),
    machineId,
    timestamp: new Date().toISOString(),
    level,
    message,
    stack,
    context,
  };
}

/**
 * Manually report a non-fatal error. No-op if reporting is not enabled.
 */
export async function reportError(err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const config = await resolveConfig();
  if (!config.enabled || !config.endpoint) return;
  const machineId = await getMachineId();
  const version = typeof process.env.APP_VERSION === 'string' ? process.env.APP_VERSION : 'unknown';
  await postReport(buildReport('error', err, context, machineId, version), config);
}

/**
 * Install global handlers for uncaughtException / unhandledRejection.
 * No-op when the reporter is not enabled. Safe to call multiple times.
 */
export async function installCrashReporter(): Promise<void> {
  if (_installed) return;
  const config = await resolveConfig();
  if (!config.enabled || !config.endpoint) return;
  _installed = true;

  const machineId = await getMachineId();
  const version = typeof process.env.APP_VERSION === 'string' ? process.env.APP_VERSION : 'unknown';

  process.on('uncaughtException', (err) => {
    void postReport(buildReport('fatal', err, { kind: 'uncaughtException' }, machineId, version), config);
  });

  process.on('unhandledRejection', (reason) => {
    void postReport(buildReport('error', reason, { kind: 'unhandledRejection' }, machineId, version), config);
  });

  logger.info('crash-reporter: enabled', { endpoint: config.endpoint });
}
