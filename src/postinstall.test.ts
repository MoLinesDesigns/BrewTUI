import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSync = vi.fn();

vi.mock('./lib/brew-tui-bar-installer.js', () => ({
  syncAndLaunchBrewTUIBar: (...args: unknown[]) => mockSync(...args),
}));

vi.mock('./i18n/index.js', () => ({
  t: (k: string, vars?: Record<string, unknown>) => (vars?.error ? `${k}: ${vars.error}` : k),
}));

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_GLOBAL = process.env.npm_config_global;

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p });
}

beforeEach(() => {
  mockSync.mockReset().mockResolvedValue(undefined);
  delete process.env.npm_config_global;
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  if (ORIGINAL_GLOBAL === undefined) {
    delete process.env.npm_config_global;
  } else {
    process.env.npm_config_global = ORIGINAL_GLOBAL;
  }
  vi.resetModules();
});

describe('postinstall: gate', () => {
  it('skips when npm_config_global is undefined (local dev install)', async () => {
    setPlatform('darwin');
    const { runPostinstall } = await import('./postinstall.js');
    await runPostinstall();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('skips when npm_config_global is "false" (literal)', async () => {
    setPlatform('darwin');
    process.env.npm_config_global = 'false';
    const { runPostinstall } = await import('./postinstall.js');
    await runPostinstall();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('skips when not on macOS even with --global', async () => {
    setPlatform('linux');
    process.env.npm_config_global = 'true';
    const { runPostinstall } = await import('./postinstall.js');
    await runPostinstall();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('runs syncAndLaunchBrewTUIBar on darwin + --global', async () => {
    setPlatform('darwin');
    process.env.npm_config_global = 'true';
    const { runPostinstall } = await import('./postinstall.js');
    await runPostinstall();
    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});

describe('postinstall: non-fatal failure', () => {
  it('swallows errors from sync and emits two warn lines', async () => {
    setPlatform('darwin');
    process.env.npm_config_global = 'true';
    mockSync.mockRejectedValue(new Error('network unreachable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { runPostinstall } = await import('./postinstall.js');
    await expect(runPostinstall()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('postinstall_skipped');
    expect(warn.mock.calls[0]?.[0]).toContain('network unreachable');
    expect(warn.mock.calls[1]?.[0]).toContain('postinstall_manualHint');

    warn.mockRestore();
  });

  it('coerces non-Error throws to string for the warn message', async () => {
    setPlatform('darwin');
    process.env.npm_config_global = 'true';
    mockSync.mockRejectedValue('string-shaped-failure');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { runPostinstall } = await import('./postinstall.js');
    await runPostinstall();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('string-shaped-failure');

    warn.mockRestore();
  });
});
