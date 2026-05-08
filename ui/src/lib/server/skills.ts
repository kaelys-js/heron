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
  language: 'en' | 'es' | 'mixed';
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
  'post-rejection': 'application',
  negotiation: 'application',

  scan: 'pipeline',
  pipeline: 'pipeline',
  batch: 'pipeline',
  tracker: 'pipeline',
  'auto-pipeline': 'pipeline',

  'interview-prep': 'interview',
  'mock-interview': 'interview',

  pdf: 'output',
  latex: 'output',

  _profile: 'system',
  _shared: 'system',
  '_profile.template': 'system',
};

const EMOJI: Record<string, string> = {
  oferta: '🎯', ofertas: '⚖️', deep: '🔍', project: '🧪', training: '📚',
  patterns: '📈', followup: '📨',
  apply: '✉️', contacto: '🤝', 'post-rejection': '↩️', negotiation: '💬',
  scan: '🔭', pipeline: '🔁', batch: '📦', tracker: '📋', 'auto-pipeline': '⚡',
  'interview-prep': '🎤', 'mock-interview': '🎭',
  pdf: '📄', latex: '📐',
  _profile: '🪪', _shared: '🧩', '_profile.template': '🪪',
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

export function listSkills(includeSystem = false): Skill[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(MODES_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort();
  } catch { return []; }

  const skills: Skill[] = [];
  for (const f of files) {
    const id = f.replace(/\.md$/, '');
    const category = inferCategory(id);
    if (!includeSystem && category === 'system') continue;
    const filePath = path.join(MODES_DIR, f);
    let stat;
    try { stat = fs.statSync(filePath); } catch { continue; }
    const text = readSafe(filePath);
    const { title, subtitle } = parseHeader(text);
    const description = parseDescription(text);
    const inputs = parseInputs(text);
    skills.push({
      id,
      name: subtitle ? title + ' — ' + subtitle : title,
      title: title || id,
      subtitle,
      description,
      category,
      emoji: EMOJI[id] ?? '🛠',
      language: detectLanguage(text),
      invocation: '/' + CLI_NAMESPACE + ' ' + id,
      inputs: inputs.length > 0 ? inputs : undefined,
      filePath,
      bytes: stat.size,
    });
  }
  return skills;
}

export function readSkillBody(id: string): string | null {
  const safe = id.replace(/[^a-zA-Z0-9_\-.]/g, '');
  if (safe !== id) return null;
  const filePath = path.join(MODES_DIR, id + '.md');
  if (!fs.existsSync(filePath)) return null;
  return readSafe(filePath);
}
