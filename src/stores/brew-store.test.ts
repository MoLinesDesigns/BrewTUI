import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBrewUpdate = vi.fn<() => Promise<void>>();
const mockGetInstalled = vi.fn();
const mockGetOutdated = vi.fn();
const mockGetServices = vi.fn();
const mockGetConfig = vi.fn();
const mockGetLeaves = vi.fn();

vi.mock('../lib/brew-api.js', () => ({
  brewUpdate: mockBrewUpdate,
  getInstalled: mockGetInstalled,
  getOutdated: mockGetOutdated,
  getServices: mockGetServices,
  getConfig: mockGetConfig,
  getLeaves: mockGetLeaves,
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  mockBrewUpdate.mockReset().mockResolvedValue(undefined);
  mockGetInstalled.mockReset().mockResolvedValue({ formulae: [], casks: [] });
  mockGetOutdated.mockReset().mockResolvedValue({ formulae: [], casks: [] });
  mockGetServices.mockReset().mockResolvedValue([]);
  mockGetConfig.mockReset().mockResolvedValue({ HOMEBREW_VERSION: '1.0.0', HOMEBREW_PREFIX: '/opt/homebrew', coreUpdated: 'today' });
  mockGetLeaves.mockReset().mockResolvedValue([]);
});

describe('brew-store fetchAll', () => {
  it('deduplicates concurrent fetches and background updates', async () => {
    const installed = deferred<{ formulae: never[]; casks: never[] }>();
    const outdated = deferred<{ formulae: never[]; casks: never[] }>();
    const services = deferred<never[]>();
    const config = deferred<{ HOMEBREW_VERSION: string; HOMEBREW_PREFIX: string; coreUpdated: string }>();

    mockGetInstalled.mockReturnValueOnce(installed.promise);
    mockGetOutdated.mockReturnValueOnce(outdated.promise);
    mockGetServices.mockReturnValueOnce(services.promise);
    mockGetConfig.mockReturnValueOnce(config.promise);

    const { useBrewStore } = await import('./brew-store.js');

    const first = useBrewStore.getState().fetchAll();
    const second = useBrewStore.getState().fetchAll();

    expect(mockBrewUpdate).toHaveBeenCalledTimes(1);
    expect(mockGetInstalled).toHaveBeenCalledTimes(1);
    expect(mockGetOutdated).toHaveBeenCalledTimes(1);
    expect(mockGetServices).toHaveBeenCalledTimes(1);
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
    // PERF: getLeaves was moved out of fetchAll because no view consumed
    // the store value. It is now lazy-fetched if a future caller needs it.
    expect(mockGetLeaves).not.toHaveBeenCalled();

    installed.resolve({ formulae: [], casks: [] });
    outdated.resolve({ formulae: [], casks: [] });
    services.resolve([]);
    config.resolve({ HOMEBREW_VERSION: '1.0.0', HOMEBREW_PREFIX: '/opt/homebrew', coreUpdated: 'today' });

    await Promise.all([first, second]);
  });

  it('skips starting another brew update immediately after a completed fetch', async () => {
    const { useBrewStore } = await import('./brew-store.js');

    await useBrewStore.getState().fetchAll();
    await useBrewStore.getState().fetchAll();

    expect(mockBrewUpdate).toHaveBeenCalledTimes(1);
    expect(mockGetInstalled).toHaveBeenCalledTimes(2);
    expect(mockGetOutdated).toHaveBeenCalledTimes(2);
    expect(mockGetServices).toHaveBeenCalledTimes(2);
    expect(mockGetConfig).toHaveBeenCalledTimes(2);
    expect(mockGetLeaves).not.toHaveBeenCalled();
  });
});
