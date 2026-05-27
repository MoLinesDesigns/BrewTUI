import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadBrewfile: vi.fn(),
  saveBrewfile: vi.fn(),
  computeDrift: vi.fn(),
  createDefaultBrewfile: vi.fn(),
  loadPolicy: vi.fn(),
  checkCompliance: vi.fn(),
  loadSnapshots: vi.fn(),
  buildRollbackPlan: vi.fn(),
  analyzeCleanup: vi.fn(),
  runSecurityAudit: vi.fn(),
  loadHistory: vi.fn(),
  appendEntry: vi.fn(),
  clearHistory: vi.fn(),
  sync: vi.fn(),
  loadSyncConfig: vi.fn(),
  applyConflictResolutions: vi.fn(),
  readSyncEnvelope: vi.fn(),
  decryptPayload: vi.fn(),
  loadLicense: vi.fn(),
  verifyPro: vi.fn(),
}));

vi.mock('../lib/brewfile/brewfile-manager.js', () => ({
  loadBrewfile: mocks.loadBrewfile,
  saveBrewfile: mocks.saveBrewfile,
  computeDrift: mocks.computeDrift,
  createDefaultBrewfile: mocks.createDefaultBrewfile,
}));
vi.mock('../lib/compliance/policy-io.js', () => ({ loadPolicy: mocks.loadPolicy }));
vi.mock('../lib/compliance/compliance-checker.js', () => ({ checkCompliance: mocks.checkCompliance }));
vi.mock('../lib/rollback/rollback-engine.js', () => ({
  loadSnapshots: mocks.loadSnapshots,
  buildRollbackPlan: mocks.buildRollbackPlan,
}));
vi.mock('../lib/cleanup/cleanup-analyzer.js', () => ({ analyzeCleanup: mocks.analyzeCleanup }));
vi.mock('../lib/security/audit-runner.js', () => ({ runSecurityAudit: mocks.runSecurityAudit }));
vi.mock('../lib/history/history-logger.js', () => ({
  loadHistory: mocks.loadHistory,
  appendEntry: mocks.appendEntry,
  clearHistory: mocks.clearHistory,
}));
vi.mock('../lib/sync/sync-engine.js', () => ({
  sync: mocks.sync,
  loadSyncConfig: mocks.loadSyncConfig,
  applyConflictResolutions: mocks.applyConflictResolutions,
}));
vi.mock('../lib/sync/backends/icloud-backend.js', () => ({ readSyncEnvelope: mocks.readSyncEnvelope }));
vi.mock('../lib/sync/crypto.js', () => ({ decryptPayload: mocks.decryptPayload }));
vi.mock('../lib/license/license-manager.js', () => ({ loadLicense: mocks.loadLicense }));
vi.mock('../lib/license/pro-guard.js', () => ({ verifyPro: mocks.verifyPro }));
vi.mock('../utils/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

import { useBrewStore } from './brew-store.js';
import { useBrewfileStore } from './brewfile-store.js';
import { useCleanupStore } from './cleanup-store.js';
import { useComplianceStore } from './compliance-store.js';
import { useHistoryStore } from './history-store.js';
import { useRollbackStore } from './rollback-store.js';
import { useSecurityStore } from './security-store.js';
import { useSyncStore } from './sync-store.js';
import type { BrewfileSchema } from '../lib/brewfile/types.js';

const schema: BrewfileSchema = {
  version: 1,
  meta: { name: 'dev', createdAt: '2026-05-01', updatedAt: '2026-05-01' },
  formulae: [],
  casks: [],
  taps: [],
  strictMode: false,
};

const resetStores = () => {
  useBrewfileStore.setState({ schema: null, drift: null, loading: false, driftLoading: false, error: null });
  useComplianceStore.setState({ policy: null, report: null, loading: false, error: null });
  useRollbackStore.setState({
    snapshots: [],
    loading: false,
    error: null,
    selectedSnapshot: null,
    plan: null,
    planLoading: false,
    planError: null,
  });
  useCleanupStore.setState({ summary: null, selected: new Set(), loading: false, error: null });
  useHistoryStore.setState({ entries: [], loading: false, error: null });
  useSecurityStore.setState({ summary: null, loading: false, error: null, cachedAt: null });
  useSyncStore.setState({ config: null, lastResult: null, conflicts: [], loading: false, error: null });
};

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
  mocks.verifyPro.mockReturnValue(true);
});

describe('brewfile-store', () => {
  it('loads a Brewfile and refreshes drift', async () => {
    mocks.loadBrewfile.mockResolvedValue(schema);
    mocks.computeDrift.mockResolvedValue({ score: 100, diff: {}, missingPackages: [], extraPackages: [], wrongVersions: [] });

    await useBrewfileStore.getState().load();
    await vi.waitFor(() => expect(useBrewfileStore.getState().drift).toMatchObject({ score: 100 }));

    expect(useBrewfileStore.getState().schema).toBe(schema);
    expect(useBrewfileStore.getState().loading).toBe(false);
  });

  it('records save errors without replacing the current schema', async () => {
    useBrewfileStore.setState({ schema });
    mocks.saveBrewfile.mockRejectedValue(new Error('disk full'));

    await useBrewfileStore.getState().save({ ...schema, meta: { ...schema.meta, name: 'new' } });

    expect(useBrewfileStore.getState().schema).toBe(schema);
    expect(useBrewfileStore.getState().error).toBe('disk full');
  });
});

describe('compliance-store', () => {
  it('refuses policy import without Pro', async () => {
    await useComplianceStore.getState().importPolicy('/tmp/policy.json', false);

    expect(mocks.loadPolicy).not.toHaveBeenCalled();
    expect(useComplianceStore.getState().error).toBe('Pro license required');
  });

  it('imports a policy and runs a compliance check', async () => {
    const policy = { version: 1, name: 'team', required: [], forbidden: [], taps: [] };
    const report = { score: 100, violations: [], requiredCount: 0, forbiddenCount: 0, tapCount: 0 };
    mocks.loadPolicy.mockResolvedValue(policy);
    mocks.checkCompliance.mockResolvedValue(report);

    await useComplianceStore.getState().importPolicy('/tmp/policy.json', true);
    await useComplianceStore.getState().runCheck(true);

    expect(useComplianceStore.getState().policy).toBe(policy);
    expect(useComplianceStore.getState().report).toBe(report);
  });
});

describe('rollback-store', () => {
  it('does not load snapshots for non-Pro users', async () => {
    await useRollbackStore.getState().fetchSnapshots(false);
    expect(mocks.loadSnapshots).not.toHaveBeenCalled();
  });

  it('loads snapshots and builds a rollback plan', async () => {
    const snapshot = { id: 's1', createdAt: 'now', formulae: [], casks: [], taps: [] };
    const plan = { actions: [], warnings: [], canRollback: true };
    mocks.loadSnapshots.mockResolvedValue([snapshot]);
    mocks.buildRollbackPlan.mockResolvedValue(plan);

    await useRollbackStore.getState().fetchSnapshots(true);
    await useRollbackStore.getState().selectSnapshot(snapshot as never, true);

    expect(useRollbackStore.getState().snapshots).toEqual([snapshot]);
    expect(useRollbackStore.getState().plan).toBe(plan);
  });
});

describe('cleanup-store', () => {
  it('fetches brew state before analyzing when formulae are empty', async () => {
    const fetchInstalled = vi.fn().mockResolvedValue(undefined);
    const fetchLeaves = vi.fn().mockResolvedValue(undefined);
    useBrewStore.setState({ formulae: [], leaves: [], fetchInstalled, fetchLeaves });
    mocks.analyzeCleanup.mockResolvedValue({ candidates: [{ name: 'jpeg-xl' }], totalSize: 34 });

    await useCleanupStore.getState().analyze();

    expect(fetchInstalled).toHaveBeenCalled();
    expect(fetchLeaves).toHaveBeenCalled();
    expect(useCleanupStore.getState().summary).toMatchObject({ totalSize: 34 });
  });

  it('toggles, selects and clears cleanup candidates', () => {
    useCleanupStore.setState({ summary: { candidates: [{ name: 'a' }, { name: 'b' }] } as never });

    useCleanupStore.getState().toggleSelect('a');
    expect([...useCleanupStore.getState().selected]).toEqual(['a']);
    useCleanupStore.getState().toggleSelect('a');
    expect(useCleanupStore.getState().selected.size).toBe(0);
    useCleanupStore.getState().selectAll();
    expect([...useCleanupStore.getState().selected]).toEqual(['a', 'b']);
    useCleanupStore.getState().deselectAll();
    expect(useCleanupStore.getState().selected.size).toBe(0);
  });
});

describe('history-store', () => {
  it('fetches, appends and clears history through the pro guard', async () => {
    const entry = { id: 'h1', timestamp: 'now', action: 'install', packageName: 'wget', success: true };
    mocks.loadHistory.mockResolvedValueOnce([entry]).mockResolvedValueOnce([entry, { ...entry, id: 'h2' }]);

    await useHistoryStore.getState().fetchHistory();
    await useHistoryStore.getState().logAction('install', 'curl', true);
    await useHistoryStore.getState().clearHistory();

    expect(mocks.verifyPro).toHaveBeenCalled();
    expect(mocks.appendEntry).toHaveBeenCalledWith(true, 'install', 'curl', true, null);
    expect(mocks.clearHistory).toHaveBeenCalledWith(true);
    expect(useHistoryStore.getState().entries).toEqual([]);
  });
});

describe('security-store', () => {
  it('uses cached security scan results until force refresh', async () => {
    useSecurityStore.setState({
      summary: { total: 0, vulnerabilities: [], severityCounts: {} } as never,
      cachedAt: Date.now(),
    });

    await useSecurityStore.getState().scan(false);
    expect(mocks.runSecurityAudit).not.toHaveBeenCalled();
  });

  it('runs a scan and stores summary', async () => {
    useBrewStore.setState({ formulae: [{ name: 'openssl' }] as never, casks: [] });
    mocks.runSecurityAudit.mockResolvedValue({ total: 1, vulnerabilities: [], severityCounts: {} });

    await useSecurityStore.getState().scan(true);

    expect(mocks.runSecurityAudit).toHaveBeenCalledWith(true, [{ name: 'openssl' }], []);
    expect(useSecurityStore.getState().summary).toMatchObject({ total: 1 });
  });
});

describe('sync-store', () => {
  it('initializes only for Pro users', async () => {
    mocks.loadSyncConfig.mockResolvedValue({ machineId: 'm1' });

    await useSyncStore.getState().initialize(false);
    expect(mocks.loadSyncConfig).not.toHaveBeenCalled();

    await useSyncStore.getState().initialize(true);
    expect(useSyncStore.getState().config).toEqual({ machineId: 'm1' });
  });

  it('stores conflicts instead of replacing config on sync conflict', async () => {
    const conflict = { path: 'formulae.wget' };
    mocks.sync.mockResolvedValue({ conflicts: [conflict], pushed: 0, pulled: 0 });

    await useSyncStore.getState().syncNow(true, schema as never);

    expect(useSyncStore.getState().conflicts).toEqual([conflict]);
  });

  it('applies conflict resolutions using decrypted remote payload', async () => {
    const config = { machineId: 'local' };
    const envelope = { encrypted: 'cipher', iv: 'iv', tag: 'tag' };
    const payload = { brewfile: schema };
    useSyncStore.setState({ config } as never);
    mocks.readSyncEnvelope.mockResolvedValue(envelope);
    mocks.loadLicense.mockResolvedValue({ key: 'license-key' });
    mocks.decryptPayload.mockReturnValue(payload);
    mocks.loadSyncConfig.mockResolvedValue({ machineId: 'updated' });

    await useSyncStore.getState().resolveConflicts([{ conflict: { path: 'x' } as never, resolution: 'use-local' }]);

    expect(mocks.decryptPayload).toHaveBeenCalledWith('cipher', 'iv', 'tag', 'license-key');
    expect(mocks.applyConflictResolutions).toHaveBeenCalledWith(payload, expect.any(Array), 'local');
    expect(useSyncStore.getState().conflicts).toEqual([]);
  });
});
