import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.mock('../fetch-timeout.js', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
  fetchWithRetry: (...args: unknown[]) => mockFetch(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockRename = vi.fn();
const mockMkdir = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

vi.mock('../data-dir.js', () => ({
  DATA_DIR: '/tmp/.brewtui-bar',
  ensureDataDirs: vi.fn().mockResolvedValue(undefined),
  getMachineId: vi.fn(async () => 'test-machine-uuid'),
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockReadFile.mockReset();
  mockWriteFile.mockReset().mockResolvedValue(undefined);
  mockRename.mockReset().mockResolvedValue(undefined);
  mockMkdir.mockReset().mockResolvedValue(undefined);
  // machine-id read returns a deterministic UUID
  mockReadFile.mockImplementation((path: string) => {
    if (typeof path === 'string' && path.endsWith('machine-id')) {
      return Promise.resolve('00000000-0000-0000-0000-000000000001');
    }
    return Promise.reject(new Error('ENOENT'));
  });
});

afterEach(() => {
  vi.resetModules();
});

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    json: async () => body,
  };
}

describe('promo: validatePromoCode', () => {
  it('rejects codes shorter than 8 chars before any network call', async () => {
    const { validatePromoCode } = await import('./promo.js');
    const result = await validatePromoCode('SHORT');
    expect(result.valid).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns valid + canonical fields on a well-formed response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ type: 'trial', durationDays: 7 }));
    const { validatePromoCode } = await import('./promo.js');
    const result = await validatePromoCode('TRIAL-CODE-1234');
    expect(result).toEqual({ valid: true, type: 'trial', durationDays: 7 });
  });

  // Runtime validation contract (audit M-fix): casts alone must not be trusted.
  // A response missing required fields must surface as invalid, not as a
  // crash when the caller dereferences expiresAt below.
  it('rejects responses missing required fields', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ type: 'trial' }));
    const { validatePromoCode } = await import('./promo.js');
    const result = await validatePromoCode('TRIAL-CODE-1234');
    expect(result.valid).toBe(false);
  });

  it('rejects unknown promo types (constrains to trial|discount|full)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ type: 'enterprise', durationDays: 365 }));
    const { validatePromoCode } = await import('./promo.js');
    const result = await validatePromoCode('TRIAL-CODE-1234');
    expect(result.valid).toBe(false);
  });

  it('returns the server error message on non-2xx', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'expired' }, 410));
    const { validatePromoCode } = await import('./promo.js');
    const result = await validatePromoCode('TRIAL-CODE-1234');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('expired');
  });

  it('reports a network error when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const { validatePromoCode } = await import('./promo.js');
    const result = await validatePromoCode('TRIAL-CODE-1234');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/connection|validate/i);
  });
});

describe('promo: redeemPromoCode', () => {
  it('persists the redemption envelope on success and returns expiresAt', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { expiresAt: '2027-01-01T00:00:00.000Z', type: 'full', durationDays: 365 },
    }));
    const { redeemPromoCode } = await import('./promo.js');
    const result = await redeemPromoCode('FULL-FOREVER-99');
    expect(result.success).toBe(true);
    expect(result.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('rejects responses where data.expiresAt is missing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { type: 'full' } }));
    const { redeemPromoCode } = await import('./promo.js');
    const result = await redeemPromoCode('FULL-FOREVER-99');
    expect(result.success).toBe(false);
  });

  it('rejects responses where the outer data wrapper is missing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    const { redeemPromoCode } = await import('./promo.js');
    const result = await redeemPromoCode('FULL-FOREVER-99');
    expect(result.success).toBe(false);
  });

  it('rejects unsupported promo types from the server', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { expiresAt: '2027-01-01T00:00:00.000Z', type: 'partner', durationDays: 365 },
    }));
    const { redeemPromoCode } = await import('./promo.js');
    const result = await redeemPromoCode('PARTNER-FOREVER');
    expect(result.success).toBe(false);
  });

  it('blocks duplicate redemptions of the same code', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { expiresAt: '2027-01-01T00:00:00.000Z', type: 'trial', durationDays: 7 },
    }));
    // Existing promo file already has this code
    mockReadFile.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.endsWith('machine-id')) {
        return Promise.resolve('00000000-0000-0000-0000-000000000001');
      }
      return Promise.resolve(JSON.stringify({
        version: 1,
        redemptions: [{
          code: 'DUPLICATE-CODE',
          redeemedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-02-01T00:00:00.000Z',
          type: 'trial',
        }],
      }));
    });

    const { redeemPromoCode } = await import('./promo.js');
    const result = await redeemPromoCode('DUPLICATE-CODE');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already/i);
  });

  it('reports a network error when the redeem call fails', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));
    const { redeemPromoCode } = await import('./promo.js');
    const result = await redeemPromoCode('TRIAL-CODE-1234');
    expect(result.success).toBe(false);
  });
});
