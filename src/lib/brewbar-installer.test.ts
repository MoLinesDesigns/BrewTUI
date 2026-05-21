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
  mockExecFile.mockReset();
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  vi.resetModules();
});

describe('brewbar-installer: isBrewBarInstalled', () => {
  it('returns true when /Applications/BrewBar.app is reachable', async () => {
    mockAccess.mockResolvedValue(undefined);
    const { isBrewBarInstalled } = await import('./brewbar-installer.js');
    expect(await isBrewBarInstalled()).toBe(true);
  });

  it('returns false when access throws', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const { isBrewBarInstalled } = await import('./brewbar-installer.js');
    expect(await isBrewBarInstalled()).toBe(false);
  });
});

describe('brewbar-installer: installBrewBar gating', () => {
  it('rejects when not running on macOS', async () => {
    setPlatform('linux');
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).rejects.toThrow(/cli_brewbarMacOnly/);
  });

  it('rejects when isPro is false', async () => {
    setPlatform('darwin');
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(false, false)).rejects.toThrow(/cli_brewbarProRequired/);
  });

  it('rejects when already installed and force is false', async () => {
    setPlatform('darwin');
    mockAccess.mockResolvedValue(undefined);
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).rejects.toThrow(/cli_brewbarAlreadyInstalled/);
  });
});

describe('brewbar-installer: integrity (NUEVO-003)', () => {
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
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).rejects.toThrow(/SHA-256 checksum unavailable/);
    // ditto must not have been invoked
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('refuses to install when the SHA-256 hash does not match', async () => {
    setupSuccessfulDownload({ checksumOk: true, hashLine: 'a'.repeat(64) + '  BrewBar.app.zip' });
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).rejects.toThrow(/SHA-256 mismatch/);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('refuses to install when the SHA-256 hash is malformed', async () => {
    setupSuccessfulDownload({ checksumOk: true, hashLine: 'not-a-hash' });
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).rejects.toThrow(/SHA-256 checksum unavailable/);
  });

  it('rejects downloads exceeding the 200 MB Content-Length cap', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close(); } }),
      headers: { get: () => String(300 * 1024 * 1024) }, // 300 MB
    });
    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).rejects.toThrow(/200 MB size limit/);
  });
});

describe('brewbar-installer: installBrewBar happy path (QA-009)', () => {
  it('downloads, verifies SHA-256 and unzips to /Applications', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT')); // not installed
    const fileBuffer = Buffer.from('zip-bytes');
    const { createHash } = await import('node:crypto');
    const realHash = createHash('sha256').update(fileBuffer).digest('hex');

    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        return Promise.resolve({ ok: true, text: async () => `${realHash}  BrewBar.app.zip` });
      }
      return Promise.resolve({
        ok: true,
        body: new ReadableStream({ start(c) { c.close(); } }),
        headers: { get: () => '0' },
      });
    });
    mockReadFile.mockResolvedValue(fileBuffer);
    mockExecFile.mockResolvedValue('');

    const { installBrewBar } = await import('./brewbar-installer.js');
    await expect(installBrewBar(true, false)).resolves.toBeUndefined();

    // ditto invoked exactly once with our temp zip → /Applications
    expect(mockExecFile).toHaveBeenCalled();
    const dittoCalls = mockExecFile.mock.calls.filter((c) => c[0] === 'ditto');
    expect(dittoCalls.length).toBeGreaterThan(0);
    expect(dittoCalls[0][1]).toEqual(expect.arrayContaining(['-xk', '/Applications/']));
  });
});

describe('brewbar-installer: auto-restart on update', () => {
  it('quits BrewBar before unzip and relaunches it after when it was running', async () => {
    setPlatform('darwin');
    // App instalada + force=true para reinstalar en sitio.
    mockAccess.mockResolvedValue(undefined);
    const fileBuffer = Buffer.from('zip-bytes');
    const { createHash } = await import('node:crypto');
    const realHash = createHash('sha256').update(fileBuffer).digest('hex');
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        return Promise.resolve({ ok: true, text: async () => `${realHash}  BrewBar.app.zip` });
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

    const { installBrewBar } = await import('./brewbar-installer.js');
    await installBrewBar(true, true);

    const calls = mockExecFile.mock.calls.map((c) => c[0]);
    // Debe llamar a osascript (graceful quit), ditto (unzip) y open (relanzar).
    expect(calls).toEqual(expect.arrayContaining(['osascript', 'ditto', 'open']));
    const osascriptIdx = calls.indexOf('osascript');
    const dittoIdx = calls.indexOf('ditto');
    const openIdx = calls.indexOf('open');
    expect(osascriptIdx).toBeLessThan(dittoIdx);
    expect(dittoIdx).toBeLessThan(openIdx);
  });

  it('does not quit or relaunch when BrewBar is not running', async () => {
    setPlatform('darwin');
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const fileBuffer = Buffer.from('zip-bytes');
    const { createHash } = await import('node:crypto');
    const realHash = createHash('sha256').update(fileBuffer).digest('hex');
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith('.sha256')) {
        return Promise.resolve({ ok: true, text: async () => `${realHash}  BrewBar.app.zip` });
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

    const { installBrewBar } = await import('./brewbar-installer.js');
    await installBrewBar(true, false);

    const calls = mockExecFile.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('osascript');
    expect(calls).not.toContain('open');
    expect(calls).toContain('ditto');
  });
});

describe('brewbar-installer: uninstallBrewBar', () => {
  it('rejects when BrewBar is not installed', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const { uninstallBrewBar } = await import('./brewbar-installer.js');
    await expect(uninstallBrewBar()).rejects.toThrow(/cli_brewbarNotInstalled/);
  });

  it('removes the app bundle when installed', async () => {
    mockAccess.mockResolvedValue(undefined);
    const { uninstallBrewBar } = await import('./brewbar-installer.js');
    await uninstallBrewBar();
    expect(mockRm).toHaveBeenCalledWith('/Applications/BrewBar.app', expect.objectContaining({ recursive: true, force: true }));
  });
});
