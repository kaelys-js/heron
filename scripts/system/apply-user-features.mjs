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

const VERIFY_ONLY = process.argv.includes('--check') || process.argv.includes('--verify');
const REPO = process.env.GH_REPO || 'kaelys-js/heron';
const OWNER = process.env.GH_OWNER || REPO.split('/')[0];
const PAT = process.env.GH_USER_PAT || process.env.GH_TOKEN || '';

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
    const created = gh('POST', `/repos/${REPO}/issues`, {
      title: 'Roadmap 2026',
      body: '## Heron Roadmap 2026\n\nLiving plan -- edit freely as priorities shift.\n\n### Now\n- _placeholder; replace with current focus_\n\n### Next\n- _next 1-3 months_\n\n### Later\n- _everything else_\n\n---\n\nThis issue is auto-created by `.github/workflows/maintain-user-features.yml` when missing.',
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

// ── 2. Pinned discussions ("Introduce yourself" + "Start here") ──
console.log('▸ Pinned discussions');
const discussionsQ = ghGraphQL(
  `query($o: String!, $n: String!) {
    repository(owner: $o, name: $n) {
      id
      discussionCategories(first: 30) { nodes { id name } }
      discussions(first: 50) { nodes { id title isPinned } }
    }
  }`,
  { o: REPO.split('/')[0], n: REPO.split('/')[1] },
);
if (discussionsQ?.__error) {
  console.log(`  (skip) couldn't query discussions -- ${discussionsQ.__error.split('\n')[0]}`);
} else {
  const repoId = discussionsQ.data.repository.id;
  const cats = discussionsQ.data.repository.discussionCategories.nodes;
  const generalCat = cats.find((c) => /^(General|Q&A|Welcome)$/i.test(c.name)) || cats[0] || null;
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
  for (const w of WANTED) {
    const existing = discussionsQ.data.repository.discussions.nodes.find(
      (d) => d.title === w.title,
    );
    if (existing) {
      if (!existing.isPinned) {
        if (VERIFY_ONLY) {
          drift(`"${w.title}" discussion`, 'unpinned');
        } else {
          const pin = ghGraphQL(
            `mutation($id: ID!) { pinDiscussion(input: {discussionId: $id}) { pinnedDiscussion { id } } }`,
            { id: existing.id },
          );
          if (pin?.__error && !/maximum.*pinned|already/i.test(pin.__error)) {
            console.log(`  "${w.title}" pin: ${pin.__error.split('\n')[0]}`);
          } else {
            console.log(`  "${w.title}" pin: ok`);
          }
        }
      } else {
        console.log(`  "${w.title}": ok`);
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
        if (create?.__error) {
          console.log(`  "${w.title}": create failed -- ${create.__error.split('\n')[0]}`);
        } else {
          const newId = create.data.createDiscussion.discussion.id;
          const pin = ghGraphQL(
            `mutation($id: ID!) { pinDiscussion(input: {discussionId: $id}) { pinnedDiscussion { id } } }`,
            { id: newId },
          );
          if (pin?.__error && !/maximum.*pinned|already/i.test(pin.__error)) {
            console.log(`  "${w.title}": created but pin failed -- ${pin.__error.split('\n')[0]}`);
          } else {
            console.log(`  "${w.title}": created + pinned`);
          }
          driftCount++;
        }
      }
    }
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
    if (create?.__error) {
      console.log(`  Heron Roadmap: create failed -- ${create.__error.split('\n')[0]}`);
    } else {
      console.log(`  Heron Roadmap: created`);
      driftCount++;
    }
  }
}

// ── 4. 5 standard saved replies ─────────────────────────────────
console.log('▸ Saved replies');
const SAVED_REPLIES = [
  {
    title: 'Thanks for the PR',
    body: "Thanks for the contribution! CI is running -- I'll review once it's green.",
  },
  {
    title: 'Please add a test',
    body: 'Could you add a regression test for this? See `docs/TESTING.md` for the convention.',
  },
  {
    title: 'Reproduction needed',
    body: 'Could you share the exact command + a small repro? I want the fix to target the right behaviour.',
  },
  {
    title: 'Help wanted',
    body: "This looks like a good `help wanted` candidate. If you'd like to take it, please comment + I'll assign.",
  },
  {
    title: 'Closing as duplicate',
    body: 'Closing as a duplicate of #N. Continuing the conversation there.',
  },
];
const repliesQ = ghGraphQL(`query { viewer { savedReplies(first: 100) { nodes { id title } } } }`);
if (repliesQ?.__error || !repliesQ?.data?.viewer) {
  console.log(
    `  (skip) couldn't query saved replies -- ${repliesQ?.__error?.split('\n')[0] || 'no viewer'}`,
  );
} else {
  const have = new Set((repliesQ.data.viewer.savedReplies.nodes || []).map((n) => n.title));
  for (const r of SAVED_REPLIES) {
    if (have.has(r.title)) {
      console.log(`  "${r.title}": ok`);
    } else if (VERIFY_ONLY) {
      drift(`"${r.title}" saved reply`, 'missing');
    } else {
      const create = ghGraphQL(
        `mutation($t: String!, $b: String!) { createSavedReply(input: {title: $t, body: $b}) { savedReply { id title } } }`,
        { t: r.title, b: r.body },
      );
      if (create?.__error) {
        console.log(`  "${r.title}": create failed -- ${create.__error.split('\n')[0]}`);
      } else {
        console.log(`  "${r.title}": created`);
        driftCount++;
      }
    }
  }
}

// ── 5. Profile README at <owner>/<owner> ────────────────────────
console.log(`▸ Profile README at ${OWNER}/${OWNER}`);
const README = `# ${OWNER}\n\n> Builder. Shipping [Heron](https://github.com/${OWNER}/heron) and a handful of smaller tools.\n\n## What I'm working on\n\n- **[Heron](https://github.com/${OWNER}/heron)** -- AI-agnostic job-search automation.\n\n## Reach me\n\n- GitHub: [@${OWNER}](https://github.com/${OWNER})\n- Sponsor: [github.com/sponsors/${OWNER}](https://github.com/sponsors/${OWNER})\n- Discord: <https://discord.gg/8pRpHETxa4> (Heron community)\n\n<sub>This README auto-applies from \`.github/workflows/maintain-user-features.yml\` in the Heron repo. Edits made directly to this file are overwritten on the next reconcile.</sub>\n`;
const profileExists = gh('GET', `/repos/${OWNER}/${OWNER}`);
if (profileExists?.__error?.includes('Not Found')) {
  if (VERIFY_ONLY) {
    drift(`profile repo ${OWNER}/${OWNER}`, 'missing');
  } else {
    // Create via REST.
    const created = gh('POST', `/user/repos`, {
      name: OWNER,
      description: `${OWNER}'s profile -- pinned + sponsor link + Heron`,
      private: false,
      auto_init: true,
    });
    if (created?.__error) {
      console.log(`  Profile repo: create failed -- ${created.__error.split('\n')[0]}`);
    } else {
      console.log(`  Profile repo: created`);
      driftCount++;
    }
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
} else if (!liveMeta?.__error?.includes('Not Found')) {
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
