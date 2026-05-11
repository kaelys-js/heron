import { wrap, badRequest } from '$lib/server/api-helpers';
import { readSiblingFile, writeSiblingFile } from '$lib/server/profile';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

const ALLOWED = new Set(['profileMd', 'cv']);
type SiblingName = 'profileMd' | 'cv';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  return q && getProfile(q) ? q : getActiveProfileId();
}

export const GET = wrap('profile-file', async ({ params, url }: { params: { name: string }; url: URL }) => {
  if (!ALLOWED.has(params.name)) badRequest('Unknown file: ' + params.name);
  const id = resolveProfileId(url);
  const body = readSiblingFile(id, params.name as SiblingName);
  if (body == null) badRequest('File not found');
  return { body };
});

export const PUT = wrap('profile-file', async ({ params, request, url }: { params: { name: string }; request: Request; url: URL }) => {
  if (!ALLOWED.has(params.name)) badRequest('Unknown file: ' + params.name);
  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  if (!body || typeof body.content !== 'string') {
    badRequest('expected JSON body with { content: string }');
  }
  if (body.content.length > 1_048_576) {
    badRequest('File too large (>1 MiB). Trim it before saving.');
  }
  const id = resolveProfileId(url);
  const result = writeSiblingFile(id, params.name as SiblingName, body.content);
  logEvent('profile-file', (params.name === 'cv' ? 'CV (cv.md)' : 'Profile MD') + ' updated', {
    level: 'info',
    category: 'user',
    message:
      'profile=' + id + ' · ' +
      (result.bytes / 1024).toFixed(1) + ' KB written' +
      (result.backedUp ? ' · previous backed up to .bak' : ''),
  });
  return result;
});
