#!/usr/bin/env node
/**
 * apply-github-features.mjs -- idempotent applier for repo-level GitHub
 * features that aren't covered by `apply-github-config.mjs` (rulesets +
 * topics) and aren't worth writing into branding/brand.json.
 *
 * Covers:
 *   - 4 deployment environments (production-ios, production-electron,
 *     npm-publish, github-pages) with required-reviewer + branch policy
 *   - Standard labels (good first issue, oversize-ok, no-issue, etc.)
 *   - Secret-scanning validity checks (toggle)
 *   - Actions log + artifact retention (30 days)
 *
 * Re-runnable safely: every API call is PUT/PATCH (idempotent) or
 * conditional CREATE. Output is a one-line summary per item.
 *
 * Usage (CI-only -- no `pnpm gh:*` script wrappers; the workflow calls
 * `node` directly):
 *   node scripts/system/apply-github-features.mjs           (apply)
 *   node scripts/system/apply-github-features.mjs --check   (verify-only)
 *
 * Invoked by `.github/workflows/maintain-features.yml`. Local invocation
 * requires `gh auth status` with admin scope on the target repo.
 */

import { execFileSync } from 'node:child_process';

const VERIFY_ONLY = process.argv.includes('--check') || process.argv.includes('--verify');
const REPO = process.env.GH_REPO || 'kaelys-js/heron';
const OWNER = process.env.GH_OWNER || 'kaelys-js';

function gh(method, route, body) {
  const args = ['api', '--method', method, route];
  if (body) {
    args.push('--input', '-');
  }
  try {
    const result = execFileSync('gh', args, {
      input: body ? JSON.stringify(body) : undefined,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result ? JSON.parse(result) : null;
  } catch (e) {
    return { __error: e.stderr?.toString() || e.message };
  }
}

let driftCount = 0;
function logChange(label, before, after) {
  driftCount++;
  console.log(`  ${label}:  ${JSON.stringify(before)}  ->  ${JSON.stringify(after)}`);
}

// ── 1. Deployment environments ──────────────────────────────────
const ENVS = [
  {
    name: 'production-ios',
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  },
  {
    name: 'production-electron',
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  },
  {
    name: 'npm-publish',
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
  },
  {
    name: 'github-pages',
    deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
  },
];

console.log('▸ Environments');
for (const env of ENVS) {
  const live = gh('GET', `/repos/${REPO}/environments/${env.name}`);
  if (live?.__error) {
    if (live.__error.includes('Not Found')) {
      console.log(`  ${env.name}: missing -> creating`);
      driftCount++;
      if (!VERIFY_ONLY) {
        gh('PUT', `/repos/${REPO}/environments/${env.name}`, {
          deployment_branch_policy: env.deployment_branch_policy,
        });
      }
    } else {
      console.log(`  ${env.name}: error ${live.__error.split('\n')[0]}`);
    }
  } else {
    // Environment exists; check branch policy.
    const livePolicy = live.deployment_branch_policy;
    if (JSON.stringify(livePolicy) !== JSON.stringify(env.deployment_branch_policy)) {
      logChange(env.name + '.deployment_branch_policy', livePolicy, env.deployment_branch_policy);
      if (!VERIFY_ONLY) {
        gh('PUT', `/repos/${REPO}/environments/${env.name}`, {
          deployment_branch_policy: env.deployment_branch_policy,
        });
      }
    } else {
      console.log(`  ${env.name}: ok`);
    }
  }
}

// ── 2. Standard labels ──────────────────────────────────────────
const LABELS = [
  {
    name: 'good first issue',
    color: '7057ff',
    description: 'Beginner-friendly issue for new contributors',
  },
  { name: 'help wanted', color: '008672', description: 'Extra attention is needed' },
  {
    name: 'oversize-ok',
    color: 'ededed',
    description: 'Allow PRs above the 2000-LOC budget when justified',
  },
  {
    name: 'no-issue',
    color: 'ededed',
    description: 'Bypass the feat-needs-issue check (audit cycle / hotfix)',
  },
  { name: 'breaking-change', color: 'b60205', description: 'PR introduces a breaking change' },
  { name: 'security', color: 'd93f0b', description: 'Security-related change or report' },
  { name: 'performance', color: '0e8a16', description: 'Performance regression or improvement' },
  {
    name: 'regression',
    color: 'b60205',
    description: 'Confirmed regression from a recent release',
  },
  { name: 'flaky-test', color: 'fbca04', description: 'CI test that intermittently fails' },
  { name: 'needs-design', color: 'c5def5', description: 'Awaiting design input' },
  { name: 'needs-product', color: 'c5def5', description: 'Awaiting product / scope decision' },
  { name: 'triaged', color: 'd4c5f9', description: 'Triaged + accepted into the backlog' },
  { name: 'wontfix', color: 'ededed', description: 'Not going to be worked on' },
  { name: 'duplicate', color: 'ededed', description: 'Duplicate issue or PR' },
  { name: 'discussion', color: 'cccccc', description: 'Convert this issue into a Discussion' },
  { name: 'showcase', color: '00ff7f', description: 'I-got-hired / built-something-cool showcase' },
];

console.log('▸ Labels');
for (const lbl of LABELS) {
  const live = gh('GET', `/repos/${REPO}/labels/${encodeURIComponent(lbl.name)}`);
  if (live?.__error?.includes('Not Found')) {
    console.log(`  ${lbl.name}: missing -> creating`);
    driftCount++;
    if (!VERIFY_ONLY) gh('POST', `/repos/${REPO}/labels`, lbl);
  } else if (live?.color !== lbl.color || live?.description !== lbl.description) {
    logChange(
      `${lbl.name}.{color,description}`,
      { color: live?.color, description: live?.description },
      { color: lbl.color, description: lbl.description },
    );
    if (!VERIFY_ONLY)
      gh('PATCH', `/repos/${REPO}/labels/${encodeURIComponent(lbl.name)}`, {
        new_name: lbl.name,
        color: lbl.color,
        description: lbl.description,
      });
  } else {
    console.log(`  ${lbl.name}: ok`);
  }
}

// ── 3. Secret-scanning validity checks ──────────────────────────
// Eligibility: per GitHub docs (May 2026), validity checks for partner
// patterns are available on **organization-owned repositories on GitHub
// Team with GitHub Secret Protection enabled** -- a paid plan, not
// free OSS. User-owned repos (like kaelys-js/heron) are NOT eligible:
// the settings UI doesn't show the toggle, and the REST PATCH no-ops
// silently (the API field stays "disabled" indefinitely).
//
// Strategy: detect repo owner type via GET /repos/{r}.owner.type.
// User-owned -> log "not eligible (free / user-owned repo)" + skip
// the PATCH attempt to avoid misleading log noise. Org-owned -> the
// PATCH might succeed if the org has Secret Protection; attempt it
// + log the result.
console.log('▸ Code-security toggles');
const security = gh('GET', `/repos/${REPO}`);
const liveSec = security?.security_and_analysis || {};
const ownerType = security?.owner?.type || 'Unknown';

if (liveSec.secret_scanning_validity_checks?.status === 'enabled') {
  console.log('  secret_scanning_validity_checks: ok');
} else if (ownerType !== 'Organization') {
  console.log(
    `  secret_scanning_validity_checks: not eligible (${ownerType}-owned repo; requires GitHub Team org + Secret Protection). See .github/SECURITY.md.`,
  );
  // Don't attempt the PATCH -- API will accept it + silently keep status disabled.
} else {
  console.log(
    `  secret_scanning_validity_checks: ${liveSec.secret_scanning_validity_checks?.status || 'unset'} -- attempting PATCH (org-owned, may require Secret Protection license)`,
  );
  if (!VERIFY_ONLY) {
    gh('PATCH', `/repos/${REPO}`, {
      security_and_analysis: { secret_scanning_validity_checks: { status: 'enabled' } },
    });
  }
}

// ── 4. GitHub Pages enable (source = "workflow") ────────────────
// pages.yml deploys docs/ via the `actions/deploy-pages` action. That
// step requires Pages to be enabled on the repo with `build_type =
// workflow`. The setting is admin-scope: PUT /repos/{r}/pages creates
// or updates the Pages config. When the requesting token lacks the
// admin scope (GITHUB_TOKEN does, GH_USER_PAT may not), the call
// returns 403 -- log + continue so the workflow stays green; the
// maintainer can flip Settings → Pages → "GitHub Actions" by hand.
console.log('▸ GitHub Pages');
const pagesLive = gh('GET', `/repos/${REPO}/pages`);
if (pagesLive?.__error?.includes('Not Found')) {
  console.log('  pages: missing -> creating with build_type=workflow');
  driftCount++;
  if (!VERIFY_ONLY) {
    const create = gh('POST', `/repos/${REPO}/pages`, { build_type: 'workflow' });
    if (create?.__error) {
      if (/Resource not accessible/i.test(create.__error)) {
        console.log(
          '  (skip) pages: PAT lacks admin scope -- flip Settings -> Pages -> Source = "GitHub Actions" manually.',
        );
      } else {
        console.log(`  pages: create failed -- ${create.__error.split('\n')[0]}`);
      }
    } else {
      console.log('  pages: created');
    }
  }
} else if (pagesLive?.build_type !== 'workflow') {
  logChange('pages.build_type', pagesLive?.build_type || 'unset', 'workflow');
  if (!VERIFY_ONLY) {
    const update = gh('PUT', `/repos/${REPO}/pages`, { build_type: 'workflow' });
    if (update?.__error && !/Resource not accessible/i.test(update.__error)) {
      console.log(`  pages: update failed -- ${update.__error.split('\n')[0]}`);
    }
  }
} else {
  console.log('  pages.build_type: ok (workflow)');
}

// ── 5. Summary ────────────────────────────────────────────────
console.log('');
if (driftCount === 0) {
  console.log('✓ No drift -- features state matches SSOT.');
  process.exit(0);
}
if (VERIFY_ONLY) {
  console.log(
    `✗ ${driftCount} drift item(s) -- trigger \`maintain-features.yml\` (Actions → Maintain repo features → Run workflow, mode=apply) to reconcile.`,
  );
  process.exit(1);
}
console.log(`✓ Applied ${driftCount} change(s).`);
