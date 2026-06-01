/**
 * report-routing -- the single source of truth for where any reported
 * event goes. Both the client reporter and the server-side bell/Issue
 * wiring consult this so client and server can never drift on the
 * "product is loud, technical is quiet" contract.
 *
 * Two orthogonal axes:
 *   • kind  -- 'product' (job-search domain events the user must act on:
 *              apply failed, posting went dead, autopilot paused, new lead,
 *              pipeline integrity finding, offer received) vs 'technical'
 *              (software/infra diagnostics: uncaught JS error, unhandled
 *              rejection, render crash, SvelteKit load error, 5xx, network
 *              failure, web-vitals).
 *   • level -- 'info' | 'warn' | 'error' (product may additionally be
 *              'success').
 */

import type { ActivityEvent, ReportKind } from '$lib/types';

// `ReportKind` is defined in $lib/types (where ActivityEvent lives, so the
// optional ActivityEvent.kind field can reference it without a cycle) and
// re-exported here so routing consumers have a single import surface.
export type { ReportKind };
export type ReportLevel = 'info' | 'warn' | 'error' | 'success';

/** Where + how a single report surfaces. The one shape every routing
 *  decision returns. */
export interface ReportRouting {
  /** Which durable sink the report is persisted to (if any):
   *   - 'issues'      -> data/issues.jsonl (open problems the Inbox shows)
   *   - 'diagnostics' -> the activity feed as a quiet technical event
   *   - 'none'        -> not persisted as an Issue (still may ping the bell) */
  persist: 'issues' | 'diagnostics' | 'none';
  /** Show a transient toast. Styled by level downstream. */
  toast: boolean;
  /** Add to the notifications bell feed. */
  bell: boolean;
  /** Fire an intrusive OS-level notification. Reserved for actionable
   *  product warn/error -- technical diagnostics never wake the user. */
  os: boolean;
}

/**
 * Route a report by (kind, level). Pure function -- no side effects.
 *
 * Product warn/error opens an Issue AND pings the bell AND fires an OS
 * notification (it's actionable). Product info/success only pings the bell
 * (no Issue row, no OS notify). Technical is always quiet: it lands in the
 * diagnostics sink and never toasts, pings, or wakes the user -- a render
 * crash must not nag like a failed apply.
 */
export function routeReport(kind: ReportKind, level: ReportLevel): ReportRouting {
  if (kind === 'technical') {
    return { persist: 'diagnostics', toast: false, bell: false, os: false };
  }
  // product
  const actionable = level === 'warn' || level === 'error';
  return {
    persist: actionable ? 'issues' : 'none',
    toast: true,
    bell: true,
    os: actionable, // intrusive only when actionable
  };
}

/**
 * Derive the report kind for an ActivityEvent off the bus, which carries a
 * `category` but only an OPTIONAL `kind`. An explicit `ev.kind` always wins;
 * otherwise the category maps: application / task / user are product (domain
 * events the user acts on), system / api are technical (infra diagnostics).
 */
export function eventKind(ev: Pick<ActivityEvent, 'category' | 'kind'>): ReportKind {
  return (
    ev.kind ??
    (ev.category === 'application' || ev.category === 'task' || ev.category === 'user'
      ? 'product'
      : 'technical')
  );
}
