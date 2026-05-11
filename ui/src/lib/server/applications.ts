/**
 * Helpers for mutating per-profile applications.md from server endpoints.
 *
 * Each mutator (markClosed / markStatus / markApplied) accepts an optional
 * `profileId` first argument (or via a 2-arg overload preserving the old
 * signature). When omitted, mutations target the active profile.
 *
 * Kept out of any +server.ts file because SvelteKit only allows HTTP-method
 * exports there.
 */

import fs from 'node:fs';
import { logEvent, reportServerError } from './events';
import { profilePath, ensureProfileDirs } from './profile-paths';
import { getActiveProfileId } from './profiles';

const HEADER =
  '# Applications Tracker\n\n' +
  '| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |\n' +
  '|---|------|---------|------|-----|-------|--------|-----|--------|-------|\n';

function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

/**
 * Read applications.md for the named profile, distinguishing "doesn't exist
 * yet" (expected on first run) from real IO failures (perms, partial-write
 * corruption). Returns '' in both cases so callers can fall through to
 * HEADER, but real errors get logged at warn level so they show up on the
 * bell instead of silently producing an empty file the user then mutates.
 */
function readApplicationsSafe(source: string, profileId: string): string {
  try {
    return fs.readFileSync(profilePath(profileId, 'applications'), 'utf8');
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

function writeApplicationsSafe(source: string, profileId: string, content: string): boolean {
  try {
    ensureProfileDirs(profileId);
    fs.writeFileSync(profilePath(profileId, 'applications'), content);
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
export function markClosed(profileId: string | undefined, url: string, reason?: string): boolean;
export function markClosed(url: string, reason?: string): boolean;
export function markClosed(arg1: string | undefined, arg2?: string, arg3?: string): boolean {
  // Disambiguate: if arg1 looks like a URL OR arg2 isn't a URL, it's the
  // legacy 2-arg signature.
  const isLegacy = arg1 != null && (arg1.startsWith('http') || arg1.startsWith('local:'));
  const profileId = isLegacy ? undefined : arg1;
  const url = isLegacy ? arg1 : arg2!;
  const reason = isLegacy ? arg2 : arg3;
  const id = resolveId(profileId);

  let text = readApplicationsSafe('mark-closed', id);
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
  return writeApplicationsSafe('mark-closed', id, lines.join('\n'));
}

/**
 * Generic row-status flip. Used by Phase 4 auto-queue + by any caller that
 * needs an arbitrary status (markApplied / markClosed are the canonical
 * shortcuts for 'Applied' / 'Closed' specifically).
 *
 * Appends a Notes-column tag when `note` is provided so audits can trace
 * where each automatic flip came from.
 */
export function markStatus(profileId: string | undefined, url: string, newStatus: string, note?: string): boolean;
export function markStatus(url: string, newStatus: string, note?: string): boolean;
export function markStatus(arg1: string | undefined, arg2: string, arg3?: string, arg4?: string): boolean {
  // Legacy signature: (url, newStatus, note?). New: (profileId, url, newStatus, note?).
  // Heuristic: if arg1 looks like a URL, it's legacy. Profile slugs never
  // start with http and don't contain '://'.
  const isLegacy = arg1 != null && (arg1.startsWith('http') || arg1.startsWith('local:'));
  const profileId = isLegacy ? undefined : arg1;
  const url = isLegacy ? arg1 : arg2;
  const newStatus = isLegacy ? arg2 : arg3!;
  const note = isLegacy ? arg3 : arg4;
  const id = resolveId(profileId);

  let text = readApplicationsSafe('mark-status', id);
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
  return writeApplicationsSafe('mark-status', id, lines.join('\n'));
}

/** Flip the row matching `url` to status=Applied. Adds a row if none exists. */
export function markApplied(profileId: string | undefined, url: string, company?: string, role?: string): boolean;
export function markApplied(url: string, company?: string, role?: string): boolean;
export function markApplied(arg1: string | undefined, arg2?: string, arg3?: string, arg4?: string): boolean {
  const isLegacy = arg1 != null && (arg1.startsWith('http') || arg1.startsWith('local:'));
  const profileId = isLegacy ? undefined : arg1;
  const url = isLegacy ? arg1 : arg2!;
  const company = isLegacy ? arg2 : arg3;
  const role = isLegacy ? arg3 : arg4;
  const id = resolveId(profileId);

  let text = readApplicationsSafe('mark-applied', id);
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
  return writeApplicationsSafe('mark-applied', id, lines.join('\n'));
}
