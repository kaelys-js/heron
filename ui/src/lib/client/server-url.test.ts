import { describe, expect, it } from 'vitest';
import { isValidServerHost, validateServerUrl, normalizeServerUrl } from './server-url';

describe('isValidServerHost', () => {
  it('accepts localhost, IPv4, bracketed IPv6, and real dotted names', () => {
    for (const ok of [
      'localhost',
      '192.168.1.20',
      '127.0.0.1',
      '10.0.0.5',
      '[::1]',
      'myserver.local',
      'host.example.com',
      'a-b.example.co',
    ]) {
      expect(isValidServerHost(ok), ok).toBe(true);
    }
  });

  it('rejects the ".com" class of garbage (leading/trailing/empty labels)', () => {
    for (const bad of ['.com', 'com.', 'host.', '.local', 'a..b', '..', '']) {
      expect(isValidServerHost(bad), bad).toBe(false);
    }
  });

  it('rejects bare words, numeric TLDs, octets > 255, and bad label chars', () => {
    expect(isValidServerHost('abc')).toBe(false); // no dot
    expect(isValidServerHost('host.123')).toBe(false); // numeric TLD
    expect(isValidServerHost('999.1.1.1')).toBe(false); // octet > 255
    expect(isValidServerHost('-bad.example.com')).toBe(false); // leading hyphen
    expect(isValidServerHost('bad-.example.com')).toBe(false); // trailing hyphen
  });
});

describe('validateServerUrl', () => {
  it('returns null for valid addresses, with or without scheme/port', () => {
    for (const ok of [
      'localhost',
      'localhost:5173',
      '192.168.1.20:5173',
      'http://example.com',
      'https://host.example.com:8443',
      'myserver.local',
    ]) {
      expect(validateServerUrl(ok), ok).toBeNull();
    }
  });

  it('asks for input when empty / whitespace', () => {
    expect(validateServerUrl('')).toMatch(/enter a server/i);
    expect(validateServerUrl('   ')).toMatch(/enter a server/i);
  });

  it('rejects the reported ".com" hole and other malformed hosts', () => {
    for (const bad of ['.com', 'com.', 'host.', 'a..b', 'abc']) {
      expect(validateServerUrl(bad), bad).not.toBeNull();
    }
  });

  it('rejects an out-of-range port', () => {
    // new URL() rejects ports > 65535 outright; this covers the parse-failure path.
    expect(validateServerUrl('192.168.1.20:99999')).not.toBeNull();
  });
});

describe('normalizeServerUrl', () => {
  it('defaults to http:// and strips path/query/hash to the origin', () => {
    expect(normalizeServerUrl('192.168.1.20:5173/foo?x=1#y')).toBe('http://192.168.1.20:5173');
    expect(normalizeServerUrl('https://example.com:8443/a')).toBe('https://example.com:8443');
    expect(normalizeServerUrl('  localhost:5173  ')).toBe('http://localhost:5173');
  });
});
