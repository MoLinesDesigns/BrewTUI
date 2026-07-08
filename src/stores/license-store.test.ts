import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LicenseData } from '../lib/license/types.js';

const mockLoadLicense = vi.fn<() => Promise<LicenseData | null>>();
const mockRevalidate = vi.fn();
const mockIsExpired = vi.fn();
const mockNeedsRevalidation = vi.fn();
const mockGetDegradationLevel = vi.fn();
const mockActivate = vi.fn();
const mockDeactivate = vi.fn();
const mockGetBuiltinAccountType = vi.fn().mockReturnValue(null);
const mockEnsureDataDirs = vi.fn<() => Promise<void>>();
const mockInitStoreIntegrity = vi.fn();

vi.mock('../lib/license/license-manager.js', () => ({
  loadLicense: mockLoadLicense,
  revalidate: mockRevalidate,
  isExpired: mockIsExpired,
  needsRevalidation: mockNeedsRevalidation,
  getDegradationLevel: mockGetDegradationLevel,
  getBuiltinAccountType: mockGetBuiltinAccountType,
  activate: mockActivate,
  deactivate: mockDeactivate,
}));

vi.mock('../lib/data-dir.js', () => ({
  ensureDataDirs: mockEnsureDataDirs,
}));

vi.mock('../lib/license/anti-tamper.js', () => ({
  initStoreIntegrity: mockInitStoreIntegrity,
}));

const staleLicense: LicenseData = {
  key: 'test-key',
  instanceId: 'instance-1',
  status: 'active',
  customerEmail: 'test@example.com',
  customerName: 'Test User',
  plan: 'pro',
  activatedAt: '2026-04-01T10:00:00.000Z',
  expiresAt: '2026-05-01T10:00:00.000Z',
  lastValidatedAt: '2026-04-10T10:00:00.000Z',
};

const refreshedLicense: LicenseData = {
  ...staleLicense,
  lastValidatedAt: '2026-04-23T10:00:00.000Z',
};

beforeEach(() => {
  vi.resetModules();
  mockLoadLicense.mockReset();
  mockRevalidate.mockReset();
  mockIsExpired.mockReset();
  mockNeedsRevalidation.mockReset();
  mockGetDegradationLevel.mockReset();
  mockActivate.mockReset();
  mockDeactivate.mockReset();
  mockGetBuiltinAccountType.mockReset().mockReturnValue(null);
  mockEnsureDataDirs.mockReset().mockResolvedValue(undefined);
  mockInitStoreIntegrity.mockReset();
});

describe('license-store', () => {
  it('refreshes degradation after a successful revalidation', async () => {
    mockLoadLicense
      .mockResolvedValueOnce(staleLicense)
      .mockResolvedValueOnce(refreshedLicense);
    mockIsExpired.mockReturnValue(false);
    mockNeedsRevalidation.mockReturnValue(true);
    mockGetDegradationLevel
      .mockReturnValueOnce('warning')
      .mockReturnValueOnce('none');
    mockRevalidate.mockResolvedValue('valid');

    const { useLicenseStore } = await import('./license-store.js');

    await useLicenseStore.getState().initialize();

    expect(useLicenseStore.getState().status).toBe('pro');
    expect(useLicenseStore.getState().license?.lastValidatedAt).toBe(refreshedLicense.lastValidatedAt);
    expect(useLicenseStore.getState().degradation).toBe('none');
  });

  it('marks the store expired when revalidation fails', async () => {
    mockLoadLicense.mockResolvedValue(staleLicense);
    mockIsExpired.mockReturnValue(false);
    mockNeedsRevalidation.mockReturnValue(true);
    mockGetDegradationLevel.mockReturnValue('warning');
    mockRevalidate.mockResolvedValue('expired');

    const { useLicenseStore } = await import('./license-store.js');

    await useLicenseStore.getState().initialize();

    expect(useLicenseStore.getState().status).toBe('expired');
    expect(useLicenseStore.getState().degradation).toBe('expired');
    expect(useLicenseStore.getState().license?.status).toBe('expired');
  });

  it('attempts revalidation before marking degraded licenses expired', async () => {
    mockLoadLicense
      .mockResolvedValueOnce(staleLicense)
      .mockResolvedValueOnce(refreshedLicense);
    mockIsExpired.mockReturnValue(false);
    mockNeedsRevalidation.mockReturnValue(false);
    mockGetDegradationLevel
      .mockReturnValueOnce('expired')
      .mockReturnValue('none');
    mockRevalidate.mockResolvedValue('valid');

    const { useLicenseStore } = await import('./license-store.js');

    await useLicenseStore.getState().initialize();

    expect(mockRevalidate).toHaveBeenCalledOnce();
    expect(useLicenseStore.getState().status).toBe('pro');
    expect(useLicenseStore.getState().degradation).toBe('none');
  });
});
