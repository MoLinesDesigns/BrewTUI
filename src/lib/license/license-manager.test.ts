import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { LicenseData } from './types.js';

// ── Mocks ──

vi.mock('./polar-api.js', () => ({
  activateLicense: vi.fn(),
  validateLicense: vi.fn(),
  deactivateLicense: vi.fn(),
}));

vi.mock('../data-dir.js', () => ({
  LICENSE_PATH: '/tmp/brewtui-bar-test-license.json',
  ensureDataDirs: vi.fn().mockResolvedValue(undefined),
  getMachineId: vi.fn(async () => 'test-machine-uuid'),
}));

vi.mock('../../i18n/index.js', () => ({
  t: (key: string, values?: Record<string, string | number>) => {
    if (key === 'cli_rateLimited' && values) return `Rate limited, try again in ${values.minutes} minute(s)`;
    if (key === 'cli_cooldown') return 'Please wait before trying again';
    return key;
  },
}));

// Mock fs to prevent real filesystem access for save/load tests
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockRename = vi.fn().mockResolvedValue(undefined);
const mockRm = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

function makeLicense(overrides: Partial<LicenseData> = {}): LicenseData {
  return {
    key: 'test-key-12345',
    instanceId: 'inst-1',
    status: 'active',
    customerEmail: 'test@example.com',
    customerName: 'Test User',
    plan: 'pro',
    activatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    lastValidatedAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

// ── getDegradationLevel tests (QA-002) ──

describe('getDegradationLevel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "none" for 0 days elapsed', async () => {
    const now = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(now);

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: now.toISOString() });
    expect(getDegradationLevel(license)).toBe('none');
  });

  it('returns "none" for 3 days elapsed', async () => {
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: '2026-04-23T12:00:00.000Z' });
    expect(getDegradationLevel(license)).toBe('none');
  });

  it('returns "none" at exactly 7 days (boundary)', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    const sevenDaysLater = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    vi.setSystemTime(sevenDaysLater);

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(getDegradationLevel(license)).toBe('none');
  });

  it('returns "warning" for 8 days elapsed', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 8 * 24 * 60 * 60 * 1000));

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(getDegradationLevel(license)).toBe('warning');
  });

  it('returns "warning" at exactly 14 days (boundary)', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000));

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(getDegradationLevel(license)).toBe('warning');
  });

  it('returns "limited" for 20 days elapsed', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 20 * 24 * 60 * 60 * 1000));

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(getDegradationLevel(license)).toBe('limited');
  });

  it('returns "limited" at exactly 30 days (boundary)', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000));

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(getDegradationLevel(license)).toBe('limited');
  });

  it('returns "expired" for 31 days elapsed', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 31 * 24 * 60 * 60 * 1000));

    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(getDegradationLevel(license)).toBe('expired');
  });

  it('returns "expired" for corrupted lastValidatedAt', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: 'not-a-date' });
    expect(getDegradationLevel(license)).toBe('expired');
  });

  it('returns "expired" when lastValidatedAt is far in the future (clock skew exploit)', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: '2026-04-30T12:00:00.000Z' });
    expect(getDegradationLevel(license)).toBe('expired');
  });

  it('tolerates small future clock skew (≤24h) while revalidation runs', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: '2026-04-23T20:00:00.000Z' });
    expect(getDegradationLevel(license)).toBe('none');
  });
});

// ── isExpired / needsRevalidation / isWithinGracePeriod ──

describe('isExpired', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false when expiresAt is null', async () => {
    const { isExpired } = await import('./license-manager.js');
    const license = makeLicense({ expiresAt: null });
    expect(isExpired(license)).toBe(false);
  });

  it('returns false when not yet expired', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    const { isExpired } = await import('./license-manager.js');
    const license = makeLicense({ expiresAt: '2027-01-01T00:00:00.000Z' });
    expect(isExpired(license)).toBe(false);
  });

  it('returns true when past expiry', async () => {
    vi.setSystemTime(new Date('2028-01-01T00:00:00.000Z'));
    const { isExpired } = await import('./license-manager.js');
    const license = makeLicense({ expiresAt: '2027-01-01T00:00:00.000Z' });
    expect(isExpired(license)).toBe(true);
  });

  it('fails closed on unparseable expiry date', async () => {
    const { isExpired } = await import('./license-manager.js');
    const license = makeLicense({ expiresAt: 'not-a-date' });
    expect(isExpired(license)).toBe(true);
  });
});

describe('needsRevalidation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false when recently validated', async () => {
    const now = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(now);
    const { needsRevalidation } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: now.toISOString() });
    expect(needsRevalidation(license)).toBe(false);
  });

  it('returns true when validated over 24 hours ago', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 25 * 60 * 60 * 1000));
    const { needsRevalidation } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(needsRevalidation(license)).toBe(true);
  });

  it('returns true for corrupted date', async () => {
    const { needsRevalidation } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: 'bad-date' });
    expect(needsRevalidation(license)).toBe(true);
  });

  it('returns true when lastValidatedAt is in the future (clock skew)', async () => {
    vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
    const { needsRevalidation } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: '2026-04-23T20:00:00.000Z' });
    expect(needsRevalidation(license)).toBe(true);
  });
});

describe('isWithinGracePeriod', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns true when within 7 days of last validation', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 3 * 24 * 60 * 60 * 1000));
    const { isWithinGracePeriod } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(isWithinGracePeriod(license)).toBe(true);
  });

  it('returns false when beyond 7 days', async () => {
    const base = new Date('2026-04-23T12:00:00.000Z');
    vi.setSystemTime(new Date(base.getTime() + 8 * 24 * 60 * 60 * 1000));
    const { isWithinGracePeriod } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: base.toISOString() });
    expect(isWithinGracePeriod(license)).toBe(false);
  });

  it('returns false for corrupted date', async () => {
    const { isWithinGracePeriod } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: 'corrupt' });
    expect(isWithinGracePeriod(license)).toBe(false);
  });
});

// ── AES-256-GCM round-trip (QA-006) via saveLicense → loadLicense ──

// In 4.0.0 the local AES-GCM envelope was replaced by a backend-signed
// envelope (Ed25519). The signing key lives on the NAS; the client only
// verifies. These tests pin the loadLicense rejection behaviour for every
// legacy / malformed shape so a regression that re-accepts unencrypted or
// AES envelopes can't slip through.
describe('loadLicense — envelope handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when license file does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('returns null when file contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('not json at all');
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('returns null when version is wrong', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ version: 99 }));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('refuses legacy v1 unencrypted envelopes (security regression guard)', async () => {
    // Pre-3.1.0 wrote `{version: 1, license: {...}}` in plaintext. Accepting
    // these would let any process that writes the file forge Pro status.
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      license: makeLicense(),
    }));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('refuses legacy v1 AES-GCM envelopes', async () => {
    // The HKDF key was bundle-derivable, so any envelope encrypted under it
    // is forgeable. v2 (signed) is the only authorised path since 4.0.0.
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 1,
      encrypted: 'AAAA',
      iv: 'BBBB',
      tag: 'CCCC',
    }));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('refuses v2 envelopes with a bogus signature', async () => {
    // The shape is right but the signature won't verify against the real
    // public key. Must NOT grant Pro.
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 2,
      license: makeLicense(),
      sig: 'AAAA'.padEnd(88, 'A'),
    }));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('refuses v2 envelopes missing the signature', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 2,
      license: makeLicense(),
    }));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });

  it('refuses v2 envelopes with malformed license payload', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      version: 2,
      license: { key: 'incomplete' },
      sig: 'A'.repeat(88),
    }));
    const { loadLicense } = await import('./license-manager.js');
    expect(await loadLicense()).toBeNull();
  });
});

// ── Rate limiting (QA-004) via activate() ──

describe('rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows a first activation attempt to reach the backend', async () => {
    // Producing a real signed envelope here would require the private key
    // (lives on the NAS). Instead we let the backend call succeed structurally
    // and assert the rate limit didn't block before the verify stage — the
    // verify failure is expected and unrelated to what this test pins.
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;
    (activateLicense as ReturnType<typeof vi.fn>).mockResolvedValue({
      license: {
        key: 'valid-key-123',
        instanceId: 'inst-1',
        status: 'active',
        customerEmail: 'test@example.com',
        customerName: 'Test',
        plan: 'pro',
        activatedAt: '2026-01-01T00:00:00Z',
        expiresAt: null,
        lastValidatedAt: '2026-06-04T00:00:00Z',
      },
      sig: 'A'.repeat(88),
    });

    const { activate } = await import('./license-manager.js');
    // The verify will reject our fake signature → activate throws a
    // signature-verification error, NOT a rate-limit error. That asymmetry
    // is what we're pinning: the rate limiter let the call through.
    await expect(activate('valid-key-123')).rejects.toThrow(/signature verification/);
  });

  it('blocks attempts within cooldown window', async () => {
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;
    (activateLicense as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid key'));

    const { activate } = await import('./license-manager.js');

    // First attempt (fails but records the attempt)
    await expect(activate('bad-key-12345')).rejects.toThrow();

    // Second attempt within 30s cooldown — should be rate limited
    vi.advanceTimersByTime(5_000); // 5 seconds later
    await expect(activate('another-key-1')).rejects.toThrow('Please wait before trying again');
  });

  it('allows attempts after cooldown expires', async () => {
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;
    (activateLicense as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid key'));

    const { activate } = await import('./license-manager.js');

    // First attempt
    await expect(activate('bad-key-12345')).rejects.toThrow();

    // Advance past cooldown (30s)
    vi.advanceTimersByTime(31_000);

    // Should be allowed (will fail at API level, not rate limit)
    await expect(activate('bad-key-23456')).rejects.toThrow('Invalid key');
  });

  it('locks out after MAX_ATTEMPTS (5) failed attempts', async () => {
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;
    (activateLicense as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid key'));

    const { activate } = await import('./license-manager.js');

    for (let i = 0; i < 5; i++) {
      await expect(activate(`bad-key-${String(i).padStart(5, '0')}0000`)).rejects.toThrow();
      // Advance past cooldown between each attempt
      vi.advanceTimersByTime(31_000);
    }

    // 6th attempt should be locked out (15 min lockout)
    vi.advanceTimersByTime(31_000); // past cooldown but within lockout
    await expect(activate('bad-key-60000')).rejects.toThrow('Rate limited');
  });

  it('does not lock out under the MAX_ATTEMPTS threshold', async () => {
    // Counterpart to the lockout test above: 4 failed attempts must NOT
    // trigger the 15-min lockout. Reset-on-success is now indirectly covered
    // — synthesising a successful activation needs a real signed envelope,
    // which lives behind the backend's private key. The interesting failure
    // mode here is that lockout fires one attempt too early, which this
    // bounded-loop assertion catches.
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;
    (activateLicense as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid key'));

    const { activate } = await import('./license-manager.js');

    for (let i = 0; i < 4; i++) {
      await expect(activate(`bad-key-${String(i).padStart(5, '0')}0000`)).rejects.toThrow('Invalid key');
      vi.advanceTimersByTime(31_000);
    }
    // 5th attempt: still allowed through to the backend (Invalid key, not Rate limited)
    await expect(activate('bad-key-40000')).rejects.toThrow('Invalid key');
  });
});

// ── License key format validation ──

describe('license key format validation', () => {
  it('rejects keys shorter than 10 characters', async () => {
    const { activate } = await import('./license-manager.js');
    await expect(activate('short')).rejects.toThrow('Invalid license key format');
  });

  it('rejects keys with invalid characters', async () => {
    const { activate } = await import('./license-manager.js');
    await expect(activate('has spaces in key!!')).rejects.toThrow('Invalid license key format');
  });

  it('rejects keys over 100 characters', async () => {
    const { activate } = await import('./license-manager.js');
    const longKey = 'a'.repeat(101);
    await expect(activate(longKey)).rejects.toThrow('Invalid license key format');
  });
});

// Plan detection by key prefix used to live here; in 4.0.0 the client no
// longer infers the plan from the key (the backend stamps it on the signed
// envelope). The corresponding tests moved to the backend repo where the
// detection logic now lives.

describe('getBuiltinAccountType (SEG-009 — backdoor removed)', () => {
  // The previous implementation hardcoded a map of customer emails that
  // bypassed Polar validation entirely. Combined with the AES key being
  // derivable from the bundle, that allowed any user to forge a perennial
  // Pro/Team license. This test locks the no-backdoor contract: every
  // candidate email returns null. A regression that re-introduces a
  // hardcoded entry will trip this test.
  const candidates = [
    'admin@molinesdesigns.com',
    'team@molinesdesigns.com',
    'artax1983@icloud.com',
    'support@molinesdesigns.com',
    '',
    'random@example.com',
  ];

  it.each(candidates)('returns null for %s', async (email) => {
    const { getBuiltinAccountType } = await import('./license-manager.js');
    expect(getBuiltinAccountType(email)).toBeNull();
  });
});
