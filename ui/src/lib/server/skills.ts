/**
 * Parse the `modes/` directory into structured "skills" — each mode is a Claude Code
 * slash-command prompt. The Skills page renders them with descriptions, categories,
 * and full markdown bodies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readSafe } from './files';
import { CLI_NAMESPACE } from '$lib/config/branding';

const MODES_DIR = path.join(ROOT, 'modes');

export type SkillCategory =
  | 'evaluation'
  | 'application'
  | 'pipeline'
  | 'interview'
  | 'output'
  | 'system';

export type Skill = {
  id: string;            // 'oferta'
  name: string;          // 'oferta — Evaluación Completa A-G'
  title: string;         // 'oferta'
  subtitle: string;      // 'Evaluación Completa A-G'
  description: string;   // first non-heading paragraph
  category: SkillCategory;
  emoji: string;
  /** Heuristic language inferred from the text body. */
  language: 'en' | 'es' | 'mixed';
  /** Concrete on-disk language directory: 'en' for top-level modes, otherwise
   *  the two-letter subdir code ('de', 'fr', 'ja', 'pt', 'ru', 'es'). */
  lang: 'en' | 'de' | 'fr' | 'ja' | 'pt' | 'ru' | 'es';
  invocation: string;    // '/career-ops oferta'
  /** When relevant: list of inputs the user provides (parsed from the body) */
  inputs?: string[];
  /** path on disk so we can read full body on demand */
  filePath: string;
  bytes: number;
};

const CATEGORY: Record<string, SkillCategory> = {
  oferta: 'evaluation',
  ofertas: 'evaluation',
  deep: 'evaluation',
  project: 'evaluation',
  training: 'evaluation',
  patterns: 'evaluation',
  followup: 'evaluation',

  apply: 'application',
  contacto: 'application',
  'cover-letter': 'application',
  'form-answers': 'application',
  'post-rejection': 'application',
  negotiation: 'application',

  scan: 'pipeline',
  pipeline: 'pipeline',
  batch: 'pipeline',
  tracker: 'pipeline',
  'auto-pipeline': 'pipeline',

  'interview-prep': 'interview',
  'mock-interview': 'interview',
  'mock-interview-turn': 'interview',
  'interview-retro': 'interview',
  'pre-call-dossier': 'interview',
  'reference-prep': 'interview',
  'drill-feedback': 'interview',
  'linkedin-audit': 'application',
  'seed-story-bank': 'interview',
  'tech-prep': 'interview',
  'seed-form-answers': 'application',

  pdf: 'output',
  latex: 'output',

  _profile: 'system',
  _shared: 'system',
  '_profile.template': 'system',
  // Localized modes use parallel ids — surfaces them with the right category
  // even though they live under modes/{lang}/.
  angebot: 'evaluation',     // de: Stellenangebot
  offre: 'evaluation',       // fr: offre d'emploi
  kyujin: 'evaluation',      // ja: 求人
  bewerben: 'application',   // de: bewerben
  postuler: 'application',   // fr: postuler
  oubo: 'application',       // ja: 応募
};

const EMOJI: Record<string, string> = {
  oferta: '🎯', ofertas: '⚖️', deep: '🔍', project: '🧪', training: '📚',
  patterns: '📈', followup: '📨',
  apply: '✉️', contacto: '🤝', 'cover-letter': '✉️', 'form-answers': '📝',
  'post-rejection': '↩️', negotiation: '💬',
  scan: '🔭', pipeline: '🔁', batch: '📦', tracker: '📋', 'auto-pipeline': '⚡',
  'reference-prep': '👥', 'drill-feedback': '💻', 'linkedin-audit': '🔍', 'interview-prep': '🎤', 'mock-interview': '🎭', 'mock-interview-turn': '🗣️', 'interview-retro': '📝', 'pre-call-dossier': '📂', 'seed-story-bank': '🌱', 'tech-prep': '🧪', 'seed-form-answers': '📋',
  pdf: '📄', latex: '📐',
  _profile: '🪪', _shared: '🧩', '_profile.template': '🪪',
  angebot: '🎯', offre: '🎯', kyujin: '🎯',
  bewerben: '✉️', postuler: '✉️', oubo: '✉️',
};

function inferCategory(id: string): SkillCategory {
  return CATEGORY[id] ?? 'pipeline';
}

function parseHeader(text: string): { title: string; subtitle: string } {
  const firstHeading = text.split('\n').find((l) => l.startsWith('# ')) ?? '';
  const cleaned = firstHeading.replace(/^# /, '').trim();
  // Match "Modo: X — Y" or "Mode: X -- Y" or "Mode: X — Y"
  const m =
    cleaned.match(/^(?:Modo|Mode):\s*([^—–\-]+?)\s*[—–\-]{1,2}\s*(.+)$/i) ??
    cleaned.match(/^([a-z\-]+)\s*[—–\-]{1,2}\s*(.+)$/i);
  if (m) return { title: m[1].trim(), subtitle: m[2].trim() };
  return { title: cleaned, subtitle: '' };
}

function parseDescription(text: string): string {
  // First non-empty paragraph that isn't a heading or list/blockquote
  const lines = text.split('\n');
  let started = false;
  let buf: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!started) {
      if (line.startsWith('# ')) { started = true; }
      continue;
    }
    if (line === '') {
      if (buf.length > 0) break;
      continue;
    }
    if (/^[#>\-*|]/.test(line) || line.startsWith('```')) {
      if (buf.length > 0) break;
      continue;
    }
    buf.push(line);
  }
  const para = buf.join(' ').trim();
  return para.length > 220 ? para.slice(0, 217) + '…' : para;
}

function parseInputs(text: string): string[] {
  // Look for '## Inputs' or '## Inputs needed' sections, take following bulleted lines
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => /^##\s*(Inputs|Inputs needed)/i.test(l));
  if (idx === -1) return [];
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length && out.length < 6; i++) {
    const line = lines[i].trim();
    if (line.startsWith('##')) break;
    const m = line.match(/^[\d]+\.\s+\*\*(.+?)\*\*/) ??
              line.match(/^[\d]+\.\s+(.+?)$/) ??
              line.match(/^-\s+\*\*(.+?)\*\*/) ??
              line.match(/^-\s+(.+?)$/);
    if (m) {
      const v = m[1].replace(/`([^`]+)`/g, '$1').trim();
      // Skip excessively long inputs (full sentences)
      if (v.length > 0 && v.length < 80) out.push(v);
    }
  }
  return out;
}

function detectLanguage(text: string): 'en' | 'es' | 'mixed' {
  // Simple heuristic
  const sample = text.slice(0, 1500).toLowerCase();
  const esWords = (sample.match(/\b(modo|para|cuando|qué|cómo|usuario|empresa|paso|sección)\b/g) ?? []).length;
  const enWords = (sample.match(/\b(mode|when|user|company|step|section|inputs|outputs|run)\b/g) ?? []).length;
  if (esWords > enWords + 2) return 'es';
  if (enWords > esWords + 2) return 'en';
  return 'mixed';
}

/** Set of valid two-letter language subdir codes. Recursion is exactly one
 *  level deep so the skills catalog stays scannable. */
const LANG_SUBDIRS = new Set(['de', 'fr', 'ja', 'pt', 'ru', 'es']);

/**
 * List every `*.md` mode discoverable in modes/ — both top-level (English)
 * and one-level language subdirs (modes/de/, modes/fr/, etc.). Skill ids
 * use a `<lang>:<id>` prefix for localized entries (e.g. `de:angebot`) so
 * they don't collide with the English file. The `/skills` page filters
 * + groups by `lang` so the user can browse one language at a time.
 */
export function listSkills(includeSystem = false): Skill[] {
  const skills: Skill[] = [];

  const consumeFile = (
    f: string,
    dirAbs: string,
    lang: Skill['lang'],
    idPrefix: string,
  ) => {
    const id = idPrefix + f.replace(/\.md$/, '');
    // Don't carry the prefix into category lookup — `de:angebot` should look
    // up `angebot` in CATEGORY.
    const lookupId = id.includes(':') ? id.split(':', 2)[1] : id;
    const category = inferCategory(lookupId);
    if (!includeSystem && category === 'system') return;
    const filePath = path.join(dirAbs, f);
    let stat;
    try { stat = fs.statSync(filePath); } catch { return; }
    const text = readSafe(filePath);
    const { title, subtitle } = parseHeader(text);
    const description = parseDescription(text);
    const inputs = parseInputs(text);
    skills.push({
      id,
      name: subtitle ? title + ' — ' + subtitle : title,
      title: title || lookupId,
      subtitle,
      description,
      category,
      emoji: EMOJI[lookupId] ?? '🛠',
      language: detectLanguage(text),
      lang,
      invocation: '/' + CLI_NAMESPACE + ' ' + lookupId,
      inputs: inputs.length > 0 ? inputs : undefined,
      filePath,
      bytes: stat.size,
    });
  };

  // Top-level English modes.
  try {
    for (const f of fs.readdirSync(MODES_DIR).sort()) {
      const full = path.join(MODES_DIR, f);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isFile() && f.endsWith('.md')) {
        consumeFile(f, MODES_DIR, 'en', '');
      } else if (stat.isDirectory() && LANG_SUBDIRS.has(f)) {
        // One-level recursion into modes/<lang>/.
        try {
          for (const lf of fs.readdirSync(full).sort()) {
            if (!lf.endsWith('.md')) continue;
            consumeFile(lf, full, f as Skill['lang'], f + ':');
          }
        } catch { /* unreadable lang dir — skip */ }
      }
    }
  } catch {
    return [];
  }
  return skills;
}

export function readSkillBody(id: string): string | null {
  // Support `<lang>:<id>` prefix for localized skills.
  let lang: string | null = null;
  let bareId = id;
  const colon = id.indexOf(':');
  if (colon >= 0) {
    lang = id.slice(0, colon);
    bareId = id.slice(colon + 1);
    if (!LANG_SUBDIRS.has(lang)) return null;
  }
  // Sanitize. Reject path-traversal and stray punctuation.
  const safe = bareId.replace(/[^a-zA-Z0-9_\-.]/g, '');
  if (safe !== bareId) return null;
  const dir = lang ? path.join(MODES_DIR, lang) : MODES_DIR;
  const filePath = path.join(dir, bareId + '.md');
  if (!fs.existsSync(filePath)) return null;
  return readSafe(filePath);
}
