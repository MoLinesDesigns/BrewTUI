import { describe, expect, it, vi, beforeEach } from 'vitest';

// The module under test hits the brewtui-api backend (not Polar directly) since
// 4.0.0 — the backend returns a SignedLicense envelope wrapped in the standard
// { success, data } shape used across our API.
const mockFetch = vi.fn();
vi.mock('../fetch-timeout.js', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
  fetchWithRetry: (...args: unknown[]) => mockFetch(...args),
}));

const sampleSignedLicense = {
  license: {
    key: 'test-key-12345',
    instanceId: 'act-123',
    status: 'active',
    customerEmail: 'user@example.com',
    customerName: 'Test User',
    plan: 'pro',
    activatedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    lastValidatedAt: '2026-06-04T00:00:00.000Z',
  },
  // Real Ed25519 signatures are 64 bytes / 88 base64 chars. Tests only care
  // about the shape passing through polar-api; signature verification itself
  // lives in license-manager.ts and is exercised by its own tests.
  sig: 'A'.repeat(88),
};

describe('activateLicense', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('returns the signed envelope on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: sampleSignedLicense }),
    });

    const { activateLicense } = await import('./polar-api.js');
    const result = await activateLicense('test-key-12345', 'machine-uuid-aaaa');

    expect(result.license.key).toBe('test-key-12345');
    expect(result.license.instanceId).toBe('act-123');
    expect(result.sig).toHaveLength(88);
  });

  it('forwards key + machineId to the backend body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: sampleSignedLicense }),
    });

    const { activateLicense } = await import('./polar-api.js');
    await activateLicense('valid-key-12345', 'machine-uuid-xyz');

    const callBody = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(callBody.key).toBe('valid-key-12345');
    expect(callBody.machineId).toBe('machine-uuid-xyz');
    // Hashing the machineId is the backend's responsibility now — the client
    // sends the raw UUID and lets the backend derive the Polar label.
  });

  it('throws when the backend rejects the request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Invalid license key' }),
    });

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('bad-key-12345', 'm-id')).rejects.toThrow('Invalid license key');
  });

  it('throws when the network call fails', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('any-key-12345', 'm-id')).rejects.toThrow('fetch failed');
  });

  it('throws when the envelope is missing license fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { sig: 'aaaa' } }),
    });

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('test-key-12345', 'm-id')).rejects.toThrow(/missing license/);
  });

  it('throws when the envelope is missing the signature', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { license: sampleSignedLicense.license } }),
    });

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('test-key-12345', 'm-id')).rejects.toThrow(/missing signature/);
  });
});

describe('validateLicense', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('returns a fresh signed envelope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: sampleSignedLicense }),
    });

    const { validateLicense } = await import('./polar-api.js');
    const result = await validateLicense('key-12345', 'act-123');

    expect(result.license.status).toBe('active');
    expect(typeof result.sig).toBe('string');
  });

  it('throws when the backend says the license is revoked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'License revoked' }),
    });

    const { validateLicense } = await import('./polar-api.js');
    await expect(validateLicense('key-12345', 'act-123')).rejects.toThrow('License revoked');
  });

  it('throws on a malformed envelope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { sig: 123 } }),
    });

    const { validateLicense } = await import('./polar-api.js');
    await expect(validateLicense('key-12345', 'act-123')).rejects.toThrow(/missing signature|missing license/);
  });
});

describe('deactivateLicense', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('resolves on a successful deactivation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { deactivated: true } }),
    });

    const { deactivateLicense } = await import('./polar-api.js');
    await expect(deactivateLicense('key-12345', 'act-123')).resolves.toBeUndefined();
  });

  it('throws when the backend returns an error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Internal server error' }),
    });

    const { deactivateLicense } = await import('./polar-api.js');
    await expect(deactivateLicense('key-12345', 'act-123')).rejects.toThrow();
  });
});
