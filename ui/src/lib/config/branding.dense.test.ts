/**
 * lib/config/branding -- dense table-driven helper coverage.
 */
import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE, CLI_NAMESPACE, cmd, docTitle } from './branding';

describe('cmd — every verb', () => {
  it.each([
    'evaluate',
    'scan',
    'apply',
    'cv',
    'pipeline',
    'deep-eval',
    'follow-up',
    'pdf',
    'scan-and-score',
  ])('verb %s', (verb) => {
    expect(cmd(verb)).toBe(`/${CLI_NAMESPACE} ${verb}`);
  });
});

describe('cmd — empty / no verb', () => {
  it.each(['', undefined])('verb=%p → /heron', (verb) => {
    expect(cmd(verb)).toBe(`/${CLI_NAMESPACE}`);
  });
});

describe('docTitle — every shape', () => {
  it.each([
    [['Inbox'], `Inbox — ${APP_NAME}`],
    [['Pipeline'], `Pipeline — ${APP_NAME}`],
    [['Inbox', 'Pipeline'], `Inbox — Pipeline — ${APP_NAME}`],
    [[''], APP_NAME],
    [[null], APP_NAME],
    [[undefined], APP_NAME],
    [[null, 'Inbox'], `Inbox — ${APP_NAME}`],
    [['Inbox', null], `Inbox — ${APP_NAME}`],
    [['Inbox', undefined, 'Detail'], `Inbox — Detail — ${APP_NAME}`],
  ] as const)('parts=%o → "%s"', (parts, expected) => {
    expect(docTitle(parts as any)).toBe(expected);
  });
});

describe('docTitle — always ends with APP_NAME', () => {
  it.each([[['Inbox']], [['A', 'B', 'C']], [[]], [[null, undefined, '']]])('parts=%o', (parts) => {
    expect(docTitle(parts as any).endsWith(APP_NAME)).toBe(true);
  });
});

describe('re-exports — non-empty strings', () => {
  it.each([
    ['APP_NAME', APP_NAME],
    ['APP_TAGLINE', APP_TAGLINE],
    ['CLI_NAMESPACE', CLI_NAMESPACE],
  ])('%s is non-empty', (_label, value) => {
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });
});
