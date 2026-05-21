#!/usr/bin/env node
/**
 * apply-github-config.mjs -- idempotent GitHub repo configuration.
 *
 * Reads the desired GitHub-side state from:
 *
 *   • `branding/brand.json::repo` (owner, name, description, homepage, topics)
 *   • `.github/rulesets/*.json` (branch protection rulesets)
 *
 * Calls `gh api` to upsert each piece of state, idempotent. Re-running
 * is a no-op unless something drifted.
 *
 * What it propagates:
 *
 *   1. Repo description + homepage + visibility (description/homepage
 *      from brand.json; visibility stays untouched -- flipping it
 *      requires explicit user confirmation, not silent automation)
 *   2. Repository topics (set-union: applies the brand.json list as
 *      the authoritative set)
 *   3. Branch-protection rulesets (one per file under .github/rulesets/;
 *      matched by `name` field; updated if changed, created if missing)
 *   4. GitHub Advanced Security toggles (secret_scanning,
 *      push_protection, dependabot, PVR -- all "enabled" for public
 *      OSS repos)
 *   5. Repo settings: allow_auto_merge, delete_branch_on_merge,
 *      web_commit_signoff_required
 *
 * What it does NOT touch:
 *
 *   • Visibility (public/private flip) -- too sensitive for automation
 *   • Wiki / Projects / Discussions enablement -- maintainer's call
 *   • Branch creation / deletion -- out of scope
 *   • Workflow secrets -- `gh secret` is the right tool
 *
 * Usage (CI-only -- no `pnpm gh:*` script wrappers; the workflow calls
 * `node` directly):
 *
 *   node scripts/system/apply-github-config.mjs            # apply
 *   node scripts/system/apply-github-config.mjs --verify   # CI drift check
 *   node scripts/system/apply-github-config.mjs --dry      # plan, no writes
 *
 * Invoked by `.github/workflows/maintain-config.yml`. Local invocation
 * requires `gh auth status` with admin scope on the target repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const DRY_RUN = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify') || process.argv.includes('--check');

/** Read brand.json + return the repo block. */
function readBrand() {
  const p = path.join(ROOT, 'branding', 'brand.json');
  const raw = fs.readFileSync(p, 'utf8');
  // strip block-level comments + trailing commas (brand.json uses jsonc-like)
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped).repo;
}

/** Read every .json under .github/rulesets/ (excluding README). */
function readRulesets() {
  const dir = path.join(ROOT, '.github', 'rulesets');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const filepath = path.join(dir, f);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      return { filepath, content };
    });
}

/** gh api wrapper. Returns parsed JSON; throws with the raw error. */
function gh(method, endpoint, body) {
  const args = ['api', '--method', method, endpoint];
  if (body !== undefined) {
    args.push('--input', '-');
  }
  args.push('-H', 'Accept: application/vnd.github+json');
  try {
    const out = execFileSync('gh', args, {
      input: body ? JSON.stringify(body) : undefined,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!out.trim()) return null;
    try {
      return JSON.parse(out);
    } catch {
      return out;
    }
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    throw new Error(`gh ${method} ${endpoint} failed:\n${stderr}`);
  }
}

/** Pretty-print a diff entry without dumping the whole comparison. */
function logChange(label, before, after) {
  if (Array.isArray(before) && Array.isArray(after)) {
    const added = after.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !after.includes(x));
    if (added.length === 0 && removed.length === 0) return false;
    console.log(`  ~ ${label}`);
    if (added.length) console.log(`      + ${added.join(', ')}`);
    if (removed.length) console.log(`      - ${removed.join(', ')}`);
    return true;
  }
  if (before === after) return false;
  console.log(`  ~ ${label}`);
  console.log(`      - ${JSON.stringify(before)}`);
  console.log(`      + ${JSON.stringify(after)}`);
  return true;
}

async function main() {
  const brand = readBrand();
  const owner = brand.owner;
  const name = brand.name;
  if (!owner || !name) {
    console.error('::error::brand.json::repo.owner + repo.name required');
    process.exit(2);
  }
  const repoSlug = `${owner}/${name}`;

  // Verify gh CLI auth + admin access
  try {
    execSync('gh auth status', { stdio: 'pipe' });
  } catch {
    console.error('::error::`gh auth status` failed. Run `gh auth login` first.');
    process.exit(2);
  }

  console.log(`${VERIFY_ONLY ? '🔍' : DRY_RUN ? '🧪' : '⚙️ '}  ${repoSlug}`);

  let driftCount = 0;

  // ── 1. Description + homepage ──────────────────────────────────
  const repoState = gh('GET', `/repos/${repoSlug}`);
  const desc = brand.description ?? '';
  const home = brand.homepage ?? '';
  const descChanged = (repoState.description || '') !== desc;
  const homeChanged = (repoState.homepage || '') !== home;
  if (descChanged || homeChanged) {
    driftCount++;
    console.log('▸ Description / homepage');
    if (descChanged) logChange('description', repoState.description, desc);
    if (homeChanged) logChange('homepage', repoState.homepage, home);
    if (!VERIFY_ONLY && !DRY_RUN) {
      gh('PATCH', `/repos/${repoSlug}`, { description: desc, homepage: home });
    }
  }

  // ── 2. Topics ──────────────────────────────────────────────────
  const desiredTopics = (brand.topics || []).slice().sort();
  const liveTopics = gh('GET', `/repos/${repoSlug}/topics`).names.slice().sort();
  if (JSON.stringify(desiredTopics) !== JSON.stringify(liveTopics)) {
    driftCount++;
    console.log('▸ Topics');
    logChange('topics', liveTopics, desiredTopics);
    if (!VERIFY_ONLY && !DRY_RUN) {
      gh('PUT', `/repos/${repoSlug}/topics`, { names: desiredTopics });
    }
  }

  // ── 3. Repo settings (auto-merge, delete-branch, commit-signoff) ──
  // `allow_auto_merge`, `delete_branch_on_merge`, and the GHAS fields
  // below are only included in GET /repos/{slug} when the requesting
  // token has `administration: read`. GITHUB_TOKEN in workflows cannot
  // grant that scope (PAT-only). So in CI those fields come back
  // undefined -- we treat that as "invisible to this token, skip"
  // rather than false-positive-flag as drift. Local runs with an
  // admin PAT still see the fields and catch real drift.
  const desiredSettings = {
    allow_auto_merge: true,
    delete_branch_on_merge: true,
    web_commit_signoff_required: true,
    has_discussions: true,
    has_issues: true,
  };
  const settingsDrift = Object.entries(desiredSettings).filter(([k, v]) => {
    if (repoState[k] === undefined) return false; // field not visible to current token
    return repoState[k] !== v;
  });
  if (settingsDrift.length > 0) {
    driftCount++;
    console.log('▸ Repo settings');
    for (const [k, v] of settingsDrift) logChange(k, repoState[k], v);
    if (!VERIFY_ONLY && !DRY_RUN) {
      gh('PATCH', `/repos/${repoSlug}`, Object.fromEntries(settingsDrift));
    }
  }

  // ── 4. GHAS toggles ────────────────────────────────────────────
  // Same admin-only-visibility caveat as section 3. When sec[k] is
  // undefined the token can't read this GHAS field; skip rather
  // than assume "disabled".
  const sec = repoState.security_and_analysis || {};
  const ghasDesired = {
    secret_scanning: 'enabled',
    secret_scanning_push_protection: 'enabled',
    dependabot_security_updates: 'enabled',
  };
  const ghasDrift = Object.entries(ghasDesired).filter(([k, v]) => {
    if (sec[k] === undefined) return false; // field not visible to current token
    return sec[k].status !== v;
  });
  if (ghasDrift.length > 0) {
    driftCount++;
    console.log('▸ GitHub Advanced Security');
    for (const [k, v] of ghasDrift) logChange(k, sec[k]?.status || 'disabled', v);
    if (!VERIFY_ONLY && !DRY_RUN) {
      gh('PATCH', `/repos/${repoSlug}`, {
        security_and_analysis: Object.fromEntries(ghasDrift.map(([k, v]) => [k, { status: v }])),
      });
    }
  }

  // Private vulnerability reporting (separate endpoint)
  const pvr = gh('GET', `/repos/${repoSlug}/private-vulnerability-reporting`);
  if (!pvr.enabled) {
    driftCount++;
    console.log('▸ Private vulnerability reporting');
    logChange('enabled', false, true);
    if (!VERIFY_ONLY && !DRY_RUN) {
      gh('PUT', `/repos/${repoSlug}/private-vulnerability-reporting`);
    }
  }

  // Vulnerability alerts + auto-fixes (Dependabot)
  // (these PUT endpoints return empty body on success; 204 on no-change)
  if (!VERIFY_ONLY && !DRY_RUN) {
    try {
      gh('PUT', `/repos/${repoSlug}/vulnerability-alerts`);
      gh('PUT', `/repos/${repoSlug}/automated-security-fixes`);
    } catch {
      /* idempotent -- already enabled is fine */
    }
  }

  // ── 4b. Full settings audit (read-only checks for fields the script
  //         can read but won't apply silently) ─────────────────────
  // Surfaces visible-via-API state that doesn't fit the apply path
  // above: visibility, has_wiki, has_projects, has_pages, has_downloads,
  // default_branch, archived, image_url (social preview), license,
  // and merge-policy toggles (allow_squash_merge / allow_merge_commit /
  // allow_rebase_merge / allow_update_branch). Each is reported as a
  // (notice) when the live value differs from the expected default --
  // not as drift, because some of these are subjective preferences
  // and forcing them via PATCH would be too aggressive. The notice
  // gives the maintainer the actionable signal to fix in UI.
  const EXPECTED_SETTINGS = {
    has_wiki: false,
    has_projects: true,
    has_pages: true,
    has_downloads: true,
    default_branch: 'main',
    archived: false,
    disabled: false,
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    allow_update_branch: true,
    visibility: 'public',
  };
  const auditDiff = [];
  for (const [k, expected] of Object.entries(EXPECTED_SETTINGS)) {
    if (repoState[k] === undefined) continue; // field not visible to token
    if (repoState[k] !== expected) {
      auditDiff.push({ key: k, before: repoState[k], after: expected });
    }
  }
  if (repoState.image_url === null || repoState.image_url === undefined) {
    auditDiff.push({
      key: 'image_url',
      before: '(default auto-generated)',
      after: '(custom upload via UI)',
    });
  }
  if (!repoState.license || repoState.license.spdx_id === 'NOASSERTION') {
    auditDiff.push({
      key: 'license',
      before: repoState.license?.spdx_id || 'NOASSERTION',
      after: 'MIT (or any SPDX)',
    });
  }
  if (auditDiff.length > 0) {
    console.log('▸ Settings audit (read-only — see notices)');
    for (const d of auditDiff) {
      console.log(
        `  (notice) ${d.key}: ${JSON.stringify(d.before)} (expected ${JSON.stringify(d.after)})`,
      );
    }
    // Don't increment driftCount -- these are notices, not auto-applied.
  } else {
    console.log('▸ Settings audit: ok');
  }

  // ── 5. Branch protection rulesets ──────────────────────────────
  const liveRulesets = gh('GET', `/repos/${repoSlug}/rulesets`) || [];
  const desiredRulesets = readRulesets();
  for (const { filepath, content } of desiredRulesets) {
    const existing = liveRulesets.find((r) => r.name === content.name);
    if (existing) {
      // GET the full ruleset to compare (the list endpoint omits rules detail)
      const full = gh('GET', `/repos/${repoSlug}/rulesets/${existing.id}`);
      // Cheap diff: enforce + rule count
      const enforcementDrift = full.enforcement !== content.enforcement;
      const ruleCountDrift = (full.rules || []).length !== (content.rules || []).length;
      if (enforcementDrift || ruleCountDrift) {
        driftCount++;
        console.log(`▸ Ruleset "${content.name}" (id=${existing.id})`);
        if (enforcementDrift) logChange('enforcement', full.enforcement, content.enforcement);
        if (ruleCountDrift)
          logChange('rules.length', (full.rules || []).length, (content.rules || []).length);
        if (!VERIFY_ONLY && !DRY_RUN) {
          gh('PUT', `/repos/${repoSlug}/rulesets/${existing.id}`, content);
        }
      }
    } else {
      driftCount++;
      console.log(`▸ Ruleset "${content.name}" (new — ${path.basename(filepath)})`);
      if (!VERIFY_ONLY && !DRY_RUN) {
        const created = gh('POST', `/repos/${repoSlug}/rulesets`, content);
        console.log(`  ✓ created id=${created.id}`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────
  if (driftCount === 0) {
    console.log('✓ No drift — repo state matches brand.json + .github/rulesets/');
    process.exit(0);
  }
  if (VERIFY_ONLY) {
    console.log(
      `\n✗ ${driftCount} drift item(s) — trigger \`maintain-config.yml\` (Actions → Maintain GitHub config → Run workflow, mode=apply) to reconcile.`,
    );
    process.exit(1);
  }
  if (DRY_RUN) {
    console.log(`\n🧪 ${driftCount} item(s) would change (dry-run, no writes).`);
    process.exit(0);
  }
  console.log(`\n✓ Applied ${driftCount} change(s).`);
}

main().catch((err) => {
  console.error('::error::', err.message || err);
  process.exit(1);
});
