#!/usr/bin/env node
// Build batch/batch-input.tsv from batch/pipeline-survivors.tsv.
// Format: id\turl\tsource\tnotes\tprofile (with header).
//
// batch/ is a shared workspace — the orchestrator runs triage → update-pipeline
// → build-batch-input once per profile, serialized. The `--profile <slug>` arg
// is recorded in the output `profile` column so workers downstream know which
// profile the batch belongs to.

import { readFileSync, writeFileSync } from 'node:fs';
import { profileFromArgv } from './lib-profiles.mjs';

const PROFILE_ID = profileFromArgv();

const survivors = readFileSync('batch/pipeline-survivors.tsv', 'utf8')
  .split('\n')
  .slice(1)
  .filter(Boolean);

const lines = ['id\turl\tsource\tnotes\tprofile'];
let id = 1;
for (const row of survivors) {
  const [url, company, role] = row.split('\t');
  // notes column carries `{company} | {role}` so the worker can fall back if WebFetch fails
  const notes = `${company} | ${role}`.replace(/\t/g, ' ');
  lines.push(`${id}\t${url}\tpipeline-survivors\t${notes}\t${PROFILE_ID}`);
  id += 1;
}

writeFileSync('batch/batch-input.tsv', lines.join('\n') + '\n');
console.log(`Wrote batch/batch-input.tsv with ${id - 1} offers (profile=${PROFILE_ID}).`);
