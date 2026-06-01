/**
 * server-url -- validate + normalize a manually-typed backend server address.
 *
 * Stricter than a bare `new URL()` parse, and stricter than the old
 * `host.includes('.')` check (which let garbage like ".com" through because a
 * leading-dot string still "contains a dot"). We require localhost, a real
 * IPv4/IPv6 literal, or a well-formed multi-label DNS name with an alphabetic
 * TLD -- so ".com", "host.", "a..b" and bare words are all rejected.
 */

/** localhost, a dotted IPv4 (octets <= 255), a bracketed IPv6 literal, or a
 *  real multi-label DNS name (each label 1-63 chars of [a-z0-9-], no
 *  leading/trailing hyphen; alphabetic TLD >= 2 chars). */
export function isValidServerHost(host: string): boolean {
  if (host === 'localhost') return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host.split('.').every((octet) => Number(octet) <= 255);
  }
  if (host.startsWith('[') && host.endsWith(']')) return host.length > 2; // IPv6 literal
  const labels = host.split('.');
  if (labels.length < 2) return false; // bare word like "abc"
  const labelOk = (l: string) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(l);
  if (!labels.every(labelOk)) return false; // empty / over-long / bad-char label
  return /^[a-z]{2,}$/i.test(labels[labels.length - 1]); // alphabetic TLD
}

/** Returns a human-readable error string, or null when the address is valid. */
export function validateServerUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return 'Enter a server address.';
  const normalized = /^https?:\/\//i.test(v) ? v : `http://${v}`;
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return "That doesn't look like a valid address.";
  }
  if (!u.hostname) return 'That address is missing a host name.';
  if (!isValidServerHost(u.hostname)) {
    return 'Enter a host like 192.168.1.20:5173 or myserver.local.';
  }
  if (u.port) {
    const port = Number(u.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return "That port number isn't valid.";
    }
  }
  return null;
}

/** Normalize a (validated) address to an origin only: scheme://host[:port].
 *  A backend base URL should never carry a path/query/hash. */
export function normalizeServerUrl(raw: string): string {
  const v = raw.trim();
  return new URL(/^https?:\/\//i.test(v) ? v : `http://${v}`).origin;
}
