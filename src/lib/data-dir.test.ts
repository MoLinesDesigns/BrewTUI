import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = {
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
};

const randomUUID = vi.fn();

async function loadModule() {
  vi.resetModules();
  fs.mkdir.mockReset();
  fs.readFile.mockReset();
  fs.writeFile.mockReset();
  fs.rename.mockReset();
  randomUUID.mockReset();

  vi.doMock('node:os', () => ({ homedir: () => '/tmp/brew-tui-home' }));
  vi.doMock('node:fs/promises', () => fs);
  vi.doMock('node:crypto', () => ({ randomUUID }));

  return import('./data-dir.js');
}

describe('data-dir', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes last-action payload atomically with private permissions', async () => {
    const mod = await loadModule();
    const payload = {
      timestamp: '2026-05-27T09:00:00.000Z',
      action: 'install' as const,
      packages: ['wget'],
      remainingOutdated: 2,
      source: 'brew-tui' as const,
    };

    await mod.writeLastAction(payload);

    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/brew-tui-home/.brew-tui', {
      recursive: true,
      mode: 0o700,
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/brew-tui-home/.brew-tui/last-action.json.tmp',
      JSON.stringify(payload, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
    expect(fs.rename).toHaveBeenCalledWith(
      '/tmp/brew-tui-home/.brew-tui/last-action.json.tmp',
      '/tmp/brew-tui-home/.brew-tui/last-action.json',
    );
  });

  it('creates all app data directories with 0700 mode', async () => {
    const mod = await loadModule();
    await mod.ensureDataDirs();

    expect(fs.mkdir.mock.calls).toEqual([
      ['/tmp/brew-tui-home/.brew-tui', { recursive: true, mode: 0o700 }],
      ['/tmp/brew-tui-home/.brew-tui/profiles', { recursive: true, mode: 0o700 }],
      ['/tmp/brew-tui-home/.brew-tui/snapshots', { recursive: true, mode: 0o700 }],
    ]);
  });

  it('reads and caches an existing machine id', async () => {
    const mod = await loadModule();
    fs.readFile.mockResolvedValue(' machine-1 \n');

    await expect(mod.getMachineId()).resolves.toBe('machine-1');
    await expect(mod.getMachineId()).resolves.toBe('machine-1');

    expect(fs.readFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('serializes concurrent first-run machine id creation', async () => {
    const mod = await loadModule();
    fs.readFile.mockRejectedValue(new Error('ENOENT'));
    randomUUID.mockReturnValue('generated-machine');

    const [a, b] = await Promise.all([mod.getMachineId(), mod.getMachineId()]);

    expect(a).toBe('generated-machine');
    expect(b).toBe('generated-machine');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/brew-tui-home/.brew-tui/machine-id',
      'generated-machine',
      { encoding: 'utf-8', mode: 0o600 },
    );
  });
});
