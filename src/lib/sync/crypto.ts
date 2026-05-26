import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
import { isSyncPayload, type SyncPayload } from './types.js';

// SEG-003: Cross-machine sync encryption.
// The two constants below are public (compiled into the npm bundle). The
// per-user secret factor is the Polar license key, which only the user's
// own machines hold and which Polar issues — so any two of the user's
// machines derive the same key, but bundle + iCloud snoop is no longer
// enough to decrypt: the attacker also needs the license key.
//
// HKDF-SHA256 over scrypt: the license key is high-entropy by construction
// (Polar issues UUID-style keys), so the cost-hardening of scrypt isn't
// what's protecting the key — the secrecy of the license key is. HKDF is
// also faster, so machines don't pay scrypt's CPU tax on every sync.
const ENCRYPTION_SECRET = 'brew-tui-sync-aes256gcm-v1';
const HKDF_SALT = 'brew-tui-sync-salt-v1';

const keyCache = new Map<string, Buffer>();

function deriveEncryptionKey(licenseKey: string): Buffer {
  const cached = keyCache.get(licenseKey);
  if (cached) return cached;
  const derived = Buffer.from(hkdfSync('sha256', ENCRYPTION_SECRET, HKDF_SALT, licenseKey, 32));
  keyCache.set(licenseKey, derived);
  return derived;
}

export function encryptPayload(data: SyncPayload, licenseKey: string): { encrypted: string; iv: string; tag: string } {
  const key = deriveEncryptionKey(licenseKey);
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

export function decryptPayload(encrypted: string, iv: string, tag: string, licenseKey: string): SyncPayload {
  const ivBuf = Buffer.from(iv, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const ciphertext = Buffer.from(encrypted, 'base64');

  // Only the licenseKey-bound HKDF key is accepted. The legacy bundle-only
  // scrypt fallback (for envelopes written by 0.6.2 and earlier) was retired
  // in 3.1.0 — see SEG-M3 in the security audit.
  const key = deriveEncryptionKey(licenseKey);
  const decipher = createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed: unknown = JSON.parse(plaintext.toString('utf-8'));
  if (!isSyncPayload(parsed)) throw new Error('Invalid sync payload shape');
  return parsed;
}
