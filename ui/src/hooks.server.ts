import { bootOnce } from '$lib/server/orchestrator';
import { reportServerError } from '$lib/server/events';
import type { Handle, HandleServerError } from '@sveltejs/kit';

bootOnce();

// Catch process-level crashes so they don't disappear silently.
// Don't process.exit — let the dev server keep going for the next request.
//
// EPIPE / EBADF / ECONNRESET filter is critical: in some setups (Cursor's
// wallaby/console-ninja extension, certain Node debuggers) console.error
// gets intercepted and writes to a socket that may be closed mid-flight.
// That throws EPIPE → uncaughtException → reportServerError → console.error
// → EPIPE → ∞. The activity.jsonl can hit gigabytes in seconds. These
// codes are benign IO churn from upstream tooling, not real crashes.
const BENIGN_IO_CODES = new Set(['EPIPE', 'EBADF', 'ECONNRESET']);

function isBenignIO(err: unknown): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && BENIGN_IO_CODES.has(code)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (typeof msg === 'string' && /\b(EPIPE|EBADF|ECONNRESET)\b/.test(msg)) return true;
  return false;
}

if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err: Error) => {
    if (isBenignIO(err)) return; // swallow — see comment above
    reportServerError('process', 'uncaughtException', err);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    if (isBenignIO(reason)) return;
    reportServerError('process', 'unhandledRejection', reason);
  });
}

export const handle: Handle = async ({ event, resolve }) => resolve(event);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const url = event.url.pathname;
  reportServerError('server', '[' + status + '] ' + url, error);
  const code = (error as Record<string, unknown>)?.code as string | undefined;
  const details = (error as Record<string, unknown>)?.details;
  return {
    message: status >= 500 ? 'Something broke on our end.' : message,
    code,
    details,
  };
};
