#!/usr/bin/env node
// TDD suite for verify-discord-config.mjs::findConfigIssues (referential
// integrity). Schema validation itself is exercised by the real config in
// the entrypoint; here we drive each cross-reference rule with fixtures.
import assert from 'node:assert/strict';
import { findConfigIssues } from './verify-discord-config.mjs';

const ALL_EXIST = () => true;

/** A clean, fully-resolving config. */
function valid() {
  return {
    server: {
      name: 'X',
      system_channel: 'general',
      widget: { enabled: true, invite_channel: 'general' },
      system_channel_flags: ['SUPPRESS_GUILD_REMINDER_NOTIFICATIONS'],
      images: { icon: 'a.png' },
    },
    webhooks: { avatar: 'a.png' },
    bot: { avatar: 'a.png' },
    roles: [{ name: 'Mod', permissions: ['MANAGE_MESSAGES'] }],
    categories: [
      {
        name: 'C',
        channels: [
          {
            name: 'general',
            webhook: 'DISCORD_WEBHOOK_X',
            overwrites: [{ role: 'Mod', allow: ['SEND_MESSAGES'], deny: [] }],
          },
        ],
      },
    ],
    automod: [
      {
        name: 'r',
        trigger_type: 1,
        actions: [{ type: 2, metadata: { channel: 'general' } }],
        exempt_roles: ['Mod'],
      },
    ],
    onboarding: {
      enabled: true,
      default_channel_ids: ['general'],
      prompts: [
        { title: 'P', options: [{ title: 'O', channel_ids: ['general'], role_ids: ['Mod'] }] },
      ],
    },
    welcome: { enabled: true, channels: [{ channel: 'general' }] },
    rules: { enabled: true, form_fields: [{ field_type: 'TERMS', label: 'ok', values: [] }] },
  };
}

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
const hasIssue = (issues, sub) => issues.some((i) => i.includes(sub));

console.log('verify-discord-config.mjs -- unit tests\n');

it('valid config -> no issues', () => {
  assert.deepEqual(findConfigIssues(valid(), { fileExists: ALL_EXIST }), []);
});
it('undefined overwrite role is flagged', () => {
  const c = valid();
  c.categories[0].channels[0].overwrites[0].role = 'Ghost';
  assert.ok(hasIssue(findConfigIssues(c, { fileExists: ALL_EXIST }), 'overwrite role "Ghost"'));
});
it('unknown permission is flagged', () => {
  const c = valid();
  c.roles[0].permissions = ['FLY'];
  assert.ok(hasIssue(findConfigIssues(c, { fileExists: ALL_EXIST }), 'unknown permission "FLY"'));
});
it('bad onboarding channel reference is flagged', () => {
  const c = valid();
  c.onboarding.default_channel_ids = ['nope'];
  assert.ok(
    hasIssue(findConfigIssues(c, { fileExists: ALL_EXIST }), '"nope" is not a defined channel'),
  );
});
it('bad automod alert channel is flagged', () => {
  const c = valid();
  c.automod[0].actions[0].metadata.channel = 'ghost';
  assert.ok(hasIssue(findConfigIssues(c, { fileExists: ALL_EXIST }), 'alert channel "ghost"'));
});
it('bad system_channel + widget channel + unknown flag', () => {
  const c = valid();
  c.server.system_channel = 'ghost';
  c.server.widget.invite_channel = 'ghost';
  c.server.system_channel_flags = ['NOPE'];
  const issues = findConfigIssues(c, { fileExists: ALL_EXIST });
  assert.ok(hasIssue(issues, 'server.system_channel "ghost"'));
  assert.ok(hasIssue(issues, 'server.widget.invite_channel "ghost"'));
  assert.ok(hasIssue(issues, 'unknown flag "NOPE"'));
});
it('malformed webhook env name is flagged', () => {
  const c = valid();
  c.categories[0].channels[0].webhook = 'not-an-env';
  assert.ok(hasIssue(findConfigIssues(c, { fileExists: ALL_EXIST }), 'should be an env-var name'));
});
it('missing image sources are flagged', () => {
  const issues = findConfigIssues(valid(), { fileExists: () => false });
  assert.ok(hasIssue(issues, 'server.images.icon'));
  assert.ok(hasIssue(issues, 'webhooks.avatar'));
  assert.ok(hasIssue(issues, 'bot.avatar'));
});
it('malformed rules form_fields is flagged', () => {
  const c = valid();
  c.rules.form_fields = 'nope';
  assert.ok(
    hasIssue(findConfigIssues(c, { fileExists: ALL_EXIST }), 'rules: form_fields must be an array'),
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
