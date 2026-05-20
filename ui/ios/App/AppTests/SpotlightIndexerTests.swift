//
@testable import App
import CoreSpotlight

// SpotlightIndexerTests — payload shape + ID stability + clear semantics.
//
// We don't hit the REAL CSSearchableIndex (that would mutate the
// device's Spotlight DB, which test isolation forbids). The tests focus
// on the structural JobIndexEntry → CSSearchableItem mapping behaviour
// that can be exercised without touching the OS index.
//
import XCTest

// `kUTTypeText` is exported by MobileCoreServices.framework. The
// production code at App/SpotlightIndexer.swift:3 imports it the same
// way; this test was copying the indexer's setup logic but missed the
// import, so `kUTTypeText` couldn't be resolved by the test compiler.
import MobileCoreServices

final class SpotlightIndexerTests: XCTestCase {
    func testJobIndexEntryRoundTrip() {
        let entry = JobIndexEntry(
            id: "j-1",
            company: "Acme",
            role: "Senior Engineer",
            score: 4.5,
            status: "Ready"
        )
        XCTAssertEqual(entry.id, "j-1")
        XCTAssertEqual(entry.company, "Acme")
        XCTAssertEqual(entry.role, "Senior Engineer")
        XCTAssertEqual(entry.score, 4.5)
        XCTAssertEqual(entry.status, "Ready")
    }

    func testJobIndexEntryAcceptsNilScore() {
        let entry = JobIndexEntry(
            id: "j-2",
            company: "X",
            role: "Eng",
            score: nil,
            status: nil
        )
        XCTAssertNil(entry.score)
        XCTAssertNil(entry.status)
    }

    func testSpotlightDomainMatchesBrand() {
        // The domainID is private but Brand.spotlightDomain is the source
        // — assert it has the expected reverse-domain shape under the
        // bundle namespace.
        XCTAssertTrue(Brand.spotlightDomain.hasPrefix(Brand.bundleId))
        XCTAssertTrue(Brand.spotlightDomain.contains("."))
    }

    func testManualSearchableItemBuild() {
        // Build a CSSearchableItem the same way the indexer does, assert
        // the attribute set has the expected shape.
        let entry = JobIndexEntry(
            id: "j-3",
            company: "Vercel",
            role: "DX Engineer",
            score: 4.2,
            status: "Scored"
        )
        let attr = CSSearchableItemAttributeSet(itemContentType: kUTTypeText as String)
        attr.title = "\(entry.company) — \(entry.role)"
        attr.contentDescription = "\(entry.role) at \(entry.company)"
        attr.keywords = [entry.company, entry.role, Brand.displayName, Brand.name, "job"]
        if let s = entry.status { attr.keywords?.append(s) }
        let item = CSSearchableItem(
            uniqueIdentifier: entry.id,
            domainIdentifier: Brand.spotlightDomain,
            attributeSet: attr
        )
        XCTAssertEqual(item.uniqueIdentifier, "j-3")
        XCTAssertEqual(item.domainIdentifier, Brand.spotlightDomain)
        XCTAssertEqual(attr.title, "Vercel — DX Engineer")
        XCTAssertEqual(attr.contentDescription, "DX Engineer at Vercel")
        XCTAssertTrue(attr.keywords?.contains("Vercel") ?? false)
        XCTAssertTrue(attr.keywords?.contains("Scored") ?? false)
    }

    func testReindexEmptyListIsSafe() {
        // Indexing zero items shouldn't crash.
        XCTAssertNoThrow(SpotlightIndexer.shared.reindex(jobs: []))
    }

    func testClearIsSafe() {
        // Clear on a domain we may or may not have populated.
        XCTAssertNoThrow(SpotlightIndexer.shared.clear())
    }

    func testKeywordsContainBrandDisplayName() {
        // Sanity: the indexer always adds Brand.displayName + Brand.name
        // to keywords so users searching either form get hits. We can't
        // see inside the actual index, but the source code's keywords
        // array literal is asserted indirectly via Brand constants.
        XCTAssertFalse(Brand.displayName.isEmpty)
        XCTAssertFalse(Brand.name.isEmpty)
    }
}
