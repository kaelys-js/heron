/**
 * /settings/backend -- page loader.
 *
 * Open to every authenticated user. (Unauthenticated users land here
 * when discovery fails -- the BackendBootGuard error overlay deep-links
 * to this route -- but they won't have a locals.user, so we don't gate
 * on it. Reads from the OS-level App Group anyway, not the DB.)
 *
 * This route is unusual: it works EVEN WHEN BACKEND DISCOVERY FAILED.
 * Both the server load fn and the page itself avoid /api/* calls that
 * would re-fail; the form writes via the Capacitor bridge directly to
 * iOS App Group UserDefaults (or localStorage on web), no backend
 * round-trip required.
 */
export async function load() {
  // Intentionally empty -- the page reads the persisted URLs client-side
  // via native-bridge so even an offline-during-discovery user sees the
  // form. SSR cannot read Capacitor Preferences anyway.
  return {};
}
