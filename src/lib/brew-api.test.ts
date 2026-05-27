import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  analyzeUpgradeImpact: vi.fn(),
}));

// Mock brew-cli to prevent actual brew execution
vi.mock('./brew-cli.js', () => ({
  execBrew: vi.fn().mockResolvedValue('{}'),
  streamBrew: vi.fn(),
  BREW_BIN: '/opt/homebrew/bin/brew',
}));

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('./impact/impact-analyzer.js', () => ({
  analyzeUpgradeImpact: mocks.analyzeUpgradeImpact,
}));

vi.mock('./parsers/json-parser.js', () => ({
  parseInstalledJson: vi.fn().mockReturnValue({ formulae: [], casks: [] }),
  parseOutdatedJson: vi.fn().mockReturnValue({ formulae: [], casks: [] }),
  parseServicesJson: vi.fn().mockReturnValue([]),
  parseFormulaInfoJson: vi.fn().mockReturnValue(null),
  parseCaskInfoJson: vi.fn().mockReturnValue(null),
}));

vi.mock('./parsers/text-parser.js', () => ({
  parseSearchResults: vi.fn().mockReturnValue([]),
  parseDoctorOutput: vi.fn().mockReturnValue({ issues: [], warnings: [] }),
  parseBrewConfig: vi.fn().mockReturnValue({}),
  parseLeavesOutput: vi.fn().mockReturnValue([]),
}));

describe('validatePackageName (EP-011)', () => {
  it('accepts valid package names', async () => {
    const { execBrew } = await import('./brew-cli.js');
    const api = await import('./brew-api.js');

    for (const name of ['node', 'python@3.11', 'font-jetbrains-mono', 'go', 'rust']) {
      (execBrew as ReturnType<typeof vi.fn>).mockResolvedValue('{}');
      await expect(api.getFormulaInfo(name)).resolves.not.toThrow();
    }
  });

  it('rejects package names with shell injection (semicolons)', async () => {
    const api = await import('./brew-api.js');
    await expect(api.getFormulaInfo('; rm -rf /')).rejects.toThrow('Invalid package name');
  });

  it('rejects empty package name', async () => {
    const api = await import('./brew-api.js');
    await expect(api.getFormulaInfo('')).rejects.toThrow('Invalid package name');
  });

  it('rejects package names with spaces', async () => {
    const api = await import('./brew-api.js');
    await expect(api.getFormulaInfo('bad name')).rejects.toThrow('Invalid package name');
  });

  it('rejects package names with backticks', async () => {
    const api = await import('./brew-api.js');
    await expect(api.getFormulaInfo('`whoami`')).rejects.toThrow('Invalid package name');
  });

  it('rejects package names with pipe', async () => {
    const api = await import('./brew-api.js');
    await expect(api.getFormulaInfo('foo|bar')).rejects.toThrow('Invalid package name');
  });

  // Note: PKG_PATTERN /^[\w@./+-]+$/ allows hyphens, so --force and -rf pass validation.
  // This is acceptable because brew CLI is called via spawn (no shell), so flags
  // would just be treated as package names and brew would report "not found".
  it('allows hyphenated names (not shell-injected via spawn)', async () => {
    const api = await import('./brew-api.js');
    // These pass regex validation but brew would just say "not found"
    await expect(api.getFormulaInfo('--force')).resolves.toBeDefined();
  });
});

describe('pinPackage / unpinPackage (ARQ-008)', () => {
  it('pinPackage rejects shell injection', async () => {
    const api = await import('./brew-api.js');
    if (typeof api.pinPackage === 'function') {
      await expect(api.pinPackage('; echo hacked')).rejects.toThrow('Invalid package name');
    }
  });

  it('unpinPackage rejects shell injection', async () => {
    const api = await import('./brew-api.js');
    if (typeof api.unpinPackage === 'function') {
      await expect(api.unpinPackage('; echo hacked')).rejects.toThrow('Invalid package name');
    }
  });

  it('pinPackage accepts valid names', async () => {
    const api = await import('./brew-api.js');
    if (typeof api.pinPackage === 'function') {
      await expect(api.pinPackage('node')).resolves.not.toThrow();
    }
  });
});

describe('brew-api wrappers and adapters', () => {
  it('calls the expected brew/json parser pairs for installed, outdated and services', async () => {
    const { execBrew } = await import('./brew-cli.js');
    const api = await import('./brew-api.js');

    await api.getInstalled();
    await api.getOutdated();
    await api.getServices();

    expect(execBrew).toHaveBeenCalledWith(['info', '--json=v2', '--installed']);
    expect(execBrew).toHaveBeenCalledWith(['outdated', '--json=v2']);
    expect(execBrew).toHaveBeenCalledWith(['services', 'list', '--json']);
  });

  it('returns null for cask info when brew/json parsing fails', async () => {
    const { execBrew } = await import('./brew-cli.js');
    const api = await import('./brew-api.js');
    (execBrew as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad cask'));

    await expect(api.getCaskInfo('warp')).resolves.toBeNull();
  });

  it('strips leading dashes from search terms and avoids empty searches', async () => {
    const { execBrew } = await import('./brew-cli.js');
    const api = await import('./brew-api.js');
    (execBrew as ReturnType<typeof vi.fn>).mockClear();

    await expect(api.search('---')).resolves.toEqual({ formulae: [], casks: [] });
    expect(execBrew).not.toHaveBeenCalled();

    await api.search('--wget');
    expect(execBrew).toHaveBeenCalledWith(['search', 'wget']);
  });

  it('parses brew doctor stderr when the command exits non-zero', async () => {
    const { execBrew } = await import('./brew-cli.js');
    const api = await import('./brew-api.js');
    (execBrew as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Warning: bad tap'));

    await expect(api.getDoctor()).resolves.toBeDefined();
  });

  it('validates names before mutating operations and delegates to brew', async () => {
    const { execBrew, streamBrew } = await import('./brew-cli.js');
    const api = await import('./brew-api.js');
    const gen = (async function* () { yield 'ok'; })();
    (streamBrew as ReturnType<typeof vi.fn>).mockReturnValue(gen);

    expect(api.installPackage('wget')).toBe(gen);
    expect(streamBrew).toHaveBeenCalledWith(['install', 'wget']);
    expect(api.upgradeAll()).toBe(gen);
    expect(streamBrew).toHaveBeenCalledWith(['upgrade']);
    await api.uninstallPackage('wget');
    await api.serviceAction('postgresql@16', 'restart');

    expect(execBrew).toHaveBeenCalledWith(['uninstall', 'wget']);
    expect(execBrew).toHaveBeenCalledWith(['services', 'restart', 'postgresql@16']);
    expect(() => api.installPackage('bad name')).toThrow('Invalid package name');
  });

  it('adapts formulae and casks into list items', async () => {
    const api = await import('./brew-api.js');
    const formulaItems = api.formulaeToListItems([
      {
        name: 'node',
        desc: 'runtime',
        versions: { stable: '22.0.0' },
        installed: [{ version: '21.0.0', installed_as_dependency: true, time: 123 }],
        outdated: true,
        pinned: true,
        keg_only: true,
      } as any,
      {
        name: 'ripgrep',
        desc: 'search',
        versions: { stable: '14.0.0' },
        installed: [],
        outdated: false,
        pinned: false,
        keg_only: false,
      } as any,
    ]);
    expect(formulaItems).toMatchObject([
      { name: 'node', version: '21.0.0', installedAsDependency: true, installedTime: 123 },
      { name: 'ripgrep', version: '14.0.0', installedAsDependency: false, installedTime: null },
    ]);

    expect(api.casksToListItems([{ token: 'warp', version: '1', installed: null, desc: 'terminal', outdated: false } as any]))
      .toMatchObject([{ name: 'warp', version: '1', type: 'cask' }]);
    expect(api.formulaeFromCask({
      token: 'warp',
      full_token: 'homebrew/cask/warp',
      desc: 'terminal',
      homepage: 'https://example.test',
      version: '1.0.0',
      installed: '1.0.0',
      installed_time: 42,
      outdated: false,
    } as any)).toMatchObject({ name: 'warp', installed: [{ version: '1.0.0', time: 42 }] });
  });

  it('caches upgrade impact until the version tuple changes', async () => {
    const api = await import('./brew-api.js');
    api._resetImpactCacheForTests();
    mocks.analyzeUpgradeImpact.mockResolvedValue({ risk: 'low' });

    await api.getUpgradeImpact('node', '20', '21', 'formula');
    await api.getUpgradeImpact('node', '20', '21', 'formula');
    await api.getUpgradeImpact('node', '21', '22', 'formula');

    expect(mocks.analyzeUpgradeImpact).toHaveBeenCalledTimes(2);
  });

  it('resolves, rejects and times out brew update correctly', async () => {
    const api = await import('./brew-api.js');

    const okProc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    okProc.kill = vi.fn();
    mocks.spawn.mockReturnValueOnce(okProc);
    const ok = api.brewUpdate();
    okProc.emit('close', 0);
    await expect(ok).resolves.toBeUndefined();

    const badProc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    badProc.kill = vi.fn();
    mocks.spawn.mockReturnValueOnce(badProc);
    const bad = api.brewUpdate();
    badProc.emit('close', 2);
    await expect(bad).rejects.toThrow('brew update exited with code 2');

    vi.useFakeTimers();
    const slowProc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    slowProc.kill = vi.fn();
    mocks.spawn.mockReturnValueOnce(slowProc);
    const slow = api.brewUpdate();
    slow.catch(() => {});
    await vi.advanceTimersByTimeAsync(120_000);
    expect(slowProc.kill).toHaveBeenCalledWith('SIGTERM');
    await expect(slow).rejects.toThrow('timed out');
    vi.useRealTimers();
  });
});
