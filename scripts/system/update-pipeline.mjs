#!/usr/bin/env node
// Apply triage results to data/pipeline.md and data/applications.md.
// - Surviving URLs stay as `[ ]`.
// - Skipped URLs become `[!]` with ` -- SKIPPED: {reason}` appended.
// - Skipped entries also append rows to data/applications.md as `SKIP`.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { profilePath, ensureProfileDirs, profileFromArgv } from '../lib/lib-profiles.mjs';

const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID);
const PIPELINE = profilePath(PROFILE_ID, 'pipeline');
const APPLICATIONS = profilePath(PROFILE_ID, 'applications');
// Per-profile batch workspace. Was repo-root batch/ pre-multi-user.
const SKIPPED_TSV = join(profilePath(PROFILE_ID, 'batch-dir'), 'pipeline-skipped.tsv');

const today = '2026-05-05';

// Build a map url -> {tier, reason}
const skippedMap = new Map();
const skippedRows = readFileSync(SKIPPED_TSV, 'utf8').split('\n').slice(1).filter(Boolean);
for (const row of skippedRows) {
  const [url, company, role, tier, reason] = row.split('\t');
  skippedMap.set(url, { url, company, role, tier, reason });
}

// Update pipeline.md in place — only modify item lines that match the pattern.
const itemRe = /^- \[ \] (\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/;
const text = readFileSync(PIPELINE, 'utf8');
const lines = text.split('\n');
const newLines = lines.map((line) => {
  const m = line.match(itemRe);
  if (!m) return line;
  const [, url, company, role] = m;
  const skip = skippedMap.get(url);
  if (!skip) return line; // survivor — leave as-is
  return `- [!] ${url} | ${company.trim()} | ${role.trim()} -- SKIPPED: ${skip.reason}`;
});
writeFileSync(PIPELINE, newLines.join('\n'));
console.log(`Marked ${skippedMap.size} URLs as [!] in ${PIPELINE}`);

// Append rows to applications.md.
const appText = readFileSync(APPLICATIONS, 'utf8');
const appLines = appText.split('\n');

// Find the highest existing entry number.
let maxN = 0;
const numRe = /^\|\s*(\d+)\s*\|/;
for (const line of appLines) {
  const m = line.match(numRe);
  if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
}

// Sort skipped entries deterministically by company then role for stable numbering.
const sortedSkipped = [...skippedMap.values()].sort(
  (a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role),
);

const newRows = [];
let n = maxN;
for (const e of sortedSkipped) {
  n += 1;
  // Escape | in role/company/notes.
  const safe = (s) => s.replace(/\|/g, '\\|').trim();
  newRows.push(
    `| ${n} | ${today} | ${safe(e.company)} | ${safe(e.role)} | — | SKIP | ❌ | — | ${safe(e.reason)} |`,
  );
}

// Append directly to file (after existing content, ensuring trailing newline).
const out = appText.replace(/\s*$/, '\n') + newRows.join('\n') + '\n';
writeFileSync(APPLICATIONS, out);
console.log(`Appended ${newRows.length} SKIP rows to ${APPLICATIONS} (numbers ${maxN + 1}..${n})`);
