import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock dependencies to isolate profile-manager logic
vi.mock('../data-dir.js', () => ({
  PROFILES_DIR: '/tmp/brewtui-bar-test-profiles',
  ensureDataDirs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../brew-cli.js', () => ({
  execBrew: vi.fn().mockResolvedValue(''),
  streamBrew: vi.fn(),
}));

vi.mock('../brew-api.js', () => ({
  getInstalled: vi.fn().mockResolvedValue({ formulae: [], casks: [] }),
  getLeaves: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../i18n/index.js', () => ({
  t: (key: string) => key,
}));

vi.mock('../license/watermark.js', () => ({
  getWatermark: vi.fn().mockReturnValue(''),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}));

describe('validateProfileName (QA-005)', () => {
  let profileModule: typeof import('./profile-manager.js');

  beforeEach(async () => {
    vi.resetModules();
    profileModule = await import('./profile-manager.js');
  });

  // Use loadProfile instead of deleteProfile because deleteProfile catches all errors.
  // loadProfile calls profilePath(name) → validateProfileName(name) without catching.

  it('rejects empty name', async () => {
    // Arg order: (isPro, name)
    await expect(profileModule.loadProfile(true, '')).rejects.toThrow('Profile name cannot be empty');
  });

  it('rejects whitespace-only name', async () => {
    await expect(profileModule.loadProfile(true, '   ')).rejects.toThrow('Profile name cannot be empty');
  });

  it('rejects name with path traversal (../)', async () => {
    await expect(profileModule.loadProfile(true, '../etc/passwd')).rejects.toThrow('Invalid profile name');
  });

  it('rejects name with forward slash', async () => {
    await expect(profileModule.loadProfile(true, 'foo/bar')).rejects.toThrow('Invalid profile name');
  });

  it('rejects name with special characters', async () => {
    await expect(profileModule.loadProfile(true, 'foo*bar?')).rejects.toThrow('Invalid profile name');
  });

  it('rejects name over 100 characters', async () => {
    const longName = 'a'.repeat(101);
    await expect(profileModule.loadProfile(true, longName)).rejects.toThrow('too long');
  });

  it('accepts valid name with alphanumerics (throws ENOENT, not validation)', async () => {
    // If validation passes, it proceeds to readFile which throws ENOENT
    await expect(profileModule.loadProfile(true, 'my-profile-1')).rejects.toThrow('ENOENT');
  });

  it('accepts valid name with hyphens and underscores', async () => {
    await expect(profileModule.loadProfile(true, 'my_test-profile')).rejects.toThrow('ENOENT');
  });

  it('accepts valid name with spaces', async () => {
    await expect(profileModule.loadProfile(true, 'My Profile')).rejects.toThrow('ENOENT');
  });

  it('rejects when not Pro', async () => {
    await expect(profileModule.loadProfile(false, 'test')).rejects.toThrow('Pro license required');
  });

  it('deleteProfile silently handles invalid names (caught by try/catch)', async () => {
    // deleteProfile wraps profilePath in try/catch, so validation errors are swallowed
    await expect(profileModule.deleteProfile(true, '../bad')).resolves.toBeUndefined();
  });
});
