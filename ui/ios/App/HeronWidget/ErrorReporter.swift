import Foundation

/**
 * ErrorReporter — Swift-side counterpart of lib/client/error-reporter.ts.
 *
 * Captures errors from native code (Bonjour failures, Keychain errors,
 * background-fetch failures, Spotlight indexing errors) and routes them
 * through the SAME unified Issues system the WebView uses:
 *
 *   1. NSLog always — for Console.app inspection.
 *   2. Queue the error in App Group UserDefaults under
 *      `<brand>:error-queue` so it survives app restarts.
 *   3. When the JS reporter resolves a backend, it reads this queue and
 *      forwards each entry to /api/issues. Then clears the queue.
 *
 * The JS reporter polls the queue on every install + flush cycle so
 * native errors land in the Issues store even when the user never
 * navigated to the WebView (e.g. background-fetch only).
 */
final class ErrorReporter {
    static let shared = ErrorReporter()
    private let queueKey = "\(Brand.name):error-queue-native"
    private let maxQueue = 50

    func report(message: String, source: String, level: String = "error", context: [String: Any] = [:]) {
        NSLog("[\(Brand.name):\(level)] [\(source)] \(message)")
        var entry: [String: Any] = [
            "message": message,
            "source": source,
            "level": level,
            "capturedAt": Int(Date().timeIntervalSince1970 * 1000),
            "platform": "ios-native",
        ]
        for (k, v) in context {
            entry[k] = v
        }
        enqueue(entry)
    }

    /// Convenience for catching Swift Error values directly.
    func report(_ error: Error, source: String, level: String = "error") {
        report(message: error.localizedDescription, source: source, level: level)
    }

    /// Drain the queue — called by the JS reporter via HeronNativePlugin.
    func drain() -> [[String: Any]] {
        guard let defaults = sharedDefaults() else { return [] }
        let queue = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
        defaults.removeObject(forKey: queueKey)
        return queue
    }

    // MARK: - Private

    private func enqueue(_ entry: [String: Any]) {
        guard let defaults = sharedDefaults() else { return }
        var queue = defaults.array(forKey: queueKey) as? [[String: Any]] ?? []
        queue.append(entry)
        if queue.count > maxQueue {
            queue.removeFirst(queue.count - maxQueue)
        }
        defaults.set(queue, forKey: queueKey)
    }

    /// Prefer the App Group store so the Share Extension can also write
    /// here, but fall back to standard defaults if the group isn't set up.
    private func sharedDefaults() -> UserDefaults? {
        if let g = UserDefaults(suiteName: Brand.appGroup) { return g }
        return UserDefaults.standard
    }
}
