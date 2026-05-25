/**
 * Unit tests for isConfiguredSubset -- the ruleset drift detector in
 * apply-github-config.mjs. It must flag rule-PARAMETER drift (e.g. a flipped
 * require_last_push_approval) while ignoring the extra keys GitHub's rulesets
 * API returns (allowed_merge_methods, required_reviewers, id, _links, ...).
 * Run: `node scripts/system/apply-github-config.test.mjs`
 */
import { isConfiguredSubset } from './apply-github-config.mjs';

let pass = 0;
let fail = 0;
function check(name, got, want) {
  if (got === want) {
    pass++;
    console.log(`  OK  ${name}`);
  } else {
    fail++;
    console.log(`  XX  ${name} (got ${got}, want ${want})`);
  }
}

// pull_request params: the file sets 5 keys; the live API echoes those plus
// required_reviewers + allowed_merge_methods. Subset must ignore the extras.
const fileReview = {
  required_approving_review_count: 1,
  dismiss_stale_reviews_on_push: true,
  require_code_owner_review: true,
  require_last_push_approval: true,
  required_review_thread_resolution: true,
};
const liveReviewExtraKeys = {
  required_approving_review_count: 1,
  dismiss_stale_reviews_on_push: true,
  required_reviewers: [],
  require_code_owner_review: true,
  require_last_push_approval: true,
  required_review_thread_resolution: true,
  allowed_merge_methods: ['merge', 'squash', 'rebase'],
};
check(
  'matching params ignore API-added keys',
  isConfiguredSubset(fileReview, liveReviewExtraKeys),
  true,
);
check(
  'flipped require_last_push_approval is drift',
  isConfiguredSubset(fileReview, { ...liveReviewExtraKeys, require_last_push_approval: false }),
  false,
);

// required_status_checks flag (the second Fix 5 setting).
check(
  'strict_required_status_checks_policy flip is drift',
  isConfiguredSubset(
    { strict_required_status_checks_policy: true },
    { strict_required_status_checks_policy: false, do_not_enforce_on_create: false },
  ),
  false,
);

// Arrays: order-insensitive but length-sensitive.
check(
  'reordered required checks are not drift',
  isConfiguredSubset([{ context: 'A' }, { context: 'B' }], [{ context: 'B' }, { context: 'A' }]),
  true,
);
check(
  'an added required check is drift',
  isConfiguredSubset([{ context: 'A' }], [{ context: 'A' }, { context: 'B' }]),
  false,
);
check(
  'context object ignores extra live keys',
  isConfiguredSubset([{ context: 'A' }], [{ context: 'A', integration_id: 7 }]),
  true,
);

// Top-level + nested.
check(
  'enforcement diff is drift',
  isConfiguredSubset({ enforcement: 'active' }, { enforcement: 'disabled' }),
  false,
);
check(
  'missing nested key in live is drift',
  isConfiguredSubset(
    { conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } } },
    { conditions: { ref_name: {} } },
  ),
  false,
);
check(
  'parameter-less rule matches live with null parameters',
  isConfiguredSubset(
    { name: 'x', enforcement: 'active', rules: [{ type: 'deletion' }] },
    {
      id: 1,
      name: 'x',
      enforcement: 'active',
      rules: [{ type: 'deletion', parameters: null }],
      _links: {},
    },
  ),
  true,
);

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail} test(s) passed`);
process.exit(fail === 0 ? 0 : 1);
