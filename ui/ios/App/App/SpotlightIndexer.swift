import Foundation
import CoreSpotlight
import MobileCoreServices

/**
 * SpotlightIndexer — index every job in the user's pipeline into
 * iOS Spotlight so they can search "Vercel" in Spotlight and tap
 * a result to jump straight into the app on that job.
 *
 * Called on app launch and whenever the WebView signals that the
 * job list changed (via the JS bridge, which writes a flag to
 * UserDefaults — Capacitor doesn't yet have a clean way to call
 * arbitrary Swift on demand, so we poll a flag on the foreground
 * timer).
 */
final class SpotlightIndexer {
    static let shared = SpotlightIndexer()
    private let domainID = Brand.spotlightDomain

    func reindex(jobs: [JobIndexEntry]) {
        let items: [CSSearchableItem] = jobs.map { job in
            let attr = CSSearchableItemAttributeSet(itemContentType: kUTTypeText as String)
            attr.title = "\(job.company) — \(job.role)"
            attr.contentDescription = "\(job.role) at \(job.company)" + (job.score.map { " · score \($0)" } ?? "")
            attr.keywords = [job.company, job.role, "career-ops", "job"]
            if let status = job.status { attr.keywords?.append(status) }
            let item = CSSearchableItem(uniqueIdentifier: job.id, domainIdentifier: domainID, attributeSet: attr)
            return item
        }
        CSSearchableIndex.default().indexSearchableItems(items) { error in
            if let error = error {
                NSLog("[spotlight] index failed: \(error)")
            } else {
                NSLog("[spotlight] indexed \(items.count) jobs")
            }
        }
    }

    func clear() {
        CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: [domainID]) { error in
            if let error = error { NSLog("[spotlight] clear failed: \(error)") }
        }
    }
}

struct JobIndexEntry {
    let id: String
    let company: String
    let role: String
    let score: Double?
    let status: String?
}
