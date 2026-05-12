/**
 * Catch-all Better Auth route.
 *
 * Forwards every request under `/api/auth/*` to the Better Auth fetch
 * handler. Better Auth implements all of:
 *
 *   • POST /api/auth/sign-up/email
 *   • POST /api/auth/sign-in/email
 *   • POST /api/auth/sign-in/social        (GitHub OAuth)
 *   • GET  /api/auth/callback/github
 *   • POST /api/auth/sign-out
 *   • GET  /api/auth/get-session
 *   • POST /api/auth/passkey/generate-register-options
 *   • POST /api/auth/passkey/verify-register
 *   • POST /api/auth/passkey/generate-authenticate-options
 *   • POST /api/auth/passkey/verify-authenticate
 *
 * …and a dozen more from the passkey + (future) admin + (future) 2FA
 * plugins. We never need to know the exact path list — the handler
 * routes internally.
 */
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const handler: RequestHandler = ({ request }) => auth.handler(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const OPTIONS = handler;
