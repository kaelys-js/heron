/** form-answers-cache -- per-question answer cache reused across jobs.
 *  Storage: per-profile form-answers-cache.jsonl, one row per
 *  normalized question (key, label, answer, updatedAt, useCount),
 *  append-only with last-write-wins on key. JSONL chosen for partial-
 *  write tolerance (corrupt line → skip, keep rest).
 *  Per-question because answers like "Years of TS" / "Notice period" /
 *  "Visa status" are reusable across hundreds of forms; per-profile
 *  because "Why this company?" stays job-specific. */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';

const CACHE_FILENAME = 'form-answers-cache.jsonl';

/** Mirror Python's normalize_question() in lib_apply.py -- keep them in lockstep. */
export function normalizeQuestion(label: string): string {
  return (
    (label || '')
      .toLowerCase()
      // Strip everything that isn't letters / digits / spaces.
      .replace(/[^a-z0-9 ]+/g, ' ')
      // Collapse whitespace.
      .replace(/\s+/g, ' ')
      .trim()
      // Drop very generic noise words that don't change meaning.
      .replace(/\b(a|an|the|please|kindly|do|you)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export type FormAnswer = {
  key: string;
  label: string;
  answer: string;
  updatedAt: number;
  useCount: number;
};

function cachePath(profileId: string): string {
  return path.join(profilePath(profileId, 'profile-dir'), CACHE_FILENAME);
}

/** Read every saved answer for a profile. Returns a Map keyed by normalized
 *  question, with the LATEST row winning on duplicate keys (the JSONL is
 *  append-friendly; we collapse here). */
export function readCache(profileId: string): Map<string, FormAnswer> {
  const out = new Map<string, FormAnswer>();
  const p = cachePath(profileId);
  if (!fs.existsSync(p)) return out;
  let txt = '';
  try {
    txt = fs.readFileSync(p, 'utf8');
  } catch {
    return out;
  }
  for (const line of txt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as FormAnswer;
      if (typeof row.key !== 'string' || typeof row.answer !== 'string') continue;
      out.set(row.key, row);
    } catch {
      // Skip corrupt line; keep rest of file usable.
    }
  }
  return out;
}

/** Return ALL answers for a profile as an array, newest first. UI uses this. */
export function listAnswers(profileId: string): FormAnswer[] {
  const cache = readCache(profileId);
  return Array.from(cache.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Look up an answer by question label. Normalizes before lookup. */
export function lookupAnswer(profileId: string, label: string): FormAnswer | null {
  const key = normalizeQuestion(label);
  if (!key) return null;
  const cache = readCache(profileId);
  return cache.get(key) ?? null;
}

/** Insert or update an answer. Append-only on disk; collapses on next read.
 *  Returns the persisted row. */
export function saveAnswer(profileId: string, label: string, answer: string): FormAnswer {
  const key = normalizeQuestion(label);
  if (!key) throw new Error('saveAnswer: empty question after normalization');
  const cache = readCache(profileId);
  const prior = cache.get(key);
  const row: FormAnswer = {
    key,
    label,
    answer,
    updatedAt: Date.now(),
    useCount: prior?.useCount ?? 0,
  };
  const p = cachePath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(row) + '\n');
  return row;
}

/** Bump the useCount on a successful auto-fill. Called by the adapters
 *  (well -- by a helper they invoke) when an answer is actually applied to
 *  a form. Letting the UI sort by useCount surfaces the answers the user
 *  actually relies on. */
export function bumpUseCount(profileId: string, label: string): void {
  const key = normalizeQuestion(label);
  const cache = readCache(profileId);
  const prior = cache.get(key);
  if (!prior) return;
  const row: FormAnswer = {
    ...prior,
    useCount: (prior.useCount ?? 0) + 1,
    updatedAt: Date.now(),
  };
  const p = cachePath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(row) + '\n');
}

/** Delete an answer by normalized key. Returns true on success. The on-disk
 *  representation is "tombstone" -- we append a row with answer="" so the
 *  next read collapses it away. Pure delete would require rewriting the
 *  whole file; tombstones keep append-only semantics.
 *
 *  Edge case: an empty answer is technically valid for some questions
 *  (e.g. "Notes" textarea). Future: switch to an explicit deleted flag. */
export function deleteAnswer(profileId: string, key: string): boolean {
  const cache = readCache(profileId);
  if (!cache.has(key)) return false;
  const p = cachePath(profileId);
  // Compact rewrite -- drop the entry. JSONL doesn't have to be append-only,
  // and a full rewrite at delete-time is fine for the typical cache size
  // (50-200 entries per profile).
  const remaining = Array.from(cache.values()).filter((r) => r.key !== key);
  const body = remaining.map((r) => JSON.stringify(r)).join('\n') + (remaining.length ? '\n' : '');
  fs.writeFileSync(p, body);
  return true;
}

/** Stats for the UI badge: "23 saved answers, 5 used today". */
export function cacheStats(profileId: string): {
  total: number;
  usedToday: number;
  lastUpdatedAt: number | null;
} {
  const all = listAnswers(profileId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  let usedToday = 0;
  let lastUpdatedAt: number | null = null;
  for (const row of all) {
    if (row.updatedAt >= cutoff) usedToday++;
    if (lastUpdatedAt == null || row.updatedAt > lastUpdatedAt) lastUpdatedAt = row.updatedAt;
  }
  return { total: all.length, usedToday, lastUpdatedAt };
}
