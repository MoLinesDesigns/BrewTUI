import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
  stat: vi.fn(),
};

const logger = {
  warn: vi.fn(),
};

async function loadModule() {
  vi.resetModules();
  Object.values(fs).forEach((fn) => fn.mockReset());
  logger.warn.mockReset();

  vi.doMock('node:fs/promises', () => fs);
  vi.doMock('node:os', () => ({ homedir: () => '/Users/tester' }));
  vi.doMock('../../../utils/logger.js', () => ({ logger }));

  return import('./icloud-backend.js');
}

describe('icloud-backend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports iCloud availability from the base directory stat', async () => {
    const mod = await loadModule();
    fs.stat.mockResolvedValue({ size: 1 });

    await expect(mod.isICloudAvailable()).resolves.toBe(true);
    expect(fs.stat).toHaveBeenCalledWith('/Users/tester/Library/Mobile Documents/com~apple~CloudDocs');
  });

  it('returns false when the iCloud base directory is missing', async () => {
    const mod = await loadModule();
    fs.stat.mockRejectedValue(new Error('ENOENT'));

    await expect(mod.isICloudAvailable()).resolves.toBe(false);
  });

  it('returns null for an empty iCloud placeholder file', async () => {
    const mod = await loadModule();
    fs.stat.mockResolvedValue({ size: 0 });

    await expect(mod.readSyncEnvelope()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('sync: iCloud envelope exists but is empty (placeholder?)');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('returns null when sync.json is absent, including pending .icloud placeholders', async () => {
    const mod = await loadModule();
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    fs.stat.mockRejectedValueOnce(missing).mockResolvedValueOnce({ size: 12 });

    await expect(mod.readSyncEnvelope()).resolves.toBeNull();
    expect(fs.stat).toHaveBeenNthCalledWith(
      2,
      '/Users/tester/Library/Mobile Documents/com~apple~CloudDocs/BrewTUI-Bar/.sync.json.icloud',
    );
  });

  it('parses valid envelopes and rejects invalid structures', async () => {
    const mod = await loadModule();
    fs.stat.mockResolvedValue({ size: 128 });
    fs.readFile.mockResolvedValueOnce(JSON.stringify({
      schemaVersion: 1,
      encrypted: 'cipher',
      iv: 'iv',
      tag: 'tag',
      updatedAt: '2026-05-27T10:00:00.000Z',
    }));

    await expect(mod.readSyncEnvelope()).resolves.toMatchObject({ encrypted: 'cipher' });

    fs.readFile.mockResolvedValueOnce(JSON.stringify({ schemaVersion: 2 }));
    await expect(mod.readSyncEnvelope()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('sync: invalid envelope structure in iCloud file');
  });

  it('writes envelopes atomically with private permissions', async () => {
    const mod = await loadModule();
    const envelope = {
      schemaVersion: 1 as const,
      encrypted: 'cipher',
      iv: 'iv',
      tag: 'tag',
      updatedAt: '2026-05-27T10:00:00.000Z',
    };

    await mod.writeSyncEnvelope(envelope);

    const dir = '/Users/tester/Library/Mobile Documents/com~apple~CloudDocs/BrewTUI-Bar';
    expect(fs.mkdir).toHaveBeenCalledWith(dir, { recursive: true, mode: 0o700 });
    expect(fs.writeFile).toHaveBeenCalledWith(
      `${dir}/sync.json.tmp`,
      JSON.stringify(envelope, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
    expect(fs.rename).toHaveBeenCalledWith(`${dir}/sync.json.tmp`, `${dir}/sync.json`);
  });
});
