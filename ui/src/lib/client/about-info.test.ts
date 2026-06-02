/**
 * about-info -- the pure assemblers behind the /about surface.
 *
 * The About surface is the screen a user reads off to a bug report, so the
 * payload it copies + the rows it shows must be exact and must DROP anything
 * absent (an empty SHA, no native bundle off-iOS, no device off-native) rather
 * than render blank "Build  ()" / "iOS  · " lines. These cases pin that.
 */
import { describe, expect, it } from 'vitest';
import { aboutLinks, deviceLine, nativeBundleLine, diagnosticsPayload } from './about-info';

describe('aboutLinks', () => {
  it('builds Website / GitHub / Report a bug / License from the brand repo block', () => {
    const links = aboutLinks();
    const labels = links.map((l) => l.label);
    expect(labels).toContain('Website');
    expect(labels).toContain('GitHub');
    expect(labels).toContain('Report a bug');
    expect(labels).toContain('License');
    // Every link carries an https URL the Browser plugin can open.
    for (const l of links) {
      expect(l.url).toMatch(/^https?:\/\//);
    }
  });

  it('points GitHub + Report a bug at the brand repo + issues', () => {
    const links = aboutLinks();
    const gh = links.find((l) => l.label === 'GitHub');
    const bug = links.find((l) => l.label === 'Report a bug');
    expect(gh?.url).toContain('github.com');
    expect(bug?.url).toContain('/issues');
  });
});

describe('deviceLine', () => {
  it('renders "iOS {osVersion} · {model}" when both are present', () => {
    expect(deviceLine({ os: 'iOS', osVersion: '17.5', model: 'iPhone15,2' })).toBe(
      'iOS 17.5 · iPhone15,2',
    );
  });

  it('drops the model when absent', () => {
    expect(deviceLine({ os: 'iOS', osVersion: '17.5', model: '' })).toBe('iOS 17.5');
  });

  it('returns an empty string off native (no os / version)', () => {
    expect(deviceLine({ os: 'web', osVersion: '', model: '' })).toBe('');
    expect(deviceLine(null)).toBe('');
  });
});

describe('nativeBundleLine', () => {
  it('renders "Build {shortVersion} ({buildNumber})" for the iOS bundle', () => {
    expect(nativeBundleLine({ shortVersion: '0.1.0', buildNumber: '100' })).toBe(
      'Build 0.1.0 (100)',
    );
  });

  it('returns an empty string off iOS (null bundle info)', () => {
    expect(nativeBundleLine(null)).toBe('');
  });

  it('returns an empty string when the bundle fields are blank', () => {
    expect(nativeBundleLine({ shortVersion: '', buildNumber: '' })).toBe('');
  });
});

describe('diagnosticsPayload', () => {
  it('bundles displayName + version + commit + buildDate + native bundle + device, dropping absent parts', () => {
    const payload = diagnosticsPayload({
      displayName: 'Heron',
      version: '1.2.3',
      commit: 'abc1234',
      buildDate: '2024-05-06T07:08:09.000Z',
      bundle: { shortVersion: '1.2.3', buildNumber: '10203' },
      device: { os: 'iOS', osVersion: '17.5', model: 'iPhone15,2' },
    });
    expect(payload).toContain('Heron 1.2.3');
    expect(payload).toContain('Commit abc1234');
    // The copy payload carries the FULL ISO timestamp (the visible chrome
    // shows only the day) so support can date a build to the minute.
    expect(payload).toContain('Build 2024-05-06T07:08:09.000Z');
    expect(payload).toContain('Bundle 1.2.3 (10203)');
    expect(payload).toContain('Device iOS 17.5 · iPhone15,2');
  });

  it('omits the commit / bundle / device lines when they are absent (web build)', () => {
    const payload = diagnosticsPayload({
      displayName: 'Heron',
      version: '1.2.3',
      commit: '',
      buildDate: '',
      bundle: null,
      device: { os: 'web', osVersion: '', model: '' },
    });
    expect(payload).toContain('Heron 1.2.3');
    expect(payload).not.toContain('Commit');
    expect(payload).not.toContain('Bundle');
    expect(payload).not.toContain('Device');
    expect(payload).not.toContain('Build ');
  });
});
