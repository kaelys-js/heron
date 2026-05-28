/** linkedin-audit -- turn the raw scraper snapshot into a remediation
 *  report. linkedin-audit.py dumps { profile, experience, skills,
 *  recommendations, featured, activity, openToWork, visibility, security,
 *  errors }; we classify each gap into a Finding with severity (error /
 *  warn / info), category (profile / account / activity), and either a
 *  paste-ready string or a "Settings → X → Y" path for manual toggles.
 *  Persisted so the UX can show progress as the user works through it. */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';
import { getActiveProfileId } from './profiles';
import { readProfile } from './profile';

export type AuditSeverity = 'error' | 'warn' | 'info';
export type FindingCategory = 'profile' | 'account' | 'activity' | 'security';

export type AuditFinding = {
  /** Stable machine id -- e.g. 'no-photo', 'stale-activity', 'no-2fa'. */
  kind: string;
  severity: AuditSeverity;
  category: FindingCategory;
  /** Short user-facing label. */
  title: string;
  /** Longer detail / why it matters. */
  detail: string;
  /** When the fix is a text edit (headline, About, etc.), this is the
   *  paste-ready replacement. The UI shows a copy button. */
  paste?: string;
  /** When the fix is a settings flip, this is the path the user follows. */
  settingsPath?: string;
  /** Set when the user marks the finding as resolved. */
  resolvedAt?: number;
};

export type LinkedInAuditReport = {
  auditedAt: number;
  /** Raw snapshot the Python scraper produced (for debugging + re-classification). */
  snapshot: Record<string, unknown>;
  findings: AuditFinding[];
  /** Overall grade: percentage of (non-resolved) findings cleared. */
  grade: number;
};

function reportPath(profileId?: string): string {
  return profilePath(profileId ?? getActiveProfileId(), 'linkedin-audit-json');
}

export function readAuditReport(profileId?: string): LinkedInAuditReport | null {
  const p = reportPath(profileId);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as LinkedInAuditReport;
  } catch {
    return null;
  }
}

export function writeAuditReport(report: LinkedInAuditReport, profileId?: string): void {
  const p = reportPath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(report, null, 2));
}

export function markFindingResolved(kind: string, profileId?: string): LinkedInAuditReport | null {
  const report = readAuditReport(profileId);
  if (!report) {
    return null;
  }
  for (const f of report.findings) {
    if (f.kind === kind) {
      f.resolvedAt = Date.now();
    }
  }
  report.grade = computeGrade(report.findings);
  writeAuditReport(report, profileId);
  return report;
}

function computeGrade(findings: AuditFinding[]): number {
  if (findings.length === 0) {
    return 100;
  }
  const open = findings.filter((f) => !f.resolvedAt).length;
  return Math.round(((findings.length - open) / findings.length) * 100);
}

/**
 * Classify the raw snapshot into Findings. Pure function over the
 * snapshot + the user's profile (for archetype-keyword expectations).
 */
export function classifySnapshot(
  snapshot: Record<string, unknown>,
  profileId?: string,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const profile = (() => {
    try {
      return readProfile(profileId ?? getActiveProfileId()) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const targeting = (profile.targeting as Record<string, unknown>) ?? {};
  const archetypes = ((targeting.archetypes as string[]) ?? []).map((a) => a.toLowerCase());
  const targetRoleTitle = (
    (targeting.role_title as string) ??
    (profile.role_title as string) ??
    ''
  ).toString();

  const p = (snapshot.profile as Record<string, unknown>) ?? {};
  const headline = ((p.headline as string) ?? '').trim();
  const about = ((p.about as string) ?? '').trim();
  const customSlug = ((p.customSlug as string) ?? '').trim();
  const hasPhoto = !!p.hasPhoto;
  const hasBanner = !!p.hasBanner;
  const name = ((p.name as string) ?? '').trim();

  const experience = (snapshot.experience as unknown[]) ?? [];
  const skills = (snapshot.skills as string[]) ?? [];
  const recs = (snapshot.recommendations as Record<string, number>) ?? { received: 0, given: 0 };
  const featured = (snapshot.featured as Record<string, number>) ?? { count: 0 };
  const activity = (snapshot.activity as Record<string, string>) ?? { lastActivityAgo: 'unknown' };
  const openToWork = (snapshot.openToWork as Record<string, boolean>) ?? {};
  const security = (snapshot.security as Record<string, unknown>) ?? {};

  // ── Profile findings ─────────────────────────────────────────────
  if (!hasPhoto) {
    findings.push({
      kind: 'no-photo',
      severity: 'error',
      category: 'profile',
      title: 'No profile photo',
      detail:
        'Profiles without a photo get 14x fewer views and 36x fewer messages from recruiters. ' +
        'Upload a clear, professional headshot (face visible, neutral background).',
      settingsPath: 'LinkedIn → Profile → Camera icon → Upload photo',
    });
  }
  if (!hasBanner) {
    findings.push({
      kind: 'no-banner',
      severity: 'warn',
      category: 'profile',
      title: 'No banner image',
      detail:
        'The default blue banner looks unfinished. Use a 1584x396 image relevant to your work — ' +
        'team you worked with, conference talk, product you shipped, or a clean abstract.',
      settingsPath: 'LinkedIn → Profile → Banner area → Pencil → Upload',
    });
  }
  if (!headline) {
    findings.push({
      kind: 'no-headline',
      severity: 'error',
      category: 'profile',
      title: 'Headline is empty',
      detail: 'The headline is the single biggest recruiter-search ranking signal.',
      settingsPath: 'LinkedIn → Profile → Edit intro → Headline',
    });
  } else if (headline.length < 30) {
    findings.push({
      kind: 'thin-headline',
      severity: 'warn',
      category: 'profile',
      title: `Headline is too short (${headline.length} chars)`,
      detail:
        'Generic short headlines lose visibility. Aim for 100-180 characters with role + 2-3 ' +
        'specific keywords + value proposition.',
    });
  } else if (
    /^(software engineer|engineer|developer|consultant|product manager|designer|manager)\s+(at|@)\s+/i.test(
      headline,
    )
  ) {
    findings.push({
      kind: 'generic-headline',
      severity: 'warn',
      category: 'profile',
      title: 'Headline reads "Title at Company"',
      detail:
        'This format wastes the most-searched field. Replace with: "{Specific role} | {Top skill} + ' +
        '{Top skill} | {What you actually do that matters}".',
    });
  }
  if (!about) {
    findings.push({
      kind: 'no-about',
      severity: 'error',
      category: 'profile',
      title: 'About section is empty',
      detail:
        'About is the 2nd-most-read field after the headline. Recruiters use it to validate the ' +
        'headline. A blank About loses ~30% of inbound.',
      settingsPath: 'LinkedIn → Profile → Add profile section → About',
    });
  } else if (about.length < 250) {
    findings.push({
      kind: 'thin-about',
      severity: 'warn',
      category: 'profile',
      title: `About is too short (${about.length} chars)`,
      detail:
        'Aim for 1000-2000 characters. Structure: opening hook (1-2 sentences) + 3-4 proof points ' +
        '(numbers, scope) + what you’re looking for next + a clear CTA (email or DM).',
    });
  } else if (about.length > 0) {
    // Check for generic words
    const generic =
      /\b(passionate|results[- ]driven|team player|seasoned|self[- ]starter|hard[- ]working|detail[- ]oriented|leveraging)\b/gi;
    const hits = (about.match(generic) || []).length;
    if (hits >= 2) {
      findings.push({
        kind: 'generic-about',
        severity: 'warn',
        category: 'profile',
        title: `About uses ${hits} generic clichés`,
        detail:
          'Words like "passionate", "results-driven", "team player" make recruiters skim past. ' +
          'Replace with specific verbs + numbers.',
      });
    }
  }
  if (customSlug && /^[a-f0-9]{8,}$/i.test(customSlug)) {
    findings.push({
      kind: 'random-slug',
      severity: 'warn',
      category: 'profile',
      title: 'Custom URL is a random hash',
      detail:
        'Recruiters share LinkedIn URLs internally and remember "linkedin.com/in/jane-doe" ' +
        'much better than "linkedin.com/in/jane-doe-7a3f9b1".',
      settingsPath: 'LinkedIn → Profile → Edit public profile & URL → Edit URL',
      paste: `/in/${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`,
    });
  }

  // ── Experience ───────────────────────────────────────────────────
  if (experience.length === 0) {
    findings.push({
      kind: 'no-experience',
      severity: 'error',
      category: 'profile',
      title: 'No experience entries',
      detail: 'Empty experience section means LinkedIn cannot rank you for ANY role search.',
    });
  } else if (experience.length === 1) {
    findings.push({
      kind: 'thin-experience',
      severity: 'warn',
      category: 'profile',
      title: 'Only 1 experience entry visible',
      detail:
        'Even early-career profiles benefit from showing internships + side roles. Add prior ' +
        'roles + open-source / consulting work.',
    });
  }

  // ── Skills ───────────────────────────────────────────────────────
  if (skills.length < 5) {
    findings.push({
      kind: 'thin-skills',
      severity: 'error',
      category: 'profile',
      title: `Only ${skills.length} skill(s) listed`,
      detail:
        'LinkedIn ranks profiles partly by skill match. Aim for 25-50 skills. Top 3 pin to your ' +
        'archetype; others fill out the long tail.',
      settingsPath: 'LinkedIn → Profile → Add profile section → Skills',
    });
  } else if (skills.length < 15) {
    findings.push({
      kind: 'sparse-skills',
      severity: 'warn',
      category: 'profile',
      title: `Sparse skills list (${skills.length})`,
      detail: 'Add 10-15 more skills to maximise search ranking + skill-endorsement loops.',
    });
  }
  // Archetype-relevant skill coverage
  if (skills.length > 0 && archetypes.length > 0) {
    const skillsLower = skills.map((s) => s.toLowerCase());
    const archetypeSignals: Record<string, string[]> = {
      backend: ['distributed systems', 'microservices', 'api', 'kubernetes', 'sre'],
      frontend: ['react', 'typescript', 'design systems', 'accessibility'],
      'full-stack': ['typescript', 'react', 'node.js', 'postgresql'],
      platform: ['kubernetes', 'terraform', 'aws', 'ci/cd', 'observability'],
      data: ['dbt', 'snowflake', 'bigquery', 'airflow', 'spark'],
      ml: ['machine learning', 'llm', 'pytorch', 'transformers'],
      product: ['product management', 'roadmap', 'okrs', 'user research'],
      design: ['figma', 'design systems', 'prototyping'],
      leadership: ['engineering management', 'team leadership', 'strategy'],
    };
    const targetSignals = new Set<string>();
    for (const a of archetypes) {
      for (const key of Object.keys(archetypeSignals)) {
        if (a.includes(key)) {
          for (const s of archetypeSignals[key]) targetSignals.add(s);
        }
      }
    }
    const missing = [...targetSignals].filter(
      (sig) => !skillsLower.some((s) => s.includes(sig.toLowerCase())),
    );
    if (missing.length >= 3) {
      findings.push({
        kind: 'archetype-skill-gap',
        severity: 'warn',
        category: 'profile',
        title: `Missing ${missing.length} archetype-critical skills`,
        detail: `For your target archetypes (${archetypes.join(
          ', ',
        )}), recruiters search for these terms but they aren’t in your skills list: ${missing
          .slice(0, 6)
          .join(', ')}.`,
        paste: missing.slice(0, 6).join(', '),
      });
    }
  }

  // ── Recommendations ──────────────────────────────────────────────
  if (recs.received === 0) {
    findings.push({
      kind: 'no-recommendations',
      severity: 'warn',
      category: 'profile',
      title: 'No recommendations received',
      detail:
        'Even 2-3 recommendations from past managers / colleagues lift trust significantly. ' +
        'Pick 3 people who saw your best work + draft the ask.',
    });
  }

  // ── Featured section ─────────────────────────────────────────────
  if (featured.count === 0) {
    findings.push({
      kind: 'empty-featured',
      severity: 'info',
      category: 'profile',
      title: 'Featured section is empty',
      detail:
        'Pin 3-5 items: a published article, OSS repo, conference talk, case study, or shipped ' +
        'product. Adds visual depth + trust signals.',
      settingsPath: 'LinkedIn → Profile → Add profile section → Featured',
    });
  }

  // ── Activity ─────────────────────────────────────────────────────
  const last = (activity.lastActivityAgo || '').toLowerCase();
  if (!last || last === 'unknown' || last.includes('year') || /\d+\s*(month|months)/.test(last)) {
    const months = /(\d+)\s*month/.exec(last);
    if (last.includes('year') || (months && Number(months[1]) >= 3)) {
      findings.push({
        kind: 'stale-activity',
        severity: 'warn',
        category: 'activity',
        title: `Last activity: ${last || 'unknown'}`,
        detail:
          'LinkedIn down-ranks inactive profiles in recruiter search. Aim for 1+ post/comment ' +
          'per week. Topics aligned to your archetype work best.',
      });
    }
  }

  // ── Account toggles ──────────────────────────────────────────────
  if (openToWork.openToWork === false) {
    findings.push({
      kind: 'open-to-work-off',
      severity: 'info',
      category: 'account',
      title: '"Open to work" is OFF',
      detail:
        'If you’re actively searching, turning this on (to recruiters only) significantly ' +
        'boosts inbound. Public version is fine if your current employer knows you’re looking.',
      settingsPath: 'LinkedIn → Profile → Open to → Finding a new job',
    });
  }
  if (security.twoFactorOn === false) {
    findings.push({
      kind: 'no-2fa',
      severity: 'error',
      category: 'security',
      title: 'Two-factor verification is OFF',
      detail:
        'A compromised LinkedIn account is a real attack vector (recruiters spoofed, your contacts ' +
        'phished). Turn on 2FA via authenticator app today.',
      settingsPath: 'LinkedIn → Settings → Sign-in & security → Two-step verification',
    });
  }

  // Use targetRoleTitle if available to suggest a headline rewrite
  if (
    targetRoleTitle &&
    headline &&
    !headline.toLowerCase().includes(targetRoleTitle.toLowerCase().split(' ')[0])
  ) {
    findings.push({
      kind: 'headline-target-mismatch',
      severity: 'warn',
      category: 'profile',
      title: 'Headline doesn’t mention your target role',
      detail: `Recruiters search for "${
        targetRoleTitle
      }" but your headline doesn’t include that phrase. Add it so you appear in their results.`,
    });
  }

  return findings;
}
