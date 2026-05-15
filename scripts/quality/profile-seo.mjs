#!/usr/bin/env node
/**
 * profile-seo.mjs — LinkedIn / portfolio profile keyword-SEO checker.
 *
 * Recruiter inbound is the second-highest converting channel (10-20%
 * vs 3-15% cold apply). It depends almost entirely on whether YOUR
 * LinkedIn profile shows up when recruiters search keywords for the
 * roles you want.
 *
 * The cheap-but-effective checks here:
 *
 *   1. HEADLINE TEST — does your headline include 2+ keywords that
 *      target-archetype recruiters search for? Generic ("Software
 *      Engineer at Acme") loses to specific ("Senior Backend Engineer
 *      | Distributed Systems | Go + Kubernetes").
 *
 *   2. ABOUT-SECTION DENSITY — for the target archetype, are the top
 *      10 most-searched keywords in your About section? A profile
 *      with 0/10 doesn't get found via search.
 *
 *   3. SKILLS COVERAGE — LinkedIn ranks profiles partly by skills
 *      endorsements; missing core skills hurts visibility.
 *
 *   4. ACTIVITY SIGNAL (heuristic) — when did you last post / comment?
 *      Inactive profiles rank lower in LinkedIn's algorithm.
 *
 * Inputs:
 *   - User's profile.yml (for target archetypes + linkedin URL)
 *   - User's headline + about + skills as plain text (from
 *     `data/users/{userId}/profiles/{slug}/linkedin-export.txt` IF
 *     it exists, OR passed via stdin)
 *
 * Output: JSON with per-check evidence + a composite 0-100 score.
 *
 * Usage:
 *   pnpm profile:seo                 # uses linkedin-export.txt
 *   pnpm profile:seo - < text.txt    # reads from stdin
 *   pnpm profile:seo --json
 *   pnpm profile:seo --headline "Senior Backend Engineer" --about "..."
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { profilePath, profileFromArgv, userFromArgv } from '../lib/lib-profiles.mjs';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const headlineArg = (() => {
  const i = args.indexOf('--headline');
  return i >= 0 ? args[i + 1] : null;
})();
const aboutArg = (() => {
  const i = args.indexOf('--about');
  return i >= 0 ? args[i + 1] : null;
})();
const stdinFlag = args.includes('-');

// scripts/quality/ -> scripts/ -> repo root (../.. from this script).
const ROOT = resolve(import.meta.dirname, '..', '..');

const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const N = '\x1b[0m';

function activeProfileDir() {
  // Resolves to data/users/{uid}/profiles/{slug}/ when CAREER_OPS_USER_ID
  // is set (orchestrator passthrough); falls back to data/profiles/{slug}/
  // under SYSTEM_USER_ID for legacy single-user installs.
  const userId = userFromArgv();
  const profileId = profileFromArgv();
  return profilePath(profileId, 'profile-dir', userId);
}

function readProfileYaml(dir) {
  const p = join(dir, 'profile.yml');
  if (!existsSync(p)) return {};
  try {
    const text = readFileSync(p, 'utf8');
    return {
      archetypes: (text.match(/^archetypes:\s*([\s\S]+?)(?:\n[a-z]|$)/im)?.[1] ?? '')
        .split('\n')
        .map((l) => l.trim().replace(/^-\s*/, '').replace(/"/g, ''))
        .filter(Boolean)
        .slice(0, 3),
      linkedinUrl: text.match(/^\s*linkedin:\s*"?([^"\n]+)/im)?.[1] ?? null,
    };
  } catch {
    return {};
  }
}

const profile = readProfileYaml(activeProfileDir());

// Read LinkedIn-export text from disk OR stdin OR args.
let exportText = '';
if (headlineArg || aboutArg) {
  exportText = (headlineArg ?? '') + '\n\n' + (aboutArg ?? '');
} else if (stdinFlag) {
  exportText = readFileSync(0, 'utf8');
} else {
  const candidatePath = join(activeProfileDir(), 'linkedin-export.txt');
  if (existsSync(candidatePath)) {
    exportText = readFileSync(candidatePath, 'utf8');
  } else {
    console.error(
      'No linkedin-export.txt and no --headline/--about provided. ' +
        'Save your LinkedIn About section to ' +
        candidatePath +
        ' or pipe via stdin.',
    );
    process.exit(3);
  }
}

// Heuristic — first non-empty line is the headline; rest is About.
const lines = exportText
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);
const headline = lines[0] ?? '';
const about = lines.slice(1).join(' ');

// ── Target archetype keywords (per archetype) ──────────────────────
// Trimmed expert-knowledge buckets. These are the words recruiters
// actually type into LinkedIn's Recruiter search. Add to your
// profile.yml.archetypes to extend.
const ARCHETYPE_KEYWORDS = {
  backend: [
    'backend',
    'distributed systems',
    'microservices',
    'api',
    'postgres',
    'redis',
    'kafka',
    'event-driven',
    'scalability',
    'high-throughput',
    'sre',
    'observability',
    'go',
    'rust',
    'python',
    'java',
  ],
  frontend: [
    'frontend',
    'react',
    'typescript',
    'design system',
    'accessibility',
    'a11y',
    'vue',
    'svelte',
    'performance',
    'ux',
    'component library',
    'figma',
    'tailwind',
  ],
  'full-stack': [
    'full-stack',
    'fullstack',
    'frontend',
    'backend',
    'typescript',
    'react',
    'node',
    'postgres',
    'api',
    'end-to-end',
  ],
  platform: [
    'platform',
    'infrastructure',
    'kubernetes',
    'terraform',
    'aws',
    'gcp',
    'azure',
    'devops',
    'sre',
    'ci/cd',
    'observability',
    'reliability',
  ],
  data: [
    'data engineering',
    'etl',
    'elt',
    'dbt',
    'snowflake',
    'bigquery',
    'redshift',
    'spark',
    'airflow',
    'warehouse',
    'pipeline',
    'sql',
    'analytics engineering',
  ],
  ml: [
    'machine learning',
    'ml',
    'llm',
    'rag',
    'transformer',
    'embeddings',
    'fine-tuning',
    'prompt engineering',
    'genai',
    'generative ai',
    'vector database',
    'semantic search',
    'agents',
  ],
  security: [
    'security',
    'appsec',
    'pentest',
    'threat modeling',
    'soc2',
    'iso27001',
    'vulnerability',
    'iam',
    'identity',
    'oauth',
    'zero trust',
    'encryption',
  ],
  mobile: [
    'mobile',
    'ios',
    'android',
    'swift',
    'kotlin',
    'react native',
    'flutter',
    'app store',
    'push notifications',
    'offline-first',
  ],
  product: [
    'product manager',
    'product',
    'roadmap',
    'strategy',
    'okrs',
    'prioritization',
    'discovery',
    'user research',
    'product-led',
    'growth',
    'metrics',
  ],
  design: [
    'design',
    'ui',
    'ux',
    'design system',
    'figma',
    'prototyping',
    'user research',
    'accessibility',
    'interaction design',
  ],
  leadership: [
    'engineering manager',
    'director of engineering',
    'head of engineering',
    'vp engineering',
    'staff engineer',
    'principal engineer',
    'tech lead',
    'team lead',
    'mentoring',
    'hiring',
    'people management',
    'strategy',
  ],
};

function bestArchetypeMatch(archetypeList) {
  if (!archetypeList || archetypeList.length === 0) return ['backend'];
  const out = new Set();
  for (const a of archetypeList) {
    const lower = a.toLowerCase();
    for (const key of Object.keys(ARCHETYPE_KEYWORDS)) {
      if (lower.includes(key)) out.add(key);
    }
  }
  return out.size ? [...out] : ['backend'];
}

const archetypeKeys = bestArchetypeMatch(profile.archetypes);
const targetKeywords = new Set();
for (const k of archetypeKeys) for (const kw of ARCHETYPE_KEYWORDS[k]) targetKeywords.add(kw);
const TOP_KEYWORDS = [...targetKeywords].slice(0, 12);

const checks = [];
function add(name, score, evidence) {
  checks.push({ name, score, evidence });
}

// 1. Headline test
const lowerHeadline = headline.toLowerCase();
const headlineHits = TOP_KEYWORDS.filter((k) => lowerHeadline.includes(k.toLowerCase()));
const headlineScore =
  headlineHits.length >= 3
    ? 100
    : headlineHits.length === 2
      ? 70
      : headlineHits.length === 1
        ? 40
        : 0;
add(
  'headline',
  headlineScore,
  headlineHits.length +
    ' target-keyword matches in headline · ' +
    (headlineHits.join(', ') || 'NONE'),
);

// 2. About-section density
const lowerAbout = about.toLowerCase();
const aboutHits = TOP_KEYWORDS.filter((k) => lowerAbout.includes(k.toLowerCase()));
const aboutScore = Math.min(
  100,
  Math.round((aboutHits.length / Math.max(8, TOP_KEYWORDS.length / 1.5)) * 100),
);
add(
  'about-density',
  aboutScore,
  aboutHits.length + '/' + TOP_KEYWORDS.length + ' keywords present in About',
);

// 3. Headline length (LinkedIn shows ~120 chars in search results)
const headlineLengthScore =
  headline.length === 0
    ? 0
    : headline.length < 30
      ? 30
      : headline.length < 80
        ? 60
        : headline.length < 220
          ? 100
          : 70;
add(
  'headline-length',
  headlineLengthScore,
  headline.length + ' chars (LinkedIn shows ~120, max 220)',
);

// 4. Generic-words penalty — "passionate", "results-driven", "team player"
const genericRe =
  /\b(passionate|results[- ]driven|team player|seasoned|self[- ]starter|go[- ]getter|hard[- ]working|hardworking|detail[- ]oriented|out[- ]of[- ]the[- ]box|leveraging|leverages|leverage)\b/gi;
const genericHits = ((headline + ' ' + about).match(genericRe) || []).length;
const genericScore = genericHits === 0 ? 100 : genericHits === 1 ? 70 : genericHits === 2 ? 40 : 10;
add(
  'generic-words',
  genericScore,
  genericHits + ' generic clichés (passionate / results-driven / etc.)',
);

// 5. Specific-numbers signal — "scaled to 1M users", "$5M ARR" → high score
const numericRe =
  /(\$[\d,.]+[mk]?|\d+%|\d+(?:,\d{3})+|\d+\s*(?:million|billion|users|customers|engineers|reports))/gi;
const numericHits = (about.match(numericRe) || []).length;
const numericScore = numericHits >= 4 ? 100 : numericHits >= 2 ? 70 : numericHits >= 1 ? 40 : 0;
add('numeric-signal', numericScore, numericHits + ' quantified achievements in About');

// 6. URL presence — portfolio / github / personal site linked
const hasUrl = /https?:\/\/[^\s]+/.test(headline + ' ' + about);
const urlScore = hasUrl ? 100 : 30;
add(
  'linked-presence',
  urlScore,
  hasUrl ? 'External URL linked (portfolio / github)' : 'No external URL — recruiters drop off',
);

// Composite ─────────────────────────────────────────────────────────
const composite = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);

const result = {
  composite,
  checks,
  headlineLength: headline.length,
  archetypeKeysApplied: archetypeKeys,
  topKeywords: TOP_KEYWORDS,
  matchedInHeadline: headlineHits,
  matchedInAbout: aboutHits,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(composite >= 60 ? 0 : 1);
}

console.log();
console.log(
  B +
    'Profile SEO Report' +
    N +
    '  ' +
    DIM +
    (archetypeKeys.join(', ') || 'backend') +
    ' archetype' +
    N,
);
console.log();
console.log(DIM + 'Headline:' + N + ' ' + (headline.slice(0, 100) || '(empty)'));
console.log();
for (const c of checks) {
  const tag = c.score >= 70 ? G + '✓' + N : c.score >= 40 ? Y + '↑' + N : R + '↓' + N;
  console.log('  ' + tag + ' ' + c.name + '  ' + DIM + c.evidence + N + '  → ' + c.score + '/100');
}
console.log();
const color = composite >= 70 ? G : composite >= 50 ? Y : R;
const flag =
  composite >= 70
    ? '🟢 Strong recruiter SEO'
    : composite >= 50
      ? '🟡 Mid-tier — fix the red items'
      : '🔴 Low recruiter visibility';
console.log(B + 'Composite SEO Score' + N + '  ' + color + composite + '/100' + N + '  ' + flag);
process.exit(composite >= 60 ? 0 : 1);
