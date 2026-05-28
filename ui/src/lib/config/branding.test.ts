/**
 * lib/config/branding -- legacy re-export surface for brand strings + the
 * cmd() / docTitle() helpers.
 *
 * Tests confirm the helpers compose correctly + the re-exports resolve
 * to non-empty strings. Drift from brand.json gets caught by the brand
 * apply pipeline (capacitor.integration.test.ts); these tests only
 * exercise the helper logic.
 */
import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  APP_TAGLINE,
  APP_DESCRIPTION,
  CLI_NAMESPACE,
  REPO_URL,
  cmd,
  docTitle,
} from './branding';

describe('re-exports', () => {
  it('aPP_NAME is a non-empty string', () => {
    expect(typeof APP_NAME).toBe('string');
    expect(APP_NAME.length).toBeGreaterThan(0);
  });
  it('aPP_TAGLINE is a non-empty string', () => {
    expect(typeof APP_TAGLINE).toBe('string');
    expect(APP_TAGLINE.length).toBeGreaterThan(0);
  });
  it('aPP_DESCRIPTION equals APP_TAGLINE (legacy alias)', () => {
    expect(APP_DESCRIPTION).toBe(APP_TAGLINE);
  });
  it('cLI_NAMESPACE is "heron"', () => {
    expect(CLI_NAMESPACE).toBe('heron');
  });
  it('rEPO_URL is an https URL', () => {
    expect(REPO_URL).toMatch(/^https?:\/\//);
  });
});

describe('cmd()', () => {
  it('returns /heron when no verb given', () => {
    expect(cmd()).toBe('/heron');
  });
  it('appends verb when given', () => {
    expect(cmd('evaluate')).toBe('/heron evaluate');
    expect(cmd('scan')).toBe('/heron scan');
  });
  it('handles empty string verb (treated as no verb)', () => {
    expect(cmd('')).toBe('/heron');
  });
});

describe('docTitle()', () => {
  it('appends APP_NAME', () => {
    expect(docTitle(['Inbox'])).toContain(APP_NAME);
    expect(docTitle(['Inbox']).endsWith(APP_NAME)).toBe(true);
  });
  it('joins parts with em-dash separator', () => {
    expect(docTitle(['Inbox'])).toBe(`Inbox — ${APP_NAME}`);
  });
  it('skips empty/null/undefined parts', () => {
    expect(docTitle([null, 'Inbox', undefined, ''])).toBe(`Inbox — ${APP_NAME}`);
  });
  it('handles all-empty array → just APP_NAME', () => {
    expect(docTitle([null, undefined, ''])).toBe(APP_NAME);
  });
  it('handles multiple parts', () => {
    expect(docTitle(['Inbox', 'Pipeline'])).toBe(`Inbox — Pipeline — ${APP_NAME}`);
  });
});
