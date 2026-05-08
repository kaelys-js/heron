/**
 * Helpers for mutating data/applications.md from server endpoints.
 *
 * Kept out of any +server.ts file because SvelteKit only allows HTTP-method
 * exports there, so cross-route helpers must live in $lib/server/*.
 */

import fs from 'node:fs';
import { APPLICATIONS } from './files';
import { logEvent, reportServerError } from './events';

const HEADER =
  '# Applications Tracker\n\n' +
  '| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |\n' +
  '|---|------|---------|------|-----|-------|--------|-----|--------|-------|\n';

/**
 * Read applications.md, distinguishing "doesn't exist yet" (expected on
 * first run) from real IO failures (perms, partial-write corruption).
 * Returns '' in both cases so callers can fall through to HEADER, but real
 * errors get logged at warn level so they show up on the bell instead of
 * silently producing an empty file the user then mutates.
 */
function readApplicationsSafe(source: string): string {
  try {
    return fs.readFileSync(APPLICATIONS, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logEvent(source, 'Failed to read applications.md', {
        level: 'warn',
        category: 'application',
        message: code + ': ' + (e instanceof Error ? e.message : String(e)),
      });
    }
    return '';
  }
}

/** Persist `lines` to applications.md. Surfaces write failures via the
 *  events bus instead of letting fs.writeFileSync's throw bubble up to a
 *  500 — the caller can decide whether to retry or surface an issue. */
function writeApplicationsSafe(source: string, content: string): boolean {
  try {
    fs.writeFileSync(APPLICATIONS, content);
    return true;
  } catch (e) {
    reportServerError(source, 'Failed to write applications.md', e, {
      category: 'application',
    });
    return false;
  }
}

/** Flip the row matching `url` to status=Closed (used by the liveness sweep
 *  when a posting is detected as expired). Adds a row if none exists. */
export function markClosed(url: string, reason?: string): boolean {
  let text = readApplicationsSafe('mark-closed');
  if (!text) text = HEADER;
  const lines = text.split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && lines[i].startsWith('|')) {
      const cells = lines[i].split('|');
      const statusIdx = cells.length >= 12 ? 7 : 6;
      const notesIdx = cells.length >= 12 ? 10 : 9;
      cells[statusIdx] = ' Closed ';
      if (reason && cells[notesIdx] !== undefined) {
        const existing = cells[notesIdx].trim();
        const tag = 'auto-closed: ' + reason;
        cells[notesIdx] = ' ' + (existing ? existing + ' · ' + tag : tag) + ' ';
      }
      lines[i] = cells.join('|');
      updated = true;
      break;
    }
  }
  if (!updated) {
    const today = new Date().toISOString().slice(0, 10);
    const row =
      '| - | ' + today + ' | (auto) | ' + url + ' | - | - | Closed | - | - | ' + (reason ?? 'auto-closed') + ' |';
    lines.push(row);
  }
  return writeApplicationsSafe('mark-closed', lines.join('\n'));
}

/**
 * Generic row-status flip. Used by Phase 4 auto-queue + by any caller that
 * needs an arbitrary status (markApplied / markClosed are the canonical
 * shortcuts for 'Applied' / 'Closed' specifically).
 *
 * Appends a Notes-column tag when `note` is provided so audits can trace
 * where each automatic flip came from.
 */
export function markStatus(url: string, newStatus: string, note?: string): boolean {
  let text = readApplicationsSafe('mark-status');
  if (!text) text = HEADER;
  const lines = text.split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && lines[i].startsWith('|')) {
      const cells = lines[i].split('|');
      const statusIdx = cells.length >= 12 ? 7 : 6;
      const notesIdx = cells.length >= 12 ? 10 : 9;
      cells[statusIdx] = ' ' + newStatus + ' ';
      if (note && cells[notesIdx] !== undefined) {
        const existing = cells[notesIdx].trim();
        cells[notesIdx] = ' ' + (existing ? existing + ' · ' + note : note) + ' ';
      }
      lines[i] = cells.join('|');
      updated = true;
      break;
    }
  }
  if (!updated) {
    const today = new Date().toISOString().slice(0, 10);
    const row =
      '| - | ' + today + ' | (auto) | ' + url + ' | - | - | ' + newStatus + ' | - | - | ' + (note ?? 'auto') + ' |';
    lines.push(row);
  }
  return writeApplicationsSafe('mark-status', lines.join('\n'));
}

/** Flip the row matching `url` to status=Applied. Adds a row if none exists. */
export function markApplied(url: string, company?: string, role?: string): boolean {
  let text = readApplicationsSafe('mark-applied');
  if (!text) text = HEADER;
  const lines = text.split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && lines[i].startsWith('|')) {
      const cells = lines[i].split('|');
      const statusIdx = cells.length >= 12 ? 7 : 6;
      cells[statusIdx] = ' Applied ';
      lines[i] = cells.join('|');
      updated = true;
      break;
    }
  }
  if (!updated) {
    const today = new Date().toISOString().slice(0, 10);
    const row =
      '| - | ' + today + ' | ' + (company || '(manual)') + ' | ' + (role || '') +
      ' | ' + url + ' | - | Applied | - | - | manual mark |';
    lines.push(row);
  }
  return writeApplicationsSafe('mark-applied', lines.join('\n'));
}
