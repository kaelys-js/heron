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
 *  surgery, or git-mid-rebase states. */
const DEFAULTS = Object.freeze({
  name: 'heron',
  displayName: 'Heron',
  bundleId: 'com.heron.app',
  urlScheme: 'heron',
  serviceType: '_heron._tcp',
  repo: {
    owner: 'kaelys-js',
    name: 'heron',
    url: 'https://github.com/kaelys-js/heron',
    issues: 'https://github.com/kaelys-js/heron/issues',
  },
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
      urlScheme: raw.identifiers?.urlScheme ?? DEFAULTS.urlScheme,
      serviceType: raw.identifiers?.serviceType ?? DEFAULTS.serviceType,
      repo: {
        owner: raw.repo?.owner ?? DEFAULTS.repo.owner,
        name: raw.repo?.name ?? DEFAULTS.repo.name,
        url: raw.repo?.url ?? DEFAULTS.repo.url,
        issues: raw.repo?.issues ?? DEFAULTS.repo.issues,
      },
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
