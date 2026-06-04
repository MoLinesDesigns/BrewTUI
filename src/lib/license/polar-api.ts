import { fetchWithRetry } from '../fetch-timeout.js';
import type { LicenseData } from './types.js';

// SEG-009/v2: licence operations no longer hit Polar directly. The brewtui-api
// backend (NAS) proxies activate/validate/deactivate and returns an Ed25519-
// signed envelope `{ license, sig }`. The client verifies that envelope
// offline with the embedded public key (see license-manager.ts). The Polar
// shared secret used to live in the published npm bundle, allowing anyone
// with the bundle to forge a license; routing through the backend moves the
// signing key off the client entirely.
const BASE_URL = 'https://api.molinesdesigns.com/api/license';

/**
 * The shape returned by the backend's activate/validate endpoints. `license`
 * is the same LicenseData the rest of the codebase already consumes; `sig` is
 * base64 Ed25519 over canonical JSON of `license`.
 */
export interface SignedLicense {
  license: LicenseData;
  sig: string;
}

function validateApiUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('HTTPS required for license API');
  }
  // SEC-M1 (carried over from the old polar-api): only accept the exact
  // hostname or a true subdomain of molinesdesigns.com. `endsWith` alone
  // would let `evilmolinesdesigns.com` through.
  if (
    parsed.hostname !== 'molinesdesigns.com'
    && !parsed.hostname.endsWith('.molinesdesigns.com')
  ) {
    throw new Error('Invalid API host');
  }
}

interface BackendEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

async function post<T>(endpoint: string, body: Record<string, unknown>, expectEmpty = false): Promise<T> {
  const url = `${BASE_URL}/${endpoint}`;
  validateApiUrl(url);

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 15_000);

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const errBody = await res.json() as BackendEnvelope<unknown>;
      if (typeof errBody.error === 'string') message = errBody.error;
    } catch { /* non-JSON body — keep generic message */ }
    throw new Error(message);
  }

  if (expectEmpty || res.status === 204) return undefined as T;
  const wrapped = await res.json() as BackendEnvelope<T>;
  if (!wrapped.success || wrapped.data === undefined) {
    throw new Error(wrapped.error ?? 'Backend response missing data');
  }
  return wrapped.data;
}

/**
 * Validate the signed envelope structurally (the cryptographic verify happens
 * in license-manager.ts where the public key lives). Throws on any missing
 * field so callers can rely on the return type.
 */
function assertSigned(value: unknown): asserts value is SignedLicense {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid signed license: not an object');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.sig !== 'string' || v.sig.length === 0) {
    throw new Error('Invalid signed license: missing signature');
  }
  if (typeof v.license !== 'object' || v.license === null) {
    throw new Error('Invalid signed license: missing license payload');
  }
}

export async function activateLicense(key: string, machineId: string): Promise<SignedLicense> {
  const signed = await post<SignedLicense>('activate', { key, machineId });
  assertSigned(signed);
  return signed;
}

export async function validateLicense(key: string, instanceId: string): Promise<SignedLicense> {
  const signed = await post<SignedLicense>('validate', { key, instanceId });
  assertSigned(signed);
  return signed;
}

export async function deactivateLicense(key: string, instanceId: string): Promise<void> {
  await post<{ deactivated: boolean }>('deactivate', { key, instanceId });
}

// Exposed for tests: lets us point the client at a local backend without
// reaching for the network. The runtime caller never uses it.
export function _internalBaseUrl(): string {
  return BASE_URL;
}
