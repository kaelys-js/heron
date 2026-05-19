/**
 * /inbound/[id] loader -- full lead + thread + draft preview.
 */

import fs from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { ROOT } from '$lib/server/files';
import { getLead, getThread, getDraftPath } from '$lib/server/inbound-leads';

export async function load({ params }: { params: { id: string } }) {
  const lead = getLead(params.id);
  if (!lead) throw error(404, 'Lead not found');
  const thread = getThread(params.id) ?? null;
  const draftPath = getDraftPath(params.id) ?? null;
  let draftContent: string | null = null;
  if (draftPath) {
    try {
      const full = path.isAbsolute(draftPath) ? draftPath : path.join(ROOT, draftPath);
      if (fs.existsSync(full)) draftContent = fs.readFileSync(full, 'utf8');
    } catch {}
  }
  return { lead, thread, draftPath, draftContent };
}
