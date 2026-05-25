#!/usr/bin/env node
/**
 * register-metadata.mjs -- one-time registration of the Discord
 * role-connection metadata schema for Heron's Connected Roles
 * (auto-`@Contributor`).
 *
 * Discord surfaces these fields when a member links their account, and a
 * "linked role" in Server Settings -> Roles can then require e.g.
 * `merged_prs >= 1`. The worker (worker.mjs) writes each member's actual
 * values after GitHub verification.
 *
 * Run once (idempotent -- a re-run overwrites the schema):
 *   DISCORD_CLIENT_ID=<app id> DISCORD_BOT_TOKEN=<token> \
 *     node scripts/discord/connected-roles/register-metadata.mjs
 *
 * Docs: https://discord.com/developers/docs/resources/application-role-connection-metadata
 */
const API = 'https://discord.com/api/v10';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!CLIENT_ID || !TOKEN) {
  console.error('DISCORD_CLIENT_ID + DISCORD_BOT_TOKEN env vars are required.');
  process.exit(2);
}

// Discord metadata_type: 2 = INTEGER_GREATER_THAN_OR_EQUAL, 7 = BOOLEAN_EQUAL.
const METADATA = [
  {
    key: 'merged_prs',
    name: 'Merged PRs',
    description: 'Merged pull requests in kaelys-js/heron',
    type: 2,
  },
  {
    key: 'is_contributor',
    name: 'Contributor',
    description: 'Has at least one merged PR',
    type: 7,
  },
];

const res = await fetch(`${API}/applications/${CLIENT_ID}/role-connections/metadata`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(METADATA),
});

if (!res.ok) {
  console.error(`Failed to register metadata: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const registered = await res.json();
console.log(
  `OK -- registered role-connection metadata: ${registered.map((m) => m.key).join(', ')}`,
);
