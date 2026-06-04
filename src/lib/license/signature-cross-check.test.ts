import { describe, expect, it } from 'vitest';
import { verifySignedLicense, canonicalJSON } from './license-manager.js';

/**
 * Cross-platform contract test for the Ed25519 signing scheme used by the
 * license envelope. The same { license, sig } pair must verify identically
 * from three implementations:
 *
 *  - Node TUI         (this verifier, src/lib/license/license-manager.ts)
 *  - macOS app menubar (Swift CryptoKit, LicenseChecker.swift)
 *  - Backend signer   (Node, backend/lib/signer.js — runs only on the NAS)
 *
 * The vector below was produced by `backend/lib/signer.js signLicense(...)`
 * with the production private key. Any drift in canonicalJSON, the SPKI
 * wrapper bytes, or the public key constant breaks this assertion before
 * users get an unverifiable license.
 *
 * If you legitimately rotate the signing key, regenerate the vector with:
 *
 *   LICENSE_SIGNING_PRIVATE_KEY=<new-priv> node --input-type=module -e "
 *     import { signLicense } from '/path/to/brewtui/backend/lib/signer.js';
 *     console.log(JSON.stringify(signLicense({...}), null, 2));
 *   "
 *
 * …and update both the TUI constant (LICENSE_PUBLIC_KEY_B64) and the Swift
 * constant (licensePublicKeyB64) in the same commit.
 */
describe('Ed25519 signature cross-platform contract', () => {
  const license = {
    key: 'TEST-VECTOR-12345',
    instanceId: 'test-inst-aaaa',
    status: 'active' as const,
    customerEmail: 'crosscheck@example.com',
    customerName: 'Cross Check',
    plan: 'pro' as const,
    activatedAt: '2026-06-04T00:00:00.000Z',
    expiresAt: null,
    lastValidatedAt: '2026-06-04T22:00:00.000Z',
  };

  // Anchor vector — produced once by backend/lib/signer.js with the
  // production private key. Must verify against the embedded public key
  // (oHtzyU7ZACt8Eqga+U4PSagr0rSj1YLs3oVSpmjmwq0=).
  const sig = 'oS3Y3sR7ho6a5w2+BDcA8Fm/hleAe1kPrHu0+zEShyj9nywVCssx7if+4HpPSc3LKhRzNK4tL7aREd6EWPl3Aw==';

  it('canonical JSON sorts keys recursively and emits no whitespace', () => {
    // Mirror of what Swift's canonicalJSON(_:) implementation must produce.
    // If you re-derive the helper, this string is the contract.
    const expected =
      '{"activatedAt":"2026-06-04T00:00:00.000Z",' +
      '"customerEmail":"crosscheck@example.com",' +
      '"customerName":"Cross Check",' +
      '"expiresAt":null,' +
      '"instanceId":"test-inst-aaaa",' +
      '"key":"TEST-VECTOR-12345",' +
      '"lastValidatedAt":"2026-06-04T22:00:00.000Z",' +
      '"plan":"pro",' +
      '"status":"active"}';
    expect(canonicalJSON(license)).toBe(expected);
  });

  it('verifies the production-key vector', () => {
    expect(verifySignedLicense({ license, sig })).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const tampered = { ...license, customerEmail: 'evil@example.com' };
    expect(verifySignedLicense({ license: tampered, sig })).toBe(false);
  });

  it('rejects a tampered signature', () => {
    // Flip the last byte by toggling one base64 character. Any single-bit
    // change in the 64-byte signature must fail verification.
    const flipped = sig.slice(0, -2) + (sig.endsWith('==') ? 'XX' : '==');
    expect(verifySignedLicense({ license, sig: flipped })).toBe(false);
  });
});
