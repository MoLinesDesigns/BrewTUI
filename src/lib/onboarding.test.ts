import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = {
  access: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
};
const ensureDataDirs = vi.fn();

async function loadModule() {
  vi.resetModules();
  fs.access.mockReset();
  fs.writeFile.mockReset();
  fs.mkdir.mockReset();
  ensureDataDirs.mockReset();

  vi.doMock('node:fs/promises', () => fs);
  vi.doMock('./data-dir.js', () => ({
    ensureDataDirs,
    ONBOARDING_FLAG_PATH: '/tmp/brewtui-bar/onboarding-completed',
    DATA_DIR: '/tmp/brewtui-bar',
  }));

  return import('./onboarding.js');
}

describe('onboarding', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when the completion flag exists and caches the answer', async () => {
    const mod = await loadModule();
    fs.access.mockResolvedValue(undefined);

    await expect(mod.hasCompletedOnboarding()).resolves.toBe(true);
    await expect(mod.hasCompletedOnboarding()).resolves.toBe(true);

    expect(fs.access).toHaveBeenCalledTimes(1);
  });

  it('returns false when the completion flag is missing', async () => {
    const mod = await loadModule();
    fs.access.mockRejectedValue(new Error('ENOENT'));

    await expect(mod.hasCompletedOnboarding()).resolves.toBe(false);
  });

  it('marks onboarding complete with a private flag file and updates cache', async () => {
    const mod = await loadModule();
    vi.setSystemTime(new Date('2026-05-27T09:30:00.000Z'));

    await mod.markOnboardingComplete();

    expect(ensureDataDirs).toHaveBeenCalled();
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/brewtui-bar', { recursive: true, mode: 0o700 });
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/brewtui-bar/onboarding-completed',
      '2026-05-27T09:30:00.000Z',
      { encoding: 'utf-8', mode: 0o600 },
    );
    await expect(mod.hasCompletedOnboarding()).resolves.toBe(true);
    expect(fs.access).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('exposes a test seam to reset the cache', async () => {
    const mod = await loadModule();
    fs.access.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('ENOENT'));

    await expect(mod.hasCompletedOnboarding()).resolves.toBe(true);
    mod._resetOnboardingCacheForTests();
    await expect(mod.hasCompletedOnboarding()).resolves.toBe(false);
  });
});
