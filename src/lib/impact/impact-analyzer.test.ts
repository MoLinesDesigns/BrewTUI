import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeUpgradeImpact, isMajorVersionBump } from './impact-analyzer.js';

vi.mock('../brew-cli.js', () => ({
  execBrew: vi.fn(),
}));

// i18n returns the key interpolated — stub t() to return recognisable strings
vi.mock('../../i18n/index.js', () => ({
  t: (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
}));

import { execBrew } from '../brew-cli.js';
const mockExecBrew = vi.mocked(execBrew);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── isMajorVersionBump ────────────────────────────────────────────────────────

describe('isMajorVersionBump', () => {
  it('returns true for 3.0.0 → 4.0.0', () => {
    expect(isMajorVersionBump('3.0.0', '4.0.0')).toBe(true);
  });

  it('returns false for 3.1.0 → 3.2.0', () => {
    expect(isMajorVersionBump('3.1.0', '3.2.0')).toBe(false);
  });

  it('returns true for 2 → 3', () => {
    expect(isMajorVersionBump('2', '3')).toBe(true);
  });

  it('returns false for same major', () => {
    expect(isMajorVersionBump('1.5.0', '1.9.9')).toBe(false);
  });
});

// ── analyzeUpgradeImpact ──────────────────────────────────────────────────────

describe('analyzeUpgradeImpact — cask', () => {
  it('always returns low risk for casks without calling execBrew', async () => {
    const result = await analyzeUpgradeImpact('firefox', '119.0', '120.0', 'cask');
    expect(result.risk).toBe('low');
    expect(result.directDeps).toEqual([]);
    expect(result.reverseDeps).toEqual([]);
    expect(result.riskReasons).toEqual([]);
    expect(mockExecBrew).not.toHaveBeenCalled();
  });
});

describe('analyzeUpgradeImpact — formula', () => {
  it('returns high risk for packages in HIGH_RISK_PACKAGES', async () => {
    mockExecBrew.mockResolvedValue('');
    const result = await analyzeUpgradeImpact('openssl', '3.0.0', '3.1.0', 'formula');
    expect(result.risk).toBe('high');
    expect(result.riskReasons).toContain('impact_reason_critical_package');
  });

  it('returns high risk when more than 10 reverse deps', async () => {
    const manyDeps = Array.from({ length: 11 }, (_, i) => `pkg${i}`).join('\n');
    mockExecBrew.mockImplementation((args: string[]) => {
      if (args[0] === 'deps') return Promise.resolve('dep1\ndep2');
      if (args[0] === 'uses') return Promise.resolve(manyDeps);
      return Promise.resolve('');
    });

    const result = await analyzeUpgradeImpact('somelib', '1.0.0', '1.1.0', 'formula');
    expect(result.risk).toBe('high');
    expect(result.reverseDeps).toHaveLength(11);
  });

  it('returns medium risk for major version bump', async () => {
    mockExecBrew.mockImplementation((args: string[]) => {
      if (args[0] === 'deps') return Promise.resolve('');
      if (args[0] === 'uses') return Promise.resolve('one\ntwo'); // 2 deps — not enough alone
      return Promise.resolve('');
    });

    const result = await analyzeUpgradeImpact('somelib', '2.0.0', '3.0.0', 'formula');
    // 2 reverse deps (< 3) + major bump = 1 factor → medium
    expect(result.risk).toBe('medium');
    expect(result.riskReasons.some((r) => r.includes('impact_reason_major_bump'))).toBe(true);
  });

  it('returns low risk when no risk factors apply', async () => {
    mockExecBrew.mockImplementation((args: string[]) => {
      if (args[0] === 'deps') return Promise.resolve('libfoo');
      if (args[0] === 'uses') return Promise.resolve('');
      return Promise.resolve('');
    });

    const result = await analyzeUpgradeImpact('normallib', '1.0.0', '1.1.0', 'formula');
    expect(result.risk).toBe('low');
    expect(result.riskReasons).toHaveLength(0);
    expect(result.directDeps).toEqual(['libfoo']);
  });

  it('returns impact with empty deps when execBrew fails, without throwing', async () => {
    // Spy the logger so the expected warns (one per failed brew sub-call:
    // `brew deps` + `brew uses`) don't bleed to stderr, and assert both
    // were emitted — silently swallowing a brew error would hide degraded
    // analysis from operators looking at logs.
    const { logger } = await import('../../utils/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    mockExecBrew.mockRejectedValue(new Error('brew command failed'));

    const result = await analyzeUpgradeImpact('brokenlib', '1.0.0', '1.1.0', 'formula');
    expect(result.directDeps).toEqual([]);
    expect(result.reverseDeps).toEqual([]);
    // Should not throw — risk is based on empty deps, no HIGH_RISK, no major bump (1.0→1.1)
    expect(result.risk).toBe('low');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('impact-analyzer: deps failed for brokenlib'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('impact-analyzer: uses failed for brokenlib'));
  });

  it('returns high risk when >=3 reverse deps AND major version bump (2 factors)', async () => {
    mockExecBrew.mockImplementation((args: string[]) => {
      if (args[0] === 'deps') return Promise.resolve('');
      if (args[0] === 'uses') return Promise.resolve('a\nb\nc'); // 3 deps
      return Promise.resolve('');
    });

    const result = await analyzeUpgradeImpact('multilib', '1.0.0', '2.0.0', 'formula');
    expect(result.risk).toBe('high');
  });
});
