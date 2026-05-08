#!/usr/bin/env node
// Build batch/batch-input.tsv from batch/pipeline-survivors.tsv.
// Format: id\turl\tsource\tnotes (with header).

import { readFileSync, writeFileSync } from 'node:fs';

const survivors = readFileSync('batch/pipeline-survivors.tsv', 'utf8')
  .split('\n')
  .slice(1)
  .filter(Boolean);

const lines = ['id\turl\tsource\tnotes'];
let id = 1;
for (const row of survivors) {
  const [url, company, role] = row.split('\t');
  // notes column carries `{company} | {role}` so the worker can fall back if WebFetch fails
  const notes = `${company} | ${role}`.replace(/\t/g, ' ');
  lines.push(`${id}\t${url}\tpipeline-survivors\t${notes}`);
  id += 1;
}

writeFileSync('batch/batch-input.tsv', lines.join('\n') + '\n');
console.log(`Wrote batch/batch-input.tsv with ${id - 1} offers.`);
