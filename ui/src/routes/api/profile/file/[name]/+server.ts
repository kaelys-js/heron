import { wrap, badRequest } from '$lib/server/api-helpers';
import { readSiblingFile, writeSiblingFile } from '$lib/server/profile';
import { logEvent } from '$lib/server/events';

const ALLOWED = new Set(['profileMd', 'cv']);
type SiblingName = 'profileMd' | 'cv';

export const GET = wrap('profile-file', async ({ params }: { params: { name: string } }) => {
  if (!ALLOWED.has(params.name)) badRequest('Unknown file: ' + params.name);
  const body = readSiblingFile(params.name as SiblingName);
  if (body == null) badRequest('File not found');
  return { body };
});

export const PUT = wrap('profile-file', async ({ params, request }: { params: { name: string }; request: Request }) => {
  if (!ALLOWED.has(params.name)) badRequest('Unknown file: ' + params.name);
  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  if (!body || typeof body.content !== 'string') {
    badRequest('expected JSON body with { content: string }');
  }
  // Cap file size at 1 MiB. CVs are typically 5–20 KB; anything bigger is a
  // copy-paste accident worth flagging.
  if (body.content.length > 1_048_576) {
    badRequest('File too large (>1 MiB). Trim it before saving.');
  }
  const result = writeSiblingFile(params.name as SiblingName, body.content);
  // info level — Profile page renders its own contextual toast. We still log
  // for the activity feed so the user has an audit trail of CV edits.
  logEvent('profile-file', (params.name === 'cv' ? 'CV (cv.md)' : 'Profile MD') + ' updated', {
    level: 'info',
    category: 'user',
    message:
      (result.bytes / 1024).toFixed(1) + ' KB written' +
      (result.backedUp ? ' · previous backed up to ' + (params.name === 'cv' ? 'cv.md.bak' : '_profile.md.bak') : ''),
  });
  return result;
});
