#!/usr/bin/env node
// Build batch-input.tsv (per-profile) from pipeline-survivors.tsv.
// Format: id\turl\tsource\tnotes\tprofile (with header).
//
// The batch dir is per-profile (data/users/{uid}/profiles/{slug}/batch/)
// so concurrent batches for different profiles don't collide on state.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { profileFromArgv, profilePath } from '../lib/lib-profiles.mjs';

const PROFILE_ID = profileFromArgv();
const BATCH_DIR = profilePath(PROFILE_ID, 'batch-dir');
mkdirSync(BATCH_DIR, { recursive: true });

const SURVIVORS_PATH = join(BATCH_DIR, 'pipeline-survivors.tsv');
const INPUT_PATH = join(BATCH_DIR, 'batch-input.tsv');

const survivors = readFileSync(SURVIVORS_PATH, 'utf8').split('\n').slice(1).filter(Boolean);

const lines = ['id\turl\tsource\tnotes\tprofile'];
let id = 1;
for (const row of survivors) {
  const [url, company, role] = row.split('\t');
  // notes column carries `{company} | {role}` so the worker can fall back if WebFetch fails
  const notes = `${company} | ${role}`.replace(/\t/g, ' ');
  lines.push(`${id}\t${url}\tpipeline-survivors\t${notes}\t${PROFILE_ID}`);
  id += 1;
}

writeFileSync(INPUT_PATH, lines.join('\n') + '\n');
console.log(`Wrote ${INPUT_PATH} with ${id - 1} offers (profile=${PROFILE_ID}).`);
