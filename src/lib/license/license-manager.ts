import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { verify, createPublicKey } from 'node:crypto';
import { LICENSE_PATH, ensureDataDirs, getMachineId } from '../data-dir.js';
import {
  activateLicense as apiActivate,
  validateLicense as apiValidate,
  deactivateLicense as apiDeactivate,
  type SignedLicense,
} from './polar-api.js';
import { t } from '../../i18n/index.js';
import { isLicenseData, type LicenseData, type LicenseFile } from './types.js';

// SEG-009 guard: previously a hardcoded map bypassed Polar entirely. The
// function is kept as an always-null export so a regression test can pin
// the behaviour and the import site in license-store stays stable.
export function getBuiltinAccountType(_email: string): 'pro' | 'team' | 'free' | null {
  return null;
}

const REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Layer 18: Client-side rate limiting on activations ──
const ACTIVATION_COOLDOWN_MS = 30_000; // 30 seconds between attempts
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 min lockout after max attempts

interface ActivationTracker {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number;
}

// UX-004: rate-limit state is intentionally in-memory only. It is a first
// filter to slow down brute force inside one TUI session — the authoritative
// activation throttle lives in the Polar backend, which sees attempts across
// process restarts. Persisting this client-side would invite users to delete
// the file and reset themselves; the trade-off is documented here on purpose.
const tracker: ActivationTracker = {
  attempts: 0,
  lastAttempt: 0,
  lockedUntil: 0,
};

function checkRateLimit(): void {
  const now = Date.now();

  // Check lockout
  if (now < tracker.lockedUntil) {
    const remaining = Math.ceil((tracker.lockedUntil - now) / 60000);
    throw new Error(t('cli_rateLimited', { minutes: remaining }));
  }

  // Check cooldown
  if (now - tracker.lastAttempt < ACTIVATION_COOLDOWN_MS) {
    throw new Error(t('cli_cooldown'));
  }
}

function recordAttempt(success: boolean): void {
  const now = Date.now();
  tracker.lastAttempt = now;

  if (success) {
    tracker.attempts = 0;
    return;
  }

  tracker.attempts++;
  if (tracker.attempts >= MAX_ATTEMPTS) {
    tracker.lockedUntil = now + LOCKOUT_MS;
    tracker.attempts = 0;
  }
}

// SECURITY (SEG-009 v2): the signing key lives only on the brewtui-api NAS
// (LICENSE_SIGNING_PRIVATE_KEY env var). The Ed25519 public counterpart is
// embedded here AND in menubar/Brew-TUI-Bar/Sources/Services/LicenseChecker.swift —
// both verify the signed envelope offline without round-tripping the network.
// Exposing the public key is by design: a verifier needs it; forging signatures
// without the private half is computationally infeasible.
//
// Cross-check vector for keeping JS and Swift in sync lives in
// signature-cross-check.test.ts. Don't change the constant without rotating
// the key on the backend AND bumping the schema version.
const LICENSE_PUBLIC_KEY_B64 = 'oHtzyU7ZACt8Eqga+U4PSagr0rSj1YLs3oVSpmjmwq0=';

let _cachedPublicKey: ReturnType<typeof createPublicKey> | null = null;
function publicKey(): ReturnType<typeof createPublicKey> {
  if (_cachedPublicKey) return _cachedPublicKey;
  // SPKI wrapper for raw Ed25519 public keys (RFC 8410 §4):
  //   SEQUENCE { AlgorithmIdentifier { 1.3.101.112 }, BIT STRING { rawKey } }
  // 12-byte prefix + 32 raw bytes = 44 bytes total. Same prefix the backend
  // uses in lib/signer.js to expose publicKeyBase64().
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const rawPub = Buffer.from(LICENSE_PUBLIC_KEY_B64, 'base64');
  const spki = Buffer.concat([spkiPrefix, rawPub]);
  _cachedPublicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  return _cachedPublicKey;
}

/**
 * Deterministic JSON serialisation: object keys sorted recursively, no
 * whitespace, JSON.stringify for primitives. Both the backend signer
 * (backend/lib/signer.js) and the Swift verifier (LicenseChecker.swift)
 * implement the same algorithm — that's how the bytes-signed match the
 * bytes-verified across three languages.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJSON).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) =>
    JSON.stringify(k) + ':' + canonicalJSON((value as Record<string, unknown>)[k]),
  );
  return '{' + parts.join(',') + '}';
}

/**
 * Crypto-verify the envelope returned by the backend. Returns false on any
 * failure — including malformed base64, wrong-length signatures or invalid
 * canonical encoding — so the caller has a single boolean to gate Pro access.
 */
export function verifySignedLicense(signed: SignedLicense): boolean {
  try {
    const sig = Buffer.from(signed.sig, 'base64');
    if (sig.length !== 64) return false;
    const message = Buffer.from(canonicalJSON(signed.license), 'utf8');
    return verify(null, message, publicKey(), sig);
  } catch {
    return false;
  }
}

// BK-003: Type guard for license data format
function isLicenseFile(obj: unknown): obj is LicenseFile {
  if (typeof obj !== 'object' || obj === null) return false;
  const v = obj as Record<string, unknown>;
  return v.version === 1 || v.version === 2;
}

export async function loadLicense(): Promise<LicenseData | null> {
  try {
    const raw = await readFile(LICENSE_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (!isLicenseFile(parsed)) return null;
    const file = parsed as LicenseFile;

    // v2: signed envelope. The only path that grants Pro since 4.0.0.
    if (file.version === 2) {
      if (!file.license || typeof file.sig !== 'string') return null;
      if (!isLicenseData(file.license)) return null;
      const signed: SignedLicense = { license: file.license, sig: file.sig };
      if (!verifySignedLicense(signed)) return null;
      return file.license;
    }

    // v1: legacy AES-GCM envelope or unencrypted blob. Both are rejected —
    // the symmetric encryption key was shipped in the public bundle, so
    // accepting v1 would defeat the point of the signature migration. The
    // user just needs to run `brew-tui revalidate` once; activate() / the
    // periodic revalidation will overwrite the file with a v2 envelope on
    // the next successful round-trip to the backend.
    if (file.version === 1) {
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Persists the signed envelope returned by the backend. Replaces the old
 * client-side AES-GCM saveLicense — the client no longer needs (or has) any
 * key material; it just writes the bytes the backend signed.
 *
 * Atomic write via tmp + rename: a crash mid-write leaves either the old
 * file intact or the new one fully written, never a torn JSON.
 */
async function persistSigned(signed: SignedLicense): Promise<void> {
  await ensureDataDirs();
  const file: LicenseFile = {
    version: 2,
    license: signed.license,
    sig: signed.sig,
  };
  const tmpPath = LICENSE_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, LICENSE_PATH);
}

/**
 * @deprecated Use `persistSigned` with a backend-issued SignedLicense. Kept
 * for tests that pre-date the v2 envelope. Sign here locally with a test
 * keypair would defeat the threat model, so this path is intentionally
 * non-functional in production: any LicenseData saved through here cannot
 * be loaded back (no signature → loadLicense returns null).
 */
export async function saveLicense(_data: LicenseData): Promise<void> {
  throw new Error('saveLicense is no longer supported; the backend issues signed envelopes (4.0.0).');
}

export async function clearLicense(): Promise<void> {
  try {
    await rm(LICENSE_PATH);
  } catch { /* file may not exist */ }
}

export function isExpired(license: LicenseData): boolean {
  if (!license.expiresAt) return false;
  const expiry = new Date(license.expiresAt).getTime();
  // Fail closed on corrupted/unparseable dates: NaN comparisons are always
  // false, so the previous version treated a garbage expiresAt as "never
  // expires", which is exploitable.
  if (isNaN(expiry)) return true;
  return expiry < Date.now();
}

export function needsRevalidation(license: LicenseData): boolean {
  const lastValidated = new Date(license.lastValidatedAt).getTime();
  if (isNaN(lastValidated)) return true; // corrupted date → force revalidation
  return Date.now() - lastValidated > REVALIDATION_INTERVAL_MS;
}

export function isWithinGracePeriod(license: LicenseData): boolean {
  const lastValidated = new Date(license.lastValidatedAt).getTime();
  if (isNaN(lastValidated)) return false; // corrupted date → no grace
  return Date.now() - lastValidated < GRACE_PERIOD_MS;
}

// ── Layer 15: Gradual degradation after extended offline ──

export type DegradationLevel = 'none' | 'warning' | 'limited' | 'expired';
export type RevalidationResult = 'valid' | 'grace' | 'expired';

/**
 * Returns the degradation level based on time since last server validation.
 * - 0-7 days: none (full access)
 * - 7-14 days: warning (shows a notice but still works)
 * - 14-30 days: limited (some features disabled)
 * - 30+ days: expired (all Pro features disabled)
 */
export function getDegradationLevel(license: LicenseData): DegradationLevel {
  const lastValidated = new Date(license.lastValidatedAt).getTime();
  if (isNaN(lastValidated)) return 'expired'; // corrupted date → deny access
  const elapsed = Date.now() - lastValidated;
  // SEC-L1: a negative elapsed means lastValidatedAt is in the future. This
  // is almost always a clock-skew exploit (set system clock forward to keep
  // Pro features forever). Fail-closed instead of granting full access. The
  // next revalidate() against Polar will reset things if the skew is benign.
  if (elapsed < 0) return 'expired';
  const days = elapsed / (24 * 60 * 60 * 1000);

  if (days <= 7) return 'none';
  if (days <= 14) return 'warning';
  if (days <= 30) return 'limited';
  return 'expired';
}

// Layer 10: License key format validation
function validateLicenseKey(key: string): void {
  // Polar keys are UUID-like: 8-4-4-4-12 hex chars or similar
  // Reject obviously invalid keys to avoid unnecessary API calls
  if (key.length < 10 || key.length > 100) {
    throw new Error('Invalid license key format');
  }
  // Only allow alphanumeric, hyphens, underscores
  if (!/^[\w-]+$/.test(key)) {
    throw new Error('Invalid license key format');
  }
}

export async function activate(key: string): Promise<LicenseData> {
  validateLicenseKey(key);
  checkRateLimit();

  let success = false;
  try {
    const machineId = await getMachineId();
    const signed = await apiActivate(key, machineId);

    // Verify the envelope before trusting it. The backend should never emit
    // an unverifiable response, but a MITM injecting `{license, sig:""}`
    // would otherwise pass straight through.
    if (!verifySignedLicense(signed)) {
      throw new Error('Backend response failed signature verification');
    }

    await persistSigned(signed);
    success = true;
    return signed.license;
  } finally {
    recordAttempt(success);
  }
}

/**
 * Revalidate the license against the server. Each call refreshes
 * lastValidatedAt and resets the offline-degradation timer.
 */
// EP-006: Detect if an error is a network error vs validation/contract error
function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|timeout|abort/i.test(msg);
}

export async function revalidate(license: LicenseData): Promise<RevalidationResult> {
  try {
    const signed = await apiValidate(license.key, license.instanceId);
    if (!verifySignedLicense(signed)) {
      // Treat a malformed signature as a hard failure — same posture as
      // an explicit "expired" from the backend.
      return 'expired';
    }
    await persistSigned(signed);
    // The backend stamps lastValidatedAt server-side, so the persisted
    // envelope is already fresh. Surface only the status to the caller.
    return signed.license.status === 'active' ? 'valid' : 'expired';
  } catch (err) {
    // EP-006: Network errors trigger grace period; validation/contract errors mean expired
    if (isNetworkError(err)) {
      return isWithinGracePeriod(license) ? 'grace' : 'expired';
    }
    // Unexpected response or contract violation — leave the existing file
    // alone (the user was Pro a moment ago; a transient API blip shouldn't
    // wipe the local state) but report expired so callers stop authorizing.
    return 'expired';
  }
}

export async function deactivate(license: LicenseData): Promise<{ remoteSuccess: boolean }> {
  // EP-001: apiDeactivate already wraps fetchWithRetry (3 attempts). The
  // outer loop multiplied that into 9 POSTs — Polar would count each as a
  // separate request and a flaky network would amplify load 3×.
  let remoteSuccess = false;
  try {
    await apiDeactivate(license.key, license.instanceId);
    remoteSuccess = true;
  } catch { /* local clear still happens below */ }
  await clearLicense();
  return { remoteSuccess };
}
