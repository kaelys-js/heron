/** Pre-flight one-liner for the salary question. Reads
 *  profile.yml.compensation + the report's Block A and returns
 *  { ask, walkaway, band?, currency, advice }. Surfaced by JobActions
 *  on every interview-stage job so the user reads it in the 30 seconds
 *  before the call. Pure function, no LLM. */

import { readProfile } from './profile';
import { loadAllJobs } from './parsers';

export type CompPreflight = {
  ask: string;
  walkaway: string;
  currency: string;
  advice: string;
  /** Free-form note when we can't fully derive (e.g. no target_range set). */
  warning?: string;
};

/** Build the pre-flight for a given job's profile. The job context is
 *  used today only to identify the profile; future versions can use
 *  Block A + location to refine the band. */
export function compPreflightForJob(jobId: string): CompPreflight | null {
  const job = loadAllJobs('all').find((j) => j.id === jobId);
  if (!job) {
    return null;
  }
  const profile = readProfile(job.profileId) as unknown as {
    compensation?: {
      target_range?: string;
      minimum?: string;
      currency?: string;
      notes?: string;
      location_flexibility?: string;
    };
  };
  const comp = profile?.compensation ?? {};

  const currency = comp.currency || 'USD';
  const target = (comp.target_range || '').trim();
  const walkaway = (comp.minimum || '').trim();

  if (!target && !walkaway) {
    return {
      ask: '(set comp.target_range in profile.yml)',
      walkaway: '(set comp.minimum in profile.yml)',
      currency,
      advice:
        "You haven't set a target_range or minimum yet — recruiters will set the anchor for you, which loses negotiating leverage. Fill these in on /profile → Compensation before the call.",
      warning: 'No target_range or minimum set in profile.yml',
    };
  }

  const askLine = target || `(at least ${walkaway})`;
  const walkawayLine = walkaway || '(set comp.minimum in profile.yml)';

  return {
    ask: askLine,
    walkaway: walkawayLine,
    currency,
    advice: [
      "Anchor with the TOP of your target_range, not the middle. Say it with confidence and don't justify the number.",
      'Never disclose your current salary. If pushed: "I\'d rather discuss the value of THIS role than benchmark against my current."',
      'Tie your ask to scope and impact, not years of experience. "Senior engineers shipping production X are typically in this band" beats "I have N years."',
    ].join(' '),
  };
}
