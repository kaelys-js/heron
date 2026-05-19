/**
 * /api/profile/avatar -- avatar upload / read / clear.
 *
 * GET    → returns the image bytes (or 404)
 * POST   → multipart/form-data with field `avatar` (file) → upload
 * DELETE → clear avatar (revert to initials)
 *
 * Stored per-machine (data/avatars/avatar.{png,jpg,gif,webp}). Max 2MB.
 */

import { error } from '@sveltejs/kit';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { saveAvatar, readAvatar, clearAvatar } from '$lib/server/ui-prefs';

export const GET = wrap('avatar', async () => {
  const r = readAvatar();
  if (!r) error(404, 'No avatar set');
  // We need to short-circuit wrap's JSON serialization; throw a Response.
  throw new Response(new Uint8Array(r.buffer) as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': r.contentType,
      'Content-Length': String(r.buffer.length),
      'Cache-Control': 'no-store',
    },
  });
});

export const POST = wrap('avatar', async ({ request }: { request: Request }) => {
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) badRequest('multipart/form-data required');
  const form = await request.formData();
  const file = form.get('avatar');
  if (!(file instanceof File)) badRequest('avatar file required');
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = saveAvatar(buffer, file.type);
  if (!result.ok) badRequest(result.error ?? 'upload failed');
  return { ok: true, path: result.path };
});

export const DELETE = wrap('avatar', async () => {
  clearAvatar();
  return { ok: true };
});
