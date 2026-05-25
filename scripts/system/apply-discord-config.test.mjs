#!/usr/bin/env node
// TDD suite for apply-discord-config.mjs pure helpers. Plain node (no
// vitest) so it runs in pre-push + CI without the workspace toolchain.
// Each phase of the reconciler adds a section below.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  automodDiffers,
  bitsToPermNames,
  buildInviteUrl,
  alertChannelNames,
  automodToPrune,
  brandRepoSlug,
  buildCommunityPatch,
  channelGatedOut,
  channelsToPrune,
  declaredChannelNames,
  rolesToPrune,
  filterGrantable,
  hasFeature,
  imageDrift,
  imageToDataUri,
  manualPerms,
  mergeOverwrites,
  mimeForPath,
  missingRequiredPerms,
  normalizeMemberVerification,
  normalizeOnboarding,
  normalizeOverwrites,
  normalizeWelcome,
  onboardingChannelCount,
  overwritesDiffer,
  parseHexColor,
  parseWebhookUrl,
  validateFormFields,
  permsToBits,
  reconcileGrantedBits,
  rolesOutOfOrder,
  safeRepoPath,
  sha256,
  systemChannelFlagsToBits,
} from './apply-discord-config.mjs';

const ADMIN = 1n << 3n;
const MANAGE_ROLES = 1n << 28n;
const MANAGE_GUILD = 1n << 5n;
const MANAGE_CHANNELS = 1n << 4n;
const SEND_MESSAGES = 1n << 11n;
const MANAGE_MESSAGES = 1n << 13n;

let failed = 0;
let passed = 0;
function it(name, fn) {
  try {
    fn();
    console.log(`  OK    ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}

console.log('apply-discord-config.mjs -- unit tests\n');

// ── permsToBits ──────────────────────────────────────────────────
it('permsToBits: empty array -> 0n', () => {
  assert.equal(permsToBits([]), 0n);
});
it('permsToBits: non-array -> 0n', () => {
  assert.equal(permsToBits(undefined), 0n);
  assert.equal(permsToBits(null), 0n);
});
it('permsToBits: ADMINISTRATOR -> 8n (1<<3)', () => {
  assert.equal(permsToBits(['ADMINISTRATOR']), 8n);
});
it('permsToBits: MANAGE_ROLES -> 1<<28', () => {
  assert.equal(permsToBits(['MANAGE_ROLES']), 1n << 28n);
});
it('permsToBits: MODERATE_MEMBERS -> 1<<40', () => {
  assert.equal(permsToBits(['MODERATE_MEMBERS']), 1n << 40n);
});
it('permsToBits: OR-combines multiple perms', () => {
  // SEND_MESSAGES (1<<11) | EMBED_LINKS (1<<14)
  assert.equal(permsToBits(['SEND_MESSAGES', 'EMBED_LINKS']), (1n << 11n) | (1n << 14n));
});
it('permsToBits: matches the maintainer invite integer 1100316934320', () => {
  const bits = permsToBits([
    'MANAGE_CHANNELS',
    'MANAGE_GUILD',
    'VIEW_AUDIT_LOG',
    'MANAGE_ROLES',
    'MANAGE_WEBHOOKS',
    'MODERATE_MEMBERS',
  ]);
  assert.equal(bits, 1100316934320n);
});
it('permsToBits: unknown permission throws (fail loud)', () => {
  assert.throws(() => permsToBits(['NOT_A_PERM']), /Unknown permission/);
});

// ── parseHexColor ────────────────────────────────────────────────
it('parseHexColor: #4a5b6d -> 0x4a5b6d', () => {
  assert.equal(parseHexColor('#4a5b6d'), 0x4a5b6d);
});
it('parseHexColor: hash optional', () => {
  assert.equal(parseHexColor('4a5b6d'), 0x4a5b6d);
});
it('parseHexColor: empty / nullish -> 0', () => {
  assert.equal(parseHexColor(''), 0);
  assert.equal(parseHexColor(undefined), 0);
  assert.equal(parseHexColor(null), 0);
});
it('parseHexColor: rejects 3-digit shorthand -> 0', () => {
  assert.equal(parseHexColor('#fff'), 0);
});
it('parseHexColor: rejects non-hex -> 0', () => {
  assert.equal(parseHexColor('#zzzzzz'), 0);
});

// ── least-privilege helpers (Phase 1) ────────────────────────────
it('bitsToPermNames: single + multiple + empty', () => {
  assert.deepEqual(bitsToPermNames(ADMIN), ['ADMINISTRATOR']);
  assert.deepEqual(bitsToPermNames(0n), []);
  const names = bitsToPermNames(MANAGE_ROLES | MANAGE_GUILD);
  assert.ok(names.includes('MANAGE_ROLES') && names.includes('MANAGE_GUILD') && names.length === 2);
});
it('filterGrantable: admin bot grants everything', () => {
  const { granted, dropped } = filterGrantable(MANAGE_MESSAGES | ADMIN, ADMIN);
  assert.equal(granted, MANAGE_MESSAGES | ADMIN);
  assert.equal(dropped, 0n);
});
it('filterGrantable: non-admin drops what it lacks', () => {
  const { granted, dropped } = filterGrantable(MANAGE_MESSAGES | SEND_MESSAGES, SEND_MESSAGES);
  assert.equal(granted, SEND_MESSAGES);
  assert.equal(dropped, MANAGE_MESSAGES);
});
it('reconcileGrantedBits: admin bot returns desired verbatim', () => {
  assert.equal(reconcileGrantedBits(0n, MANAGE_MESSAGES, ADMIN), MANAGE_MESSAGES);
});
it('reconcileGrantedBits: preserves manually-set ungrantable bits', () => {
  // Maintainer role: existing has ADMIN (set by hand), bot lacks ADMIN.
  assert.equal(reconcileGrantedBits(ADMIN, ADMIN, MANAGE_ROLES), ADMIN);
});
it('reconcileGrantedBits: adds grantable, removes grantable-not-desired, keeps the rest', () => {
  // existing = SEND (manageable) | MANAGE_GUILD (not manageable by this bot)
  // desired  = 0 ; bot can manage only SEND
  const out = reconcileGrantedBits(SEND_MESSAGES | MANAGE_GUILD, 0n, SEND_MESSAGES);
  assert.equal(out, MANAGE_GUILD); // SEND removed, MANAGE_GUILD preserved
});
it('manualPerms: flags ungrantable-and-absent, self-clears once present', () => {
  assert.equal(manualPerms(0n, ADMIN, MANAGE_ROLES), ADMIN);
  assert.equal(manualPerms(ADMIN, ADMIN, MANAGE_ROLES), 0n);
  assert.equal(manualPerms(0n, ADMIN, ADMIN), 0n); // admin bot
});
it('missingRequiredPerms: none / partial / admin', () => {
  assert.equal(missingRequiredPerms(0n), MANAGE_ROLES | MANAGE_CHANNELS | MANAGE_GUILD);
  assert.equal(missingRequiredPerms(1100316934320n), 0n);
  assert.equal(missingRequiredPerms(ADMIN), 0n);
});
it('buildInviteUrl: carries client_id + scope + permissions integer', () => {
  const url = buildInviteUrl(
    '123',
    permsToBits(['MANAGE_ROLES', 'MANAGE_CHANNELS', 'MANAGE_GUILD']),
  );
  assert.match(url, /client_id=123/);
  assert.match(url, /scope=bot%20applications\.commands/);
  assert.match(url, /permissions=268435504/);
});

// ── server settings: flags + features + images (Phase 2) ─────────
it('systemChannelFlagsToBits: SUPPRESS_GUILD_REMINDER_NOTIFICATIONS -> 4', () => {
  assert.equal(systemChannelFlagsToBits(['SUPPRESS_GUILD_REMINDER_NOTIFICATIONS']), 4);
});
it('systemChannelFlagsToBits: OR-combines + empty + unknown throws', () => {
  assert.equal(
    systemChannelFlagsToBits(['SUPPRESS_JOIN_NOTIFICATIONS', 'SUPPRESS_PREMIUM_SUBSCRIPTIONS']),
    3,
  );
  assert.equal(systemChannelFlagsToBits([]), 0);
  assert.throws(() => systemChannelFlagsToBits(['NOPE']), /Unknown system_channel_flag/);
});
it('hasFeature: present / absent / missing array', () => {
  assert.equal(hasFeature({ features: ['BANNER', 'COMMUNITY'] }, 'BANNER'), true);
  assert.equal(hasFeature({ features: ['COMMUNITY'] }, 'BANNER'), false);
  assert.equal(hasFeature({}, 'BANNER'), false);
});
it('channelGatedOut: announcement + stage gated only on a non-COMMUNITY guild', () => {
  // Both bugs that hard-failed maintain-discord: announcement (5, error 50035)
  // and stage voice (13, error 50024) on a guild without COMMUNITY.
  assert.equal(channelGatedOut({ type: 5 }, { features: [] }), true);
  assert.equal(channelGatedOut({ type: 13 }, { features: [] }), true);
  assert.equal(channelGatedOut({ type: 5 }, { features: ['COMMUNITY'] }), false);
  assert.equal(channelGatedOut({ type: 13 }, { features: ['COMMUNITY'] }), false);
  // text/voice/forum are creatable without COMMUNITY -> never gated here.
  assert.equal(channelGatedOut({ type: 0 }, { features: [] }), false);
  assert.equal(channelGatedOut({ type: 2 }, { features: [] }), false);
  assert.equal(channelGatedOut({ type: 15 }, { features: [] }), false);
});
it('buildCommunityPatch: adds COMMUNITY (deduped) + the two channel ids', () => {
  const p = buildCommunityPatch({ features: ['NEWS'] }, '111', '222');
  assert.deepEqual([...p.features].sort(), ['COMMUNITY', 'NEWS']);
  assert.equal(p.rules_channel_id, '111');
  assert.equal(p.public_updates_channel_id, '222');
  // already-COMMUNITY guild doesn't double it; missing features array is fine.
  assert.deepEqual(buildCommunityPatch({ features: ['COMMUNITY'] }, '1', '2').features, [
    'COMMUNITY',
  ]);
  assert.deepEqual(buildCommunityPatch({}, '1', '2').features, ['COMMUNITY']);
});
it('alertChannelNames: collects SEND_ALERT_MESSAGE (type 2) targets, deduped', () => {
  const cfg = {
    automod: [
      { actions: [{ type: 1 }, { type: 2, metadata: { channel: 'mods' } }] },
      { actions: [{ type: 2, metadata: { channel: 'mods' } }] }, // dup name
      { actions: [{ type: 2, metadata: { channel: 'alerts' } }] },
      { actions: [{ type: 2 }] }, // alert without a channel -> ignored
    ],
  };
  assert.deepEqual(alertChannelNames(cfg).sort(), ['alerts', 'mods']);
  assert.deepEqual(alertChannelNames({}), []);
});
it('brandRepoSlug: owner/name from brand.repo, empty when missing', () => {
  assert.equal(brandRepoSlug({ repo: { owner: 'kaelys-js', name: 'heron' } }), 'kaelys-js/heron');
  assert.equal(brandRepoSlug({ repo: { owner: 'o' } }), '');
  assert.equal(brandRepoSlug({}), '');
});
it('declaredChannelNames: category names + their channels', () => {
  const cfg = {
    categories: [{ name: 'CAT', channels: [{ name: 'a' }, { name: 'b' }] }, { name: 'EMPTY' }],
  };
  assert.deepEqual(declaredChannelNames(cfg).sort(), ['CAT', 'EMPTY', 'a', 'b']);
});
it('channelsToPrune: prunes undeclared; categories sort last (children first)', () => {
  const cfg = { categories: [{ name: 'CAT', channels: [{ name: 'keep' }] }] };
  const live = [
    { id: '1', name: 'keep', type: 0 },
    { id: '2', name: 'stray', type: 0 },
    { id: '3', name: 'OLD CAT', type: 4 },
  ];
  assert.deepEqual(
    channelsToPrune(live, cfg).map((c) => c.name),
    ['stray', 'OLD CAT'],
  );
});
it('rolesToPrune: skips @everyone + managed, prunes undeclared', () => {
  const cfg = { roles: [{ name: 'Keep' }] };
  const live = [
    { id: '0', name: '@everyone' },
    { id: '1', name: 'Keep' },
    { id: '2', name: 'Stray' },
    { id: '3', name: 'BotRole', managed: true }, // bot/integration/booster
  ];
  assert.deepEqual(
    rolesToPrune(live, cfg).map((r) => r.name),
    ['Stray'],
  );
});
it('automodToPrune: prunes rules not in config', () => {
  const cfg = { automod: [{ name: 'keep-rule' }] };
  const live = [
    { id: '1', name: 'keep-rule' },
    { id: '2', name: 'old-rule' },
  ];
  assert.deepEqual(
    automodToPrune(live, cfg).map((r) => r.name),
    ['old-rule'],
  );
});
it('sha256: known vector', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
it('mimeForPath: png/jpg/jpeg/gif + case-insensitive + unsupported throws', () => {
  assert.equal(mimeForPath('a/b.png'), 'image/png');
  assert.equal(mimeForPath('a/b.JPG'), 'image/jpeg');
  assert.equal(mimeForPath('a/b.jpeg'), 'image/jpeg');
  assert.equal(mimeForPath('a/b.gif'), 'image/gif');
  assert.throws(() => mimeForPath('a/b.webp'), /Unsupported image type/);
});
it('imageToDataUri: encodes bytes + reports source sha', () => {
  // mkdtempSync gives a randomized dir -- avoids the predictable-temp-file
  // pitfall (CodeQL js/insecure-temporary-file).
  const dir = mkdtempSync(join(tmpdir(), 'disc-'));
  const tmp = join(dir, 'img.png');
  const bytes = Buffer.from([0, 1, 2, 3, 255]);
  writeFileSync(tmp, bytes);
  try {
    const { dataUri, sourceSha } = imageToDataUri(tmp);
    assert.equal(dataUri, `data:image/png;base64,${bytes.toString('base64')}`);
    assert.equal(sourceSha, sha256(bytes));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('safeRepoPath: keeps in-root paths, rejects absolute / traversal / empty', () => {
  const root = '/repo';
  assert.equal(safeRepoPath('a/b.png', root), '/repo/a/b.png');
  assert.equal(safeRepoPath('/etc/passwd', root), null);
  assert.equal(safeRepoPath('../outside.png', root), null);
  assert.equal(safeRepoPath('', root), null);
  assert.equal(safeRepoPath(undefined, root), null);
});
it('safeRepoPath: accepts a real file, rejects a directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'disc-root-'));
  try {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'f.png'), Buffer.from([1]));
    assert.equal(safeRepoPath('sub', root), null); // directory -> EISDIR guard
    assert.equal(safeRepoPath('f.png', root), join(root, 'f.png'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('imageDrift: unseen / source-changed / live-diverged / removed / clean', () => {
  assert.equal(imageDrift(undefined, 'a', 'h'), true);
  assert.equal(imageDrift({ sourceSha: 'a', discordHash: 'h' }, 'b', 'h'), true);
  assert.equal(imageDrift({ sourceSha: 'a', discordHash: 'h' }, 'a', 'h2'), true);
  assert.equal(imageDrift({ sourceSha: 'a', discordHash: 'h' }, 'a', null), true);
  assert.equal(imageDrift({ sourceSha: 'a', discordHash: 'h' }, 'a', 'h'), false);
});

// ── channel permission overwrites (Phase 3) ──────────────────────
it('normalizeOverwrites: keys by id with allow/deny/type, applies defaults', () => {
  const n = normalizeOverwrites([{ id: '1', allow: '2', deny: '0', type: 0 }, { id: 7 }]);
  assert.equal(n['1'], '2/0/0');
  assert.equal(n['7'], '0/0/0');
});
it('overwritesDiffer: order-independent equality', () => {
  const a = [
    { id: '1', allow: '2', deny: '0', type: 0 },
    { id: '2', allow: '0', deny: '8', type: 0 },
  ];
  const b = [
    { id: '2', allow: '0', deny: '8', type: 0 },
    { id: '1', allow: '2', deny: '0', type: 0 },
  ];
  assert.equal(overwritesDiffer(a, b), false);
});
it('overwritesDiffer: detects an allow change', () => {
  const live = [{ id: '1', allow: '0', deny: '0', type: 0 }];
  const want = [{ id: '1', allow: '2', deny: '0', type: 0 }];
  assert.equal(overwritesDiffer(live, want), true);
});
it('mergeOverwrites: preserves unmanaged ids, overrides managed ones', () => {
  const live = [
    { id: '1', allow: '0', deny: '0', type: 0 }, // managed role, will change
    { id: '99', allow: '8', deny: '0', type: 1 }, // member overwrite, unmanaged
  ];
  const desired = [{ id: '1', allow: '2', deny: '0', type: 0 }];
  const merged = mergeOverwrites(live, desired);
  assert.equal(merged.length, 2);
  assert.equal(normalizeOverwrites(merged)['1'], '2/0/0'); // desired wins
  assert.equal(normalizeOverwrites(merged)['99'], '8/0/1'); // member preserved
  // live still differs from merged -> a PATCH is warranted
  assert.equal(overwritesDiffer(live, merged), true);
});
it('mergeOverwrites: no drift when live already matches', () => {
  const live = [
    { id: '1', allow: '2', deny: '0', type: 0 },
    { id: '99', allow: '8', deny: '0', type: 1 },
  ];
  const desired = [{ id: '1', allow: '2', deny: '0', type: 0 }];
  assert.equal(overwritesDiffer(live, mergeOverwrites(live, desired)), false);
});

// ── role hierarchy order (Phase 4) ───────────────────────────────
it('rolesOutOfOrder: descending live positions in config order -> false', () => {
  const live = [
    { name: 'A', position: 3 },
    { name: 'B', position: 2 },
    { name: 'C', position: 1 },
  ];
  assert.equal(rolesOutOfOrder(['A', 'B', 'C'], live), false);
});
it('rolesOutOfOrder: swapped positions -> true', () => {
  const live = [
    { name: 'A', position: 1 },
    { name: 'B', position: 3 },
    { name: 'C', position: 2 },
  ];
  assert.equal(rolesOutOfOrder(['A', 'B', 'C'], live), true);
});
it('rolesOutOfOrder: ignores config roles not present live', () => {
  const live = [
    { name: 'A', position: 3 },
    { name: 'C', position: 1 },
  ];
  assert.equal(rolesOutOfOrder(['A', 'B', 'C'], live), false);
});
it('rolesOutOfOrder: empty inputs -> false', () => {
  assert.equal(rolesOutOfOrder([], []), false);
});

// ── automod deep diff (Phase 5) ──────────────────────────────────
it('automodDiffers: keyword/exempt order is irrelevant', () => {
  const live = {
    trigger_type: 1,
    enabled: true,
    trigger_metadata: { keyword_filter: ['b', 'a'] },
    actions: [{ type: 1 }],
    exempt_roles: ['2', '1'],
  };
  const want = {
    trigger_type: 1,
    enabled: true,
    trigger_metadata: { keyword_filter: ['a', 'b'] },
    actions: [{ type: 1 }],
    exempt_roles: ['1', '2'],
  };
  assert.equal(automodDiffers(live, want), false);
});
it('automodDiffers: a changed keyword is drift', () => {
  const live = {
    trigger_type: 1,
    trigger_metadata: { keyword_filter: ['a'] },
    actions: [],
    exempt_roles: [],
  };
  const want = {
    trigger_type: 1,
    trigger_metadata: { keyword_filter: ['a', 'c'] },
    actions: [],
    exempt_roles: [],
  };
  assert.equal(automodDiffers(live, want), true);
});
it('automodDiffers: mention limit + enabled drift', () => {
  const a = {
    trigger_type: 5,
    enabled: true,
    trigger_metadata: { mention_total_limit: 5 },
    actions: [],
    exempt_roles: [],
  };
  const b = {
    trigger_type: 5,
    enabled: true,
    trigger_metadata: { mention_total_limit: 3 },
    actions: [],
    exempt_roles: [],
  };
  assert.equal(automodDiffers(a, b), true);
  const c = { ...a, enabled: false };
  assert.equal(automodDiffers(a, c), true);
});
it('automodDiffers: alert-channel change is drift', () => {
  const live = {
    trigger_type: 3,
    actions: [{ type: 2, metadata: { channel_id: '10' } }],
    exempt_roles: [],
  };
  const want = {
    trigger_type: 3,
    actions: [{ type: 2, metadata: { channel_id: '11' } }],
    exempt_roles: [],
  };
  assert.equal(automodDiffers(live, want), true);
});

// ── webhooks (Phase 6) ───────────────────────────────────────────
it('parseWebhookUrl: standard URL', () => {
  assert.deepEqual(parseWebhookUrl('https://discord.com/api/webhooks/123456789/abcDEF-_.tok'), {
    id: '123456789',
    token: 'abcDEF-_.tok',
  });
});
it('parseWebhookUrl: versioned path', () => {
  assert.deepEqual(parseWebhookUrl('https://discord.com/api/v10/webhooks/42/xyz'), {
    id: '42',
    token: 'xyz',
  });
});
it('parseWebhookUrl: non-string / garbage -> null', () => {
  assert.equal(parseWebhookUrl(undefined), null);
  assert.equal(parseWebhookUrl('https://example.com/not-a-webhook'), null);
});

// ── membership screening / rules (Phase 8) ───────────────────────
it('validateFormFields: a well-formed TERMS field passes', () => {
  assert.deepEqual(
    validateFormFields([{ field_type: 'TERMS', label: 'Agree?', required: true, values: ['a'] }]),
    [],
  );
});
it('validateFormFields: non-array + missing label + TERMS without values', () => {
  assert.equal(validateFormFields('nope').length, 1);
  assert.ok(
    validateFormFields([{ field_type: 'TERMS', values: [] }]).some((e) => e.includes('label')),
  );
  assert.ok(
    validateFormFields([{ field_type: 'TERMS', label: 'x' }]).some((e) => e.includes('values')),
  );
});
it('normalizeMemberVerification: value order irrelevant, description matters', () => {
  const a = {
    description: 'd',
    form_fields: [{ field_type: 'TERMS', label: 'l', required: true, values: ['y', 'x'] }],
  };
  const b = {
    description: 'd',
    form_fields: [{ field_type: 'TERMS', label: 'l', required: true, values: ['x', 'y'] }],
  };
  assert.equal(normalizeMemberVerification(a), normalizeMemberVerification(b));
  const c = { ...a, description: 'different' };
  assert.notEqual(normalizeMemberVerification(a), normalizeMemberVerification(c));
});

// ── onboarding + welcome (Phase 9) ───────────────────────────────
it('normalizeOnboarding: id-agnostic + emoji shape-agnostic', () => {
  const live = {
    enabled: true,
    mode: 1,
    default_channel_ids: ['11', '10'],
    prompts: [
      {
        id: '999',
        title: 'P',
        type: 0,
        single_select: true,
        required: false,
        options: [
          {
            id: '888',
            title: 'O',
            description: 'd',
            emoji: { id: null, name: '💼' },
            role_ids: ['1'],
            channel_ids: ['10'],
          },
        ],
      },
    ],
  };
  const desired = {
    enabled: true,
    mode: 1,
    default_channel_ids: ['10', '11'],
    prompts: [
      {
        id: '1',
        title: 'P',
        type: 0,
        single_select: true,
        required: false,
        in_onboarding: true,
        options: [
          {
            id: '2',
            title: 'O',
            description: 'd',
            emoji: { name: '💼' },
            role_ids: ['1'],
            channel_ids: ['10'],
          },
        ],
      },
    ],
  };
  assert.equal(normalizeOnboarding(live), normalizeOnboarding(desired));
});
it('normalizeOnboarding: a changed option title is drift', () => {
  const a = {
    enabled: true,
    mode: 1,
    default_channel_ids: [],
    prompts: [{ title: 'P', options: [{ title: 'X' }] }],
  };
  const b = {
    enabled: true,
    mode: 1,
    default_channel_ids: [],
    prompts: [{ title: 'P', options: [{ title: 'Y' }] }],
  };
  assert.notEqual(normalizeOnboarding(a), normalizeOnboarding(b));
});
it('onboardingChannelCount: ADVANCED counts default + prompt channels (distinct)', () => {
  const desired = {
    mode: 1,
    default_channel_ids: ['1', '2', '3'],
    prompts: [{ options: [{ channel_ids: ['3', '4'] }, { channel_ids: ['5'] }] }],
  };
  assert.equal(onboardingChannelCount(desired), 5); // 1,2,3,4,5
});
it('onboardingChannelCount: DEFAULT counts only default channels', () => {
  const desired = {
    mode: 0,
    default_channel_ids: ['1', '2'],
    prompts: [{ options: [{ channel_ids: ['9'] }] }],
  };
  assert.equal(onboardingChannelCount(desired), 2);
});
it('normalizeWelcome: description + channel order matter; enabled ignored', () => {
  const a = {
    enabled: true,
    description: 'hi',
    welcome_channels: [{ channel_id: '1', description: 'a', emoji_name: '📜' }],
  };
  const b = {
    enabled: false,
    description: 'hi',
    welcome_channels: [{ channel_id: '1', description: 'a', emoji_name: '📜' }],
  };
  assert.equal(normalizeWelcome(a), normalizeWelcome(b)); // enabled excluded
  const c = { ...a, description: 'bye' };
  assert.notEqual(normalizeWelcome(a), normalizeWelcome(c));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
