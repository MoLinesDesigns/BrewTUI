export interface LicenseData {
  key: string;
  instanceId: string;
  status: 'active' | 'expired' | 'inactive';
  customerEmail: string;
  customerName: string;
  plan: 'pro' | 'team';
  activatedAt: string;
  expiresAt: string | null;
  lastValidatedAt: string;
}

// BK-006: type guard for license payload after AES-GCM decrypt. A corrupt or
// migrated file could JSON.parse to anything — refuse instead of crashing on
// undefined accesses downstream.
export function isLicenseData(value: unknown): value is LicenseData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    typeof v.instanceId === 'string' &&
    (v.status === 'active' || v.status === 'expired' || v.status === 'inactive') &&
    typeof v.customerEmail === 'string' &&
    typeof v.customerName === 'string' &&
    (v.plan === 'pro' || v.plan === 'team') &&
    typeof v.activatedAt === 'string' &&
    (v.expiresAt === null || typeof v.expiresAt === 'string') &&
    typeof v.lastValidatedAt === 'string'
  );
}

/**
 * v2 envelope: license payload + Ed25519 signature from the brewtui-api
 * backend. The client verifies the signature with the embedded public key
 * — see license-manager.ts. This replaces the v1 AES-GCM envelope where the
 * shared HKDF secret lived in the public npm bundle.
 *
 * v1 envelopes (encrypted: {iv,tag,encrypted}) and legacy unencrypted
 * envelopes ({license}) are still represented here so the loader can detect
 * and reject them with a helpful message ("run brewtui-bar revalidate").
 */
export interface LicenseFile {
  version: 1 | 2;
  // v2 fields
  license?: LicenseData | null;
  sig?: string;
  // v1 legacy fields — present only on files written by < 4.0.0
  hmac?: string;
  encrypted?: string;
  iv?: string;
  tag?: string;
}

export type LicenseStatus = 'free' | 'pro' | 'team' | 'expired' | 'validating';

// PolarActivateResponse / PolarValidateResponse used to mirror the shape of
// the customer-portal API responses. Since 4.0.0 the client no longer talks
// to Polar directly — see polar-api.ts (now a thin wrapper around the
// brewtui-api backend). The signed envelope returned by the backend is
// `SignedLicense` (exported from polar-api.ts).

export type ProFeatureId =
  | 'profiles'
  | 'smart-cleanup'
  | 'history'
  | 'security-audit'
  | 'rollback'
  | 'brewfile'
  | 'sync'
  | 'impact-analysis';

export type TeamFeatureId = 'compliance';
