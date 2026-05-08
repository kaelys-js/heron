import { bootOnce } from '$lib/server/orchestrator';
import { reportServerError } from '$lib/server/events';
import type { Handle, HandleServerError } from '@sveltejs/kit';

bootOnce();

// Catch process-level crashes so they don't disappear silently.
// Don't process.exit — let the dev server keep going for the next request.
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err: Error) => {
    reportServerError('process', 'uncaughtException', err);
  });
  process.on('unhandledRejection', (reason: unknown) => {
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
