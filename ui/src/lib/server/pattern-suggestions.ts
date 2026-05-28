/** pattern-suggestions -- turn analyze-patterns.mjs textual output into
 *  structured, one-click-applyable suggestions. The analyzer emits
 *  recommendations: [{ action, reasoning, impact }] but doesn't say WHERE
 *  to apply them; we (1) spawn it in JSON mode, (2) map each rec to
 *  { targetFile, op, payload }, (3) expose applySuggestion(s) that mutate
 *  portals.yml / _profile.md. Every mutation writes <file>.bak first
 *  (same convention as resetProfile) so the user can revert with `mv`. */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { ROOT } from './files';
import { profilePath } from './profile-paths';
import { logEvent, reportServerError } from './events';

export type PatternRecommendation = {
  action: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
};

export type PatternAnalysis = {
  metadata?: { total?: number };
  recommendations?: PatternRecommendation[];
  blockerAnalysis?: Array<{ blocker: string; frequency: number; percentage: number }>;
  techStackGaps?: Array<{ skill: string; frequency: number }>;
  scoreThreshold?: { recommended: number; reasoning: string };
  error?: string;
};

export type StructuredSuggestion = {
  id: string;
  action: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
  /** What to change. */
  op:
    | 'portals-add-negative-keyword'
    | 'portals-set-location-filter'
    | 'profile-set-min-score'
    | 'profile-flag-archetype-strong'
    | 'profile-flag-archetype-weak'
    | 'manual';
  /** Free-form payload -- meaning depends on op. */
  payload?: {
    keyword?: string;
    keywords?: string[];
    locationFilter?: string;
    minScore?: number;
    archetype?: string;
    conversionRate?: number;
  };
  /** Files this suggestion will modify (for the confirm dialog). */
  targetFiles?: string[];
};

function spawnAnalyzer(): PatternAnalysis | null {
  const r = spawnSync('node', ['scripts/tracker/analyze-patterns.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (r.status !== 0) {
    return null;
  }
  try {
    return JSON.parse(r.stdout) as PatternAnalysis;
  } catch {
    return null;
  }
}

/** Run the analyzer + map textual recs to structured ones. */
export function listSuggestions(profileId?: string): {
  analysis: PatternAnalysis | null;
  suggestions: StructuredSuggestion[];
} {
  const analysis = spawnAnalyzer();
  if (!analysis || analysis.error) {
    return { analysis, suggestions: [] };
  }
  const recs = analysis.recommendations ?? [];
  const suggestions: StructuredSuggestion[] = [];

  recs.forEach((rec, idx) => {
    const id = `sug-${idx}-${Date.now()}`;
    // Geo-restriction → add US-only / region-restricted keywords to portals.yml.negative
    if (/geo-?restriction|tighten location/i.test(rec.action)) {
      suggestions.push({
        id,
        action: rec.action,
        reasoning: rec.reasoning,
        impact: rec.impact,
        op: 'portals-add-negative-keyword',
        payload: {
          keywords: [
            'US only',
            'US-only',
            'United States only',
            'US citizen',
            'US residency',
            'no visa',
          ],
        },
        targetFiles: [profileFilePath(profileId, 'portals')],
      });
      return;
    }
    // Stack-gap → add the specific tech as a negative keyword
    const stackMatch = /Filter out roles requiring (.+?) as primary/i.exec(rec.action);
    if (stackMatch) {
      const techs = stackMatch[1].split(/,\s*/).filter(Boolean);
      suggestions.push({
        id,
        action: rec.action,
        reasoning: rec.reasoning,
        impact: rec.impact,
        op: 'portals-add-negative-keyword',
        payload: { keywords: techs.map((t) => t.trim()) },
        targetFiles: [profileFilePath(profileId, 'portals')],
      });
      return;
    }
    // Score threshold → set profile.yml.automation.min_score_to_apply
    const scoreMatch = /minimum score threshold at (\d+\.?\d*)/i.exec(rec.action);
    if (scoreMatch) {
      const minScore = parseFloat(scoreMatch[1]);
      suggestions.push({
        id,
        action: rec.action,
        reasoning: rec.reasoning,
        impact: rec.impact,
        op: 'profile-set-min-score',
        payload: { minScore },
        targetFiles: [profileFilePath(profileId, 'profile-yml')],
      });
      return;
    }
    // Archetype "double down" → annotate _profile.md or just leave manual
    const archStrongMatch = /Double down on "(.+?)" roles \((\d+)% conversion/i.exec(rec.action);
    if (archStrongMatch) {
      suggestions.push({
        id,
        action: rec.action,
        reasoning: rec.reasoning,
        impact: rec.impact,
        op: 'profile-flag-archetype-strong',
        payload: {
          archetype: archStrongMatch[1],
          conversionRate: parseInt(archStrongMatch[2], 10),
        },
        targetFiles: [profileFilePath(profileId, 'profile-md')],
      });
      return;
    }
    const archWeakMatch = /Avoid "(.+?)" roles/i.exec(rec.action);
    if (archWeakMatch) {
      suggestions.push({
        id,
        action: rec.action,
        reasoning: rec.reasoning,
        impact: rec.impact,
        op: 'profile-flag-archetype-weak',
        payload: { archetype: archWeakMatch[1] },
        targetFiles: [profileFilePath(profileId, 'profile-md')],
      });
      return;
    }
    // Fallback: surface as manual (user reads + decides)
    suggestions.push({
      id,
      action: rec.action,
      reasoning: rec.reasoning,
      impact: rec.impact,
      op: 'manual',
    });
  });

  return { analysis, suggestions };
}

/** Apply a suggestion. Always writes `<file>.bak` before mutating so the
 *  user can revert manually. Returns a summary of what changed. */
export function applySuggestion(
  s: StructuredSuggestion,
  profileId?: string,
): { ok: boolean; summary?: string; error?: string; changedFiles?: string[] } {
  try {
    switch (s.op) {
      case 'portals-add-negative-keyword': {
        const keywords = s.payload?.keywords ?? [];
        if (keywords.length === 0) {
          return { ok: false, error: 'No keywords in payload' };
        }
        const portalsPath = profileFilePath(profileId, 'portals');
        // CodeQL js/file-system-race: read directly and treat ENOENT as
        // empty rather than racing existsSync against the read.
        let before = '';
        try {
          before = fs.readFileSync(portalsPath, 'utf8');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw e;
          }
        }
        if (!before) {
          return { ok: false, error: 'portals.yml not found at ' + portalsPath };
        }
        const parsed = (yamlParse(before) as Record<string, unknown>) ?? {};
        const tf = (parsed.title_filter as Record<string, unknown>) ?? {};
        const negative = Array.isArray(tf.negative) ? (tf.negative as string[]) : [];
        const added: string[] = [];
        for (const k of keywords) {
          if (!negative.includes(k)) {
            negative.push(k);
            added.push(k);
          }
        }
        tf.negative = negative;
        parsed.title_filter = tf;
        // Backup + write
        fs.writeFileSync(`${portalsPath}.bak`, before);
        fs.writeFileSync(portalsPath, yamlStringify(parsed));
        return {
          ok: true,
          summary: `Added ${added.length} negative keyword(s): ${added.join(', ')}`,
          changedFiles: [path.relative(ROOT, portalsPath)],
        };
      }

      case 'profile-set-min-score': {
        const minScore = s.payload?.minScore;
        if (typeof minScore !== 'number') {
          return { ok: false, error: 'No minScore in payload' };
        }
        const profilePath_ = profileFilePath(profileId, 'profile-yml');
        // CodeQL js/file-system-race: read directly and treat ENOENT as
        // empty rather than racing existsSync against the read.
        let before = '';
        try {
          before = fs.readFileSync(profilePath_, 'utf8');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw e;
          }
        }
        if (!before) {
          return { ok: false, error: 'profile.yml not found' };
        }
        const parsed = (yamlParse(before) as Record<string, unknown>) ?? {};
        const automation = (parsed.automation as Record<string, unknown>) ?? {};
        const previousMin = automation.min_score_to_apply;
        automation.min_score_to_apply = minScore;
        parsed.automation = automation;
        fs.writeFileSync(`${profilePath_}.bak`, before);
        fs.writeFileSync(profilePath_, yamlStringify(parsed));
        return {
          ok: true,
          summary: `min_score_to_apply: ${previousMin ?? '(unset)'} → ${minScore}`,
          changedFiles: [path.relative(ROOT, profilePath_)],
        };
      }

      case 'profile-flag-archetype-strong':
      case 'profile-flag-archetype-weak': {
        const archetype = s.payload?.archetype;
        if (!archetype) {
          return { ok: false, error: 'No archetype in payload' };
        }
        const target = profileFilePath(profileId, 'profile-md');
        // CodeQL js/file-system-race: read directly and treat ENOENT as
        // empty rather than racing existsSync against the read.
        let before = '';
        try {
          before = fs.readFileSync(target, 'utf8');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw e;
          }
        }
        const isStrong = s.op === 'profile-flag-archetype-strong';
        const tag = isStrong ? 'STRONG-FIT' : 'AVOID';
        const note = `<!-- Pattern-analyzer ${new Date().toISOString().slice(0, 10)}: [${tag}] "${
          archetype
        }"${
          s.payload?.conversionRate != null ? ' (' + s.payload.conversionRate + '% conversion)' : ''
        } — ${s.reasoning} -->`;
        const after = `${before + (before.endsWith('\n') ? '' : '\n')}\n${note}\n`;
        fs.writeFileSync(`${target}.bak`, before);
        fs.writeFileSync(target, after);
        return {
          ok: true,
          summary: `Annotated _profile.md with [${tag}] for "${archetype}"`,
          changedFiles: [path.relative(ROOT, target)],
        };
      }

      case 'manual':
        return { ok: false, error: 'Manual suggestion — apply by hand' };

      default:
        return { ok: false, error: `Unknown op: ${(s as { op: string }).op}` };
    }
  } catch (err) {
    reportServerError('pattern-suggestions', 'applySuggestion failed', err, { category: 'system' });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Resolve which per-profile file a kind targets. Falls back to repo-root
 *  legacy paths when no profileId is given. */
function profileFilePath(
  profileId: string | undefined,
  kind: 'portals' | 'profile-yml' | 'profile-md',
): string {
  if (profileId) {
    if (kind === 'portals') {
      return profilePath(profileId, 'portals-yml');
    }
    if (kind === 'profile-yml') {
      return profilePath(profileId, 'profile-yml');
    }
    if (kind === 'profile-md') {
      return profilePath(profileId, 'profile-md');
    }
  }
  // Legacy fallbacks at repo root.
  if (kind === 'portals') {
    return path.join(ROOT, 'portals.yml');
  }
  if (kind === 'profile-yml') {
    return path.join(ROOT, 'config', 'profile.yml');
  }
  if (kind === 'profile-md') {
    return path.join(ROOT, 'modes', '_profile.md');
  }
  return '';
}

// Used in logging when an apply succeeds.
export function logSuggestionApplied(s: StructuredSuggestion, summary: string): void {
  logEvent('pattern-suggestions', `Applied · ${s.op}`, {
    level: 'success',
    category: 'system',
    message: summary,
  });
}
