/**
 * Update job status in applications.md.
 *
 * @module
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { activePath } from '$lib/server/profile-paths';
import { logEvent } from '$lib/server/events';
import fs from 'node:fs';

export const POST = wrap('status', async ({ request }: any) => {
  const body = await request.json().catch(() => ({}));
  const { url, newStatus, notes } = body ?? {};
  if (!url) badRequest('url required', { field: 'url' });
  if (!newStatus) badRequest('newStatus required', { field: 'newStatus' });

  let text = '';
  try {
    text = fs.readFileSync(activePath('applications'), 'utf8');
  } catch {
    text =
      '# Applications Tracker\n\n| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-----|-------|--------|-----|--------|-------|\n';
  }

  const lines = text.split('\n');
  let updated = false;
  let companyRole = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url) && lines[i].startsWith('|')) {
      const cells = lines[i].split('|');
      if (cells.length > 6) {
        cells[6] = ' ' + newStatus + ' ';
        if (notes && cells.length > 9) cells[9] = ' ' + notes + ' ';
        lines[i] = cells.join('|');
        updated = true;
        if (cells.length > 4)
          companyRole = (cells[3]?.trim() || '') + ' · ' + (cells[4]?.trim() || '');
      }
      break;
    }
  }
  if (!updated) {
    const today = new Date().toISOString().slice(0, 10);
    lines.push(
      '| - | ' +
        today +
        ' | (manual) | ' +
        url +
        ' | - | ' +
        newStatus +
        ' | - | - | ' +
        (notes ?? '') +
        ' |',
    );
  }
  try {
    fs.writeFileSync(activePath('applications'), lines.join('\n'));
  } catch (e: any) {
    throw new Error('failed to write applications.md: ' + (e?.message ?? String(e)));
  }
  logEvent('status', 'Status changed to ' + newStatus, {
    level: 'success',
    category: 'application',
    message: companyRole || url,
  });
  return {};
});
