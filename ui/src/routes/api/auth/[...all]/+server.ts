/** Catch-all Better Auth route -- forwards every /api/auth/* request to
 *  the Better Auth fetch handler. Routes implemented internally include
 *  sign-up/email, sign-in/email, sign-in/social (GitHub OAuth),
 *  callback/github, sign-out, get-session, plus passkey
 *  generate/verify-register and generate/verify-authenticate -- and a
 *  dozen more from the passkey + future admin + future 2FA plugins. We
 *  never need to enumerate the path list -- the handler routes internally. */
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const handler: RequestHandler = ({ request }) => auth.handler(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
