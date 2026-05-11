#!/usr/bin/env node
// Phase 1 triage: classify pipeline URLs by company + role title only.
// Output: pipeline-survivors.tsv, pipeline-skipped.tsv, plus rewritten pipeline.md
// and appended Skipped rows in applications.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { profilePath, ensureProfileDirs, profileFromArgv } from './lib-profiles.mjs';

const PROFILE_ID = profileFromArgv();
ensureProfileDirs(PROFILE_ID);
const PIPELINE = profilePath(PROFILE_ID, 'pipeline');
const APPLICATIONS = profilePath(PROFILE_ID, 'applications');
// batch/ is a shared workspace; orchestrator runs triage once per profile
// and consumes survivors before triggering the next profile's run.
const SURVIVORS_OUT = 'batch/pipeline-survivors.tsv';
const SKIPPED_OUT = 'batch/pipeline-skipped.tsv';

// HIGH-BG companies that should be skipped in triage per modes/_profile.md.
const HIGH_BG_COMPANIES = new Set([
  'Anthropic',
  'OpenAI',
  'SumUp',
  'N26',
  'Trade Republic',
  'Stripe',
  'Plaid',
  'Salesforce',
  'Workday',
  'Atlassian',
  'HubSpot',
  'Qonto', // EU fintech / banking-adjacent
]);

// Companies under HARD STOP (defense / intel / clearance-bound).
const HARD_STOP_COMPANIES = new Set([
  'Anduril',
  'Palantir',
  'Helsing',
  'Shield AI',
  'Lockheed',
  'Raytheon',
  'Boeing',
]);

// Patterns to SKIP by role title (case-insensitive).
const SKIP_ROLE_PATTERNS = [
  // Management / leadership
  { re: /\bengineering manager\b/i, reason: 'archetype mismatch: management role' },
  { re: /^\s*(senior|sr\.?|staff)?\s*manager\b/i, reason: 'archetype mismatch: management role' },
  { re: /^(director|vp|vice president|head of|chief)\b/i, reason: 'archetype mismatch: leadership role' },
  { re: /\bmanager,/i, reason: 'archetype mismatch: management role' },
  // Sales-adjacent / customer-facing
  { re: /\bsolutions? architect\b/i, reason: 'archetype mismatch: solutions architect (sales-adjacent)' },
  { re: /\bsolutions? engineer\b/i, reason: 'archetype mismatch: solutions engineer (sales-adjacent)' },
  { re: /\bpartner engineer\b/i, reason: 'archetype mismatch: partner engineer' },
  { re: /\bsales engineer\b/i, reason: 'archetype mismatch: sales role' },
  { re: /\bdeveloper (advocate|relations)\b|\bdevrel\b/i, reason: 'archetype mismatch: DevRel/advocacy' },
  { re: /\btechnical writer\b/i, reason: 'archetype mismatch: technical writer' },
  { re: /\bcustomer (success|engineer|engineering)\b/i, reason: 'archetype mismatch: customer success' },
  { re: /\bfield engineer\b/i, reason: 'archetype mismatch: field engineering' },
  { re: /\bforward deployed\b/i, reason: 'archetype mismatch: forward deployed (client-facing, not core IC)' },
  // Research / ML-deep
  { re: /\bresearch (engineer|scientist|software engineer|platform engineer|lead)\b/i, reason: 'archetype mismatch: research role' },
  { re: /\bml (researcher|scientist)\b/i, reason: 'archetype mismatch: ML research' },
  { re: /\bml infrastructure\b|\bml ops\b|\bmachine learning platform\b|\bml platform\b|\bmachine learning infrastructure\b/i, reason: 'archetype mismatch: ML infra/platform (not Cole TS profile)' },
  { re: /\bml engineer\b|\bmachine learning engineer\b|\bmachine learning software engineer\b|\bsoftware engineer,\s*machine learning\b/i, reason: 'archetype mismatch: ML engineering' },
  { re: /\binference (engineer|deployment|services|infrastructure)\b/i, reason: 'archetype mismatch: inference/ML systems' },
  { re: /\bgpu (infrastructure|engineer|kernel)\b|\bhpc\b/i, reason: 'archetype mismatch: GPU/HPC infra' },
  { re: /\b(pre|post)[\s-]?training\b|\bpretraining\b|\bposttraining\b/i, reason: 'archetype mismatch: ML pre/post-training' },
  { re: /\bmodel (behavior|behaviour|efficiency|evaluation|architect)\b/i, reason: 'archetype mismatch: ML modeling/evaluation' },
  { re: /\bactive learning\b/i, reason: 'archetype mismatch: ML active learning team' },
  { re: /\bagents? modeling\b/i, reason: 'archetype mismatch: agent modeling (ML research)' },
  { re: /\b(synthetic data|multimodal ai|sovereign ai|vlm|alignment researcher|adversarial researcher|interpretability)\b/i, reason: 'archetype mismatch: AI lab ML research' },
  { re: /\bai researcher\b|\bai research lead\b/i, reason: 'archetype mismatch: AI researcher' },
  // AI-lab "Member of Technical Staff" research variants (keep MTS engineering roles)
  { re: /\bmember of technical staff\b.*?\b(modeling|\bmle\b|multimodal|pre[\s-]?training|post[\s-]?training|pretraining|posttraining|model (efficiency|evaluation|behavior|behaviour|architect)|data analysis|synthetic data|sovereign|safety for|adversarial|alignment|interpretability|reinforcement|training (performance|infra)|inference (infra|services|infrastructure)|gpu|vlm|image\s*\/?\s*video generation|ai research|policy and strategic|secure intelligence)\b/i, reason: 'archetype mismatch: AI-lab MTS ML/research role' },
  // Voice synthesis ML (kept voice-agent product roles at TS companies)
  { re: /\bvoices\b|\bfuture\s*voices\b|\bvoice synthesis\b|\bspeech synthesis\b|\btext[\s-]?to[\s-]?speech\b/i, reason: 'archetype mismatch: voice/speech synthesis ML' },
  // Language specialists (Cole is TS-first)
  { re: /\bc\+\+/i, reason: 'archetype mismatch: C++ specialist (Cole TS-first)' },
  { re: /\(rust\)|\brust engineer\b|\(rust\s/i, reason: 'archetype mismatch: Rust specialist (Cole TS-first)' },
  { re: /\(golang\)|\(go\)|\bgolang engineer\b|\(golang\s/i, reason: 'archetype mismatch: Go/Golang specialist (Cole TS-first)' },
  // Robotics / vehicle / kernel low-level
  { re: /\brobot software\b|\bos & kernel\b|\bsensor systems\b|\bvehicle sw\b|\bvehicle software\b|\bwayve labs\b/i, reason: 'hard_no: robotics/embedded/vehicle/research-labs low-level' },
  // Non-IC specialists / admin
  { re: /\bknowledge\s*&\s*enablement\b|\benablement specialist\b/i, reason: 'archetype mismatch: enablement specialist' },
  { re: /\bexecutive assistant\b/i, reason: 'archetype mismatch: admin/EA' },
  { re: /\bdevops consultant\b/i, reason: 'archetype mismatch: consultant role' },
  { re: /\bsoftware engineer,\s*qa\b/i, reason: 'archetype mismatch: QA' },
  { re: /\boffensive security\b/i, reason: 'archetype mismatch: offensive security (specialist)' },
  // Marketing / non-eng
  { re: /\bmarketer\b|\bmarketing\b/i, reason: 'archetype mismatch: marketing role' },
  { re: /\bproduct manager\b|\bprogram manager\b|\bproject manager\b/i, reason: 'archetype mismatch: PM role' },
  { re: /\brecruiter\b|\bpeople (operations|partner)\b|\btalent\b/i, reason: 'archetype mismatch: people/ops role' },
  // Hard_no per profile.yml
  { re: /\bmobile\b|\bios\b|\bandroid\b/i, reason: 'hard_no: native mobile (iOS/Android)' },
  { re: /\bhardware\b|\bembedded\b|\bfpga\b|\brobotics\b|\bfirmware\b/i, reason: 'hard_no: hardware/embedded' },
  { re: /\b(web3|crypto|blockchain)\b/i, reason: 'hard_no: crypto/web3' },
  { re: /\b(junior|early career|new grad|graduate|intern|internship|entry[\s-]level)\b/i, reason: 'hard_no: junior/mid title' },
  // HARD STOP roles per profile (clearance-bound)
  { re: /\bnational security\b|\bdefense\b|\bpublic sector\b|\bfederal\b|\bgovtech\b|\bgovernment\b/i, reason: 'HARD STOP: clearance-bound role per BG policy' },
  { re: /\bclearance\b|\btop secret\b|\bts\/sci\b|\bpolygraph\b/i, reason: 'HARD STOP: security clearance required' },
  // Specific niche skips
  { re: /\bqa engineer\b|\bqa engineering\b/i, reason: 'archetype mismatch: QA' },
  { re: /\bdata engineer\b|\bdata scientist\b|\banalytics engineer\b/i, reason: 'archetype mismatch: data engineering' },
  { re: /\bdesigner\b/i, reason: 'archetype mismatch: design role' },
  { re: /\bsecurity researcher\b|\bsecurity analyst\b/i, reason: 'archetype mismatch: security research' },
  { re: /\bdetection (and )?response\b|\bdetection & response\b/i, reason: 'archetype mismatch: security ops/SOC' },
  { re: /\baccount abuse\b|\btrust (and|&) safety\b|\btrust & safety\b/i, reason: 'archetype mismatch: T&S/abuse (heavy BG)' },
  { re: /\bgrc\b/i, reason: 'archetype mismatch: GRC' },
  // Healthcare PHI exposure → HARD STOP per profile
  { re: /\bhealthcare\b.*\bagent\b|\bclinical\b/i, reason: 'HARD STOP: healthcare/clinical (PHI exposure)' },
];

function classify(company, role) {
  // 1. HARD STOP companies
  if (HARD_STOP_COMPANIES.has(company)) {
    return { decision: 'skip', tier: 'HARD STOP', reason: `HARD STOP: ${company} is defense/intel — clearance-required` };
  }

  // 2. HARD STOP role patterns first (higher priority than HIGH BG company)
  for (const { re, reason } of SKIP_ROLE_PATTERNS) {
    if (reason.startsWith('HARD STOP:') && re.test(role)) {
      return { decision: 'skip', tier: 'HARD STOP', reason };
    }
  }

  // 3. HIGH BG companies (per profile, skip in triage)
  if (HIGH_BG_COMPANIES.has(company)) {
    return { decision: 'skip', tier: 'HIGH BG', reason: `HIGH BG risk: ${company} (AI lab / fintech / large public US tech per BG policy)` };
  }

  // 4. Other role-based skips (archetype mismatch / hard_no)
  for (const { re, reason } of SKIP_ROLE_PATTERNS) {
    if (re.test(role)) {
      return { decision: 'skip', tier: reason.startsWith('hard_no:') ? 'hard_no' : 'archetype', reason };
    }
  }

  // 5. Survivor
  return { decision: 'keep', tier: 'survivor', reason: 'matches Senior IC TS/Node/Edge archetype' };
}

// Parse pipeline.md
const text = readFileSync(PIPELINE, 'utf8');
const lines = text.split('\n');

const survivors = [];
const skipped = [];

const itemRe = /^- \[ \] (\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/;
let parsedLines = 0;
let unparsedItems = [];
for (const line of lines) {
  const m = line.match(itemRe);
  if (!m) continue;
  parsedLines++;
  const [, url, company, role] = m;
  const result = classify(company.trim(), role.trim());
  const entry = { url, company: company.trim(), role: role.trim(), ...result, originalLine: line };
  if (result.decision === 'keep') survivors.push(entry);
  else skipped.push(entry);
}

console.log(`Parsed ${parsedLines} pending items.`);
console.log(`Survivors: ${survivors.length}`);
console.log(`Skipped: ${skipped.length}`);
console.log();

// Breakdown of skipped by tier
const tierCounts = {};
const reasonCounts = {};
for (const e of skipped) {
  tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;
  reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1;
}
console.log('Skipped by tier:');
for (const [tier, n] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tier}: ${n}`);
}
console.log();
console.log('Top skip reasons:');
for (const [reason, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${n}\t${reason}`);
}
console.log();

// Survivors by company
const survByCompany = {};
for (const e of survivors) survByCompany[e.company] = (survByCompany[e.company] || 0) + 1;
console.log('Survivors by company (top 30):');
for (const [c, n] of Object.entries(survByCompany).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`  ${n}\t${c}`);
}

// Write outputs
writeFileSync(SURVIVORS_OUT,
  'url\tcompany\trole\n' +
  survivors.map(e => `${e.url}\t${e.company}\t${e.role}`).join('\n') + '\n'
);
writeFileSync(SKIPPED_OUT,
  'url\tcompany\trole\ttier\treason\n' +
  skipped.map(e => `${e.url}\t${e.company}\t${e.role}\t${e.tier}\t${e.reason}`).join('\n') + '\n'
);
console.log();
console.log(`Wrote ${SURVIVORS_OUT} (${survivors.length} survivors)`);
console.log(`Wrote ${SKIPPED_OUT} (${skipped.length} skipped)`);
