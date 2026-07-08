import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../state-snapshot/snapshot.js', () => ({
  captureSnapshot: vi.fn(),
  saveSnapshot: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('../data-dir.js', () => ({
  DATA_DIR: '/fake/.brewtui-bar',
  ensureDataDirs: vi.fn(),
}));

vi.mock('../brew-cli.js', () => ({
  streamBrew: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { captureSnapshot } from '../state-snapshot/snapshot.js';
import { loadBrewfile, computeDrift } from './brewfile-manager.js';
import type { BrewfileSchema } from './types.js';
import type { BrewSnapshot } from '../state-snapshot/snapshot.js';

const MOCK_SCHEMA: BrewfileSchema = {
  version: 1,
  meta: {
    name: 'Test',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  formulae: [{ name: 'git' }, { name: 'node' }],
  casks: [{ name: 'visual-studio-code' }],
  taps: ['homebrew/core'],
};

const MOCK_SNAPSHOT_MATCHING: BrewSnapshot = {
  capturedAt: '2024-01-01T01:00:00.000Z',
  formulae: [
    { name: 'git', version: '2.44.0', pinned: false },
    { name: 'node', version: '20.0.0', pinned: false },
  ],
  casks: [{ name: 'visual-studio-code', version: '1.88.0' }],
  taps: ['homebrew/core'],
};

describe('brewfile-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadBrewfile', () => {
    it('returns null when file does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(readFile).mockRejectedValue(err);

      const result = await loadBrewfile();
      expect(result).toBeNull();
    });

    it('returns null when file is invalid (parse error)', async () => {
      // Spy the logger so the expected warn doesn't bleed to stderr and
      // doubles as a contract: parse failures MUST emit a structured warn.
      const { logger } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      vi.mocked(readFile).mockResolvedValue('invalid: yaml: content: that: fails: version\n');

      const result = await loadBrewfile();
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('Failed to parse Brewfile', expect.objectContaining({ error: expect.stringContaining('Invalid Brewfile') }));
    });

    it('returns parsed schema when file is valid', async () => {
      // Build valid YAML from our serializer
      const { serializeBrewfile } = await import('./yaml-serializer.js');
      const yaml = serializeBrewfile(MOCK_SCHEMA);
      vi.mocked(readFile).mockResolvedValue(yaml);

      const result = await loadBrewfile();
      expect(result).not.toBeNull();
      expect(result?.meta.name).toBe('Test');
      expect(result?.formulae).toHaveLength(2);
    });
  });

  describe('computeDrift', () => {
    it('returns score 100 when actual matches desired exactly', async () => {
      vi.mocked(captureSnapshot).mockResolvedValue(MOCK_SNAPSHOT_MATCHING);

      const report = await computeDrift(MOCK_SCHEMA);
      expect(report.score).toBe(100);
      expect(report.missingPackages).toHaveLength(0);
      expect(report.extraPackages).toHaveLength(0);
      expect(report.wrongVersions).toHaveLength(0);
    });

    it('lowers score when packages are missing from actual', async () => {
      const partialSnapshot: BrewSnapshot = {
        capturedAt: '2024-01-01T01:00:00.000Z',
        formulae: [{ name: 'git', version: '2.44.0', pinned: false }], // node missing
        casks: [], // visual-studio-code missing
        taps: ['homebrew/core'],
      };
      vi.mocked(captureSnapshot).mockResolvedValue(partialSnapshot);

      const report = await computeDrift(MOCK_SCHEMA);
      // node missing (formula) + visual-studio-code missing (cask) = 2 missing * 10 = 20 penalty
      expect(report.score).toBe(80);
      expect(report.missingPackages).toContain('node');
      expect(report.missingPackages).toContain('visual-studio-code');
    });

    it('returns score 0 when all packages are missing', async () => {
      const emptySnapshot: BrewSnapshot = {
        capturedAt: '2024-01-01T01:00:00.000Z',
        formulae: [],
        casks: [],
        taps: [],
      };
      const bigSchema: BrewfileSchema = {
        ...MOCK_SCHEMA,
        formulae: Array.from({ length: 12 }, (_, i) => ({ name: `pkg${i}` })),
      };
      vi.mocked(captureSnapshot).mockResolvedValue(emptySnapshot);

      const report = await computeDrift(bigSchema);
      expect(report.score).toBe(0);
    });

    it('detects extra packages when strictMode is true', async () => {
      const extraSnapshot: BrewSnapshot = {
        ...MOCK_SNAPSHOT_MATCHING,
        formulae: [
          ...MOCK_SNAPSHOT_MATCHING.formulae,
          { name: 'extra-tool', version: '1.0.0', pinned: false },
        ],
      };
      vi.mocked(captureSnapshot).mockResolvedValue(extraSnapshot);

      const schemaStrict: BrewfileSchema = { ...MOCK_SCHEMA, strictMode: true };
      const report = await computeDrift(schemaStrict);
      expect(report.extraPackages).toContain('extra-tool');
    });

    it('ignores extra packages when strictMode is false', async () => {
      const extraSnapshot: BrewSnapshot = {
        ...MOCK_SNAPSHOT_MATCHING,
        formulae: [
          ...MOCK_SNAPSHOT_MATCHING.formulae,
          { name: 'extra-tool', version: '1.0.0', pinned: false },
        ],
      };
      vi.mocked(captureSnapshot).mockResolvedValue(extraSnapshot);

      const schemaLenient: BrewfileSchema = { ...MOCK_SCHEMA, strictMode: false };
      const report = await computeDrift(schemaLenient);
      expect(report.extraPackages).toHaveLength(0);
    });

    it('detects wrong versions', async () => {
      const wrongVersionSnapshot: BrewSnapshot = {
        capturedAt: '2024-01-01T01:00:00.000Z',
        formulae: [
          { name: 'git', version: '2.44.0', pinned: false },
          { name: 'node', version: '20.0.0', pinned: false },
        ],
        casks: [{ name: 'visual-studio-code', version: '1.88.0' }],
        taps: ['homebrew/core'],
      };
      const schemaWithVersion: BrewfileSchema = {
        ...MOCK_SCHEMA,
        formulae: [
          { name: 'git', version: '2.45.0' }, // desired is newer
          { name: 'node' },
        ],
      };
      vi.mocked(captureSnapshot).mockResolvedValue(wrongVersionSnapshot);

      const report = await computeDrift(schemaWithVersion);
      expect(report.wrongVersions).toHaveLength(1);
      expect(report.wrongVersions[0]?.name).toBe('git');
      expect(report.wrongVersions[0]?.desired).toBe('2.45.0');
      expect(report.wrongVersions[0]?.actual).toBe('2.44.0');
    });
  });
});
