/**
 * lib/validators -- leniency-by-default validators for the forms layer.
 *
 * Every validator: empty → OK, valid → OK, invalid → { ok:false, message }.
 * `validateRequired` is the one exception that fails on empty.
 *
 * URL validators auto-prepend `https://` when only the host is given.
 */
import { describe, expect, it } from 'vitest';
import {
  validateEmail,
  validateGitHub,
  validateLinkedIn,
  validateOptional,
  validatePhone,
  validatePortfolio,
  validateRequired,
  validateTwitter,
  validateUrl,
} from './validators';

describe('validateOptional', () => {
  it('treats null as optional', () => {
    expect(validateOptional(null)).toBe(true);
  });
  it('treats undefined as optional', () => {
    expect(validateOptional(undefined)).toBe(true);
  });
  it('treats empty string as optional', () => {
    expect(validateOptional('')).toBe(true);
  });
  it('treats whitespace-only as optional', () => {
    expect(validateOptional('   \n\t')).toBe(true);
  });
  it('returns false for any real value', () => {
    expect(validateOptional('a')).toBe(false);
  });
});

describe('validateRequired', () => {
  it('fails on empty', () => {
    const r = validateRequired('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Required');
  });
  it('fails on whitespace-only', () => {
    expect(validateRequired('   ').ok).toBe(false);
  });
  it('fails on null/undefined', () => {
    expect(validateRequired(null).ok).toBe(false);
    expect(validateRequired(undefined).ok).toBe(false);
  });
  it('passes on real value', () => {
    expect(validateRequired('hello').ok).toBe(true);
  });
});

describe('validateEmail', () => {
  it('passes empty (leniency-by-default)', () => {
    expect(validateEmail('').ok).toBe(true);
  });
  it('passes basic addresses', () => {
    expect(validateEmail('jane@example.com').ok).toBe(true);
    expect(validateEmail('a+b@sub.example.co').ok).toBe(true);
  });
  it('trims whitespace before checking', () => {
    expect(validateEmail('  jane@example.com  ').ok).toBe(true);
  });
  it('fails on missing @', () => {
    expect(validateEmail('jane.example.com').ok).toBe(false);
  });
  it('fails on missing domain', () => {
    expect(validateEmail('jane@').ok).toBe(false);
  });
  it('fails on missing local part', () => {
    expect(validateEmail('@example.com').ok).toBe(false);
  });
  it('fails on missing TLD-shaped suffix', () => {
    expect(validateEmail('jane@example').ok).toBe(false);
  });
  it('fails on >254 chars', () => {
    const long = 'a'.repeat(250) + '@e.co';
    expect(validateEmail(long).ok).toBe(false);
  });
});

describe('validatePhone', () => {
  it('passes empty', () => {
    expect(validatePhone('').ok).toBe(true);
  });
  it('passes US-style format', () => {
    expect(validatePhone('(555) 123-4567').ok).toBe(true);
  });
  it('passes E.164', () => {
    expect(validatePhone('+1 555 123 4567').ok).toBe(true);
  });
  it('fails on < 7 digits', () => {
    expect(validatePhone('555-1').ok).toBe(false);
  });
  it('fails on > 15 digits', () => {
    expect(validatePhone('+1234567890123456').ok).toBe(false);
  });
  it('fails on letters in number', () => {
    expect(validatePhone('555-CALL-NOW').ok).toBe(false);
  });
});

describe('validateUrl', () => {
  it('passes empty', () => {
    expect(validateUrl('').ok).toBe(true);
  });
  it('passes https://...', () => {
    expect(validateUrl('https://example.com').ok).toBe(true);
  });
  it('passes http://...', () => {
    expect(validateUrl('http://example.com').ok).toBe(true);
  });
  it('auto-prepends https:// for host-only input', () => {
    expect(validateUrl('example.com').ok).toBe(true);
    expect(validateUrl('sub.example.co.uk/path').ok).toBe(true);
  });
  it('fails on garbage', () => {
    expect(validateUrl('not a url').ok).toBe(false);
  });
  it('rejects javascript: protocols (no dot in input means no auto-prefix)', () => {
    // `javascript:alert(1)` has no dot in the host portion, so normaliseUrl
    // returns null and the validator fails. (`ftp://example.com` is
    // intentionally lenient: it gets prefixed with https:// → parses as
    // host="ftp" path="//example.com", which is a valid http URL.)
    expect(validateUrl('javascript:alert(1)').ok).toBe(false);
  });
});

describe('validateLinkedIn', () => {
  it('passes empty', () => {
    expect(validateLinkedIn('').ok).toBe(true);
  });
  it('passes linkedin.com hosts', () => {
    expect(validateLinkedIn('linkedin.com/in/jane').ok).toBe(true);
    expect(validateLinkedIn('https://www.linkedin.com/in/jane').ok).toBe(true);
    expect(validateLinkedIn('https://uk.linkedin.com/in/jane').ok).toBe(true);
  });
  it('fails on non-linkedin hosts', () => {
    const r = validateLinkedIn('https://twitter.com/jane');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('LinkedIn');
  });
});

describe('validateGitHub', () => {
  it('passes github.com', () => {
    expect(validateGitHub('github.com/jane').ok).toBe(true);
  });
  it('fails on gitlab.com', () => {
    expect(validateGitHub('https://gitlab.com/jane').ok).toBe(false);
  });
});

describe('validateTwitter', () => {
  it('accepts both twitter.com and x.com', () => {
    expect(validateTwitter('twitter.com/jane').ok).toBe(true);
    expect(validateTwitter('x.com/jane').ok).toBe(true);
  });
  it('rejects mastodon', () => {
    expect(validateTwitter('https://hachyderm.io/@jane').ok).toBe(false);
  });
});

describe('validatePortfolio', () => {
  it('passes any valid URL', () => {
    expect(validatePortfolio('jane.dev').ok).toBe(true);
    expect(validatePortfolio('https://janes-portfolio.vercel.app').ok).toBe(true);
  });
  it('fails on too-short hostname', () => {
    // tld.x has hostname "tld.x" which is 5 chars -- passes
    // make a shorter one:
    expect(validatePortfolio('https://a.b').ok).toBe(false);
  });
  it('fails on garbage', () => {
    expect(validatePortfolio('lol nope').ok).toBe(false);
  });
});
