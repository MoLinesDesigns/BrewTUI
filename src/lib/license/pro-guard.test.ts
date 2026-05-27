import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenseData } from './types.js';

const isDebuggerAttached = vi.fn();
const verifyStoreIntegrity = vi.fn();
const checkCanaries = vi.fn();
const checkBundleIntegrity = vi.fn();
const getDegradationLevel = vi.fn();

vi.mock('./anti-debug.js', () => ({ isDebuggerAttached }));
vi.mock('./anti-tamper.js', () => ({ verifyStoreIntegrity }));
vi.mock('./canary.js', () => ({ checkCanaries }));
vi.mock('./integrity.js', () => ({ checkBundleIntegrity }));
vi.mock('./license-manager.js', () => ({ getDegradationLevel }));

const license: LicenseData = {
  key: 'key',
  status: 'active',
  plan: 'pro',
  customerEmail: 'dev@example.test',
  customerName: 'Dev',
  activatedAt: '2026-05-01T00:00:00.000Z',
  lastValidatedAt: new Date().toISOString(),
  instanceId: 'instance',
  expiresAt: null,
};

describe('pro-guard', () => {
  beforeEach(() => {
    isDebuggerAttached.mockReturnValue(false);
    verifyStoreIntegrity.mockReturnValue(true);
    checkCanaries.mockReturnValue(true);
    checkBundleIntegrity.mockReturnValue(true);
    getDegradationLevel.mockReturnValue('none');
  });

  it('keeps the obfuscated pro check honest', async () => {
    const { _verify } = await import('./pro-guard.js');
    expect(_verify('pro')).toBe(true);
    expect(_verify('team')).toBe(false);
  });

  it('allows healthy pro licenses', async () => {
    const { verifyPro } = await import('./pro-guard.js');
    expect(verifyPro(license, 'pro')).toBe(true);
  });

  it.each([
    ['debugger', () => isDebuggerAttached.mockReturnValue(true)],
    ['bundle integrity', () => checkBundleIntegrity.mockReturnValue(false)],
    ['store integrity', () => verifyStoreIntegrity.mockReturnValue(false)],
    ['canary integrity', () => checkCanaries.mockReturnValue(false)],
  ])('blocks pro access when %s fails', async (_name, arrange) => {
    arrange();
    const { verifyPro } = await import('./pro-guard.js');
    expect(verifyPro(license, 'pro')).toBe(false);
  });

  it('requires both direct and indirect status checks to pass', async () => {
    const { verifyPro } = await import('./pro-guard.js');
    expect(verifyPro(license, 'free')).toBe(false);
    expect(verifyPro(license, 'team')).toBe(false);
  });

  it.each(['limited', 'expired'] as const)('blocks degraded licenses at %s level', async (level) => {
    getDegradationLevel.mockReturnValue(level);
    const { verifyPro } = await import('./pro-guard.js');
    expect(verifyPro(license, 'pro')).toBe(false);
  });

  it('throws from requirePro when verification fails', async () => {
    const { requirePro } = await import('./pro-guard.js');
    expect(() => requirePro(null, 'free')).toThrow('Pro license required');
  });
});
