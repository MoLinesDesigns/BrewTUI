import Foundation
import os

private let newPackagesLogger = Logger(subsystem: "com.molinesdesigns.brewtuibar", category: "NewPackages")

/// Discovers formulae and casks recently added to Homebrew's core taps.
///
/// The data is stitched together from two sources because no single endpoint
/// exposes both "when was it added" and "what does it do":
///  - GitHub Search Commits API (`(new formula)` / `(new cask)` in commit
///    message). Gives the package name + committed-at date, but no description.
///  - formulae.brew.sh JSON dump. Gives description + homepage for the name.
///
/// Cached on disk for 24h to stay well under GitHub's 10 req/min unauth search
/// rate limit even if the user opens the modal several times per session.
actor NewPackagesService {
    static let shared = NewPackagesService()

    /// How many recent entries we keep per kind. The modal renders them in a
    /// ScrollView, so the cap is mostly to bound network/parse cost.
    static let maxResults = 30

    /// 24h cache TTL. Homebrew typically adds a handful of formulae per day —
    /// refreshing more often spends GitHub rate limit without surfacing new
    /// content. Forced refresh from the modal bypasses this.
    private let cacheTTL: TimeInterval = 24 * 60 * 60

    private let session: URLSession
    private let cacheURL: URL

    init(session: URLSession = .shared) {
        self.session = session
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let dir = caches.appendingPathComponent("com.molinesdesigns.brewtuibar", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.cacheURL = dir.appendingPathComponent("new-packages.json")
    }

    struct Result: Sendable, Equatable, Codable {
        var formulae: [NewPackage]
        var casks: [NewPackage]
        /// When the result was assembled. Used by `loadCacheIfFresh` to decide
        /// if we can skip the network round-trip.
        var fetchedAt: Date
    }

    enum ServiceError: LocalizedError {
        case allSourcesFailed(String)

        var errorDescription: String? {
            switch self {
            case .allSourcesFailed(let reason):
                return String(format: String(localized: "Could not load new packages: %@"), reason)
            }
        }
    }

    /// Returns the latest `Result`, hitting the cache when fresh. `force: true`
    /// bypasses the TTL check (the modal's refresh button uses it). Falls back
    /// to stale cache if all upstream calls fail so the modal still has data.
    func fetchNewPackages(force: Bool = false) async throws -> Result {
        if !force, let cached = loadCache(), Date().timeIntervalSince(cached.fetchedAt) < cacheTTL {
            newPackagesLogger.debug("Serving new-packages from fresh cache")
            return cached
        }

        async let formulaeCommits = fetchCommits(repo: "Homebrew/homebrew-core", kind: .formula)
        async let caskCommits     = fetchCommits(repo: "Homebrew/homebrew-cask", kind: .cask)
        async let formulaeMeta    = fetchMetadata(url: Self.formulaeMetaURL)
        async let caskMeta        = fetchMetadata(url: Self.caskMetaURL)

        let formulae: [NewPackage]
        let casks: [NewPackage]
        do {
            let (fCommits, fMeta) = try await (formulaeCommits, formulaeMeta)
            formulae = stitch(commits: fCommits, meta: fMeta, kind: .formula)
        } catch {
            newPackagesLogger.warning("Formulae fetch failed: \(error.localizedDescription, privacy: .public)")
            formulae = []
        }
        do {
            let (cCommits, cMeta) = try await (caskCommits, caskMeta)
            casks = stitch(commits: cCommits, meta: cMeta, kind: .cask)
        } catch {
            newPackagesLogger.warning("Casks fetch failed: \(error.localizedDescription, privacy: .public)")
            casks = []
        }

        if formulae.isEmpty && casks.isEmpty {
            // All sources failed. Surface stale cache so the user sees something
            // instead of an empty modal.
            if let stale = loadCache() {
                newPackagesLogger.info("Both upstream sources failed; serving stale cache")
                return stale
            }
            throw ServiceError.allSourcesFailed(String(localized: "Network error or rate-limited"))
        }

        let result = Result(formulae: formulae, casks: casks, fetchedAt: Date())
        saveCache(result)
        return result
    }

    // MARK: - Sources

    /// GitHub Search Commits API. The `cloak-preview` Accept header is still
    /// required even in 2026 — the standard `application/vnd.github+json`
    /// returns `total_count: 0` for the same query. If GitHub ever drops the
    /// preview alias, this call will start returning empty results and the
    /// caller will gracefully fall back to whatever the other source produced.
    private func fetchCommits(repo: String, kind: NewPackage.Kind) async throws -> [RawCommit] {
        let needle = kind == .formula ? "new+formula" : "new+cask"
        let urlString = "https://api.github.com/search/commits?q=repo:\(repo)+\(needle)&sort=committer-date&order=desc&per_page=100"
        guard let url = URL(string: urlString) else { return [] }

        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        req.setValue("application/vnd.github.cloak-preview+json", forHTTPHeaderField: "Accept")
        req.setValue("Brew-TUI-Bar", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw NSError(domain: "NewPackagesService", code: code, userInfo: [
                NSLocalizedDescriptionKey: "GitHub responded \(code)",
            ])
        }
        let decoded = try JSONDecoder().decode(GHSearchResponse.self, from: data)
        return decoded.items
    }

    /// Fetches the public formulae.brew.sh dump and indexes it by name.
    /// The payload is large (~30 MB) but cacheable; we re-download it whenever
    /// the parent TTL hits, which is acceptable for a 24h window.
    private func fetchMetadata(url: URL) async throws -> [String: PackageMeta] {
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        req.setValue("Brew-TUI-Bar", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            throw NSError(domain: "NewPackagesService", code: code, userInfo: [
                NSLocalizedDescriptionKey: "formulae.brew.sh responded \(code)",
            ])
        }
        let metas = try JSONDecoder().decode([PackageMeta].self, from: data)
        var index: [String: PackageMeta] = [:]
        index.reserveCapacity(metas.count)
        for meta in metas { index[meta.name] = meta }
        return index
    }

    // MARK: - Stitching

    /// Joins commit messages with metadata. Drops commits we can't parse a
    /// name from (e.g. the message changed format) and dedupes by name keeping
    /// the most-recent occurrence. Limited to `maxResults` per kind.
    private func stitch(commits: [RawCommit], meta: [String: PackageMeta], kind: NewPackage.Kind) -> [NewPackage] {
        var seen = Set<String>()
        var out: [NewPackage] = []
        out.reserveCapacity(Self.maxResults)

        for commit in commits {
            guard let (name, date) = parseCommit(commit, kind: kind) else { continue }
            if seen.contains(name) { continue }
            seen.insert(name)
            let m = meta[name]
            out.append(NewPackage(
                name: name,
                kind: kind,
                addedAt: date,
                desc: m?.desc,
                homepage: m?.homepage.flatMap(URL.init(string:))
            ))
            if out.count >= Self.maxResults { break }
        }
        return out
    }

    /// Extracts `(name, committedAt)` from a commit. Homebrew's PRs land with
    /// titles like `<name> <version> (new formula)` (sometimes wrapped in a
    /// "Merge pull request ..." prefix). We scan all lines for the suffix and
    /// take the first token of the matching line.
    private func parseCommit(_ commit: RawCommit, kind: NewPackage.Kind) -> (String, Date)? {
        guard let name = Self.extractPackageName(from: commit.commit.message, kind: kind) else { return nil }
        return (name, Self.parseDate(commit.commit.committer.date))
    }

    /// Returns the formula/cask name from a commit message, or nil if the
    /// message doesn't carry a `(new <kind>)` suffix or the first token is
    /// not a valid Homebrew name. Exposed `static` so tests can pin the
    /// parser's contract without standing up the whole actor.
    static func extractPackageName(from message: String, kind: NewPackage.Kind) -> String? {
        let suffix = kind == .formula ? "(new formula)" : "(new cask)"
        let lines = message.split(separator: "\n", omittingEmptySubsequences: false)
        guard let line = lines.first(where: { $0.contains(suffix) }) else { return nil }
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let first = trimmed.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true).first.map(String.init)
        guard let name = first, isValidPackageName(name) else { return nil }
        return name
    }

    /// ISO 8601 parser that accepts both fractional-seconds and base formats
    /// (GitHub returns the latter for committer dates). Falls back to "now"
    /// rather than failing — the package is real, the date is decorative.
    static func parseDate(_ raw: String) -> Date {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: raw) { return d }
        let base = ISO8601DateFormatter()
        base.formatOptions = [.withInternetDateTime]
        return base.date(from: raw) ?? Date()
    }

    /// Homebrew names start with a letter, only contain letters/digits/`@`/`+`/`-`/`_`.
    /// Filters out merge titles where the first token happened to be `Merge` or `from`.
    static func isValidPackageName(_ name: String) -> Bool {
        guard let first = name.unicodeScalars.first,
              CharacterSet.letters.contains(first) else { return false }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "@+-_."))
        return name.unicodeScalars.allSatisfy(allowed.contains)
            && name.count < 80
    }

    // MARK: - Cache I/O

    private func loadCache() -> Result? {
        guard let data = try? Data(contentsOf: cacheURL) else { return nil }
        return try? JSONDecoder().decode(Result.self, from: data)
    }

    private func saveCache(_ result: Result) {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(result)
            try data.write(to: cacheURL, options: .atomic)
        } catch {
            newPackagesLogger.warning("Cache write failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Endpoints / DTOs

    private static let formulaeMetaURL = URL(string: "https://formulae.brew.sh/api/formula.json")!
    private static let caskMetaURL     = URL(string: "https://formulae.brew.sh/api/cask.json")!

    private struct GHSearchResponse: Decodable {
        let items: [RawCommit]
    }

    private struct RawCommit: Decodable {
        let commit: RawCommitBody
    }

    private struct RawCommitBody: Decodable {
        let message: String
        let committer: RawCommitter
    }

    private struct RawCommitter: Decodable {
        let date: String
    }

    /// Subset of formulae.brew.sh entries we actually consume — full payload
    /// has dozens of fields, ignoring them keeps the decode cheap.
    private struct PackageMeta: Decodable {
        let name: String
        let desc: String?
        let homepage: String?
        /// Casks publish the user-facing label under `token` not `name`. Decoding
        /// both lets the same struct serve both endpoints.
        let token: String?

        enum CodingKeys: String, CodingKey {
            case name, desc, homepage, token
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let token = try c.decodeIfPresent(String.self, forKey: .token)
            let n = try c.decodeIfPresent(String.self, forKey: .name) ?? token ?? ""
            self.name = n
            self.token = token
            self.desc = try c.decodeIfPresent(String.self, forKey: .desc)
            // Casks use `homepage` as String too — `decodeIfPresent` covers both.
            self.homepage = try c.decodeIfPresent(String.self, forKey: .homepage)
        }
    }
}
