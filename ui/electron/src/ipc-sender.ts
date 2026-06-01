/** IPC sender-frame validation.
 *
 *  Every ipcMain handler runs whatever frame sent the message -- including a
 *  cross-origin <iframe> a compromised page embedded, or a frame that navigated
 *  away from the app origin. contextIsolation keeps the page from forging the
 *  preload bridge, but the main process should still verify each invoke/send
 *  actually came from OUR content before acting on it. This rejects any message
 *  whose senderFrame is gone (frame detached/navigated) or whose origin isn't an
 *  internal origin (the app scheme / dev-server origin).
 *
 *  The pure isTrustedSenderOrigin() is the testable core; assertSender() reads
 *  the live event's senderFrame and applies it. */
import { isInternalNavigation } from './dev-server';

export type SenderContext = {
  customScheme: string;
  devServerUrl: string | null;
};

/** PURE. True when `origin` belongs to the app (app scheme / dev origin). A
 *  null/empty origin (detached or about:blank frame) is never trusted.
 *
 *  Electron reports a frame's origin as a serialized origin like
 *  `heron://app` or `http://localhost:5173` (no trailing path). isInternalNavigation
 *  parses it as a URL and compares origins, which handles both forms. */
export function isTrustedSenderOrigin(
  origin: string | null | undefined,
  ctx: SenderContext,
): boolean {
  if (!origin) {
    return false;
  }
  return isInternalNavigation(origin, ctx.customScheme, ctx.devServerUrl);
}

/** Minimal shape of the bits of an IpcMainEvent / IpcMainInvokeEvent we read.
 *  senderFrame is null once the frame is disposed. */
type SenderEvent = {
  senderFrame: { origin?: string } | null;
};

/** Guard an ipcMain handler: returns true if the event came from a trusted
 *  internal frame, false otherwise (caller should bail without side effects).
 *  Logs a refusal so a blocked attempt is visible rather than silent. */
export function assertSender(event: SenderEvent, ctx: SenderContext): boolean {
  const origin = event.senderFrame?.origin ?? null;
  if (isTrustedSenderOrigin(origin, ctx)) {
    return true;
  }
  console.warn(`[ipc] refused message from untrusted sender origin "${origin ?? '<none>'}"`);
  return false;
}
