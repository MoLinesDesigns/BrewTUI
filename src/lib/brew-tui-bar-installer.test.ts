import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAccess = vi.fn();
const mockRm = vi.fn();
const mockReadFile = vi.fn();
const mockFetch = vi.fn();
const mockCreateWriteStream = vi.fn();
const mockPipeline = vi.fn();
const mockExecFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  rm: (...args: unknown[]) => mockRm(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

vi.mock('node:fs', () => ({
  createWriteStream: (...args: unknown[]) => mockCreateWriteStream(...args),
}));

vi.mock('node:stream/promises', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
}));

vi.mock('node:child_process', () => ({
  execFile: (file: string, args: string[], cb: (err: Error | null, out: { stdout: string; stderr: string }) => void) => {
    mockExecFile(file, args)
      .then((stdout: string) => cb(null, { stdout, stderr: '' }))
      .catch((err: Error) => cb(err, { stdout: '', stderr: '' }));
  },
}));

vi.mock('./fetch-timeout.js', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock('../i18n/index.js', () => ({
  t: (k: string, vars?: Record<string, unknown>) => vars?.error ? `${k}: ${vars.error}` : k,
}));

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p });
}

beforeEach(() => {
  mockAccess.mockReset();
  mockRm.mockReset().mockResolvedValue(undefined);
  mockReadFile.mockReset();
  mockFetch.mockReset();
  mockCreateWriteStream.mockReset().mockReturnValue({});
  mockPipeline.mockReset().mockResolvedValue(undefined);
  // Default execFile returns empty stdout. The bundle-ID guard uses
  // `defaults read … CFBundleIdentifier`; an empty response is treated as
  // unknown, so unrelated tests don't accidentally trip the foreign-bundle
  // path. Tests that exercise pgrep/osascript/etc. override per-call.
  mockExecFile.mockReset().mockResolvedValue('');
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  vi.resetModules();
});

describe('brew-tui-bar-installer: isBrewTUIBarInstalled', () => {
  it('returns true when /Applications/Brew-TUI-Bar.app is reachable', async () => {
    mockAccess.mockResolvedValue(undefined);
    const { isBrewTUIBarInstalled } = await import('./brew-tui-bar-installer.js');
    expect(await isBrewTUIBarInstalled()).toBe(true);
  });

  it('returns false when access throws', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const { isBrewTUIBarInstalled } = await import('./brew-tui-bar-installer.js');
    expect(await isBrewTUIBarInstalled()).toBe(false);
  });
});

describe('brew-tui-bar-installer: installBrewTUIBar gating', () => {
  it('rejects when not running on macOS', async () => {
    setPlatform('linux');
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).rejects.toThrow(/cli_brewtuibarMacOnly/);
  });

  // 2.1.0: Pro gate removed. Free users get the bundle and see the in-app
  // upgrade prompt. We keep this test to pin that behaviour explicitly.
  it('does not gate on isPro (Free users install the same bundle)', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT')); // not installed
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close(); } }),
      headers: { get: () => '0' },
    });
    mockReadFile.mockResolvedValue(Buffer.from('zip-bytes'));
    mockExecFile.mockResolvedValue('');
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    // No throw on integrity guard alone — the SHA-256 check kicks in next,
    // so we only assert that the early "ProRequired" guard is gone.
    await expect(installBrewTUIBar(false, false)).rejects.not.toThrow(/cli_brewtuibarProRequired/);
  });

  it('rejects when already installed and force is false', async () => {
    setPlatform('darwin');
    mockAccess.mockResolvedValue(undefined);
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).rejects.toThrow(/cli_brewtuibarAlreadyInstalled/);
  });

  it('refuses to touch /Applications/Brew-TUI-Bar.app when its bundle ID is foreign', async () => {
    setPlatform('darwin');
    mockAccess.mockResolvedValue(undefined); // installed
    mockExecFile.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'defaults' && args[0] === 'read') return 'com.example.someone-else\n';
      return '';
    });
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, true)).rejects.toThrow(/cli_brewtuibarForeignBundle/);
    // ditto must never be invoked when the bundle ID is foreign
    const dittoCalls = mockExecFile.mock.calls.filter((c) => c[0] === 'ditto');
    expect(dittoCalls.length).toBe(0);
  });
});

describe('brew-tui-bar-installer: integrity (NUEVO-003)', () => {
  function setupSuccessfulDownload({ checksumOk, hashLine }: { checksumOk: boolean; hashLine?: string } = { checksumOk: false }) {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT')); // not installed
    // First call: download
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        if (checksumOk && hashLine !== undefined) {
          return Promise.resolve({ ok: true, text: async () => hashLine });
        }
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({ start(c) { c.close(); } }),
        headers: { get: () => '0' },
      });
    });
    mockReadFile.mockResolvedValue(Buffer.from('zip-bytes'));
    mockExecFile.mockResolvedValue('');
  }

  it('refuses to install when the SHA-256 checksum is unavailable', async () => {
    setupSuccessfulDownload({ checksumOk: false });
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).rejects.toThrow(/SHA-256 checksum unavailable/);
    // ditto must not have been invoked
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('refuses to install when the SHA-256 hash does not match', async () => {
    setupSuccessfulDownload({ checksumOk: true, hashLine: 'a'.repeat(64) + '  Brew-TUI-Bar.app.zip' });
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).rejects.toThrow(/SHA-256 mismatch/);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('refuses to install when the SHA-256 hash is malformed', async () => {
    setupSuccessfulDownload({ checksumOk: true, hashLine: 'not-a-hash' });
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).rejects.toThrow(/SHA-256 checksum unavailable/);
  });

  it('rejects downloads exceeding the 200 MB Content-Length cap', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close(); } }),
      headers: { get: () => String(300 * 1024 * 1024) }, // 300 MB
    });
    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).rejects.toThrow(/200 MB size limit/);
  });
});

describe('brew-tui-bar-installer: installBrewTUIBar happy path (QA-009)', () => {
  it('downloads, verifies SHA-256 and unzips to /Applications', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT')); // not installed
    const fileBuffer = Buffer.from('zip-bytes');
    const { createHash } = await import('node:crypto');
    const realHash = createHash('sha256').update(fileBuffer).digest('hex');

    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        return Promise.resolve({ ok: true, text: async () => `${realHash}  Brew-TUI-Bar.app.zip` });
      }
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({ start(c) { c.close(); } }),
        headers: { get: () => '0' },
      });
    });
    mockReadFile.mockResolvedValue(fileBuffer);
    mockExecFile.mockResolvedValue('');

    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(installBrewTUIBar(true, false)).resolves.toBeUndefined();

    // ditto invoked exactly once with our temp zip → /Applications
    expect(mockExecFile).toHaveBeenCalled();
    const dittoCalls = mockExecFile.mock.calls.filter((c) => c[0] === 'ditto');
    expect(dittoCalls.length).toBeGreaterThan(0);
    expect(dittoCalls[0][1]).toEqual(expect.arrayContaining(['-xk', '/Applications/']));
  });
});

describe('brew-tui-bar-installer: auto-restart on update', () => {
  it('quits Brew-TUI-Bar before unzip and relaunches it after when it was running', async () => {
    setPlatform('darwin');
    // App instalada + force=true para reinstalar en sitio.
    mockAccess.mockResolvedValue(undefined);
    const fileBuffer = Buffer.from('zip-bytes');
    const { createHash } = await import('node:crypto');
    const realHash = createHash('sha256').update(fileBuffer).digest('hex');
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        return Promise.resolve({ ok: true, text: async () => `${realHash}  Brew-TUI-Bar.app.zip` });
      }
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({ start(c) { c.close(); } }),
        headers: { get: () => '0' },
      });
    });
    mockReadFile.mockResolvedValue(fileBuffer);

    // pgrep responde con un PID la primera vez (running), luego vacío (ya cerrado).
    let pgrepCalls = 0;
    mockExecFile.mockImplementation(async (cmd: string) => {
      if (cmd === 'pgrep') {
        pgrepCalls += 1;
        return pgrepCalls === 1 ? '12345\n' : '';
      }
      return '';
    });

    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await installBrewTUIBar(true, true);

    const calls = mockExecFile.mock.calls.map((c) => c[0]);
    // Debe llamar a osascript (graceful quit), ditto (unzip) y open (relanzar).
    expect(calls).toEqual(expect.arrayContaining(['osascript', 'ditto', 'open']));
    const osascriptIdx = calls.indexOf('osascript');
    const dittoIdx = calls.indexOf('ditto');
    const openIdx = calls.indexOf('open');
    expect(osascriptIdx).toBeLessThan(dittoIdx);
    expect(dittoIdx).toBeLessThan(openIdx);
  });

  it('does not quit or relaunch when Brew-TUI-Bar is not running', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const fileBuffer = Buffer.from('zip-bytes');
    const { createHash } = await import('node:crypto');
    const realHash = createHash('sha256').update(fileBuffer).digest('hex');
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        return Promise.resolve({ ok: true, text: async () => `${realHash}  Brew-TUI-Bar.app.zip` });
      }
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({ start(c) { c.close(); } }),
        headers: { get: () => '0' },
      });
    });
    mockReadFile.mockResolvedValue(fileBuffer);
    // pgrep siempre devuelve stdout vacío → "no running".
    mockExecFile.mockResolvedValue('');

    const { installBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await installBrewTUIBar(true, false);

    const calls = mockExecFile.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('osascript');
    expect(calls).not.toContain('open');
    expect(calls).toContain('ditto');
  });
});

describe('brew-tui-bar-installer: uninstallBrewTUIBar', () => {
  it('rejects when Brew-TUI-Bar is not installed', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const { uninstallBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await expect(uninstallBrewTUIBar()).rejects.toThrow(/cli_brewtuibarNotInstalled/);
  });

  it('removes the app bundle when installed', async () => {
    mockAccess.mockResolvedValue(undefined);
    const { uninstallBrewTUIBar } = await import('./brew-tui-bar-installer.js');
    await uninstallBrewTUIBar();
    expect(mockRm).toHaveBeenCalledWith('/Applications/Brew-TUI-Bar.app', expect.objectContaining({ recursive: true, force: true }));
  });
});
