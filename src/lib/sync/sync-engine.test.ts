import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrewSnapshot } from '../state-snapshot/snapshot.js';
import type { SyncPayload, MachineState, SyncConflict } from './types.js';

// Mock modules before importing the tested module
vi.mock('../state-snapshot/snapshot.js', () => ({
  captureSnapshot: vi.fn(),
}));

vi.mock('./backends/icloud-backend.js', () => ({
  isICloudAvailable: vi.fn(),
  readSyncEnvelope: vi.fn(),
  writeSyncEnvelope: vi.fn(),
}));

vi.mock('./crypto.js', () => ({
  encryptPayload: vi.fn(),
  decryptPayload: vi.fn(),
}));

vi.mock('../license/license-manager.js', () => ({
  loadLicense: vi.fn(async () => ({
    key: 'BTUI-TEST-LICENSE',
    instanceId: 'inst-1',
    status: 'active',
    customerEmail: 'test@example.com',
    customerName: 'Test',
    plan: 'pro',
    activatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    lastValidatedAt: '2026-05-01T00:00:00.000Z',
  })),
}));

vi.mock('../data-dir.js', () => ({
  DATA_DIR: '/tmp/.brewtui-bar-test',
  getMachineId: vi.fn(async () => 'test-machine-uuid'),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    hostname: vi.fn(() => 'TestMachine'),
  };
});

import { sync, applyConflictResolutions } from './sync-engine.js';
import { captureSnapshot } from '../state-snapshot/snapshot.js';
import { isICloudAvailable, readSyncEnvelope, writeSyncEnvelope } from './backends/icloud-backend.js';
import { encryptPayload, decryptPayload } from './crypto.js';
import { readFile, writeFile, rename } from 'node:fs/promises';

const mockCaptureSnapshot = vi.mocked(captureSnapshot);
const mockIsICloudAvailable = vi.mocked(isICloudAvailable);
const mockReadSyncEnvelope = vi.mocked(readSyncEnvelope);
const mockWriteSyncEnvelope = vi.mocked(writeSyncEnvelope);
const mockEncryptPayload = vi.mocked(encryptPayload);
const mockDecryptPayload = vi.mocked(decryptPayload);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockRename = vi.mocked(rename);

function makeSnapshot(overrides: Partial<BrewSnapshot> = {}): BrewSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    formulae: [],
    casks: [],
    taps: [],
    ...overrides,
  };
}

function makeMachineState(
  machineId: string,
  machineName: string,
  snapshot: BrewSnapshot,
): MachineState {
  return {
    machineId,
    machineName,
    updatedAt: new Date().toISOString(),
    snapshot,
  };
}

const FAKE_ENCRYPTED = {
  encrypted: 'enc==',
  iv: 'iv==',
  tag: 'tag==',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsICloudAvailable.mockResolvedValue(true);
  mockReadSyncEnvelope.mockResolvedValue(null);
  mockEncryptPayload.mockReturnValue(FAKE_ENCRYPTED);
  mockWriteSyncEnvelope.mockResolvedValue(undefined);
  // machine-id file doesn't exist → getMachineId falls back to hostname
  mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  mockWriteFile.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
});

describe('sync()', () => {
  it('throws if not isPro', async () => {
    const snapshot = makeSnapshot();
    mockCaptureSnapshot.mockResolvedValue(snapshot);
    await expect(sync(false)).rejects.toThrow('Pro license required');
  });

  it('returns error if iCloud not available', async () => {
    mockIsICloudAvailable.mockResolvedValue(false);
    const snapshot = makeSnapshot();
    mockCaptureSnapshot.mockResolvedValue(snapshot);

    const result = await sync(true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/iCloud/i);
  });

  it('returns success with empty conflicts when only one machine exists', async () => {
    const snapshot = makeSnapshot({
      formulae: [{ name: 'git', version: '2.43.0', pinned: false }],
      casks: [],
    });
    mockCaptureSnapshot.mockResolvedValue(snapshot);
    mockReadSyncEnvelope.mockResolvedValue(null); // first sync — no existing data

    const result = await sync(true);

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(mockWriteSyncEnvelope).toHaveBeenCalledOnce();
  });

  it('returns success with empty conflicts when two machines have same versions', async () => {
    const localSnapshot = makeSnapshot({
      formulae: [{ name: 'git', version: '2.43.0', pinned: false }],
    });
    mockCaptureSnapshot.mockResolvedValue(localSnapshot);

    // Machine-id falls back to hostname 'TestMachine'
    const otherMachine = makeMachineState(
      'other-machine-uuid',
      'OtherMac',
      makeSnapshot({ formulae: [{ name: 'git', version: '2.43.0', pinned: false }] }),
    );
    const existingPayload: SyncPayload = {
      machines: { 'other-machine-uuid': otherMachine },
    };

    mockReadSyncEnvelope.mockResolvedValue({
      schemaVersion: 1,
      encrypted: 'enc==',
      iv: 'iv==',
      tag: 'tag==',
      updatedAt: new Date().toISOString(),
    });
    mockDecryptPayload.mockReturnValue(existingPayload);

    const result = await sync(true);

    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it('detects conflict when two machines have same formula with different versions', async () => {
    const localSnapshot = makeSnapshot({
      formulae: [{ name: 'node', version: '20.0.0', pinned: false }],
    });
    mockCaptureSnapshot.mockResolvedValue(localSnapshot);

    const otherMachine = makeMachineState(
      'other-machine-uuid',
      'OtherMac',
      makeSnapshot({ formulae: [{ name: 'node', version: '21.0.0', pinned: false }] }),
    );
    const existingPayload: SyncPayload = {
      machines: { 'other-machine-uuid': otherMachine },
    };

    mockReadSyncEnvelope.mockResolvedValue({
      schemaVersion: 1,
      encrypted: 'enc==',
      iv: 'iv==',
      tag: 'tag==',
      updatedAt: new Date().toISOString(),
    });
    mockDecryptPayload.mockReturnValue(existingPayload);

    const result = await sync(true);

    expect(result.success).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      packageName: 'node',
      packageType: 'formula',
      localVersion: '20.0.0',
      remoteMachine: 'OtherMac',
      remoteVersion: '21.0.0',
    });
    // Local machine state must be persisted even when conflicts exist, so that
    // applyConflictResolutions() can update an existing local entry. Without
    // this, the iCloud envelope would only contain remote machines and every
    // 'use-remote' resolution would be silently dropped.
    expect(mockWriteSyncEnvelope).toHaveBeenCalledTimes(1);
  });

  it('merge-union: formula only on machine B appears in merged payload', async () => {
    const localSnapshot = makeSnapshot({
      formulae: [{ name: 'git', version: '2.43.0', pinned: false }],
    });
    mockCaptureSnapshot.mockResolvedValue(localSnapshot);

    // Machine B has an extra formula 'curl' not present locally
    const machineB = makeMachineState(
      'machine-b-uuid',
      'MacB',
      makeSnapshot({
        formulae: [
          { name: 'git', version: '2.43.0', pinned: false },
          { name: 'curl', version: '8.5.0', pinned: false },
        ],
      }),
    );
    const existingPayload: SyncPayload = {
      machines: { 'machine-b-uuid': machineB },
    };

    mockReadSyncEnvelope.mockResolvedValue({
      schemaVersion: 1,
      encrypted: 'enc==',
      iv: 'iv==',
      tag: 'tag==',
      updatedAt: new Date().toISOString(),
    });
    mockDecryptPayload.mockReturnValue(existingPayload);

    const result = await sync(true);

    // No conflict — curl is only on B, not on local (no version mismatch)
    expect(result.success).toBe(true);
    expect(result.conflicts).toHaveLength(0);

    // The merged payload written to iCloud should contain both machines
    expect(mockEncryptPayload).toHaveBeenCalledOnce();
    const writtenPayload = mockEncryptPayload.mock.calls[0]![0] as SyncPayload;
    expect(Object.keys(writtenPayload.machines)).toContain('machine-b-uuid');
    // Local machine (hostname 'TestMachine') should also be present
    expect(Object.values(writtenPayload.machines).some((m) => m.machineName === 'TestMachine')).toBe(true);
    // Machine B still has curl in its entry
    const machineBEntry = writtenPayload.machines['machine-b-uuid'];
    expect(machineBEntry?.snapshot.formulae.some((f) => f.name === 'curl')).toBe(true);
  });

  it('detects cask conflict when two machines have same cask with different versions', async () => {
    const localSnapshot = makeSnapshot({
      casks: [{ name: 'firefox', version: '120.0' }],
    });
    mockCaptureSnapshot.mockResolvedValue(localSnapshot);

    const otherMachine = makeMachineState(
      'other-uuid',
      'Desktop',
      makeSnapshot({ casks: [{ name: 'firefox', version: '121.0' }] }),
    );
    const existingPayload: SyncPayload = { machines: { 'other-uuid': otherMachine } };

    mockReadSyncEnvelope.mockResolvedValue({
      schemaVersion: 1,
      encrypted: 'enc==',
      iv: 'iv==',
      tag: 'tag==',
      updatedAt: new Date().toISOString(),
    });
    mockDecryptPayload.mockReturnValue(existingPayload);

    const result = await sync(true);

    expect(result.success).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.packageType).toBe('cask');
    expect(result.conflicts[0]?.packageName).toBe('firefox');
  });

  // Regression: persisting local machine on conflict (Codex bug #1).
  it('writes local machine to envelope even when conflicts are detected', async () => {
    mockIsICloudAvailable.mockResolvedValue(true);
    mockEncryptPayload.mockReturnValue(FAKE_ENCRYPTED);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);

    const localSnapshot = makeSnapshot({
      formulae: [{ name: 'node', version: '20.0.0', pinned: false }],
    });
    mockCaptureSnapshot.mockResolvedValue(localSnapshot);

    const remoteSnapshot = makeSnapshot({
      formulae: [{ name: 'node', version: '21.0.0', pinned: false }],
    });
    const existingPayload: SyncPayload = {
      machines: { 'machine-other': makeMachineState('machine-other', 'OtherMac', remoteSnapshot) },
    };
    mockReadSyncEnvelope.mockResolvedValue({
      schemaVersion: 1,
      encrypted: 'enc==',
      iv: 'iv==',
      tag: 'tag==',
      updatedAt: new Date().toISOString(),
    });
    mockDecryptPayload.mockReturnValue(existingPayload);

    const result = await sync(true);
    expect(result.success).toBe(false);
    expect(result.conflicts).toHaveLength(1);

    const encryptedPayload = mockEncryptPayload.mock.calls[0]?.[0] as SyncPayload | undefined;
    expect(encryptedPayload).toBeDefined();
    const localMachineEntries = Object.values(encryptedPayload!.machines).filter(
      (m) => m.machineId !== 'machine-other',
    );
    expect(localMachineEntries).toHaveLength(1);
  });
});

// Regression: applyConflictResolutions accumulates updates across iterations (Codex bug #2).
describe('applyConflictResolutions()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncryptPayload.mockReturnValue(FAKE_ENCRYPTED);
    mockWriteFile.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  it('preserves all use-remote resolutions when applied in sequence', async () => {
    const localSnapshot = makeSnapshot({
      formulae: [
        { name: 'node', version: '20.0.0', pinned: false },
        { name: 'git', version: '2.40.0', pinned: false },
      ],
      casks: [{ name: 'firefox', version: '120.0' }],
    });
    const localId = 'machine-local';
    const payload: SyncPayload = {
      machines: { [localId]: makeMachineState(localId, 'LocalMac', localSnapshot) },
    };

    const conflicts: SyncConflict[] = [
      {
        packageName: 'node',
        packageType: 'formula',
        localVersion: '20.0.0',
        remoteVersion: '21.0.0',
        remoteMachine: 'OtherMac',
      },
      {
        packageName: 'git',
        packageType: 'formula',
        localVersion: '2.40.0',
        remoteVersion: '2.43.0',
        remoteMachine: 'OtherMac',
      },
      {
        packageName: 'firefox',
        packageType: 'cask',
        localVersion: '120.0',
        remoteVersion: '125.0',
        remoteMachine: 'OtherMac',
      },
    ];

    await applyConflictResolutions(
      payload,
      conflicts.map((c) => ({ conflict: c, resolution: 'use-remote' as const })),
      localId,
    );

    const written = mockEncryptPayload.mock.calls[0]?.[0] as SyncPayload | undefined;
    expect(written).toBeDefined();
    const updatedSnapshot = written!.machines[localId]?.snapshot;
    expect(updatedSnapshot?.formulae.find((f) => f.name === 'node')?.version).toBe('21.0.0');
    expect(updatedSnapshot?.formulae.find((f) => f.name === 'git')?.version).toBe('2.43.0');
    expect(updatedSnapshot?.casks.find((c) => c.name === 'firefox')?.version).toBe('125.0');
  });
});
