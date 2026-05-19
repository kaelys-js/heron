/**
 * Client-side pin/unpin state for the sidebar.
 *
 * The server auto-derives a base set of "pinnable" jobs (top Ready jobs by score).
 * The user can unpin individual ones -- those go into an exclusion set persisted
 * in localStorage, so the sidebar respects the user's choices across reloads.
 */

import { BRAND } from '$lib/client/brand';
const STORAGE_KEY = `${BRAND.name}:sidebar-pin-excluded`;

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(s: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
  } catch {}
}

class PinStore {
  excluded = $state<Set<string>>(new Set());

  init() {
    this.excluded = readSet();
  }

  unpin(id: string) {
    const next = new Set(this.excluded);
    next.add(id);
    this.excluded = next;
    writeSet(next);
  }

  unpinAll(ids: string[]) {
    const next = new Set(this.excluded);
    for (const id of ids) next.add(id);
    this.excluded = next;
    writeSet(next);
  }

  pin(id: string) {
    if (!this.excluded.has(id)) return;
    const next = new Set(this.excluded);
    next.delete(id);
    this.excluded = next;
    writeSet(next);
  }

  resetAll() {
    this.excluded = new Set();
    writeSet(this.excluded);
  }

  isExcluded(id: string): boolean {
    return this.excluded.has(id);
  }
}

export const pinStore = new PinStore();
