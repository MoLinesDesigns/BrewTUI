import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { LicenseData } from './types.js';

// ── Mocks ──

vi.mock('./polar-api.js', () => ({
  activateLicense: vi.fn(),
  validateLicense: vi.fn(),
  deactivateLicense: vi.fn(),
}));

vi.mock('../data-dir.js', () => ({
  LICENSE_PATH: '/tmp/brew-tui-test-license.json',
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

  it('returns "expired" when lastValidatedAt is in the future (clock skew → fail closed)', async () => {
    // SEC-L1: a future lastValidatedAt is almost always a clock-skew exploit
    // (user advances system clock to keep Pro features forever). Fail closed;
    // the next online revalidate() resets things if the skew is benign.
    vi.setSystemTime(new Date('2026-04-23T12:00:00.000Z'));
    const { getDegradationLevel } = await import('./license-manager.js');
    const license = makeLicense({ lastValidatedAt: '2026-04-30T12:00:00.000Z' });
    expect(getDegradationLevel(license)).toBe('expired');
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

describe('AES-256-GCM license round-trip', () => {
  let capturedFileContent: string | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    capturedFileContent = null;

    // Capture what saveLicense writes
    mockWriteFile.mockImplementation(async (_path: string, content: string) => {
      capturedFileContent = content;
    });
    mockRename.mockResolvedValue(undefined);

    // Return captured content when loadLicense reads
    mockReadFile.mockImplementation(async () => {
      if (!capturedFileContent) throw new Error('ENOENT');
      return capturedFileContent;
    });
  });

  it('encrypts and decrypts license data correctly (round-trip)', async () => {
    const { saveLicense, loadLicense } = await import('./license-manager.js');
    const original = makeLicense();

    await saveLicense(original);
    expect(capturedFileContent).toBeTruthy();

    // Verify the saved file is encrypted (does not contain plaintext key)
    const parsed = JSON.parse(capturedFileContent!);
    expect(parsed.version).toBe(1);
    expect(parsed.encrypted).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.tag).toBeDefined();
    // The raw plaintext key should NOT appear in the encrypted file
    expect(capturedFileContent).not.toContain(original.key);

    const loaded = await loadLicense();
    expect(loaded).not.toBeNull();
    expect(loaded!.key).toBe(original.key);
    expect(loaded!.instanceId).toBe(original.instanceId);
    expect(loaded!.customerEmail).toBe(original.customerEmail);
    expect(loaded!.status).toBe(original.status);
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

  it('detects tampering with ciphertext', async () => {
    const { saveLicense, loadLicense } = await import('./license-manager.js');
    await saveLicense(makeLicense());

    // Tamper with the encrypted data
    const parsed = JSON.parse(capturedFileContent!);
    const tampered = Buffer.from(parsed.encrypted, 'base64');
    tampered[0] = tampered[0]! ^ 0xFF;
    parsed.encrypted = tampered.toString('base64');
    capturedFileContent = JSON.stringify(parsed);

    // loadLicense should return null (decryption fails gracefully)
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

  it('allows a first activation attempt', async () => {
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;
    (activateLicense as ReturnType<typeof vi.fn>).mockResolvedValue({
      activated: true,
      error: null,
      instance: { id: 'inst-1' },
      license_key: { id: 0, status: 'granted', key: 'valid-key-123', activation_limit: 3, activations_count: 1, expires_at: null },
      meta: { customer_email: 'test@example.com', customer_name: 'Test' },
    });

    const { activate } = await import('./license-manager.js');
    const license = await activate('valid-key-123');
    expect(license.key).toBe('valid-key-123');
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

  it('resets attempts on successful activation', async () => {
    const polarApi = await import('./polar-api.js');
    const { activateLicense } = polarApi;

    const { activate } = await import('./license-manager.js');

    // 3 failed attempts
    (activateLicense as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid key'));
    for (let i = 0; i < 3; i++) {
      await expect(activate(`bad-key-${String(i).padStart(5, '0')}0000`)).rejects.toThrow();
      vi.advanceTimersByTime(31_000);
    }

    // Successful attempt
    (activateLicense as ReturnType<typeof vi.fn>).mockResolvedValue({
      activated: true,
      error: null,
      instance: { id: 'inst-1' },
      license_key: { id: 0, status: 'granted', key: 'good-key-12345', activation_limit: 3, activations_count: 1, expires_at: null },
      meta: { customer_email: 'test@example.com', customer_name: 'Test' },
    });
    vi.advanceTimersByTime(31_000);
    const license = await activate('good-key-12345');
    expect(license.key).toBe('good-key-12345');

    // More failed attempts should NOT trigger lockout (counter was reset)
    (activateLicense as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid key'));
    vi.advanceTimersByTime(31_000);
    // This should fail with API error, not rate limit
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

// ── Plan detection from license-key prefix ──
// Polar's license-key benefits use distinct prefixes per tier, and we rely on
// the prefix to set license.plan correctly because the customer-portal API
// doesn't echo the productId on activation.

describe('plan detection by key prefix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockSuccessfulActivation(key: string) {
    return import('./polar-api.js').then(({ activateLicense }) => {
      (activateLicense as ReturnType<typeof vi.fn>).mockResolvedValue({
        activated: true,
        error: null,
        instance: { id: 'inst-1' },
        license_key: { id: 0, status: 'granted', key, activation_limit: 5, activations_count: 1, expires_at: null },
        meta: { customer_email: 'test@example.com', customer_name: 'Test' },
      });
    });
  }

  it('flags BTUI- (no -T-) keys as Pro', async () => {
    await mockSuccessfulActivation('BTUI-aaaa-bbbb-cccc');
    const { activate } = await import('./license-manager.js');
    const license = await activate('BTUI-aaaa-bbbb-cccc');
    expect(license.plan).toBe('pro');
  });

  it('flags BTUI-T- keys as Team', async () => {
    await mockSuccessfulActivation('BTUI-T-aaaa-bbbb-cccc');
    const { activate } = await import('./license-manager.js');
    const license = await activate('BTUI-T-aaaa-bbbb-cccc');
    expect(license.plan).toBe('team');
  });

  it('case-insensitive prefix match (lowercase BTUI-T-)', async () => {
    await mockSuccessfulActivation('btui-t-aaaa-bbbb-cccc');
    const { activate } = await import('./license-manager.js');
    const license = await activate('btui-t-aaaa-bbbb-cccc');
    expect(license.plan).toBe('team');
  });

  it('defaults unknown prefixes to Pro (legacy keys without prefix)', async () => {
    await mockSuccessfulActivation('legacy-key-without-prefix');
    const { activate } = await import('./license-manager.js');
    const license = await activate('legacy-key-without-prefix');
    expect(license.plan).toBe('pro');
  });
});

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
