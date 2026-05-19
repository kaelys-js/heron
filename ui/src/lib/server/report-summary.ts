/**
 * Parse a deep-evaluation report (English/Spanish/mixed Markdown) into structured fields
 * for the job detail page's Key Facts panel.
 *
 * The goal: surface everything a job-seeker actually wants to know at a glance —
 * comp, work mode, location, visa, BG risk, company stage, team, stack, gaps —
 * without forcing them to scan the full report.
 */

import type { BgRisk } from '$lib/types';

export type StrongMatch = { requirement: string; level: string; notes: string };
export type Gap = { requirement: string; level: string; notes: string };

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type ReportSummary = {
  score: number | null;
  archetype: string;
  bgRisk: BgRisk;
  bgNote: string;
  legitimacy: string;
  tldr: string;

  // Headline facts (rendered as a grid up top)
  salary: string;
  workMode: WorkMode;
  workModeRaw: string; // raw string from the report (used in tooltip)
  location: string; // explicit location field if present
  visa: string; // sponsorship / authorization summary

  // Company / role context
  domain: string;
  function: string;
  seniority: string;
  teamSize: string;
  companyStage: string; // "Series B", "Public", etc.

  // Stack / requirements (top 6)
  stack: string[];

  url: string;
  pdfNote: string;
  strongMatches: StrongMatch[];
  gaps: Gap[];
};

const EMPTY: ReportSummary = {
  score: null,
  archetype: '',
  bgRisk: undefined,
  bgNote: '',
  legitimacy: '',
  tldr: '',
  salary: '',
  workMode: 'unknown',
  workModeRaw: '',
  location: '',
  visa: '',
  domain: '',
  function: '',
  seniority: '',
  teamSize: '',
  companyStage: '',
  stack: [],
  url: '',
  pdfNote: '',
  strongMatches: [],
  gaps: [],
};

function takeFirst(text: string, ...patterns: RegExp[]): string {
  for (const r of patterns) {
    const m = text.match(r);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function parseScore(text: string): number | null {
  const m = text.match(/\*\*Score:\*\*\s*([\d.]+)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return isNaN(n) ? null : n;
}

function parseBg(text: string): { risk: BgRisk; note: string } {
  const m = text.match(/\*\*Background Check Risk:\*\*\s*([A-Z][A-Z ]+?)(?:\s*[—\-–]\s*(.+))?$/im);
  if (!m) return { risk: undefined, note: '' };
  const raw = m[1].trim().toUpperCase();
  const note = (m[2] ?? '').trim();
  if (raw === 'HARD STOP') return { risk: 'BLOCKED', note };
  if (['LOW', 'MEDIUM', 'HIGH', 'BLOCKED'].includes(raw)) return { risk: raw as BgRisk, note };
  return { risk: undefined, note };
}

/**
 * Pull all `| **Key** | Value |` rows from any A-block style table.
 * Returns a key→value map (lowercase keys, stripped of bold/code formatting).
 */
function parseKeyValueTable(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    // skip separator lines and headers
    if (/^\|\s*-+\s*\|/.test(line) || /[✅❌]/.test(line)) continue;
    const cells = line.split('|').map((c) => c.trim());
    // Need at least: empty, key, value, empty (= 4 cells from split with leading/trailing |)
    if (cells.length < 4) continue;
    const keyRaw = cells[1];
    const valueRaw = cells[2];
    if (!keyRaw || !valueRaw) continue;
    const key = keyRaw
      .replace(/\*\*/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .toLowerCase()
      .trim();
    if (!key || key.length > 40) continue;
    if (out[key]) continue; // first occurrence wins
    out[key] = valueRaw.replace(/`([^`]+)`/g, '$1').trim();
  }
  return out;
}

function classifyWorkMode(raw: string): WorkMode {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  // Negative signals first
  if (/\bon[\s-]?site\b|\bin[\s-]?office\b/.test(s)) return 'onsite';
  if (/\bhybrid\b|\d+\s*day(?:s)?\s*\/?\s*(?:per\s+)?week|\bhq\s*\d/.test(s)) return 'hybrid';
  if (
    /\bfully\s*remote\b|\bremote[\s-]?(first|friendly|ok)\b|\bremote\b\s*[-—:].*\b(yes|available|ok|friendly)\b/.test(
      s,
    )
  )
    return 'remote';
  if (/^yes\b|^remote\b|\bdistributed\b|\banywhere\b/.test(s)) return 'remote';
  if (/\bno\b|\bmust be (in|located|based) (in)?\s/.test(s)) return 'onsite';
  // If it just mentions a city, lean on-site/hybrid — pessimistic
  if (/\b(based in|located in)\s+[A-Z]/.test(raw)) return 'hybrid';
  return 'unknown';
}

/** Extract `| **TL;DR** | text |` table cell content. */
function parseTldr(table: Record<string, string>): string {
  return table['tl;dr'] ?? table['tldr'] ?? table['summary'] ?? table['resumen'] ?? '';
}

/**
 * Parse the "Requirements → CV Mapping" / "Match con CV" table.
 * Each row: | requirement | level | evidence | notes |
 */
function parseMatchTable(text: string): { strong: StrongMatch[]; gaps: Gap[]; stack: string[] } {
  const strong: StrongMatch[] = [];
  const gaps: Gap[] = [];
  const stack: Set<string> = new Set();

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    if (!/[✅❌]/.test(line)) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cells.length < 2) continue;

    const requirement = cells[0]
      .replace(/\*\*/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
    const level = cells[1];
    const notes = (cells[3] ?? cells[2] ?? '').replace(/`([^`]+)`/g, '$1').trim();
    if (level.includes('✅')) {
      strong.push({ requirement, level: level.replace(/[✅\s]+/, '').trim() || 'Strong', notes });
      // Collect tech tokens for the stack tag list
      const tokens = requirement.match(
        /\b(TypeScript|JavaScript|React|Node\.?js|Vue|Svelte|Python|Go(?:lang)?|Rust|Java|Kotlin|Ruby|PHP|C\+\+|C#|GraphQL|REST|gRPC|AWS|GCP|Azure|Cloudflare|Workers|Kubernetes|K8s|Docker|Terraform|Postgres|PostgreSQL|MySQL|MongoDB|Redis|Kafka|GraphQL|Next\.js|Nuxt|Astro|Vite|Webpack|Tailwind)\b/gi,
      );
      if (tokens) for (const t of tokens) stack.add(t);
    } else if (level.includes('❌')) {
      gaps.push({ requirement, level: level.replace(/[❌\s]+/, '').trim() || 'Gap', notes });
    }
  }

  return { strong: strong.slice(0, 8), gaps: gaps.slice(0, 8), stack: [...stack].slice(0, 8) };
}

/** Look anywhere in the report for visa / sponsorship summary. */
function parseVisa(text: string, table: Record<string, string>): string {
  // Common keys
  const fromTable =
    table['visa'] ??
    table['work authorization'] ??
    table['authorization'] ??
    table['sponsorship'] ??
    table['work auth'] ??
    table['visa status'] ??
    '';
  if (fromTable) return fromTable;

  // Heuristic: search lines mentioning visa/sponsorship
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!/visa|sponsorship|work auth/i.test(line)) continue;
    if (!line.startsWith('|') && !line.startsWith('-')) continue;
    const m = line.match(/visa[^|]*?[\.|]/i);
    if (m) return m[0].replace(/[|\.]+$/, '').trim();
    // Take the line up to ~120 chars
    const cleaned = line.replace(/^\|\s*|\|\s*$|^-\s+/, '').trim();
    if (cleaned && cleaned.length < 200) return cleaned;
  }
  return '';
}

function parseCompanyStage(text: string, table: Record<string, string>): string {
  const fromTable = table['stage'] ?? table['etapa'] ?? table['funding'] ?? '';
  if (fromTable) return fromTable;
  const m = text.match(
    /Series\s+([A-K])(?!\w)|\b(public|publicly traded|seed|pre-seed|bootstrapped)\b/i,
  );
  if (m) return m[0];
  return '';
}

export function parseReportSummary(markdown: string): ReportSummary {
  if (!markdown || markdown.trim().length === 0) return { ...EMPTY };

  const score = parseScore(markdown);
  const archetype = takeFirst(markdown, /\*\*Arch?(?:etype|quetipo):\*\*\s*(.+)/i);
  const { risk: bgRisk, note: bgNote } = parseBg(markdown);
  const legitimacy = takeFirst(markdown, /\*\*Legitimacy:\*\*\s*(.+)/i);

  const table = parseKeyValueTable(markdown);

  const tldr = parseTldr(table);
  const salary =
    table['salary'] ??
    table['compensation'] ??
    table['comp'] ??
    table['salary range'] ??
    table['target comp'] ??
    '';
  const workModeRaw = table['remote'] ?? table['work mode'] ?? table['location policy'] ?? '';
  const workMode = classifyWorkMode(workModeRaw);
  const location = table['location'] ?? '';
  const visa = parseVisa(markdown, table);

  const domain = table['domain'] ?? '';
  const fn = table['function'] ?? table['role function'] ?? '';
  const seniority = table['seniority'] ?? table['level'] ?? '';
  const teamSize = table['team size'] ?? table['team'] ?? '';
  const companyStage = parseCompanyStage(markdown, table);

  const url = takeFirst(markdown, /\*\*URL:\*\*\s*(\S+)/i);
  const pdfNote = takeFirst(markdown, /\*\*PDF:\*\*\s*(.+)/i);
  const { strong: strongMatches, gaps, stack } = parseMatchTable(markdown);

  return {
    score,
    archetype,
    bgRisk,
    bgNote,
    legitimacy,
    tldr,
    salary,
    workMode,
    workModeRaw,
    location,
    visa,
    domain,
    function: fn,
    seniority,
    teamSize,
    companyStage,
    stack,
    url,
    pdfNote,
    strongMatches,
    gaps,
  };
}
