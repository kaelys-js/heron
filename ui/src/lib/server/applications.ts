/**
 * Helpers for mutating data/applications.md from server endpoints.
 *
 * Kept out of any +server.ts file because SvelteKit only allows HTTP-method
 * exports there, so cross-route helpers must live in $lib/server/*.
 */

import fs from 'node:fs';
import { APPLICATIONS } from './files';

const HEADER =
  '# Applications Tracker\n\n' +
  '| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |\n' +
  '|---|------|---------|------|-----|-------|--------|-----|--------|-------|\n';

/** Flip the row matching `url` to status=Closed (used by the liveness sweep
 *  when a posting is detected as expired). Adds a row if none exists. */
export function markClosed(url: string, reason?: string): boolean {
  let text = '';
  try { text = fs.readFileSync(APPLICATIONS, 'utf8'); } catch {}
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
  fs.writeFileSync(APPLICATIONS, lines.join('\n'));
  return true;
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
  let text = '';
  try { text = fs.readFileSync(APPLICATIONS, 'utf8'); } catch {}
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
  fs.writeFileSync(APPLICATIONS, lines.join('\n'));
  return true;
}

/** Flip the row matching `url` to status=Applied. Adds a row if none exists. */
export function markApplied(url: string, company?: string, role?: string): boolean {
  let text = '';
  try { text = fs.readFileSync(APPLICATIONS, 'utf8'); } catch {}
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
  fs.writeFileSync(APPLICATIONS, lines.join('\n'));
  return true;
}
