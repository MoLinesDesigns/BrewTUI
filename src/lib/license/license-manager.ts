import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
import { LICENSE_PATH, ensureDataDirs, getMachineId } from '../data-dir.js';
import { activateLicense as apiActivate, validateLicense as apiValidate, deactivateLicense as apiDeactivate } from './polar-api.js';
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

// SECURITY (SEG-002): the bundle-only constants below USED to be the entire
// derivation input — anyone with the npm bundle could decrypt any user's
// license.json. Now the per-user machineId is mixed into the HKDF info, so
// the bundle alone is no longer sufficient: an attacker also needs the
// target's ~/.brew-tui/machine-id. The two constants stay published; what's
// secret is the user's local machineId, which never leaves the machine.
//
// HKDF-SHA256 was chosen over scrypt because Swift's CryptoKit (used by
// Brew-TUI-Bar to read the same license.json) ships HKDF natively but not scrypt.
// machineId is a UUIDv4 with 122 bits of entropy, so the cost-hardening of
// scrypt is not what's protecting the key — the secrecy of the machineId is.
const ENCRYPTION_SECRET = 'brew-tui-license-aes256gcm-v1';
const HKDF_SALT = 'brew-tui-salt-v1';

let _derivedKey: Buffer | null = null;

async function deriveEncryptionKey(): Promise<Buffer> {
  if (_derivedKey) return _derivedKey;
  const machineId = await getMachineId();
  // HKDF: ikm = SECRET, salt = HKDF_SALT, info = machineId, len = 32
  const derived = hkdfSync('sha256', ENCRYPTION_SECRET, HKDF_SALT, machineId, 32);
  _derivedKey = Buffer.from(derived);
  return _derivedKey;
}

async function encryptLicenseData(data: LicenseData): Promise<{ encrypted: string; iv: string; tag: string }> {
  const key = await deriveEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

async function decryptLicenseData(encrypted: string, iv: string, tag: string): Promise<LicenseData> {
  const ivBuf = Buffer.from(iv, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const ciphertext = Buffer.from(encrypted, 'base64');

  // Only the machine-bound HKDF key is accepted. The legacy bundle-only
  // scrypt fallback (in place from 0.6.3 through 2.x for license.json files
  // written by 0.6.2 and earlier) was retired in 3.1.0 — see SEG-M2 in the
  // security audit. Any envelope ciphered with the legacy key now fails
  // decryption, which loadLicense() surfaces as "license not found" so the
  // user re-activates.
  const key = await deriveEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed: unknown = JSON.parse(plaintext.toString('utf-8'));
  if (!isLicenseData(parsed)) {
    throw new Error('Decrypted license payload failed shape validation');
  }
  return parsed;
}

// BK-003: Type guard for license data format
function isLicenseFile(obj: unknown): obj is LicenseFile {
  return typeof obj === 'object' && obj !== null && (obj as Record<string, unknown>).version === 1;
}

function isEncryptedLicenseFile(obj: unknown): obj is LicenseFile & { encrypted: string; iv: string; tag: string } {
  if (!isLicenseFile(obj)) return false;
  const record = obj as unknown as Record<string, unknown>;
  return typeof record.encrypted === 'string'
    && typeof record.iv === 'string'
    && typeof record.tag === 'string';
}

export async function loadLicense(): Promise<LicenseData | null> {
  try {
    const raw = await readFile(LICENSE_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    // BK-003: Validate parsed data
    if (!isLicenseFile(parsed)) {
      throw new Error('Invalid license data format');
    }

    const file = parsed as LicenseFile;

    if (file.version !== 1) {
      // Future: add migration logic here
      throw new Error('Unsupported data version');
    }

    // New encrypted format
    if (isEncryptedLicenseFile(file)) {
      const data = await decryptLicenseData(file.encrypted!, file.iv!, file.tag!);

      // SEG-002: Check machine ID if stored in the envelope.
      // getMachineId() now always resolves a value — if the user's machine-id
      // file was wiped, a new UUID is created and this check rejects the
      // license, prompting reactivation. Same behaviour the polar-api flow
      // already had on save.
      const fileRecord = file as unknown as Record<string, unknown>;
      if (fileRecord.machineId) {
        const currentMachineId = await getMachineId();
        // SEC-L2: randomUUID() yields lowercase UUIDs, but a manually edited
        // machine-id or license.json could carry mixed case. Normalise both
        // sides before comparing so case alone is never the rejection reason.
        if (typeof fileRecord.machineId !== 'string'
            || fileRecord.machineId.toLowerCase() !== currentMachineId.toLowerCase()) {
          throw new Error('License was activated on a different machine');
        }
      }

      return data;
    }

    // Legacy unencrypted format — migrate to encrypted on read
    if (file.license) {
      const data = file.license;
      // Re-save in encrypted format
      await saveLicense(data);
      return data;
    }

    return null;
  } catch {
    return null;
  }
}

export async function saveLicense(data: LicenseData): Promise<void> {
  await ensureDataDirs();
  const { encrypted, iv, tag } = await encryptLicenseData(data);
  // SEG-002: Include machineId in the envelope for portability detection
  const machineId = await getMachineId();
  const file: Record<string, unknown> = { version: 1, encrypted, iv, tag, machineId };
  const tmpPath = LICENSE_PATH + '.tmp';
  await writeFile(tmpPath, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmpPath, LICENSE_PATH);
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

// Polar license-key benefits use distinct prefixes per tier:
//   Pro Monthly/Yearly  → "BTUI-..."
//   Team Monthly/Yearly → "BTUI-T-..."
// We detect the tier from the prefix instead of looking up the productId,
// because Polar's customer-portal license endpoints don't echo product info
// in the activation response.
function detectPlan(key: string): 'pro' | 'team' {
  const upper = key.toUpperCase();
  return upper.startsWith('BTUI-T-') || upper.startsWith('BTUI-T_') ? 'team' : 'pro';
}

export async function activate(key: string): Promise<LicenseData> {
  validateLicenseKey(key);
  checkRateLimit();

  let success = false;
  try {
    const res = await apiActivate(key);

    if (!res.activated) {
      throw new Error(res.error ?? 'Activation failed');
    }

    const license: LicenseData = {
      key,
      instanceId: res.instance.id,
      status: 'active',
      customerEmail: res.meta.customer_email,
      customerName: res.meta.customer_name,
      plan: detectPlan(key),
      activatedAt: new Date().toISOString(),
      expiresAt: res.license_key.expires_at,
      lastValidatedAt: new Date().toISOString(),
    };

    await saveLicense(license);
    success = true;
    return license;
  } finally {
    recordAttempt(success);
  }
}

/**
 * Revalidate the license against the server.
 * This also serves as Layer 19 (telemetry): each validation call
 * allows Polar to track activation count, last-seen timestamp,
 * and detect if the activation limit is exceeded (license sharing).
 */
// EP-006: Detect if an error is a network error vs validation/contract error
function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|timeout|abort/i.test(msg);
}

export async function revalidate(license: LicenseData): Promise<RevalidationResult> {
  try {
    const res = await apiValidate(license.key, license.instanceId);

    if (res.valid) {
      const updated: LicenseData = {
        ...license,
        lastValidatedAt: new Date().toISOString(),
        status: 'active',
        expiresAt: res.license_key.expires_at,
      };
      await saveLicense(updated);
      return 'valid';
    }

    await saveLicense({ ...license, status: 'expired' });
    return 'expired';
  } catch (err) {
    // EP-006: Network errors trigger grace period; validation/contract errors mean expired
    if (isNetworkError(err)) {
      return isWithinGracePeriod(license) ? 'grace' : 'expired';
    }
    // Unexpected response or contract violation — treat as expired
    await saveLicense({ ...license, status: 'expired' });
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
