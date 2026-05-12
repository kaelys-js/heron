import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Re-export bits-ui helpers so shadcn-svelte v1 components can import them from $lib/utils.
export type {
  WithElementRef,
  WithoutChild,
  WithoutChildren,
  WithoutChildrenOrChild,
} from 'bits-ui';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  if (day < 30) return day + 'd ago';
  return new Date(ts).toLocaleDateString();
}

export function truncate(s: string, n = 60): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Run an async action while ensuring its visible busy state lasts at least `minMs`.
 * Makes near-instant actions feel responsive — the user sees the spinner long enough
 * to register that something happened, instead of a flicker.
 *
 * Use:
 *   busy = true;
 *   try { await withMinDuration(api.post(...), 450); }
 *   finally { busy = false; }
 */
export async function withMinDuration<T>(promise: Promise<T>, minMs = 450): Promise<T> {
  const start = performance.now();
  const result = await promise;
  const elapsed = performance.now() - start;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
  return result;
}
