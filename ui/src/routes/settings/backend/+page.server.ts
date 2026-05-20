/** /settings/backend loader -- open to anon (BackendBootGuard deep-links
 *  here on discovery failure; reads OS-level App Group, not DB).
 *  Unique: works EVEN WHEN BACKEND DISCOVERY FAILED. Loader + page avoid
 *  any /api/* call; the form writes via the Capacitor bridge straight to
 *  iOS App Group UserDefaults (or localStorage on web). No round-trip. */
export async function load() {
  // Intentionally empty -- the page reads the persisted URLs client-side
  // via native-bridge so even an offline-during-discovery user sees the
  // form. SSR cannot read Capacitor Preferences anyway.
  return {};
}
