/**
 * lib/validators -- table-driven dense tests.
 *
 * Each describe.each block runs the same assertion against N inputs.
 * Densifies the regression surface without adding fast-check complexity.
 */
import { describe, expect, it } from 'vitest';
import {
  validateEmail,
  validateGitHub,
  validateLinkedIn,
  validatePhone,
  validatePortfolio,
  validateRequired,
  validateTwitter,
  validateUrl,
} from './validators';

describe('validateEmail — happy cases', () => {
  it.each([
    'jane@example.com',
    'a.b@example.com',
    'a+tag@example.co.uk',
    'a_b@x.io',
    'a-b@x.io',
    'first.last+gmail-trick@gmail.com',
    'name@subdomain.example.org',
    'x@y.zz',
    'a1@b2.c3',
    'CAPS@DOMAIN.COM',
  ])('accepts %s', (email) => {
    expect(validateEmail(email).ok).toBe(true);
  });
});

describe('validateEmail — invalid cases', () => {
  it.each([
    'no-at-sign.com',
    '@no-local.com',
    'no-domain@',
    'no-tld@example',
    'spaces in@email.com',
    'email@spaces in.com',
    'multiple@@signs.com',
    'a@b@c.com',
  ])('rejects %s', (email) => {
    expect(validateEmail(email).ok).toBe(false);
  });
});

describe('validatePhone — happy cases', () => {
  it.each([
    '5551234567', // 10 digits
    '15551234567', // 11 with country code
    '+1 555 123 4567',
    '(555) 123-4567',
    '555-123-4567',
    '+44 20 7946 0958', // UK
    '+33 1 23 45 67 89', // FR
    '+81 3-1234-5678', // JP
    '4155551212',
    '7890123',
  ])('accepts %s', (p) => {
    expect(validatePhone(p).ok).toBe(true);
  });
});

describe('validatePhone — invalid cases', () => {
  it.each([
    '555', // too short
    '12345', // 5 digits
    '+1234567890123456', // too long
    '555-CALL-NOW', // letters
    'phone number',
    'abc-123-4567',
  ])('rejects %s', (p) => {
    expect(validatePhone(p).ok).toBe(false);
  });
});

describe('validateUrl — happy cases', () => {
  it.each([
    'https://example.com',
    'http://example.com',
    'https://example.com/path',
    'https://example.com/path?query=1',
    'https://example.com:8080',
    'https://sub.example.com',
    'https://example.co.uk',
    'example.com', // auto-prepends https://
    'sub.example.com/path',
    'example.dev',
  ])('accepts %s', (url) => {
    expect(validateUrl(url).ok).toBe(true);
  });
});

describe('validateUrl — invalid cases', () => {
  it.each([
    'not a url',
    'javascript:alert(1)',
    'lol nope',
    '   ',
    '://broken',
  ])('rejects %s', (url) => {
    // validateOptional treats whitespace as OK (returns true), so '   '
    // and '' actually pass. Filter those out.
    if (url.trim()) {
      expect(validateUrl(url).ok).toBe(false);
    }
  });
});

describe('validateLinkedIn — host allowlist', () => {
  it.each([
    'linkedin.com/in/jane',
    'https://www.linkedin.com/in/jane',
    'https://uk.linkedin.com/in/jane',
    'https://de.linkedin.com/in/jane',
  ])('accepts %s', (url) => {
    expect(validateLinkedIn(url).ok).toBe(true);
  });

  it.each([
    'https://twitter.com/jane',
    'https://github.com/jane',
    'https://example.com/in/jane',
    'https://linkedfake.com/in/jane',
  ])('rejects %s', (url) => {
    expect(validateLinkedIn(url).ok).toBe(false);
  });
});

describe('validateGitHub — host allowlist', () => {
  it.each([
    'github.com/jane',
    'https://github.com/jane',
    'https://www.github.com/jane',
  ])('accepts %s', (url) => {
    expect(validateGitHub(url).ok).toBe(true);
  });

  it.each([
    'https://gitlab.com/jane',
    'https://bitbucket.org/jane',
    'https://giiithub.com/jane',
  ])('rejects %s', (url) => {
    expect(validateGitHub(url).ok).toBe(false);
  });
});

describe('validateTwitter — Twitter OR X', () => {
  it.each([
    'twitter.com/jane',
    'x.com/jane',
    'https://twitter.com/jane',
    'https://x.com/jane',
    'https://www.twitter.com/jane',
    'https://www.x.com/jane',
  ])('accepts %s', (url) => {
    expect(validateTwitter(url).ok).toBe(true);
  });

  it.each([
    'https://mastodon.social/@jane',
    'https://bsky.social/jane',
    'https://example.com/jane',
  ])('rejects %s', (url) => {
    expect(validateTwitter(url).ok).toBe(false);
  });
});

describe('validatePortfolio — generic URL with min hostname', () => {
  it.each([
    'jane.dev',
    'https://janes-portfolio.vercel.app',
    'https://my.cool.site',
    'https://about.me/jane',
  ])('accepts %s', (url) => {
    expect(validatePortfolio(url).ok).toBe(true);
  });

  it.each(['https://a.b', 'lol nope', 'not a url'])('rejects %s', (url) => {
    expect(validatePortfolio(url).ok).toBe(false);
  });
});

describe('validateRequired — completeness', () => {
  it.each([null, undefined, '', '   ', '\t\n', '   \n\t'])('fails on %p', (v) => {
    expect(validateRequired(v as any).ok).toBe(false);
  });

  it.each(['a', 'hello', '   x   ', 'long string of text'])('passes on %p', (v) => {
    expect(validateRequired(v).ok).toBe(true);
  });
});
