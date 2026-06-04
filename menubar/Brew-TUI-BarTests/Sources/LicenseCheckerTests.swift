import Testing
import Foundation
@testable import Brew_TUI_Bar

// Cross-platform contract: the same fixture is verified by the JS TUI in
// src/lib/license/signature-cross-check.test.ts. If either side drifts on
// canonicalJSON, the public-key constant, or the SPKI wrapper, this test
// (or its JS twin) will fail before users see a broken license.
@Suite("LicenseChecker Ed25519 cross-platform contract")
struct LicenseCheckerSignatureTests {
    static let fixtureLicense = LicenseData(
        key: "TEST-VECTOR-12345",
        instanceId: "test-inst-aaaa",
        status: "active",
        customerEmail: "crosscheck@example.com",
        customerName: "Cross Check",
        plan: "pro",
        activatedAt: "2026-06-04T00:00:00.000Z",
        expiresAt: nil,
        lastValidatedAt: "2026-06-04T22:00:00.000Z"
    )
    // Anchor signature produced by backend/lib/signer.js with the production
    // private key. Stored here so we don't need to round-trip the network in
    // CI just to verify our verifier still verifies.
    static let fixtureSig = "oS3Y3sR7ho6a5w2+BDcA8Fm/hleAe1kPrHu0+zEShyj9nywVCssx7if+4HpPSc3LKhRzNK4tL7aREd6EWPl3Aw=="

    @Test("verifies the production-key fixture")
    func verifiesFixture() {
        #expect(LicenseChecker.verifySignedLicense(Self.fixtureLicense, signatureBase64: Self.fixtureSig))
    }

    @Test("rejects a tampered payload")
    func rejectsTamperedPayload() {
        let tampered = LicenseData(
            key: Self.fixtureLicense.key,
            instanceId: Self.fixtureLicense.instanceId,
            status: Self.fixtureLicense.status,
            customerEmail: "evil@example.com",
            customerName: Self.fixtureLicense.customerName,
            plan: Self.fixtureLicense.plan,
            activatedAt: Self.fixtureLicense.activatedAt,
            expiresAt: Self.fixtureLicense.expiresAt,
            lastValidatedAt: Self.fixtureLicense.lastValidatedAt
        )
        #expect(!LicenseChecker.verifySignedLicense(tampered, signatureBase64: Self.fixtureSig))
    }

    @Test("rejects a tampered signature (single base64 char flip)")
    func rejectsTamperedSignature() {
        // Flip the trailing two chars; Ed25519 fails on any single-bit change.
        let flipped = String(Self.fixtureSig.dropLast(2)) + (Self.fixtureSig.hasSuffix("==") ? "XX" : "==")
        #expect(!LicenseChecker.verifySignedLicense(Self.fixtureLicense, signatureBase64: flipped))
    }

    @Test("rejects malformed base64 in the signature")
    func rejectsMalformedBase64() {
        #expect(!LicenseChecker.verifySignedLicense(Self.fixtureLicense, signatureBase64: "not valid base64!!!"))
    }

    @Test("rejects a signature with the wrong byte length")
    func rejectsWrongLengthSignature() {
        // 32 bytes of base64 (44 chars) is not a valid Ed25519 signature
        // (which is 64 bytes / 88 chars). Must be rejected at the length check.
        let tooShort = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        #expect(!LicenseChecker.verifySignedLicense(Self.fixtureLicense, signatureBase64: tooShort))
    }
}
