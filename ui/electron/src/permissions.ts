/** Session permission policy for the desktop renderer.
 *
 *  Electron's default is to GRANT most permission requests. We invert that to a
 *  strict allowlist: the SvelteKit renderer is the only trusted content, and it
 *  needs exactly two web permissions --
 *    - 'media'         microphone, for mock-interview voice recording
 *                      (NSMicrophoneUsageDescription is declared for this).
 *    - 'notifications' web Notifications API for interview reminders.
 *  Everything else (camera, geolocation, USB/HID/Serial/MIDI, clipboard-read,
 *  fullscreen-from-untrusted, etc.) is DENIED, and any device-chooser request
 *  (WebUSB/WebSerial/WebHID device picker) is refused outright.
 *
 *  Requests are honoured ONLY when they come from an internal origin (the app
 *  scheme / dev-server origin); a request attributed to any other origin -- e.g.
 *  aframed external doc -- is denied even for the two allowed permissions.
 *
 *  The pure decide() below is the testable core; installPermissionHandlers wires
 *  it onto session.defaultSession. */
import { session } from 'electron';
import { isInternalNavigation } from './dev-server';

/** Permissions the renderer is allowed to use, when requested from an internal
 *  origin. Electron reports microphone as 'media'. */
const ALLOWED_PERMISSIONS = new Set(['media', 'notifications']);

export type PermissionContext = {
  customScheme: string;
  devServerUrl: string | null;
};

/** PURE. Decide whether to grant a permission request/check.
 *
 *  @param permission  Electron permission string ('media' | 'geolocation' | ...).
 *  @param requestingOrigin  The origin the request is attributed to (may be ''
 *         or undefined -- Electron passes '' for some checks; treat as untrusted).
 *  @param ctx  app scheme + dev-server URL, used to classify the origin.
 */
export function decidePermission(
  permission: string,
  requestingOrigin: string | undefined,
  ctx: PermissionContext,
): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) {
    return false;
  }
  // An allowed permission still requires an internal origin. isInternalNavigation
  // classifies the app scheme + dev origin as internal; anything else is not.
  return isInternalNavigation(requestingOrigin ?? '', ctx.customScheme, ctx.devServerUrl);
}

/** Wire the deny-by-default permission policy onto the default session.
 *  setDevicePermissionHandler is unconditional false: the renderer never needs
 *  to pick a USB/Serial/HID device. */
export function installPermissionHandlers(ctx: PermissionContext): void {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details?.requestingUrl ?? wc?.getURL?.() ?? '';
    callback(decidePermission(permission, origin, ctx));
  });

  // setPermissionCheckHandler is the synchronous sibling (navigator.permissions
  // .query + getUserMedia's pre-check). Mirror the same decision.
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    decidePermission(permission, requestingOrigin, ctx),
  );

  // Device chooser (WebUSB / WebSerial / WebHID): always refuse -- no feature
  // in the app talks to a hardware device.
  ses.setDevicePermissionHandler(() => false);
}
