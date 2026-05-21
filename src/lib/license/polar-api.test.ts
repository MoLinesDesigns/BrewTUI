import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock fetch-timeout
const mockFetch = vi.fn();
vi.mock('../fetch-timeout.js', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
  fetchWithRetry: (...args: unknown[]) => mockFetch(...args),
}));

// Mock machine-id resolution (single canonical impl in data-dir.ts)
vi.mock('../data-dir.js', () => ({
  getMachineId: vi.fn(async () => 'test-machine-uuid-1234'),
}));

describe('activateLicense (QA-007, EP-001)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('returns activation data on successful activation', async () => {
    // First call: activate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'act-123',
        license_key: { status: 'granted', expires_at: null },
      }),
    });
    // Second call: validate (for customer info)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'act-123',
        status: 'granted',
        expires_at: null,
        customer: { email: 'user@example.com', name: 'Test User' },
        activation: { id: 'act-123' },
      }),
    });

    const { activateLicense } = await import('./polar-api.js');
    const result = await activateLicense('valid-key-12345');

    expect(result.activated).toBe(true);
    expect(result.instance.id).toBe('act-123');
    expect(result.meta.customer_email).toBe('user@example.com');
  });

  it('throws on invalid key (400 response)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Invalid license key' }),
    });

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('bad-key-123456')).rejects.toThrow('Invalid license key');
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('any-key-123456')).rejects.toThrow('fetch failed');
  });

  it('throws on malformed activation response (EP-001)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: 'data' }), // missing id, license_key
    });

    const { activateLicense } = await import('./polar-api.js');
    await expect(activateLicense('test-key-123456')).rejects.toThrow('Invalid activation response');
  });

  it('uses machine UUID instead of hostname (SEG-004)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'act-456',
        license_key: { status: 'granted', expires_at: null },
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'act-456',
        status: 'granted',
        expires_at: null,
        customer: { email: '', name: '' },
        activation: { id: 'act-456' },
      }),
    });

    const { activateLicense } = await import('./polar-api.js');
    await activateLicense('test-key-123456');

    // BK-009: el label es ahora SHA-256(machineId) truncado a 32 chars hex,
    // no el UUID en claro. Verificamos: (1) no es el hostname, (2) no es el
    // UUID en claro, (3) tiene 32 caracteres hex, (4) es derivacion
    // deterministica del UUID conocido.
    const { createHash } = await import('node:crypto');
    const expectedHash = createHash('sha256').update('test-machine-uuid-1234').digest('hex').slice(0, 32);
    const callBody = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(callBody.label).toBe(expectedHash);
    expect(callBody.label).toMatch(/^[0-9a-f]{32}$/);
    expect(callBody.label).not.toContain('.local');
    expect(callBody.label).not.toBe('test-machine-uuid-1234'); // UUID no debe filtrarse en claro
  });
});

describe('validateLicense (QA-007, EP-002)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('returns valid=true for granted license', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'act-123',
        status: 'granted',
        expires_at: null,
        customer: { email: 'user@example.com', name: 'Test' },
        activation: { id: 'act-123' },
      }),
    });

    const { validateLicense } = await import('./polar-api.js');
    const result = await validateLicense('key-123456789', 'act-123');

    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('returns valid=false for revoked license', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'act-123',
        status: 'revoked',
        expires_at: null,
        customer: { email: '', name: '' },
        activation: { id: 'act-123' },
      }),
    });

    const { validateLicense } = await import('./polar-api.js');
    const result = await validateLicense('key-123456789', 'act-123');

    expect(result.valid).toBe(false);
    expect(result.error).toContain('revoked');
  });

  it('throws on malformed response (EP-002)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'act-123' }), // missing status, customer
    });

    const { validateLicense } = await import('./polar-api.js');
    await expect(validateLicense('key-123456789', 'act-123')).rejects.toThrow('Invalid validation response');
  });
});

describe('deactivateLicense', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
  });

  it('succeeds on 204 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const { deactivateLicense } = await import('./polar-api.js');
    await expect(deactivateLicense('key-123456789', 'act-123')).resolves.toBeUndefined();
  });

  it('throws on server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });

    const { deactivateLicense } = await import('./polar-api.js');
    await expect(deactivateLicense('key-123456789', 'act-123')).rejects.toThrow();
  });
});
