import { describe, it, expect } from 'vitest';
import { isLicenseData, type LicenseData } from './types.js';

// ARQ-001: license.json is the cross-language contract between the TS TUI and
// the Swift Brew-TUI-Bar. Both sides parse the same envelope, so the *shape* of the
// inner LicenseData has to stay stable. This fixture is the canonical payload —
// any field added on the TS side has to land here AND in the Swift LicenseData
// struct, with the equivalent test in Brew-TUI-BarTests pinned to the same JSON.
const FIXTURE: LicenseData = {
  key: 'POLAR-XXXX-YYYY-ZZZZ',
  instanceId: '00000000-0000-0000-0000-000000000001',
  status: 'active',
  customerEmail: 'tester@example.com',
  customerName: 'Test User',
  plan: 'pro',
  activatedAt: '2026-04-01T00:00:00.000Z',
  expiresAt: '2027-04-01T00:00:00.000Z',
  lastValidatedAt: '2026-05-01T00:00:00.000Z',
};

describe('license cross-language contract (ARQ-001)', () => {
  it('the canonical fixture parses through isLicenseData', () => {
    const json = JSON.stringify(FIXTURE);
    const parsed: unknown = JSON.parse(json);
    expect(isLicenseData(parsed)).toBe(true);
  });

  it('payloads with a null expiresAt are accepted', () => {
    const perpetual = { ...FIXTURE, expiresAt: null };
    const json = JSON.stringify(perpetual);
    expect(isLicenseData(JSON.parse(json))).toBe(true);
  });

  it('payloads missing required fields are rejected', () => {
    const required = ['key', 'instanceId', 'status', 'customerEmail',
      'customerName', 'plan', 'activatedAt', 'lastValidatedAt'] as const;
    for (const field of required) {
      const broken: Record<string, unknown> = { ...FIXTURE };
      delete broken[field];
      expect(isLicenseData(broken)).toBe(false);
    }
  });

  it('payloads with unexpected enum values are rejected', () => {
    expect(isLicenseData({ ...FIXTURE, plan: 'enterprise' })).toBe(false);
    expect(isLicenseData({ ...FIXTURE, status: 'trial' })).toBe(false);
  });
});
