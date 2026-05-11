/**
 * GET    /api/backup/[id] — download the .tar.gz for a given backup.
 * DELETE /api/backup/[id] — delete the .tar.gz + its sidecar.
 *
 * The id path parameter is the filename stem (ISO timestamp). Path-traversal
 * is filtered server-side by getBackup() which validates the id against a
 * strict regex before touching the filesystem.
 */

import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import { wrap } from '$lib/server/api-helpers';
import { getBackup, deleteBackup } from '$lib/server/backup';

export const GET = wrap('backup-download', async ({ params }: { params: { id: string } }) => {
  const info = getBackup(params.id);
  if (!info) error(404, 'Backup not found: ' + params.id);
  // Stream the tar.gz directly. wrap() expects a JSON-serializable return,
  // so we throw a Response to short-circuit its serializer. wrap()'s catch
  // path re-throws Responses unchanged.
  const stat = fs.statSync(info.path);
  const stream = fs.createReadStream(info.path);
  throw new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${info.id}.tar.gz"`,
      'Cache-Control': 'no-store',
    },
  });
});

export const DELETE = wrap('backup-delete', async ({ params }: { params: { id: string } }) => {
  const ok = deleteBackup(params.id);
  return { ok };
});
