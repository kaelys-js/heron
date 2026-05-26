/** Shared brand.json loader for Node scripts. Defaults baked in for
 *  fresh-clone bootstrap (when brand.json is missing/corrupt). Resolves
 *  brand.json by walking up from this file's location, so callers from
 *  any scripts/ subdir work without path math.
 *
 *  Usage:  `import { BRAND } from '../lib/_brand.mjs';`
 *  Python twin: `from _brand import BRAND`. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// scripts/lib/_brand.mjs → scripts/lib/ → scripts/ → repo root.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const BRAND_JSON = join(REPO_ROOT, 'branding', 'brand.json');

/** Historical defaults -- used when brand.json is missing or corrupt.
 *  Keeps scripts functional during fresh-clone bootstrap, repo
 *  surgery, or git-mid-rebase states. The literal values here are
 *  the LAST KNOWN GOOD brand state; if brand.json is missing they
 *  give us a sensible failover rather than crashing with undefined.
 *  When brand.json changes (rebrand, fork), these defaults stay
 *  pinned to the current canonical brand and get refreshed by hand
 *  during the next maintainer commit -- they intentionally do NOT
 *  derive from the brand.json that just disappeared. */
const DEFAULTS = Object.freeze({
  name: 'heron',
  displayName: 'Heron',
  bundleId: 'com.resistjs.heron',
  appGroup: 'group.com.resistjs.heron',
  urlScheme: 'heron',
  serviceType: '_heron._tcp',
  spotlightDomain: 'com.resistjs.heron.jobs',
  envPrefix: 'HERON',
  tagline: 'Stand still. Strike well.',
  subline: 'A thinking partner for career transitions. Patient, precise, local-first.',
  description:
    'Heron is a thinking partner for career transitions. Local-first job-search platform.',
  community: {
    discord: { url: 'https://discord.gg/MyFbztUK5U' },
  },
  repo: {
    owner: 'kaelys-js',
    name: 'heron',
    url: 'https://github.com/kaelys-js/heron',
    issues: 'https://github.com/kaelys-js/heron/issues',
  },
  homepageUrl: 'https://heron.app',
  supportEmail: 'hello@heron.app',
});

function loadBrand() {
  if (!existsSync(BRAND_JSON)) return DEFAULTS;
  try {
    const raw = JSON.parse(readFileSync(BRAND_JSON, 'utf8'));
    // Flatten brand.identifiers.* onto the top-level object so callers
    // can write BRAND.bundleId instead of BRAND.identifiers.bundleId.
    // Keep the nested form too for callers that prefer it.
    const flat = {
      name: raw.name ?? DEFAULTS.name,
      displayName: raw.displayName ?? DEFAULTS.displayName,
      bundleId: raw.identifiers?.bundleId ?? DEFAULTS.bundleId,
      appGroup: raw.identifiers?.appGroup ?? DEFAULTS.appGroup,
      urlScheme: raw.identifiers?.urlScheme ?? DEFAULTS.urlScheme,
      serviceType: raw.identifiers?.serviceType ?? DEFAULTS.serviceType,
      spotlightDomain: raw.identifiers?.spotlightDomain ?? DEFAULTS.spotlightDomain,
      /** Uppercase brand name suffix for env-var names. Callers that
       *  honour env vars (HERON_DATA_DIR, HERON_USER_ID) compose them
       *  as `${BRAND.envPrefix}_DATA_DIR` so a rebrand re-derives the
       *  expected names. Users still have to rename their shell env
       *  vars on rebrand; we ship a migration note in CHANGELOG. */
      envPrefix: (raw.name ?? DEFAULTS.name).toUpperCase(),
      tagline: raw.voice?.tagline ?? DEFAULTS.tagline,
      subline: raw.voice?.subline ?? DEFAULTS.subline,
      description: raw.description ?? DEFAULTS.description,
      community: {
        discord: {
          url: raw.community?.discord?.url ?? DEFAULTS.community.discord.url,
        },
      },
      repo: {
        owner: raw.repo?.owner ?? DEFAULTS.repo.owner,
        name: raw.repo?.name ?? DEFAULTS.repo.name,
        url: raw.repo?.url ?? DEFAULTS.repo.url,
        issues: raw.repo?.issues ?? DEFAULTS.repo.issues,
      },
      homepageUrl: raw.homepageUrl ?? DEFAULTS.homepageUrl,
      supportEmail: raw.supportEmail ?? DEFAULTS.supportEmail,
      // Pass-through for callers that want the raw nested object.
      raw,
    };
    return flat;
  } catch {
    return DEFAULTS;
  }
}

export const BRAND = loadBrand();
export const BRAND_REPO_ROOT = REPO_ROOT;
