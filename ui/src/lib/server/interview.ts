import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readSafe } from './files';
import { complete } from './ai';
import { profilePath, ensureProfileDirs } from './profile-paths';
import { getActiveProfileId } from './profiles';

/** modes/ is system-layer, shared, not per-profile. */
export function loadModeFile(name: string): string {
  return readSafe(path.join(ROOT, 'modes', name));
}

function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'job';
}

function persistedInterviewPath(profileId: string, jobId: string): string {
  return path.join(profilePath(profileId, 'interview-prep-dir'), slugify(jobId) + '.md');
}

/** Read a previously persisted prep file for the named profile, if any. */
export function readPersistedInterviewPrep(profileId: string | undefined, jobId: string): string | null;
export function readPersistedInterviewPrep(jobId: string): string | null;
export function readPersistedInterviewPrep(arg1: string | undefined, arg2?: string): string | null {
  // 2-arg: (profileId, jobId). 1-arg: (jobId).
  // Heuristic: jobId is 12-char hex (urlId()); profile slugs are kebab-case.
  // If arg2 is defined, it's the new signature.
  const profileId = arg2 !== undefined ? arg1 : undefined;
  const jobId = arg2 !== undefined ? arg2 : (arg1 as string);
  const id = resolveId(profileId);
  const full = persistedInterviewPath(id, jobId);
  if (!fs.existsSync(full)) return null;
  try { return fs.readFileSync(full, 'utf8'); } catch { return null; }
}

export async function generateInterviewPrep(
  profileIdOrReportFile: string,
  reportFileOrArchetype?: string,
  archetypeOrJobId?: string,
  jobIdForPersist?: string,
): Promise<string> {
  // Disambiguate signatures:
  //   Legacy: (reportFile, archetypeOverride?, jobIdForPersist?)
  //   New:    (profileId, reportFile, archetypeOverride?, jobIdForPersist?)
  // Heuristic: report files end with .md and contain digits/slugs; profile
  // slugs don't end with .md. Plus the legacy 1-arg form omits the second.
  const isNew = profileIdOrReportFile != null &&
                !profileIdOrReportFile.endsWith('.md') &&
                reportFileOrArchetype != null &&
                reportFileOrArchetype.endsWith('.md');
  const profileId = isNew ? profileIdOrReportFile : undefined;
  const reportFile = isNew ? reportFileOrArchetype! : profileIdOrReportFile;
  const archetypeOverride = isNew ? archetypeOrJobId : reportFileOrArchetype;
  const persistJobId = isNew ? jobIdForPersist : archetypeOrJobId;
  const id = resolveId(profileId);

  const reportContent = readSafe(path.join(profilePath(id, 'reports-dir'), reportFile));
  const cv = readSafe(profilePath(id, 'cv-md'));
  const interviewPrepMode = loadModeFile('interview-prep.md');
  const sys = 'You are a senior interview-prep coach. Use the report (Block A/B/F) to produce a focused brief.\n\n' + (interviewPrepMode || 'Generate a comprehensive interview prep brief.');
  const user = '# Report\n' + reportContent + '\n\n# CV\n' + cv.slice(0, 3000) + '\n\n# Task\nProduce a Markdown brief: 8-12 likely questions, STAR map, 5-topic study plan, 3 talking points, red flags, 5 questions to ask back.' + (archetypeOverride ? '\n\nReframe for archetype: ' + archetypeOverride : '');
  const md = await complete(sys, user, { maxTokens: 16000, thinking: true });
  if (persistJobId) {
    try {
      ensureProfileDirs(id);
      fs.writeFileSync(persistedInterviewPath(id, persistJobId), md);
    } catch {
      // Persistence is best-effort — caller still got the body
    }
  }
  return md;
}

export async function generateNegotiationBrief(
  profileIdOrReportFile: string,
  reportFileOrOfferDetails: string,
  offerDetailsMaybe?: string,
): Promise<string> {
  // Legacy: (reportFile, offerDetails). New: (profileId, reportFile, offerDetails).
  const isNew = offerDetailsMaybe !== undefined;
  const profileId = isNew ? profileIdOrReportFile : undefined;
  const reportFile = isNew ? reportFileOrOfferDetails : profileIdOrReportFile;
  const offerDetails = isNew ? offerDetailsMaybe! : reportFileOrOfferDetails;
  const id = resolveId(profileId);

  const reportContent = readSafe(path.join(profilePath(id, 'reports-dir'), reportFile));
  const profile = readSafe(profilePath(id, 'profile-yml'));
  const negMode = loadModeFile('negotiation.md');
  const sys = 'You are a senior compensation and negotiation coach.\n\n' + (negMode || '');
  const user = '# Report\n' + reportContent + '\n\n# Profile\n' + profile + '\n\n# Offer\n' + offerDetails + '\n\nProduce: percentile table, leverage stance, draft email, 2 alternates, recruiter response handling.';
  return complete(sys, user, { maxTokens: 16000, thinking: true });
}
