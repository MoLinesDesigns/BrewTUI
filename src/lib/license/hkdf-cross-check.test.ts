import { describe, expect, it } from 'vitest';
import { hkdfSync } from 'node:crypto';

/**
 * Cross-platform anchor test for the HKDF parameters used by both
 * src/lib/license/license-manager.ts and
 * menubar/Brew-TUI-Bar/Sources/Services/LicenseChecker.swift (CryptoKit's
 * HKDF<SHA256>.deriveKey).
 *
 * Both implementations follow RFC 5869, so they produce identical output
 * for identical inputs. If this test ever drifts from the Swift code path,
 * Brew-TUI-Bar will silently fall back to its legacy scrypt key — and PR
 * reviewers should treat any change here as cross-platform contract change.
 */
describe('HKDF cross-platform contract', () => {
  it('matches the parameters used by LicenseChecker.swift', () => {
    const ikm = 'brew-tui-license-aes256gcm-v1';
    const salt = 'brew-tui-salt-v1';
    const info = 'fixed-machine-uuid-1234'; // stand-in for the user's machineId
    const len = 32;

    const key = Buffer.from(hkdfSync('sha256', ikm, salt, info, len)).toString('hex');

    // Anchor: re-running this test must produce the same hex. If the algo
    // or any input string changes, this assertion catches it before users
    // ship a license.json that Brew-TUI-Bar can't decrypt.
    expect(key).toBe(
      '7f0ee6ba78781861984cc7c1e21559279671743ee7a8d29997af68401064cb0a',
    );
  });

  it('changes the derived key when machineId changes', () => {
    const ikm = 'brew-tui-license-aes256gcm-v1';
    const salt = 'brew-tui-salt-v1';

    const k1 = Buffer.from(hkdfSync('sha256', ikm, salt, 'machine-A', 32));
    const k2 = Buffer.from(hkdfSync('sha256', ikm, salt, 'machine-B', 32));

    expect(k1.equals(k2)).toBe(false);
  });
});
