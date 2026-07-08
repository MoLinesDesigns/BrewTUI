import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();
const mockOpen = vi.fn();
const mockUnlink = vi.fn();
const mockClose = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  open: (...args: unknown[]) => mockOpen(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

vi.mock('../data-dir.js', () => ({
  HISTORY_PATH: '/tmp/.brewtui-bar/history.json',
  ensureDataDirs: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockReadFile.mockReset();
  mockWriteFile.mockReset().mockResolvedValue(undefined);
  mockRename.mockReset().mockResolvedValue(undefined);
  mockClose.mockReset().mockResolvedValue(undefined);
  mockUnlink.mockReset().mockResolvedValue(undefined);
  mockOpen.mockReset().mockResolvedValue({ close: mockClose });
});

afterEach(() => {
  vi.resetModules();
});

describe('history-logger: detectAction', () => {
  it('classifies install commands', async () => {
    const { detectAction } = await import('./history-logger.js');
    expect(detectAction(['install', 'wget'])).toEqual({ action: 'install', packageName: 'wget' });
  });

  it('classifies uninstall commands', async () => {
    const { detectAction } = await import('./history-logger.js');
    expect(detectAction(['uninstall', 'wget'])).toEqual({ action: 'uninstall', packageName: 'wget' });
  });

  it('classifies upgrade with no args as upgrade-all', async () => {
    const { detectAction } = await import('./history-logger.js');
    expect(detectAction(['upgrade'])).toEqual({ action: 'upgrade-all', packageName: null });
  });

  it('classifies upgrade with a package name', async () => {
    const { detectAction } = await import('./history-logger.js');
    expect(detectAction(['upgrade', 'curl'])).toEqual({ action: 'upgrade', packageName: 'curl' });
  });

  it('returns null for unknown commands', async () => {
    const { detectAction } = await import('./history-logger.js');
    expect(detectAction(['list'])).toBeNull();
    expect(detectAction([])).toBeNull();
  });
});

describe('history-logger: gating', () => {
  it.each([
    ['loadHistory', (m: typeof import('./history-logger.js')) => m.loadHistory(false)],
    ['clearHistory', (m: typeof import('./history-logger.js')) => m.clearHistory(false)],
    ['appendEntry', (m: typeof import('./history-logger.js')) => m.appendEntry(false, 'install', 'wget', true)],
  ])('%s rejects when isPro is false', async (_name, fn) => {
    const m = await import('./history-logger.js');
    await expect(fn(m)).rejects.toThrow(/Pro/i);
  });
});

describe('history-logger: loadHistory', () => {
  it('returns parsed entries from a valid v1 file', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      entries: [{ id: 'a', action: 'install', packageName: 'wget', timestamp: '2026-04-01', success: true, error: null }],
    }));
    const { loadHistory } = await import('./history-logger.js');
    const entries = await loadHistory(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.packageName).toBe('wget');
  });

  it('returns [] when the file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const { loadHistory } = await import('./history-logger.js');
    expect(await loadHistory(true)).toEqual([]);
  });

  it('returns [] when JSON is malformed', async () => {
    mockReadFile.mockResolvedValue('{not json');
    const { loadHistory } = await import('./history-logger.js');
    expect(await loadHistory(true)).toEqual([]);
  });

  it('returns [] when the file claims an unsupported version', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 99, entries: [] }));
    const { loadHistory } = await import('./history-logger.js');
    expect(await loadHistory(true)).toEqual([]);
  });
});

describe('history-logger: appendEntry', () => {
  it('prepends the new entry (most recent first)', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      entries: [{ id: 'old', action: 'install', packageName: 'old', timestamp: '2026-01-01', success: true, error: null }],
    }));
    const { appendEntry } = await import('./history-logger.js');
    await appendEntry(true, 'uninstall', 'new', true);

    const written = JSON.parse(mockWriteFile.mock.calls[0]![1] as string);
    expect(written.entries[0]!.action).toBe('uninstall');
    expect(written.entries[0]!.packageName).toBe('new');
    expect(written.entries[1]!.id).toBe('old');
  });

  it('caps history at 1000 entries by dropping the oldest', async () => {
    const existing = Array.from({ length: 1000 }, (_, i) => ({
      id: `e${i}`, action: 'install', packageName: `p${i}`, timestamp: '2026-01-01', success: true, error: null,
    }));
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 1, entries: existing }));

    const { appendEntry } = await import('./history-logger.js');
    await appendEntry(true, 'install', 'newest', true);

    const written = JSON.parse(mockWriteFile.mock.calls[0]![1] as string);
    expect(written.entries).toHaveLength(1000);
    expect(written.entries[0]!.packageName).toBe('newest');
    // Last (oldest pre-existing) was at index 999, after prepend the cap drops the original e999.
    expect(written.entries.find((e: { id: string }) => e.id === 'e999')).toBeUndefined();
  });

  it('writes with restrictive 0o600 permissions', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const { appendEntry } = await import('./history-logger.js');
    await appendEntry(true, 'install', 'wget', true);

    const opts = mockWriteFile.mock.calls[0]![2] as { mode?: number };
    expect(opts.mode).toBe(0o600);
  });

  it('rejects concurrent writes when the lock file already exists', async () => {
    mockOpen.mockResolvedValueOnce(null);
    const { appendEntry } = await import('./history-logger.js');
    await expect(appendEntry(true, 'install', 'wget', true)).rejects.toThrow(/locked/i);
  });

  it('releases the lock even if the inner work throws', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 1, entries: [] }));
    mockWriteFile.mockRejectedValue(new Error('disk full'));

    const { appendEntry } = await import('./history-logger.js');
    await expect(appendEntry(true, 'install', 'wget', true)).rejects.toThrow(/disk full/);
    // Lock file must have been removed even though saveHistory threw.
    expect(mockUnlink).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });
});

describe('history-logger: clearHistory', () => {
  it('writes an empty entries array', async () => {
    const { clearHistory } = await import('./history-logger.js');
    await clearHistory(true);
    const written = JSON.parse(mockWriteFile.mock.calls[0]![1] as string);
    expect(written.entries).toEqual([]);
  });
});
