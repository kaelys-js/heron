/**
 * daily-backup job — registered with the autopilot job registry so the
 * scheduled trigger + the manual /agents "Run now" button both go through
 * the same code path.
 *
 * Trigger: daily 02:00, all 7 days. We pick 02:00 because:
 *   - The autopilot's other jobs (scan, gemini, apply-queue-drain) run
 *     during work hours (08:00–18:00). 02:00 is reliably quiet.
 *   - Local timezone is fine — backup doesn't care about UTC offsets.
 *
 * Manual trigger is also exposed via /api/backup/run (Backups card on
 * /settings). Both paths land in createBackup() in backup.ts.
 */

import { register } from './registry';
import { createBackup } from '../backup';
import type { JobResult } from './types';

async function runBackup(): Promise<JobResult> {
  const r = await createBackup();
  if (!r.ok) {
    return { ok: false, error: r.error ?? 'Backup failed', meta: r as unknown as Record<string, unknown> };
  }
  const sizeMb = ((r.size ?? 0) / 1024 / 1024).toFixed(1);
  return {
    ok: true,
    message: `Backup ${r.id} · ${r.fileCount} files · ${sizeMb} MB` +
      (r.pruned ? ` · pruned ${r.pruned}` : ''),
    meta: r as unknown as Record<string, unknown>,
  };
}

register({
  id: 'daily-backup',
  label: 'Daily backup',
  description: 'Snapshot user data (profiles, tracker, reports, output) to data/backups/. Excludes .env, node_modules, .playwright-*. Pruning is retention-day based.',
  // 'hygiene' is the closest existing JobCategory — backup is maintenance
  // adjacent to normalize/dedup/verify which also live under that label.
  category: 'hygiene',
  trigger: { type: 'daily', hour: 2, minute: 0, weekdays: [0, 1, 2, 3, 4, 5, 6] },
  allowManual: true,
  run: runBackup,
});
