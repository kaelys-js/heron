#!/usr/bin/env node
/**
 * normalize-statuses.mjs -- Clean non-canonical states in applications.md
 *
 * Maps all non-canonical statuses to canonical ones per states.yml:
 *   Evaluada, Aplicado, Respondido, Entrevista, Oferta, Rechazado, Descartado, NO APLICAR
 *
 * Also strips markdown bold (**) and dates from the status field,
 * moving DUPLICADO info to the notes column.
 *
 * Multi-profile + multi-user safe (F3 fix). Resolves the target
 * applications.md via `lib-profiles.mjs` so:
 *   • --profile <slug>        scopes to one profile
 *   • --user <id> / env       scopes to one user
 *   • omit both               falls back to active profile / system user
 *
 * Run:
 *   node scripts/tracker/normalize-statuses.mjs [--dry-run]
 *   node scripts/tracker/normalize-statuses.mjs --profile teacher --dry-run
 *   node scripts/tracker/normalize-statuses.mjs --user u_alice --profile engineer
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import { profilePath, profileFromArgv, userFromArgv } from '../lib/lib-profiles.mjs';

const USER_ID = userFromArgv();
const PROFILE_ID = profileFromArgv();
const APPS_FILE = profilePath(PROFILE_ID, 'applications', USER_ID);
const DRY_RUN = process.argv.includes('--dry-run');

// Ensure the profile dir exists so a first-run with --dry-run on an
// empty profile doesn't error out before reporting "nothing to do".
mkdirSync(dirname(APPS_FILE), { recursive: true });

// Canonical status mapping
function normalizeStatus(raw) {
  // Strip markdown bold
  let s = raw.replace(/\*\*/g, '').trim();
  const lower = s.toLowerCase();

  // DUPLICADO variants → Discarded
  if (/^duplicado/i.test(s) || /^dup\b/i.test(s)) {
    return { status: 'Discarded', moveToNotes: raw.trim() };
  }

  // CERRADA / Cancelada / Descartada → Discarded
  if (/^cerrada$/i.test(s)) return { status: 'Discarded' };
  if (/^cancelada/i.test(s)) return { status: 'Discarded' };
  if (/^descartada$/i.test(s)) return { status: 'Discarded' };
  if (/^descartado$/i.test(s)) return { status: 'Discarded' };

  // Rechazada / Rechazado → Rejected
  if (/^rechazada?$/i.test(s)) return { status: 'Rejected' };
  if (/^rechazado\s+\d{4}/i.test(s)) return { status: 'Rejected' };

  // Aplicado with date → Applied (strip date)
  if (/^aplicado\s+\d{4}/i.test(s)) return { status: 'Applied' };

  // CONDICIONAL / HOLD / EVALUAR / Verificar → Evaluated
  if (/^(condicional|hold|evaluar|verificar)$/i.test(s)) return { status: 'Evaluated' };

  // MONITOR → SKIP
  if (/^monitor$/i.test(s)) return { status: 'SKIP' };

  // GEO BLOCKER → SKIP
  if (/geo.?blocker/i.test(s)) return { status: 'SKIP' };

  // Repost #NNN → Discarded
  if (/^repost/i.test(s)) return { status: 'Discarded', moveToNotes: raw.trim() };

  // "--" (em dash, no status) → Discarded
  if (s === '—' || s === '-' || s === '') return { status: 'Discarded' };

  // Already canonical (English, per states.yml) -- just fix casing/bold
  const canonical = [
    'Evaluated',
    'Applied',
    'Responded',
    'Interview',
    'Offer',
    'Rejected',
    'Discarded',
    'SKIP',
    // Autonomous-apply additions (round 4)
    'Queued',
    'Applying',
    'ManualApplyNeeded',
  ];
  for (const c of canonical) {
    if (lower === c.toLowerCase()) return { status: c };
  }

  // Spanish aliases → English canonicals
  if (['evaluada'].includes(lower)) return { status: 'Evaluated' };
  if (['aplicado', 'enviada', 'aplicada', 'applied', 'sent'].includes(lower))
    return { status: 'Applied' };
  if (['respondido'].includes(lower)) return { status: 'Responded' };
  if (['entrevista'].includes(lower)) return { status: 'Interview' };
  if (['oferta'].includes(lower)) return { status: 'Offer' };
  if (['cerrada', 'descartada'].includes(lower)) return { status: 'Discarded' };
  if (['no aplicar', 'no_aplicar', 'skip'].includes(lower)) return { status: 'SKIP' };

  // Legacy labels users typed before canonical names existed:
  // READY-TO-APPLY / ready_to_apply / ready to apply → Queued (autonomous-apply)
  if (['ready-to-apply', 'ready_to_apply', 'ready to apply', 'readytoapply'].includes(lower)) {
    return { status: 'Queued' };
  }

  // Unknown -- flag it
  return { status: null, unknown: true };
}

// Read applications.md. CodeQL `js/file-system-race`: read directly
// and let ENOENT branch handle "no file" rather than precheck + open.
let content;
try {
  content = readFileSync(APPS_FILE, 'utf-8');
} catch (e) {
  if (e?.code === 'ENOENT') {
    console.log('No applications.md found. Nothing to normalize.');
    process.exit(0);
  }
  throw e;
}
const lines = content.split('\n');

let changes = 0;
let unknowns = [];
let scoreFixes = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;

  const parts = line.split('|').map((s) => s.trim());
  // Schema detection per row -- 12 cells (incl. empty leading/trailing) when
  // URL column is present, 11 cells when not. Column offsets shift by 1.
  //   9-col  (length 11): ['', '#', 'date', 'co', 'role', 'score', 'STATUS', 'pdf', 'report', 'notes', '']
  //   10-col (length 12): ['', '#', 'date', 'co', 'role', 'URL', 'score', 'STATUS', 'pdf', 'report', 'notes', '']
  if (parts.length < 11) continue;
  if (parts[1] === '#' || parts[1] === '---' || parts[1] === '') continue;

  const num = parseInt(parts[1]);
  if (isNaN(num)) continue;

  const off = parts.length >= 12 ? 1 : 0;
  const SCORE = 5 + off;
  const STATUS = 6 + off;
  const NOTES = 9 + off;

  const rawStatus = parts[STATUS];
  const result = normalizeStatus(rawStatus);
  let lineChanged = false;

  // --- Status normalization ---
  if (result.unknown) {
    unknowns.push({ num, rawStatus, line: i + 1 });
  } else if (result.status !== rawStatus) {
    const oldStatus = rawStatus;
    parts[STATUS] = result.status;
    if (result.moveToNotes) {
      const existing = parts[NOTES] || '';
      if (!existing.includes(result.moveToNotes)) {
        parts[NOTES] = result.moveToNotes + (existing ? '. ' + existing : '');
      }
    }
    changes++;
    lineChanged = true;
    console.log(`#${num}: status "${oldStatus}" → "${result.status}"`);
  }

  // --- Score normalization (bold strip + bare-number /5 suffix) ---
  if (parts[SCORE]) {
    const before = parts[SCORE];
    let after = before.replace(/\*\*/g, '').trim();
    // Append /5 to bare numbers like "4.3" → "4.3/5"
    if (/^\d+\.?\d*$/.test(after)) after = after + '/5';
    if (after !== before) {
      parts[SCORE] = after;
      scoreFixes++;
      lineChanged = true;
      console.log(`#${num}: score "${before}" → "${after}"`);
    }
  }

  if (lineChanged) {
    const newLine = '| ' + parts.slice(1, -1).join(' | ') + ' |';
    lines[i] = newLine;
  }
}

if (unknowns.length > 0) {
  console.log(`\n⚠️  ${unknowns.length} unknown statuses:`);
  for (const u of unknowns) {
    console.log(`  #${u.num} (line ${u.line}): "${u.rawStatus}"`);
  }
}

console.log(`\n📊 ${changes} statuses normalized · ${scoreFixes} scores fixed`);

const totalChanges = changes + scoreFixes;
if (!DRY_RUN && totalChanges > 0) {
  // Atomic backup-then-replace: see dedup-tracker.mjs for the
  // CodeQL `js/file-system-race` rationale. renameSync is a single
  // syscall; the previous `copyFileSync ; writeFileSync` pair had
  // overlapping read+write windows on APPS_FILE.
  renameSync(APPS_FILE, APPS_FILE + '.bak');
  writeFileSync(APPS_FILE, lines.join('\n'));
  console.log(`✅ Written to ${APPS_FILE} (backup: ${APPS_FILE}.bak)`);
} else if (DRY_RUN) {
  console.log('(dry-run — no changes written)');
} else {
  console.log('✅ No changes needed');
}
