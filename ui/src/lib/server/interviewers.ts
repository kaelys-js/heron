/**
 * interviewers — per-job interview-panel tracking.
 *
 * Stored at `data/users/{userId}/profiles/{slug}/interviewers.json` as a
 * map of jobId → Interviewer[]. Each entry records who is on the panel,
 * what stage they're for, when they're scheduled, and where the dossier
 * lives (filesystem path under `interview-prep/{company}-{slug}.md`).
 *
 * Used by:
 *   • POST /api/job/[id]/interviewers      → upsert an interviewer
 *   • GET  /api/job/[id]/interviewers      → list current panel
 *   • POST /api/job/[id]/interviewer/[slug]/dossier → spawn deep research
 *   • Inbox — thank-you-owed cards (per interviewer, within 24h of scheduledAt)
 *   • Calendar surface
 */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';
import { getActiveProfileId } from './profiles';

export type InterviewerStage =
  | 'recruiter-screen'
  | 'hiring-manager-screen'
  | 'tech-screen'
  | 'take-home'
  | 'onsite'
  | 'final-round'
  | 'reference'
  | 'unknown';

export type Interviewer = {
  /** kebab-case slug derived from name. Used as URL segment + file path. */
  slug: string;
  name: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  /** Stage this interviewer is responsible for. */
  stage: InterviewerStage;
  /** Unix ms — when the interview is/was scheduled. */
  scheduledAt?: number;
  /** Path (relative to ROOT) to the dossier file in interview-prep/. */
  dossierPath?: string;
  /** Path to per-interviewer "questions to ask" file. */
  questionsPath?: string;
  /** Path to thank-you draft, written after the interview. */
  thankYouPath?: string;
  /** Free-form user notes (added in the dashboard). */
  notes?: string;
  /** ISO ts of last edit — useful for "stale dossier" warnings. */
  updatedAt: number;
};

function statePath(profileId?: string): string {
  return profilePath(profileId ?? getActiveProfileId(), 'interviewers-json');
}

function readAll(profileId?: string): Record<string, Interviewer[]> {
  const p = statePath(profileId);
  try {
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Interviewer[]>) : {};
  } catch {
    return {};
  }
}

function writeAll(state: Record<string, Interviewer[]>, profileId?: string): void {
  const p = statePath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

export function listInterviewers(jobId: string, profileId?: string): Interviewer[] {
  return readAll(profileId)[jobId] ?? [];
}

export function getInterviewer(
  jobId: string,
  slug: string,
  profileId?: string,
): Interviewer | undefined {
  return listInterviewers(jobId, profileId).find((i) => i.slug === slug);
}

/** Slug from human name. "Sarah Chen" → "sarah-chen". */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 64);
}

export function upsertInterviewer(
  jobId: string,
  fields: Omit<Interviewer, 'slug' | 'updatedAt'> & { slug?: string },
  profileId?: string,
): Interviewer {
  const all = readAll(profileId);
  const list = all[jobId] ?? [];
  const slug = fields.slug || slugifyName(fields.name);
  const idx = list.findIndex((i) => i.slug === slug);
  const next: Interviewer = {
    ...fields,
    slug,
    updatedAt: Date.now(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...next };
  else list.push(next);
  all[jobId] = list;
  writeAll(all, profileId);
  return next;
}

export function removeInterviewer(jobId: string, slug: string, profileId?: string): boolean {
  const all = readAll(profileId);
  const list = all[jobId] ?? [];
  const next = list.filter((i) => i.slug !== slug);
  if (next.length === list.length) return false;
  if (next.length === 0) delete all[jobId];
  else all[jobId] = next;
  writeAll(all, profileId);
  return true;
}

/** Find every interviewer whose interview happened in the last 48h and
 *  who has no thank-you-path yet. Used by the Inbox to surface "thank-you
 *  owed" cards. */
export function findThankYousOwed(
  profileId?: string,
  windowMs = 48 * 60 * 60 * 1000,
): { jobId: string; interviewer: Interviewer }[] {
  const all = readAll(profileId);
  const now = Date.now();
  const out: { jobId: string; interviewer: Interviewer }[] = [];
  for (const [jobId, list] of Object.entries(all)) {
    for (const i of list) {
      if (!i.scheduledAt) continue;
      const elapsed = now - i.scheduledAt;
      if (elapsed > 0 && elapsed < windowMs && !i.thankYouPath) {
        out.push({ jobId, interviewer: i });
      }
    }
  }
  return out;
}

/** List interviews scheduled in the next `forwardDays` — used by the
 *  Calendar surface + the Ready-to-Interview gate. */
export function findUpcomingInterviews(
  forwardDays = 14,
  profileId?: string,
): { jobId: string; interviewer: Interviewer; daysAway: number }[] {
  const all = readAll(profileId);
  const now = Date.now();
  const horizon = now + forwardDays * 24 * 60 * 60 * 1000;
  const out: { jobId: string; interviewer: Interviewer; daysAway: number }[] = [];
  for (const [jobId, list] of Object.entries(all)) {
    for (const i of list) {
      if (!i.scheduledAt) continue;
      if (i.scheduledAt < now || i.scheduledAt > horizon) continue;
      out.push({
        jobId,
        interviewer: i,
        daysAway: Math.ceil((i.scheduledAt - now) / (24 * 60 * 60 * 1000)),
      });
    }
  }
  return out.sort((a, b) => a.interviewer.scheduledAt! - b.interviewer.scheduledAt!);
}
