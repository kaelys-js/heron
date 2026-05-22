#!/usr/bin/env node
/**
 * apply-user-features.mjs -- idempotent applier for user-scope GitHub
 * state that's adjacent to the repo (Project v2, saved replies,
 * profile README repo) plus repo-scope features that need to write
 * (pinned issue, pinned discussions, social-preview PNG).
 *
 * Invoked by `.github/workflows/maintain-user-features.yml` on
 * push:main + weekly cron + workflow_dispatch. Authentication via
 * the `GH_USER_PAT` env var -- a fine-grained PAT scoped to:
 *
 *   repo               (write README to <owner>/<owner>)
 *   write:discussion   (create + pin Discussions)
 *   read/write:user    (saved replies)
 *   read/write:project (Project v2)
 *
 * When `GH_USER_PAT` is absent, the script exits 0 with a notice --
 * the workflow stays green so first-time maintainers can incrementally
 * land the secret without breaking CI.
 *
 * Modes:
 *   apply-user-features.mjs           apply (default)
 *   apply-user-features.mjs --check   verify-only; exit 1 on drift
 */

import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFY_ONLY = process.argv.includes('--check') || process.argv.includes('--verify');
const REPO = process.env.GH_REPO || 'kaelys-js/heron';
const OWNER = process.env.GH_OWNER || REPO.split('/')[0];
const PAT = process.env.GH_USER_PAT || process.env.GH_TOKEN || '';

// Read brand.json for SSOT values (Discord URL, supportEmail, etc.).
// Fall back to safe defaults when fields are absent, the file is
// missing, OR parsing throws (malformed JSON) -- the script must run
// even when invoked outside a checkout AND must not hard-crash on
// transiently-bad input.
const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAND_JSON = resolve(__dirname, '..', '..', 'branding', 'brand.json');
let BRAND = {};
if (existsSync(BRAND_JSON)) {
  try {
    BRAND = JSON.parse(
      readFileSync(BRAND_JSON, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,(\s*[}\]])/g, '$1'),
    );
  } catch (e) {
    console.log(
      `::warning::branding/brand.json parse failed (${e.message?.split('\n')[0] || e}); falling back to defaults.`,
    );
  }
}
const DISCORD_URL = BRAND.community?.discord?.url || '';
const SUPPORT_EMAIL = BRAND.supportEmail || 'hello@heron.app';

if (!PAT) {
  console.log(
    '::notice::GH_USER_PAT secret not set -- skipping user-scope apply. ' +
      'Add a fine-grained PAT (scopes: repo, write:discussion, read/write:user, read/write:project) ' +
      'as repo secret GH_USER_PAT, then re-run.',
  );
  process.exit(0);
}

function gh(method, route, body) {
  const args = ['api', '--method', method, route];
  if (body) args.push('--input', '-');
  try {
    const out = execFileSync('gh', args, {
      input: body ? JSON.stringify(body) : undefined,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GH_TOKEN: PAT },
    });
    return out ? JSON.parse(out) : null;
  } catch (e) {
    return { __error: e.stderr?.toString() || e.message };
  }
}

function ghGraphQL(query, variables = {}) {
  try {
    const body = JSON.stringify({ query, variables });
    const out = execFileSync('gh', ['api', 'graphql', '--input', '-'], {
      input: body,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GH_TOKEN: PAT },
    });
    return JSON.parse(out);
  } catch (e) {
    return { __error: e.stderr?.toString() || e.message };
  }
}

let driftCount = 0;
function drift(label, msg) {
  driftCount++;
  console.log(`  ${label}: ${msg}`);
}

// ── 1. Pinned "Roadmap 2026" issue ──────────────────────────────
console.log('▸ Pinned "Roadmap 2026" issue');
let roadmapIssue =
  (gh('GET', `/repos/${REPO}/issues?state=open&per_page=100`) || []).find?.(
    (i) => i.title === 'Roadmap 2026',
  ) || null;
if (!roadmapIssue) {
  if (VERIFY_ONLY) {
    drift('Roadmap 2026 issue', 'missing');
  } else {
    const ROADMAP_BODY = [
      '## 🪶 Heron Roadmap',
      '',
      `> _${BRAND.voice?.tagline ?? 'Stand still. Strike well.'}_`,
      '',
      'This is the living plan. The maintain-user-features workflow only creates this issue once + re-pins it; the **body is yours to edit freely** as priorities shift.',
      '',
      '---',
      '',
      '### 🎯 Now — this month',
      '',
      '- [ ] _placeholder; replace with current focus_',
      '',
      '### ⏭ Next — 1–3 months',
      '',
      '- [ ] _placeholder; next on deck_',
      '',
      '### 🌅 Later — this year',
      '',
      '- [ ] _placeholder; everything beyond the horizon_',
      '',
      '---',
      '',
      '<sub>',
      'Lifecycle markers you can use as you fill items in: 🚧 in flight · ✅ shipped · ⏸ paused · ❌ cancelled · 🔗 [linked PR](#)',
      '<br />',
      'Issue auto-created by <a href="../blob/main/.github/workflows/maintain-user-features.yml">maintain-user-features.yml</a> when missing. Once it exists, the workflow only re-pins it — never overwrites this body.',
      '</sub>',
    ].join('\n');
    const created = gh('POST', `/repos/${REPO}/issues`, {
      title: 'Roadmap 2026',
      body: ROADMAP_BODY,
      labels: ['triaged'],
    });
    if (!created?.__error) {
      roadmapIssue = created;
      console.log(`  Roadmap 2026 issue: created (#${created.number})`);
      driftCount++;
    } else {
      console.log(`  Roadmap 2026 issue: create failed -- ${created.__error.split('\n')[0]}`);
    }
  }
}
if (roadmapIssue?.node_id && !VERIFY_ONLY) {
  const pin = ghGraphQL(`mutation($id: ID!) { pinIssue(input: {issueId: $id}) { issue { id } } }`, {
    id: roadmapIssue.node_id,
  });
  if (pin?.__error && !/already pinned/i.test(pin.__error)) {
    console.log(`  Roadmap 2026 pin: ${pin.__error.split('\n')[0]}`);
  } else {
    console.log(`  Roadmap 2026 pin: ok`);
  }
}

// ── 2. Discussions ("Introduce yourself" + "Start here") ──
// CREATE the discussions when missing. We CANNOT pin them programmatically
// -- `pinDiscussion` is NOT on the public GraphQL Mutation schema (only
// `pinIssue`, `pinIssueComment`, `pinEnvironment` exist). Pinning is a
// UI-only feature; surface the URL for the one-time manual step.
//
// The `pinnedDiscussions` query is kept (read-only) so we can log
// whether each WANTED discussion happens to already be pinned via UI.
console.log('▸ Discussions');
const discussionsQ = ghGraphQL(
  `query($o: String!, $n: String!) {
    repository(owner: $o, name: $n) {
      id
      discussionCategories(first: 30) { nodes { id name } }
      discussions(first: 50) { nodes { id title } }
      pinnedDiscussions(first: 10) { nodes { discussion { id title } } }
    }
  }`,
  { o: REPO.split('/')[0], n: REPO.split('/')[1] },
);
if (discussionsQ?.__error || discussionsQ?.errors || !discussionsQ?.data?.repository) {
  const reason =
    discussionsQ?.__error?.split('\n')[0] ||
    discussionsQ?.errors?.[0]?.message ||
    'no repository data';
  console.log(`  (skip) couldn't query discussions -- ${reason}`);
} else {
  const repoId = discussionsQ.data.repository.id;
  const cats = discussionsQ.data.repository.discussionCategories.nodes;
  const generalCat = cats.find((c) => /^(General|Q&A|Welcome)$/i.test(c.name)) || cats[0] || null;
  // Pinned discussions can carry a null `discussion` node when the
  // underlying discussion was deleted but the pin record lingered, or
  // when the PAT scope hides it. Filter before .map so we don't crash
  // on the .id deref.
  const pinnedIds = new Set(
    (discussionsQ.data.repository.pinnedDiscussions?.nodes || [])
      .filter((n) => n?.discussion)
      .map((n) => n.discussion.id),
  );
  const WANTED = [
    {
      title: 'Introduce yourself',
      body: '👋 Tell the community a bit about yourself + what brings you to Heron.',
    },
    {
      title: 'Start here -- how to contribute',
      body: 'Quickstart for new contributors. See `.github/CONTRIBUTING.md` for the canonical guide.',
    },
  ];
  let needsUiPin = false;
  for (const w of WANTED) {
    const existing = discussionsQ.data.repository.discussions.nodes.find(
      (d) => d.title === w.title,
    );
    if (existing) {
      const isPinned = pinnedIds.has(existing.id);
      console.log(
        `  "${w.title}": exists${isPinned ? ' + pinned (UI)' : ' (UNPINNED -- pin via UI)'}`,
      );
      if (!isPinned) {
        needsUiPin = true;
        // Treat unpinned existing discussions as drift so --check exits
        // non-zero + apply runs increment the change counter. Pinning
        // is UI-only, but the OUTCOME (a discussion not in pinned state)
        // is real drift; bookkeep it the same way.
        drift(`"${w.title}" discussion`, 'unpinned (manual UI pin required)');
      }
    } else if (generalCat) {
      if (VERIFY_ONLY) {
        drift(`"${w.title}" discussion`, 'missing');
      } else {
        const create = ghGraphQL(
          `mutation($r: ID!, $c: ID!, $t: String!, $b: String!) {
            createDiscussion(input: {repositoryId: $r, categoryId: $c, title: $t, body: $b}) {
              discussion { id title }
            }
          }`,
          { r: repoId, c: generalCat.id, t: w.title, b: w.body },
        );
        if (create?.__error || create?.errors) {
          const e = create?.__error?.split('\n')[0] || create?.errors?.[0]?.message;
          console.log(`  "${w.title}": create failed -- ${e}`);
        } else {
          console.log(`  "${w.title}": created (UNPINNED -- pin via UI)`);
          needsUiPin = true;
          driftCount++; // for the create
          drift(`"${w.title}" discussion`, 'unpinned (manual UI pin required)');
        }
      }
    }
  }
  if (needsUiPin && !VERIFY_ONLY) {
    console.log(
      `  (manual step) Pin both discussions via UI at https://github.com/${REPO}/discussions ` +
        `-- pinDiscussion is not on the public GraphQL Mutation schema.`,
    );
  }
}

// ── 3. User Project v2 "Heron Roadmap" ───────────────────────────
console.log('▸ User Project v2 "Heron Roadmap"');
const projectsQ = ghGraphQL(
  `query($l: String!) { user(login: $l) { id projectsV2(first: 30) { nodes { id title } } } }`,
  { l: OWNER },
);
if (projectsQ?.__error || !projectsQ?.data?.user) {
  console.log(
    `  (skip) couldn't query projects -- ${projectsQ?.__error?.split('\n')[0] || 'no user data'}`,
  );
} else {
  const existing = projectsQ.data.user.projectsV2.nodes.find((n) => n.title === 'Heron Roadmap');
  if (existing) {
    console.log('  Heron Roadmap: ok');
  } else if (VERIFY_ONLY) {
    drift('Heron Roadmap project', 'missing');
  } else {
    const create = ghGraphQL(
      `mutation($o: ID!, $t: String!) { createProjectV2(input: {ownerId: $o, title: $t}) { projectV2 { id title } } }`,
      { o: projectsQ.data.user.id, t: 'Heron Roadmap' },
    );
    if (create?.__error || create?.errors) {
      const e = create?.__error?.split('\n')[0] || create?.errors?.[0]?.message;
      if (/Resource not accessible/i.test(e)) {
        const tokenLabel = process.env.GH_USER_PAT ? 'GH_USER_PAT' : 'GH_TOKEN';
        console.log(
          `  (skip) Heron Roadmap project: ${tokenLabel} can't create user-scope Project v2s. ` +
            `If running under GH_TOKEN: set GH_USER_PAT (a PAT with project scope) and re-run. ` +
            `Otherwise: create it ONCE via UI at https://github.com/users/${OWNER}/projects ` +
            `(click "New project" -> Roadmap template -> name "Heron Roadmap"). ` +
            `Subsequent runs will detect + skip.`,
        );
      } else {
        console.log(`  Heron Roadmap: create failed -- ${e}`);
      }
    } else {
      console.log(`  Heron Roadmap: created`);
      driftCount++;
    }
  }
}

// ── 4. Saved replies ─ NO-OP (no public GraphQL/REST API) ───────
// GitHub does not expose saved-reply mutations on the public GraphQL
// schema (only available on enterprise installs, and the field name
// drifts between previews). They're user-scoped UI-only objects --
// the maintainer creates them once at https://github.com/settings/replies
// and the reconciler can't help. Skipping this section keeps
// `maintain-user-features.yml` reliably green; remove this comment
// + add an entry to TODO-INSTRUCTIONS.md if the API ever lands.
console.log(
  '▸ Saved replies: SKIPPED (no public API -- create via UI at github.com/settings/replies)',
);

// ── 5. Profile README at <owner>/<owner> ────────────────────────
// Beautiful README pattern -- same design language as the Heron repo:
// centered hero, badge row, featured-project section, contact channels.
// Structure: resist.js is the company; Heron is its first product.
// Stats use shields.io (always-on) -- the previous github-readme-stats
// Vercel cards were 503-ing because that public instance is unreliable.
// Discord URL is templated from `community.discord.url` in brand.json
// (SSOT); we read it from a tiny inline json parse here so this script
// stays standalone (no apply-brand dependency at workflow time).
console.log(`▸ Profile README at ${OWNER}/${OWNER}`);
const README = [
  '<div align="center">',
  '',
  `# @${OWNER}`,
  '',
  '**Building [resist.js](https://github.com/' +
    OWNER +
    ') — local-first software. Currently shipping [Heron](https://github.com/' +
    OWNER +
    '/heron).**',
  '',
  `[![Heron stars](https://img.shields.io/github/stars/${OWNER}/heron?label=heron%20%E2%98%85&style=social)](https://github.com/${OWNER}/heron)`,
  `[![Sponsor](https://img.shields.io/github/sponsors/${OWNER}?label=sponsor&logo=githubsponsors&logoColor=white&color=ea4aaa)](https://github.com/sponsors/${OWNER})`,
  `[![Followers](https://img.shields.io/github/followers/${OWNER}?label=follow&style=social)](https://github.com/${OWNER})`,
  '',
  `[**Heron**](https://github.com/${OWNER}/heron) · [**Sponsor**](https://github.com/sponsors/${OWNER}) · [**Email**](mailto:${SUPPORT_EMAIL})`,
  '',
  '</div>',
  '',
  '---',
  '',
  '## Currently shipping',
  '',
  '### 🛡 resist.js',
  '',
  '_A local-first software company. The monorepo is private while early products mature; expect it to open up later this year. Heron is the first product._',
  '',
  `### 🪶 [${BRAND.displayName ?? 'Heron'}](https://github.com/${OWNER}/heron) — resist.js's first product`,
  '',
  `> _${BRAND.voice?.tagline ?? 'Stand still. Strike well.'}_`,
  '',
  // Description prose pulled from brand.json::description -- a rebrand
  // re-derives the profile-README body in one edit. Fallback covers the
  // brand.json-missing edge case (fresh-clone bootstrap).
  BRAND.description ??
    'A thinking partner for career transitions. Local-first job-search platform: pipeline tracking, A-F role evaluation, ATS-optimized CVs, 11-portal scanning, recruiter email triage, interview prep, and opt-in autonomous apply. Runs on macOS, Windows, Linux, iOS, iPadOS, Android, and Apple Watch.',
  '',
  `[![License](https://img.shields.io/github/license/${OWNER}/heron?color=blue)](https://github.com/${OWNER}/heron/blob/main/LICENSE)`,
  `[![Build](https://github.com/${OWNER}/heron/actions/workflows/test.yml/badge.svg)](https://github.com/${OWNER}/heron/actions/workflows/test.yml)`,
  `[![Release](https://img.shields.io/github/v/release/${OWNER}/heron?label=release&color=success)](https://github.com/${OWNER}/heron/releases)`,
  `[![Languages](https://img.shields.io/github/languages/top/${OWNER}/heron?label=top%20lang)](https://github.com/${OWNER}/heron)`,
  '',
  '---',
  '',
  '## Reach me',
  '',
  ...(DISCORD_URL ? [`- 💬 **Discord** — [community for Heron](${DISCORD_URL})`] : []),
  `- 💼 **GitHub Sponsors** — [github.com/sponsors/${OWNER}](https://github.com/sponsors/${OWNER})`,
  `- ✉️ **Email** — <${SUPPORT_EMAIL}>`,
  '',
  '---',
  '',
  `<sub>This README auto-applies from <a href="https://github.com/${OWNER}/heron/blob/main/scripts/system/apply-user-features.mjs"><code>apply-user-features.mjs</code></a> in the Heron repo. Edits made directly to this file are overwritten on the next reconcile — change the template at the source instead.</sub>`,
  '',
].join('\n');

// Always TRY to create the profile repo. POST /user/repos is idempotent
// when the repo already exists -- GitHub returns 422 "name already
// exists" which we treat as a no-op. Avoids the previous GET-then-decide
// flow that races against propagation + relies on a __error.includes
// substring match that's fragile across gh CLI versions.
if (!VERIFY_ONLY) {
  const repoCreate = gh('POST', `/user/repos`, {
    name: OWNER,
    description: `${OWNER}'s profile`,
    private: false,
    auto_init: true,
  });
  if (repoCreate?.__error) {
    if (/name already exists|already exists on this account/i.test(repoCreate.__error)) {
      // expected when the repo already exists -- continue to README upsert
    } else if (/Resource not accessible/i.test(repoCreate.__error)) {
      const tokenLabel = process.env.GH_USER_PAT ? 'GH_USER_PAT' : 'GH_TOKEN';
      console.log(
        `  (skip) Profile repo: ${tokenLabel} can't create user-account repos. ` +
          `If running under GH_TOKEN: set GH_USER_PAT (a PAT with repo scope at account level) ` +
          `and re-run. Otherwise: create it ONCE via UI -- https://github.com/new -> name "${OWNER}", ` +
          `public, with README -- THEN add "${OWNER}/${OWNER}" to the PAT's "Only select repositories" ` +
          `list with Contents Read+Write. Subsequent runs will upsert the README idempotently.`,
      );
    } else {
      console.log(`  Profile repo: ${repoCreate.__error.split('\n')[0]}`);
    }
  } else {
    console.log(`  Profile repo: created`);
    driftCount++;
  }
}

// Upsert README via contents API. Idempotent on identical content.
const liveMeta = gh('GET', `/repos/${OWNER}/${OWNER}/contents/README.md`);
if (liveMeta?.content) {
  const live = Buffer.from(liveMeta.content.replace(/\n/g, ''), 'base64').toString('utf8');
  if (live.trim() === README.trim()) {
    console.log('  Profile README: ok');
  } else if (VERIFY_ONLY) {
    drift('profile README', 'drift');
  } else {
    const put = gh('PUT', `/repos/${OWNER}/${OWNER}/contents/README.md`, {
      message: 'docs: refresh profile README (auto-applied from kaelys-js/heron)',
      content: Buffer.from(README, 'utf8').toString('base64'),
      sha: liveMeta.sha,
    });
    if (put?.__error) {
      console.log(`  Profile README: update failed -- ${put.__error.split('\n')[0]}`);
    } else {
      console.log('  Profile README: updated');
      driftCount++;
    }
  }
} else if (liveMeta?.__error?.includes('Not Found')) {
  // Repo exists but README absent -- create.
  if (VERIFY_ONLY) {
    drift('profile README', 'missing');
  } else {
    const put = gh('PUT', `/repos/${OWNER}/${OWNER}/contents/README.md`, {
      message: 'docs: initial profile README (auto-applied from kaelys-js/heron)',
      content: Buffer.from(README, 'utf8').toString('base64'),
    });
    if (put?.__error) {
      console.log(`  Profile README: create failed -- ${put.__error.split('\n')[0]}`);
    } else {
      console.log('  Profile README: created');
      driftCount++;
    }
  }
}

// ── 6. GitHub Sponsors listing audit (read-only) ────────────────
// We can't enable Sponsors via API -- the maintainer has to complete
// bank/tax verification on github.com/sponsors/<OWNER>. But we CAN
// warn when the listing is still pending so the `funding` field in
// package.json + `.github/FUNDING.yml` aren't dead links.
console.log('▸ GitHub Sponsors listing');
const sponsorsQ = ghGraphQL(`query($l: String!) { user(login: $l) { hasSponsorsListing } }`, {
  l: OWNER,
});
if (sponsorsQ?.__error || sponsorsQ?.errors || !sponsorsQ?.data?.user) {
  const reason =
    sponsorsQ?.__error?.split('\n')[0] || sponsorsQ?.errors?.[0]?.message || 'no user data';
  console.log(`  (skip) couldn't query Sponsors listing -- ${reason}`);
} else if (sponsorsQ.data.user.hasSponsorsListing) {
  console.log('  Sponsors listing: ok');
} else {
  console.log(
    `  Sponsors listing: NOT YET VERIFIED -- complete signup at ` +
      `https://github.com/sponsors/${OWNER} (bank + tax required; no API path).`,
  );
  // Not flagged as drift -- it's a one-time manual step, not state
  // the script can reconcile. Surfaced as a notice only.
}

// ── Summary ─────────────────────────────────────────────────────
console.log('');
if (driftCount === 0) {
  console.log('✓ No drift -- user-scope features match SSOT.');
  process.exit(0);
}
if (VERIFY_ONLY) {
  console.log(`✗ ${driftCount} drift item(s).`);
  process.exit(1);
}
console.log(`✓ Applied ${driftCount} change(s).`);
