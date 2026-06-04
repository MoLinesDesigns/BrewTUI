import Testing
import Foundation
@testable import Brew_TUI_Bar

@Suite("NewPackagesService commit message parser")
struct NewPackagesServiceParserTests {
    @Test("Merge PR wrapping a (new formula) line extracts the formula name")
    func mergePRFormula() {
        let msg = "Merge pull request #286257 from YupItzAfi/libbcg729\n\nlibbcg729 1.1.1 (new formula)"
        #expect(NewPackagesService.extractPackageName(from: msg, kind: .formula) == "libbcg729")
    }

    @Test("Direct commit with (new formula) on the first line")
    func directCommitFormula() {
        let msg = "zellij 0.42.0 (new formula)"
        #expect(NewPackagesService.extractPackageName(from: msg, kind: .formula) == "zellij")
    }

    @Test("Versioned formula keeps its @-fragment")
    func versionedFormula() {
        let msg = "Merge pull request #1\n\npython@3.13 3.13.1 (new formula)"
        #expect(NewPackagesService.extractPackageName(from: msg, kind: .formula) == "python@3.13")
    }

    @Test("Cask kind requires (new cask) suffix, not (new formula)")
    func caskKindIsolated() {
        let formulaMsg = "ghostty 1.0 (new formula)"
        #expect(NewPackagesService.extractPackageName(from: formulaMsg, kind: .cask) == nil)
        let caskMsg = "ghostty 1.0 (new cask)"
        #expect(NewPackagesService.extractPackageName(from: caskMsg, kind: .cask) == "ghostty")
    }

    @Test("Message without the (new <kind>) suffix returns nil")
    func noSuffix() {
        let msg = "Merge pull request #999\n\nfoo 1.0 (rebuild)"
        #expect(NewPackagesService.extractPackageName(from: msg, kind: .formula) == nil)
    }

    @Test("First token starting with a digit or punctuation is rejected")
    func invalidFirstToken() {
        // A line that contains the suffix but starts with a non-letter first
        // token would let bogus rows through (e.g. truncated merge titles).
        let msg = "1.0 (new formula)"
        #expect(NewPackagesService.extractPackageName(from: msg, kind: .formula) == nil)
        let msg2 = "--option (new formula)"
        #expect(NewPackagesService.extractPackageName(from: msg2, kind: .formula) == nil)
    }

    @Test("Names with disallowed characters (spaces, colons) are rejected")
    func disallowedCharacters() {
        // isValidPackageName must guard against tokens that pass the split but
        // contain punctuation Homebrew never uses in formula names.
        #expect(NewPackagesService.isValidPackageName("foo:bar") == false)
        #expect(NewPackagesService.isValidPackageName("foo bar") == false)
        #expect(NewPackagesService.isValidPackageName("foo") == true)
        #expect(NewPackagesService.isValidPackageName("python@3.13") == true)
        #expect(NewPackagesService.isValidPackageName("gtk+3") == true)
    }

    @Test("Date parser accepts fractional and base ISO 8601 forms")
    func dateParsing() {
        let withFraction = NewPackagesService.parseDate("2026-06-04T15:24:17.000Z")
        #expect(withFraction.timeIntervalSince1970 > 1_000_000_000)
        let withoutFraction = NewPackagesService.parseDate("2026-06-04T15:24:17Z")
        #expect(withoutFraction.timeIntervalSince1970 > 1_000_000_000)
        // Invalid strings fall back to "now" (within a few seconds of the test run).
        let fallback = NewPackagesService.parseDate("not a date")
        #expect(abs(fallback.timeIntervalSinceNow) < 5)
    }
}

@Suite("NewPackage")
struct NewPackageTests {
    @Test("installCommand differs by kind")
    func installCommandByKind() {
        let formula = NewPackage(name: "ripgrep", kind: .formula, addedAt: Date(), desc: nil, homepage: nil)
        let cask = NewPackage(name: "ghostty", kind: .cask, addedAt: Date(), desc: nil, homepage: nil)
        #expect(formula.installCommand == "brew install ripgrep")
        #expect(cask.installCommand == "brew install --cask ghostty")
    }

    @Test("id namespaces the name by kind so formula+cask homonyms don't collide")
    func idIsNamespaced() {
        let formula = NewPackage(name: "node", kind: .formula, addedAt: Date(), desc: nil, homepage: nil)
        let cask = NewPackage(name: "node", kind: .cask, addedAt: Date(), desc: nil, homepage: nil)
        #expect(formula.id != cask.id)
        #expect(formula.id == "formula:node")
        #expect(cask.id == "cask:node")
    }
}
