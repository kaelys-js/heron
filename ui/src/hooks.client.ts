import type { HandleClientError } from '@sveltejs/kit';
import { reportClientError } from '$lib/notifications.svelte';

/**
 * Funnel every client-side error through `reportClientError` so the user always
 * sees a toast + activity-feed entry instead of a silent console log.
 *
 * Three sources are wired up:
 *   1. SvelteKit `handleError` hook — load/navigation lifecycle errors
 *   2. `<svelte:boundary onerror>` in +layout.svelte — component-tree errors ($effect, render, lifecycle)
 *   3. Plain `window.error` and `window.unhandledrejection` — anything outside Svelte's reach
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
  const url = event?.url?.pathname ?? '?';
  reportClientError('sveltekit', '[' + status + '] ' + url, error);
  return {
    message: status >= 500 ? 'Something broke on our end.' : message,
    code: (error as { code?: string })?.code,
  };
};

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e: ErrorEvent) => {
    if (!e.error && !e.message) return;
    const stackFrame =
      (e.error?.stack ?? '').split('\n')[0] ||
      (e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : '');
    reportClientError('window', 'Uncaught error', e.error ?? e.message, {
      message: stackFrame
        ? (e.error?.message ?? e.message) + ' · ' + stackFrame
        : (e.error?.message ?? e.message),
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const code = (e.reason as { code?: string })?.code;
    reportClientError('promise', 'Unhandled promise rejection', e.reason, {
      message: code
        ? '[' + code + '] ' + (e.reason instanceof Error ? e.reason.message : String(e.reason))
        : undefined,
    });
  });
}
