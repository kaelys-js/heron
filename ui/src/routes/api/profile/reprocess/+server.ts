/**
 * Reprocess cv.md → structured ProfileEdit suggestion.
 *
 * Reads the canonical CV, asks Claude to extract identity + narrative fields,
 * and returns the JSON. The endpoint NEVER auto-writes to profile.yml — the
 * client merges the suggestion into the local edit state so the user can
 * review every field before clicking Save.
 *
 * Cost: one Anthropic call per invocation (~$0.10–$0.30 on Opus). The Profile
 * page warns the user before submitting.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { readSafe } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { complete } from '$lib/server/ai';
import { logEvent } from '$lib/server/events';

type Suggestion = {
  candidate?: {
    full_name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio_url?: string;
    twitter?: string;
  };
  narrative?: {
    headline?: string;
    exit_story?: string;
    superpowers?: string[];
    proof_points?: { name: string; hero_metric?: string; url?: string }[];
  };
  location?: {
    city?: string;
    province?: string;
    country?: string;
    timezone?: string;
  };
};

const SYSTEM_PROMPT =
  "You are extracting structured profile data from a candidate's CV.\n\n" +
  'Return STRICT JSON matching this schema (omit a field entirely if you cannot derive it from the CV):\n' +
  '{\n' +
  '  "candidate": { "full_name": string, "email": string, "phone": string, "location": string, "linkedin": string, "github": string, "portfolio_url": string, "twitter": string },\n' +
  '  "narrative": {\n' +
  '    "headline": string,        // one-line professional headline tailored to their seniority + stack\n' +
  '    "exit_story": string,       // 4–8 sentence narrative — what they\'ve shipped, what they\'re about\n' +
  '    "superpowers": string[],    // 3–6 concrete capabilities. Skills, not adjectives.\n' +
  '    "proof_points": [{ "name": string, "hero_metric": string, "url": string }]   // up to 5 specific projects/wins with metrics if available\n' +
  '  },\n' +
  '  "location": { "city": string, "province": string, "country": string, "timezone": string }\n' +
  '}\n\n' +
  'Rules:\n' +
  '- Output ONLY the JSON object — no markdown fences, no commentary, no preamble.\n' +
  '- Use empty string ("") for fields you can\'t derive. Never invent.\n' +
  '- For URL fields (linkedin, github, portfolio_url, twitter): always normalize to bare host+path (e.g. "linkedin.com/in/jane", not "https://www.linkedin.com/in/jane").\n' +
  '- For superpowers: prefer concrete tech ("Production TypeScript + Node end-to-end") over vague adjectives ("Strong communicator").\n' +
  '- For proof_points: only include ones the CV actually mentions with a metric.';

export const POST = wrap('profile-reprocess', async ({ url }: { url: URL }) => {
  const q = url.searchParams.get('profile');
  const profileId = q && getProfile(q) ? q : getActiveProfileId();
  const cv = readSafe(profilePath(profileId, 'cv-md'));
  if (!cv.trim()) {
    badRequest('cv.md is empty or missing — paste a CV via Replace before reprocessing');
  }

  logEvent('profile-reprocess', 'Reprocessing CV via Claude', {
    category: 'user',
    message: cv.length.toLocaleString() + ' chars · model=claude-opus-4-7',
  });

  const text = await complete(SYSTEM_PROMPT, cv, { maxTokens: 4000, thinking: false });

  // Strip code fences if Claude added them despite the instruction.
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  let suggestion: Suggestion;
  try {
    suggestion = JSON.parse(json);
  } catch (e) {
    logEvent('profile-reprocess', 'CV reprocessing failed (parse)', {
      level: 'error',
      category: 'user',
      message: (e instanceof Error ? e.message : 'unknown') + ' · raw=' + text.slice(0, 200),
    });
    badRequest(
      'Failed to parse extracted profile JSON. Try again or edit profile fields manually.',
    );
  }

  // Build a human-readable summary of which fields the suggestion populates,
  // so the activity feed entry is descriptive instead of just "Reprocessed".
  const populated: string[] = [];
  if (suggestion.candidate) {
    const c = suggestion.candidate;
    const filled = (Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k]);
    if (filled.length > 0) populated.push(filled.length + ' identity fields');
  }
  if (suggestion.narrative?.headline) populated.push('headline');
  if (suggestion.narrative?.exit_story) populated.push('exit story');
  if (suggestion.narrative?.superpowers?.length)
    populated.push(suggestion.narrative.superpowers.length + ' superpowers');
  if (suggestion.narrative?.proof_points?.length)
    populated.push(suggestion.narrative.proof_points.length + ' proof points');
  if (suggestion.location?.city || suggestion.location?.country) populated.push('location');

  logEvent('profile-reprocess', 'CV reprocessing finished', {
    level: 'success',
    category: 'user',
    message: 'Extracted: ' + (populated.length > 0 ? populated.join(' · ') : 'no usable fields'),
  });

  return { suggestion };
});
