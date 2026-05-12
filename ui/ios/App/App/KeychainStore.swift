import Foundation
import Security

/**
 * KeychainStore — secure storage for tokens, cookies, API keys.
 *
 * The WebView's window.localStorage is **NOT** secure on iOS (it lives
 * inside the WebView sandbox and can be exposed by misbehaving content).
 * Anything secret — LinkedIn session cookies, OpenAI API keys, Tailscale
 * auth keys — goes here instead via a Capacitor plugin bridge.
 *
 * Keychain entries are scoped to the app bundle ID (com.resistjs.careerops)
 * and survive app deletion only if "Keychain Access Group" entitlement
 * is set, which we deliberately *don't* set — uninstall wipes credentials.
 */
enum KeychainError: Error {
    case unhandledError(status: OSStatus)
    case notFound
}

final class KeychainStore {
    static let shared = KeychainStore()
    private let service = Brand.keychainService

    func set(_ value: String, forKey key: String) throws {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        // Delete prior (kSecAttrService + kSecAttrAccount is the primary key).
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
    }

    func get(_ key: String) throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else {
            if status == errSecItemNotFound { throw KeychainError.notFound }
            throw KeychainError.unhandledError(status: status)
        }
        guard let data = result as? Data, let str = String(data: data, encoding: .utf8) else {
            throw KeychainError.notFound
        }
        return str
    }

    func remove(_ key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
}
