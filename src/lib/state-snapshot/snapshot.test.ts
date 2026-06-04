import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../brew-cli.js', () => ({
  execBrew: vi.fn(),
}));

// Use a real temp dir so save/load tests exercise actual fs I/O
const TEST_SNAPSHOTS_DIR = join(tmpdir(), `brew-tui-snap-test-${process.pid}`);

vi.mock('../data-dir.js', () => ({
  SNAPSHOTS_DIR: TEST_SNAPSHOTS_DIR,
  ensureDataDirs: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setupDir(): Promise<void> {
  await mkdir(TEST_SNAPSHOTS_DIR, { recursive: true });
}

async function teardownDir(): Promise<void> {
  await rm(TEST_SNAPSHOTS_DIR, { recursive: true, force: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('captureSnapshot()', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { execBrew } = await import('../brew-cli.js');
    const mock = execBrew as ReturnType<typeof vi.fn>;
    mock.mockImplementation((args: string[]) => {
      if (args.includes('--formula') && args.includes('--versions')) {
        return Promise.resolve('git 2.44.0\nnpm 10.5.0 10.7.0');
      }
      if (args.includes('--cask') && args.includes('--versions')) {
        return Promise.resolve('firefox 125.0\nslack 4.36.140.0');
      }
      if (args[0] === 'tap') {
        return Promise.resolve('homebrew/core\nhomebrew/cask');
      }
      if (args.includes('--pinned')) {
        return Promise.resolve('git');
      }
      return Promise.resolve('');
    });
  });

  it('returns a valid BrewSnapshot structure', async () => {
    const { captureSnapshot } = await import('./snapshot.js');
    const snap = await captureSnapshot();

    expect(snap.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(snap.formulae)).toBe(true);
    expect(Array.isArray(snap.casks)).toBe(true);
    expect(Array.isArray(snap.taps)).toBe(true);
  });

  it('marks pinned formulae correctly', async () => {
    const { captureSnapshot } = await import('./snapshot.js');
    const snap = await captureSnapshot();

    const git = snap.formulae.find((f) => f.name === 'git');
    const npm = snap.formulae.find((f) => f.name === 'npm');

    expect(git?.pinned).toBe(true);
    expect(npm?.pinned).toBe(false);
  });

  it('takes last version when multiple versions listed', async () => {
    const { captureSnapshot } = await import('./snapshot.js');
    const snap = await captureSnapshot();

    // npm line: "npm 10.5.0 10.7.0" → version should be 10.7.0
    const npm = snap.formulae.find((f) => f.name === 'npm');
    expect(npm?.version).toBe('10.7.0');
  });

  it('parses taps list correctly', async () => {
    const { captureSnapshot } = await import('./snapshot.js');
    const snap = await captureSnapshot();

    expect(snap.taps).toEqual(['homebrew/core', 'homebrew/cask']);
  });
});

describe('saveSnapshot() / loadSnapshots() round-trip', () => {
  beforeEach(async () => {
    vi.resetModules();
    await setupDir();
  });

  it('round-trips a snapshot through save → load', async () => {
    const { saveSnapshot, loadSnapshots } = await import('./snapshot.js');

    const snap = {
      capturedAt: '2026-04-27T10:00:00.000Z',
      formulae: [{ name: 'git', version: '2.44.0', pinned: false }],
      casks: [{ name: 'firefox', version: '125.0' }],
      taps: ['homebrew/core'],
    };

    await saveSnapshot(snap);
    const loaded = await loadSnapshots();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.capturedAt).toBe(snap.capturedAt);
    expect(loaded[0]?.formulae).toEqual(snap.formulae);
    expect(loaded[0]?.casks).toEqual(snap.casks);
    expect(loaded[0]?.taps).toEqual(snap.taps);
  });

  it('preserves optional label field', async () => {
    const { saveSnapshot, loadSnapshots } = await import('./snapshot.js');

    const snap = {
      capturedAt: '2026-04-27T11:00:00.000Z',
      formulae: [],
      casks: [],
      taps: [],
    };

    await saveSnapshot(snap, 'before-upgrade');
    const loaded = await loadSnapshots();

    expect(loaded[0]?.label).toBe('before-upgrade');
  });

  it('sorts snapshots by capturedAt descending', async () => {
    const { saveSnapshot, loadSnapshots } = await import('./snapshot.js');

    const older = { capturedAt: '2026-04-26T10:00:00.000Z', formulae: [], casks: [], taps: [] };
    const newer = { capturedAt: '2026-04-27T10:00:00.000Z', formulae: [], casks: [], taps: [] };

    await saveSnapshot(older);
    await saveSnapshot(newer);

    const loaded = await loadSnapshots();
    expect(loaded[0]?.capturedAt).toBe(newer.capturedAt);
    expect(loaded[1]?.capturedAt).toBe(older.capturedAt);
  });

  afterEach(teardownDir);
});

describe('loadSnapshots() — corrupt file handling', () => {
  beforeEach(async () => {
    vi.resetModules();
    await setupDir();
  });

  it('silences corrupt JSON files and returns valid snapshots', async () => {
    const { writeFile } = await import('node:fs/promises');
    // Spy on the logger so the expected warnings don't leak to stderr during
    // the test run AND so we can assert the contract: every corrupt file
    // must be flagged. Promoting the warns to an assertion turns "annoying
    // noise" into "regression guard if someone removes the log".
    const { logger } = await import('../../utils/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    // Write one valid snapshot file
    const valid = {
      capturedAt: '2026-04-27T12:00:00.000Z',
      formulae: [],
      casks: [],
      taps: [],
    };
    await writeFile(
      join(TEST_SNAPSHOTS_DIR, '2026-04-27T12-00-00-000Z-auto.json'),
      JSON.stringify(valid),
      { mode: 0o600 },
    );

    // Write one corrupt file (unparseable JSON)
    await writeFile(
      join(TEST_SNAPSHOTS_DIR, '2026-04-27T11-00-00-000Z-auto.json'),
      'this is not valid json{{{{',
      { mode: 0o600 },
    );

    // Write one file with wrong shape (parseable but schema-invalid)
    await writeFile(
      join(TEST_SNAPSHOTS_DIR, '2026-04-27T10-00-00-000Z-auto.json'),
      JSON.stringify({ wrong: 'shape' }),
      { mode: 0o600 },
    );

    const { loadSnapshots } = await import('./snapshot.js');
    const loaded = await loadSnapshots();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.capturedAt).toBe(valid.capturedAt);
    // Each invalid file must produce one warning: parse error path and
    // shape-rejection path use different messages, so check both.
    expect(warnSpy).toHaveBeenCalledWith('Failed to read snapshot file', expect.objectContaining({ filename: expect.stringContaining('2026-04-27T11') }));
    expect(warnSpy).toHaveBeenCalledWith('Skipping corrupt snapshot file', expect.objectContaining({ filename: expect.stringContaining('2026-04-27T10') }));
  });

  afterEach(teardownDir);
});

describe('deleteSnapshot()', () => {
  beforeEach(async () => {
    vi.resetModules();
    await setupDir();
  });

  it('deletes the snapshot matching the given capturedAt', async () => {
    const { saveSnapshot, loadSnapshots, deleteSnapshot } = await import('./snapshot.js');

    const snap1 = { capturedAt: '2026-04-27T09:00:00.000Z', formulae: [], casks: [], taps: [] };
    const snap2 = { capturedAt: '2026-04-27T08:00:00.000Z', formulae: [], casks: [], taps: [] };

    await saveSnapshot(snap1);
    await saveSnapshot(snap2);

    await deleteSnapshot(snap1.capturedAt);

    const remaining = await loadSnapshots();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.capturedAt).toBe(snap2.capturedAt);
  });

  afterEach(teardownDir);
});

describe('getLatestSnapshot()', () => {
  beforeEach(async () => {
    vi.resetModules();
    await setupDir();
  });

  it('returns null when no snapshots exist', async () => {
    const { getLatestSnapshot } = await import('./snapshot.js');
    const result = await getLatestSnapshot();
    expect(result).toBeNull();
  });

  it('returns the most recent snapshot', async () => {
    const { saveSnapshot, getLatestSnapshot } = await import('./snapshot.js');

    await saveSnapshot({ capturedAt: '2026-04-26T00:00:00.000Z', formulae: [], casks: [], taps: [] });
    await saveSnapshot({ capturedAt: '2026-04-27T00:00:00.000Z', formulae: [], casks: [], taps: [] });

    const latest = await getLatestSnapshot();
    expect(latest?.capturedAt).toBe('2026-04-27T00:00:00.000Z');
  });

  afterEach(teardownDir);
});
