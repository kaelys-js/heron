/**
 * worker.mjs -- Connected Roles endpoint scaffold (auto-`@Contributor`).
 *
 * SCAFFOLD: review security + test before production. Discord linked-roles via
 * a Discord + GitHub double-OAuth (/linked-role -> /discord-callback ->
 * /github-callback): counts merged Heron PRs, writes the member's
 * role-connection metadata with HMAC-signed state. Deploy + register per
 * docs/DISCORD.md; run register-metadata.mjs first. Env: DISCORD_CLIENT_ID/
 * SECRET, GITHUB_CLIENT_ID/SECRET, COOKIE_SECRET, BASE_URL.
 */

const DISCORD_API = 'https://discord.com/api/v10';
const REPO = 'kaelys-js/heron';
const enc = new TextEncoder();

// ── HMAC-signed state (CSRF) ──────────────────────────────────────
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
async function sign(secret, value) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${value}.${b64}`;
}
async function verify(secret, signed) {
  const i = (signed || '').lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  return (await sign(secret, value)) === signed ? value : null;
}
function cookie(name, value, maxAge = 600) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function redirect(url, setCookies = []) {
  const headers = new Headers({ Location: url });
  for (const c of setCookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

// ── OAuth helpers ─────────────────────────────────────────────────
async function exchange(tokenUrl, params) {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  return res.json();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const redirectUri = `${env.BASE_URL}`;

    // 1. Start: redirect to Discord OAuth (identify + role_connections.write).
    if (url.pathname === '/linked-role') {
      const state = await sign(env.COOKIE_SECRET, crypto.randomUUID());
      const auth = new URL('https://discord.com/oauth2/authorize');
      auth.search = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        redirect_uri: `${redirectUri}/discord-callback`,
        response_type: 'code',
        scope: 'identify role_connections.write',
        state,
        prompt: 'consent',
      }).toString();
      return redirect(auth.toString(), [cookie('d_state', state)]);
    }

    // 2. Discord callback -> stash the Discord token, bounce to GitHub OAuth.
    if (url.pathname === '/discord-callback') {
      if (
        (await verify(env.COOKIE_SECRET, readCookie(req, 'd_state'))) !==
        url.searchParams.get('state')
      )
        return new Response('bad state', { status: 400 });
      const tok = await exchange(`${DISCORD_API}/oauth2/token`, {
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        redirect_uri: `${redirectUri}/discord-callback`,
      });
      const gState = await sign(env.COOKIE_SECRET, crypto.randomUUID());
      const gh = new URL('https://github.com/login/oauth/authorize');
      gh.search = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${redirectUri}/github-callback`,
        scope: 'read:user',
        state: gState,
      }).toString();
      return redirect(gh.toString(), [
        cookie('d_token', await sign(env.COOKIE_SECRET, tok.access_token)),
        cookie('g_state', gState),
      ]);
    }

    // 3. GitHub callback -> verify contributor, write role-connection metadata.
    if (url.pathname === '/github-callback') {
      if (
        (await verify(env.COOKIE_SECRET, readCookie(req, 'g_state'))) !==
        url.searchParams.get('state')
      )
        return new Response('bad state', { status: 400 });
      const discordToken = await verify(env.COOKIE_SECRET, readCookie(req, 'd_token'));
      if (!discordToken)
        return new Response('session expired; restart at /linked-role', { status: 400 });

      const ghTok = await exchange('https://github.com/login/oauth/access_token', {
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: url.searchParams.get('code'),
        redirect_uri: `${redirectUri}/github-callback`,
      });
      const ghHeaders = {
        Authorization: `Bearer ${ghTok.access_token}`,
        'User-Agent': 'heron-connected-roles',
      };
      const ghUser = await (
        await fetch('https://api.github.com/user', { headers: ghHeaders })
      ).json();
      const search = await (
        await fetch(
          `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${REPO} type:pr author:${ghUser.login} is:merged`)}`,
          { headers: ghHeaders },
        )
      ).json();
      const mergedPrs = search.total_count ?? 0;

      const put = await fetch(
        `${DISCORD_API}/users/@me/applications/${env.DISCORD_CLIENT_ID}/role-connection`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${discordToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform_name: 'GitHub',
            platform_username: ghUser.login,
            metadata: { merged_prs: mergedPrs, is_contributor: mergedPrs > 0 ? 1 : 0 },
          }),
        },
      );
      if (!put.ok)
        return new Response(`role-connection write failed: ${await put.text()}`, { status: 502 });
      const done = new Headers();
      for (const c of [
        cookie('d_token', '', 0),
        cookie('g_state', '', 0),
        cookie('d_state', '', 0),
      ])
        done.append('Set-Cookie', c);
      return new Response(
        `Linked ${ghUser.login}: ${mergedPrs} merged PR(s). You can close this tab and claim the role in Discord.`,
        { headers: done },
      );
    }

    return new Response('Heron Connected Roles. Start at /linked-role.', { status: 404 });
  },
};
