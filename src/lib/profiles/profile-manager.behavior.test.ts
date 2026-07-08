import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  rename: vi.fn(),
  ensureDataDirs: vi.fn(),
  execBrew: vi.fn(),
  streamBrew: vi.fn(),
  getInstalled: vi.fn(),
  getLeaves: vi.fn(),
  getWatermark: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  readdir: mocks.readdir,
  rm: mocks.rm,
  rename: mocks.rename,
}));
vi.mock('../data-dir.js', () => ({
  PROFILES_DIR: '/tmp/brewtui-bar/profiles',
  ensureDataDirs: mocks.ensureDataDirs,
}));
vi.mock('../brew-cli.js', () => ({
  execBrew: mocks.execBrew,
  streamBrew: mocks.streamBrew,
}));
vi.mock('../brew-api.js', () => ({
  getInstalled: mocks.getInstalled,
  getLeaves: mocks.getLeaves,
}));
vi.mock('../../i18n/index.js', () => ({
  t: (key: string, values?: Record<string, unknown>) => values?.name ? `${key}:${values.name}` : key,
}));
vi.mock('../license/watermark.js', () => ({
  getWatermark: mocks.getWatermark,
}));

import {
  exportCurrentSetup,
  importProfile,
  listProfiles,
  loadProfile,
  saveProfile,
  updateProfile,
} from './profile-manager.js';
import type { Profile } from './types.js';

const profile: Profile = {
  name: 'Work Mac',
  description: 'dev tools',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  formulae: ['wget'],
  casks: ['warp'],
  taps: ['homebrew/core'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureDataDirs.mockResolvedValue(undefined);
  mocks.readdir.mockResolvedValue([]);
  mocks.readFile.mockResolvedValue(JSON.stringify({ version: 1, profile }));
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.rename.mockResolvedValue(undefined);
  mocks.rm.mockResolvedValue(undefined);
  mocks.execBrew.mockResolvedValue('');
  mocks.getLeaves.mockResolvedValue(['wget']);
  mocks.getInstalled.mockResolvedValue({
    formulae: [],
    casks: [{ token: 'warp', installed: '1.0.0' }],
  });
  mocks.getWatermark.mockReturnValue('watermark');
  mocks.streamBrew.mockImplementation(async function* () {
    yield 'installed';
  });
});

describe('profile-manager behavior', () => {
  it('lists only json profiles without their extension', async () => {
    mocks.readdir.mockResolvedValue(['work.json', 'notes.txt', 'home.json']);

    await expect(listProfiles(true)).resolves.toEqual(['work', 'home']);
  });

  it('loads valid profiles and rejects corrupt or unsupported files', async () => {
    await expect(loadProfile(true, 'Work Mac')).resolves.toMatchObject({ name: 'Work Mac' });

    mocks.readFile.mockResolvedValueOnce('{bad');
    await expect(loadProfile(true, 'Work Mac')).rejects.toThrow('is corrupted');

    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ version: 2, profile }));
    await expect(loadProfile(true, 'Work Mac')).rejects.toThrow('Unsupported data version');

    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ version: 1 }));
    await expect(loadProfile(true, 'Work Mac')).rejects.toThrow('missing required data');
  });

  it('saves profiles atomically and updates existing profile names', async () => {
    await saveProfile(true, profile);

    expect(mocks.writeFile).toHaveBeenCalledWith(
      '/tmp/brewtui-bar/profiles/Work Mac.json.tmp',
      JSON.stringify({ version: 1, profile }, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
    expect(mocks.rename).toHaveBeenCalledWith(
      '/tmp/brewtui-bar/profiles/Work Mac.json.tmp',
      '/tmp/brewtui-bar/profiles/Work Mac.json',
    );

    await updateProfile(true, 'Work Mac', 'Laptop', 'new desc');
    expect(mocks.rm).toHaveBeenCalledWith('/tmp/brewtui-bar/profiles/Work Mac.json');
    expect(mocks.rename).toHaveBeenLastCalledWith(
      '/tmp/brewtui-bar/profiles/Laptop.json.tmp',
      '/tmp/brewtui-bar/profiles/Laptop.json',
    );
  });

  it('exports the current setup and prevents duplicate names', async () => {
    mocks.readdir.mockResolvedValueOnce([]);
    mocks.execBrew.mockResolvedValueOnce('homebrew/core\nmolinesdesigns/tap\n');

    const exported = await exportCurrentSetup(true, 'Fresh', 'new machine');

    expect(exported).toMatchObject({
      name: 'Fresh',
      formulae: ['wget'],
      casks: ['warp'],
      taps: ['homebrew/core', 'molinesdesigns/tap'],
      exportedBy: 'watermark',
    });

    mocks.readdir.mockResolvedValueOnce(['Fresh.json']);
    await expect(exportCurrentSetup(true, 'Fresh', 'dupe')).rejects.toThrow('Profile already exists');
  });

  it('imports valid missing taps/packages and skips invalid names', async () => {
    mocks.getInstalled.mockResolvedValue({
      formulae: [{ name: 'already-there' }],
      casks: [{ token: 'installed-cask', installed: '1' }],
    });
    const target: Profile = {
      ...profile,
      taps: ['homebrew/core', '../bad'],
      formulae: ['already-there', 'wget', '--flag'],
      casks: ['installed-cask', 'warp', 'Bad/Cask'],
    };

    const lines: string[] = [];
    for await (const line of importProfile(true, target)) lines.push(line);

    expect(lines).toContain('profileMgr_tapping:homebrew/core');
    expect(lines).toContain('Skipping invalid tap name: ../bad');
    expect(lines).toContain('profileMgr_installing:wget');
    expect(lines).toContain('Skipping invalid formula name: --flag');
    expect(lines).toContain('profileMgr_installingCask:warp');
    expect(lines).toContain('Skipping invalid cask name: Bad/Cask');
    expect(mocks.streamBrew).toHaveBeenCalledWith(['install', 'wget']);
    expect(mocks.streamBrew).toHaveBeenCalledWith(['install', '--cask', 'warp']);
  });
});
