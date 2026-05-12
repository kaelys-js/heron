#!/usr/bin/env node
/**
 * verify-pipeline.mjs — Health check for career-ops pipeline integrity
 *
 * Checks:
 * 1. All statuses are canonical (per states.yml)
 * 2. No duplicate company+role entries
 * 3. All report links point to existing files
 * 4. Scores match format X.XX/5 or N/A or DUP
 * 5. All rows have proper pipe-delimited format
 * 6. No pending TSVs in tracker-additions/ (only in merged/ or archived/)
 * 7. states.yml canonical IDs for cross-system consistency
 *
 * Run: node career-ops/verify-pipeline.mjs
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const PROFILES_JSON = join(CAREER_OPS, 'data/profiles.json');
const ADDITIONS_DIR = join(CAREER_OPS, 'batch/tracker-additions');
const STATES_FILE = existsSync(join(CAREER_OPS, 'templates/states.yml'))
  ? join(CAREER_OPS, 'templates/states.yml')
  : join(CAREER_OPS, 'states.yml');

/**
 * Resolve the list of scopes to check.
 *
 * Multi-profile layout (post-migration): `data/profiles.json` exists →
 * one scope per profile, each pointing at `data/profiles/{slug}/applications.md`
 * and `data/profiles/{slug}/reports/`. Pre-migration / boilerplate: a single
 * scope using the legacy flat layout.
 *
 * @returns {Array<{label: string, appsFile: string, reportsBase: string}>}
 */
function resolveScopes() {
  if (existsSync(PROFILES_JSON)) {
    try {
      const state = JSON.parse(readFileSync(PROFILES_JSON, 'utf-8'));
      const profiles = Array.isArray(state?.profiles) ? state.profiles : [];
      if (profiles.length > 0) {
        return profiles.map((p) => ({
          label: p.name ? `profile ${p.id} (${p.name})` : `profile ${p.id}`,
          appsFile: join(CAREER_OPS, 'data/profiles', p.id, 'applications.md'),
          reportsBase: join(CAREER_OPS, 'data/profiles', p.id),
        }));
      }
    } catch {
      // Fall through to flat layout if profiles.json is malformed.
    }
  }
  // Legacy flat layout — support both `data/applications.md` (boilerplate)
  // and `applications.md` (original).
  const flatApps = existsSync(join(CAREER_OPS, 'data/applications.md'))
    ? join(CAREER_OPS, 'data/applications.md')
    : join(CAREER_OPS, 'applications.md');
  return [{ label: 'flat layout', appsFile: flatApps, reportsBase: CAREER_OPS }];
}

const SCOPES = resolveScopes();

// Ensure required directories exist (fresh setup) — data/ is always present
// since profiles.json lives under it. Reports are per-scope.
mkdirSync(join(CAREER_OPS, 'data'), { recursive: true });
for (const s of SCOPES) mkdirSync(join(s.reportsBase, 'reports'), { recursive: true });

const CANONICAL_STATUSES = [
  'evaluated', 'applied', 'responded', 'interview',
  'offer', 'rejected', 'discarded', 'skip',
  // Autonomous-apply additions.
  'queued', 'applying', 'manual-apply-needed', 'manualapplyneeded',
  // Interview sub-stages (#4 punch-list item).
  'phonescreen', 'technical', 'takehome', 'onsite', 'final',
];

const ALIASES = {
  'evaluada': 'evaluated', 'condicional': 'evaluated', 'hold': 'evaluated', 'evaluar': 'evaluated', 'verificar': 'evaluated',
  'aplicado': 'applied', 'enviada': 'applied', 'aplicada': 'applied', 'applied': 'applied', 'sent': 'applied',
  'respondido': 'responded',
  'entrevista': 'interview',
  'oferta': 'offer',
  'rechazado': 'rejected', 'rechazada': 'rejected',
  'descartado': 'discarded', 'descartada': 'discarded', 'cerrada': 'discarded', 'cancelada': 'discarded',
  'no aplicar': 'skip', 'no_aplicar': 'skip', 'monitor': 'skip', 'geo blocker': 'skip',
  // Round-5: legacy/pre-canonical labels still in user-owned applications.md.
  'ready-to-apply': 'queued', 'ready_to_apply': 'queued', 'ready to apply': 'queued',
};

let errors = 0;
let warnings = 0;

function error(msg) { console.log(`❌ ${msg}`); errors++; }
function warn(msg) { console.log(`⚠️  ${msg}`); warnings++; }
function ok(msg) { console.log(`✅ ${msg}`); }

/**
 * Run all per-entry + per-row checks against a single scope (one profile, or
 * one flat-layout install). Returns the number of entries checked so the
 * top-level summary can show a total.
 */
function checkScope(scope) {
  if (!existsSync(scope.appsFile)) {
    console.log(`\n📊 [${scope.label}] No applications.md found — skipping (fresh setup).`);
    return 0;
  }
  const content = readFileSync(scope.appsFile, 'utf-8');
  const lines = content.split('\n');

  // Schema detection: applications.md has rows in either 9-column (old)
  // or 10-column (new w/ URL inserted between Role and Score) format. The
  // file may contain a mix during transition — detect per-row by counting
  // cells. A 10-col row has `parts.length === 12` (incl. leading/trailing
  // empties from the `|...|` delimiters); a 9-col row has length 11.
  const entries = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 11) continue;
    const num = parseInt(parts[1]);
    if (isNaN(num)) continue;
    // 12-column rows include URL; 11-column rows don't.
    const off = parts.length >= 12 ? 1 : 0;
    entries.push({
      num, date: parts[2], company: parts[3], role: parts[4],
      url: off ? parts[5] : '',
      score: parts[5 + off], status: parts[6 + off],
      pdf: parts[7 + off], report: parts[8 + off],
      notes: parts[9 + off] || '',
    });
  }

  console.log(`\n📊 [${scope.label}] Checking ${entries.length} entries\n`);

  // --- Check 1: Canonical statuses ---
  let badStatuses = 0;
  for (const e of entries) {
    const clean = e.status.replace(/\*\*/g, '').trim().toLowerCase();
    // Strip trailing dates
    const statusOnly = clean.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

    if (!CANONICAL_STATUSES.includes(statusOnly) && !ALIASES[statusOnly]) {
      error(`[${scope.label}] #${e.num}: Non-canonical status "${e.status}"`);
      badStatuses++;
    }

    // Check for markdown bold in status
    if (e.status.includes('**')) {
      error(`[${scope.label}] #${e.num}: Status contains markdown bold: "${e.status}"`);
      badStatuses++;
    }

    // Check for dates in status
    if (/\d{4}-\d{2}-\d{2}/.test(e.status)) {
      error(`[${scope.label}] #${e.num}: Status contains date: "${e.status}" — dates go in date column`);
      badStatuses++;
    }
  }
  if (badStatuses === 0) ok(`[${scope.label}] All statuses are canonical`);

  // --- Check 2: Duplicates ---
  const companyRoleMap = new Map();
  let dupes = 0;
  for (const e of entries) {
    const key = e.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '::' +
      e.role.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (!companyRoleMap.has(key)) companyRoleMap.set(key, []);
    companyRoleMap.get(key).push(e);
  }
  for (const [_key, group] of companyRoleMap) {
    if (group.length > 1) {
      warn(`[${scope.label}] Possible duplicates: ${group.map((e) => `#${e.num}`).join(', ')} (${group[0].company} — ${group[0].role})`);
      dupes++;
    }
  }
  if (dupes === 0) ok(`[${scope.label}] No exact duplicates found`);

  // --- Check 3: Report links ---
  // Report links in applications.md are written relative to the profile root
  // (e.g. `reports/123-foo-...md`), so resolve against `scope.reportsBase`.
  // Missing reports are reported as WARN (not error): they represent user-
  // data drift (deleted/moved/never-generated reports), not a code defect,
  // and shouldn't block CI on a clean working tree.
  let brokenReports = 0;
  for (const e of entries) {
    const match = e.report.match(/\]\(([^)]+)\)/);
    if (!match) continue;
    const reportPath = join(scope.reportsBase, match[1]);
    if (!existsSync(reportPath)) {
      warn(`[${scope.label}] #${e.num}: Report not found: ${match[1]}`);
      brokenReports++;
    }
  }
  if (brokenReports === 0) ok(`[${scope.label}] All report links valid`);

  // --- Check 4: Score format ---
  // Canonical: "X.X/5". Also tolerate bare "X.X" (user-data drift) as a
  // WARN — it's a normalization gap, not a code defect.
  let badScores = 0;
  for (const e of entries) {
    const s = e.score.replace(/\*\*/g, '').trim();
    if (s === 'N/A' || s === 'DUP') continue;
    if (/^\d+\.?\d*\/5$/.test(s)) continue;
    if (/^\d+\.?\d*$/.test(s)) {
      warn(`[${scope.label}] #${e.num}: Score missing /5 suffix: "${e.score}"`);
      continue;
    }
    error(`[${scope.label}] #${e.num}: Invalid score format: "${e.score}"`);
    badScores++;
  }
  if (badScores === 0) ok(`[${scope.label}] All scores valid`);

  // --- Check 5: Row format ---
  let badRows = 0;
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---') || line.includes('Empresa')) continue;
    const parts = line.split('|');
    if (parts.length < 9) {
      error(`[${scope.label}] Row with <9 columns: ${line.substring(0, 80)}...`);
      badRows++;
    }
  }
  if (badRows === 0) ok(`[${scope.label}] All rows properly formatted`);

  // --- Check 7: Bold in scores ---
  let boldScores = 0;
  for (const e of entries) {
    if (e.score.includes('**')) {
      warn(`[${scope.label}] #${e.num}: Score has markdown bold: "${e.score}"`);
      boldScores++;
    }
  }
  if (boldScores === 0) ok(`[${scope.label}] No bold in scores`);

  return entries.length;
}

let totalEntries = 0;
for (const scope of SCOPES) totalEntries += checkScope(scope);

if (totalEntries === 0 && SCOPES.length === 1 && !existsSync(SCOPES[0].appsFile)) {
  console.log('\n📊 No applications.md found in any scope. This is normal for a fresh setup.');
  console.log('   The file will be created when you evaluate your first offer.\n');
  process.exit(0);
}

// --- Check 6: Pending TSVs — workspace-wide (batch/ is shared infra) ---
let pendingTsvs = 0;
if (existsSync(ADDITIONS_DIR)) {
  const files = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
  pendingTsvs = files.length;
  if (pendingTsvs > 0) {
    warn(`${pendingTsvs} pending TSVs in tracker-additions/ (not merged)`);
  }
}
if (pendingTsvs === 0) ok('No pending TSVs');

// --- Summary ---
console.log('\n' + '='.repeat(50));
console.log(`📊 Pipeline Health: ${errors} errors, ${warnings} warnings`);
if (errors === 0 && warnings === 0) {
  console.log('🟢 Pipeline is clean!');
} else if (errors === 0) {
  console.log('🟡 Pipeline OK with warnings');
} else {
  console.log('🔴 Pipeline has errors — fix before proceeding');
}

process.exit(errors > 0 ? 1 : 0);
