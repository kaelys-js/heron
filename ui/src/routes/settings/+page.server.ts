import { readEnvMasked, loadEnv } from '$lib/server/env';
import { listBackups, readBackupConfig } from '$lib/server/backup';
loadEnv();
export async function load() {
  return {
    env: readEnvMasked(),
    // Seed the Backups card with the current snapshot list + retention
    // config so it renders without a separate /api/backup/list round-trip
    // on first paint.
    backups: listBackups(),
    backupConfig: readBackupConfig(),
  };
}
