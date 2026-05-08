import { json, error } from '@sveltejs/kit';
import { APPLICATIONS } from '$lib/server/files';
import fs from 'node:fs';

export const POST = async ({ request }) => {
  const { url, newStatus, notes } = await request.json();
  if (!url || !newStatus) throw error(400, 'url + newStatus required');

  let text = '';
  try { text = fs.readFileSync(APPLICATIONS, 'utf8'); }
  catch { text = '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n'; }

  const lines = text.split('\n');
  let updated = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && lines[i].startsWith('|')) {
      const cells = lines[i].split('|');
      if (cells.length > 6) {
        cells[6] = ' ' + newStatus + ' ';
        if (notes && cells.length > 9) cells[9] = ' ' + notes + ' ';
        lines[i] = cells.join('|');
        updated = true;
      }
      break;
    }
  }

  if (!updated) {
    // append a new row
    const today = new Date().toISOString().slice(0, 10);
    lines.push(`| - | ${today} | - | - | - | ${newStatus} | - | - | ${notes ?? ''} | `);
    lines[lines.length - 1] = `| - | ${today} | (manual) | ${url} | - | ${newStatus} | - | - | ${notes ?? ''} |`;
  }

  fs.writeFileSync(APPLICATIONS, lines.join('\n'));
  return json({ ok: true });
};
