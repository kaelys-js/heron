/**
 * negotiation-playbook — the structured playbook for verbal → signed.
 *
 * Today the product has comp-eval math + negotiation prompt drafts.
 * What's missing is the calibrated "if they say X, you say Y" tree,
 * the non-comp ask checklist, the exploding-offer counter-scripts,
 * and the multiple-offer leveraging coach. This module assembles all
 * four into structured data the UI surfaces as a wizard.
 *
 * Pure-function. No LLM. The structure is the value — the user (or
 * the user + Claude in agent mode) can refine wording per situation,
 * but the decision tree of WHAT to ask + WHEN is what most candidates
 * lack and what loses the most money at signing.
 *
 * Why static structured data + not Claude: the negotiation conversation
 * happens in real-time over phone calls. The user needs a flowchart
 * they can SEE while talking, not a 1-minute LLM call between each
 * recruiter sentence.
 */

import { evaluateOffer, type OfferInput, type OfferEvaluation } from './comp-math';

// ── Decision tree (#8 if-they-say-X-you-say-Y) ─────────────────────

export type Branch = {
  /** What the recruiter says (paraphrased) */
  trigger: string;
  /** What you say back (you can paraphrase, this is the structure) */
  response: string;
  /** Why this response — so the user understands the logic, not just memorizes */
  rationale: string;
  /** Optional next branch label they'll likely hit */
  nextLikely?: string;
};

export const DECISION_TREE: Record<string, Branch[]> = {
  // After they extend verbal
  'verbal-offer': [
    {
      trigger: 'We\'re going to extend an offer at $X base.',
      response:
        '"Thank you, I\'m excited about the role. I\'d appreciate getting the full written offer so I can review the details — base, equity, signing, benefits, start date. Can you have that to me by tomorrow? I\'ll get back to you within 48 hours of receiving it."',
      rationale:
        'Three plays: (1) Don\'t accept verbally — verbal offers can be rescinded with no recourse. (2) Ask for FULL written offer including equity/signing/benefits so you can negotiate on multiple axes. (3) Buy yourself 48h of decision time, which gives you space to get a competing offer or talk to your network.',
      nextLikely: 'recruiter-asks-current-comp',
    },
    {
      trigger: 'What were you thinking for compensation?',
      response:
        '"I\'d rather discuss the value of THIS role than benchmark against past comp. Based on the scope you described and my experience shipping <relevant proof>, I\'m looking for the top of your senior band — typically $X-$Y for similar roles."',
      rationale:
        'Never anchor with your current salary — it locks you to your past. Anchor on the VALUE you bring + the company\'s OWN band (which you research separately).',
      nextLikely: 'they-say-band-is-lower',
    },
  ],

  // Common pressure / countering moves
  'they-say-band-is-lower': [
    {
      trigger: 'Our band tops out at $X.',
      response:
        '"I appreciate that. The band data I\'ve seen for similar roles at companies your size shows $X-$Y. Is the level here negotiable — could we discuss whether this is actually a Staff-level scope?"',
      rationale:
        'When base is capped, attack the level — a Senior → Staff title bump often unlocks 20-30% more comp. If level is also fixed, you fall back to signing bonus + equity refresh (which don\'t hit the salary band).',
      nextLikely: 'they-say-level-fixed',
    },
  ],

  'they-say-level-fixed': [
    {
      trigger: 'The level is set; I can\'t change that.',
      response:
        '"Understood. Are there other levers we can pull? I\'m thinking a signing bonus to bridge the gap to where I\'d typically expect, or a Year-1 equity refresh accelerator. Both keep your band intact."',
      rationale:
        'Signing bonuses and equity refreshes don\'t affect the salary band (which is a published constraint), so they\'re often available even when base isn\'t. Frame it as "helping the recruiter" — they want to close you, give them tools to do it.',
    },
  ],

  // Exploding offer (#19)
  'exploding-offer': [
    {
      trigger: 'We need an answer by Friday or we\'ll move on.',
      response:
        '"I appreciate you sharing the deadline. To make a thoughtful decision on a multi-year commitment, I need to talk to a couple of people on my side and review the full package carefully. Could we extend to <date 7-10 days out>? I want to give you a genuine "yes" rather than a rushed one."',
      rationale:
        'Exploding offers are 99% a negotiation tactic, not a real deadline. The cost of losing you after they\'ve spent 4 rounds of engineering time is much higher than waiting another week. If they refuse to extend at all, that\'s a red flag about how they\'ll treat you internally.',
    },
    {
      trigger: 'No, we really do need an answer by Friday.',
      response:
        '"OK — given the time constraint, can you share what you\'d need to see in my answer to make this work for you? And on my side, the items I\'d want clarified before signing are <list 3-4 specific items>. If we can resolve those today, I\'m in a much better position to commit."',
      rationale:
        'Force them to make the deadline concrete with sub-questions — usually exposes that "Friday" was soft. If they hold firm, you\'ve at least extracted what you need to sign confidently.',
    },
  ],

  // Multiple offers (#11)
  'leveraging-multiple-offers': [
    {
      trigger: 'You already have an offer? What\'s the comp?',
      response:
        '"I do — I\'d rather not disclose the specific number, but I can tell you it\'s competitive in the $X-$Y range for a similar Senior IC role at a Series B+ company. I\'d like to make this work with YOU; can you tell me what flexibility you have?"',
      rationale:
        'NEVER name the exact competing number — they\'ll match exactly. Give a credible RANGE that anchors above where you\'d be happy. Pivot the question back to THEIR flexibility — make them the one who has to move.',
    },
    {
      trigger: 'I\'ll need to see the competing offer to match it.',
      response:
        '"I appreciate that\'s how some companies handle this, but I treat offer letters as confidential. What I can tell you is the competing comp + the specific role responsibilities. Is there a way to match based on that, or do you need the document specifically?"',
      rationale:
        'Some recruiters will ask for the competing offer document. Politely decline — it\'s your private negotiating leverage. If they hold the line, that\'s a red flag about how they\'ll handle confidential info post-hire.',
    },
  ],

  // Background check + reference window
  'silent-week': [
    {
      trigger: '(No response for 5+ business days post-onsite)',
      response:
        '"Hi <recruiter> — just checking in. I\'m still very interested in <role> at <company>. I have <other-process> moving forward; could you give me a rough timeline so I can plan accordingly? Happy to wait if it helps." (Send Day 5 only, not before.)',
      rationale:
        'Silent week post-onsite is the hardest moment — hiring committees take 5-14 business days. Don\'t panic-spam. ONE polite follow-up at Day 5 surfaces urgency on your side without being pushy. If you have another process running, mention it neutrally (creates time pressure without ultimatum).',
    },
  ],
};

// ── Non-comp ask checklist (#12) ───────────────────────────────────

export type NonCompAsk = {
  category: string;
  ask: string;
  /** Why this matters in $$ or quality-of-life terms */
  why: string;
  /** Difficulty 1-3: 1=usually yes, 2=needs justification, 3=harder ask */
  difficulty: 1 | 2 | 3;
};

export const NON_COMP_ASKS: NonCompAsk[] = [
  // Title / level
  { category: 'Level', ask: 'Senior → Staff title bump (with corresponding equity refresh)', why: 'Title compounds — every future role uses this as the floor. Worth 20-30% comp.', difficulty: 3 },
  { category: 'Level', ask: 'Confirm leveling matches stated scope (e.g. Senior at this co = Staff elsewhere)', why: 'External leveling varies wildly — protect yourself from "Senior" that\'s really Mid.', difficulty: 1 },

  // Comp structure
  { category: 'Comp', ask: 'Signing bonus to bridge any base gap (1-3× monthly base)', why: 'Doesn\'t affect the salary band, often available when base isn\'t.', difficulty: 2 },
  { category: 'Comp', ask: 'Year-1 equity refresh accelerator', why: 'Most refreshes start Year-2. Asking for Year-1 unlocks ~25% more 4-year equity.', difficulty: 2 },
  { category: 'Comp', ask: 'Double-trigger acceleration on change-of-control', why: 'If they\'re acquired in Y1-2, you keep your unvested equity instead of being trapped.', difficulty: 3 },
  { category: 'Comp', ask: 'Annual equity refresh % minimum (written into offer)', why: 'Most refreshes are discretionary. Locking in a floor protects against future cuts.', difficulty: 3 },

  // Remote / location
  { category: 'Remote', ask: 'Confirm remote eligibility in writing (NOT just verbally)', why: 'Remote policies shift. Written = enforceable. Verbal = "we never agreed to that."', difficulty: 1 },
  { category: 'Remote', ask: 'Travel cap / quarterly offsite commitment', why: 'Define expectations upfront — avoid surprise mandatory office days.', difficulty: 1 },
  { category: 'Remote', ask: 'Home office stipend ($500-$2000 one-time + monthly internet)', why: 'Most companies have this; you have to ask.', difficulty: 1 },

  // Schedule
  { category: 'Start', ask: 'Push start date out 4-6 weeks beyond their default', why: 'Time off between jobs is wildly underrated. Recovery + bandwidth for the new role.', difficulty: 2 },
  { category: 'Schedule', ask: 'Pre-approved Week 1 PTO for already-planned travel', why: 'Easier to ask BEFORE signing than to grovel month 1.', difficulty: 1 },
  { category: 'PTO', ask: 'Extra week of PTO (negotiable when "unlimited" isn\'t cultural)', why: 'Hardline PTO numbers (15 vs 20 days) bend more than equity.', difficulty: 2 },

  // Growth
  { category: 'Growth', ask: 'Annual learning / conference budget ($2K-$5K)', why: 'Standard at Senior+ at most tech cos. If they don\'t offer it, you ask.', difficulty: 1 },
  { category: 'Growth', ask: 'Documented promotion criteria for Year-1 promotion target', why: 'Locks in a real ladder, not "we\'ll see how it goes."', difficulty: 3 },

  // Side projects
  { category: 'IP', ask: 'Carve-out for existing open-source + side projects (IP assignment)', why: 'Default IP assignment is overly broad. Carve out before signing or you legally own nothing you build on the side.', difficulty: 1 },
];

// ── "Don't accept verbally" template (#4) ──────────────────────────

export const DONT_ACCEPT_VERBALLY = {
  title: 'You just got a verbal offer — don\'t accept yet',
  steps: [
    'Reply with enthusiasm but DON\'T commit. Sample: "Thank you, I\'m very excited. Could you send the written offer so I can review the details? I\'ll get back to you within 48 hours."',
    'Open /comp-eval and plug in the numbers as soon as you have base + signing + equity. See the year-1 cash and 4-year discounted total before responding.',
    'If you have a competing process, ping that recruiter today: "I have an offer in hand and a decision deadline of <date>. Where are you in the process?"',
    'Identify your 2-3 negotiation asks BEFORE the next call. Open the Decision Tree for scripts.',
    'Take a full night\'s sleep. Excited-and-emotional is when people accept too fast.',
  ],
  redFlags: [
    'They won\'t put the offer in writing',
    'They refuse a 48-hour decision window',
    'The verbal offer is materially different from what was discussed in interviews',
    'They\'re unclear on the equity grant size or vesting schedule',
    'They push you to sign without seeing the equity agreement',
  ],
};

// ── Comp-band benchmarking (#20) ───────────────────────────────────
// Static reference data — Senior IC bands in tech as of 2024-2025, US.
// Numbers are approximate; user should refine via levels.fyi for the
// specific company × role × location. This is the "default sanity check."

export type CompBand = {
  band: string;
  base: [number, number];
  total: [number, number];
  notes: string;
};

/** Version tag for the baked-in defaults — used by the staleness
 *  warning in comp-bands-overrides.ts. Bump whenever the numbers below
 *  are updated. */
export const TIER_COMP_BANDS_VERSION = '2024-2025';
export const TIER_COMP_BANDS_LAST_UPDATED_MS = Date.parse('2025-01-15T00:00:00Z');

export const DEFAULT_TIER_COMP_BANDS: Record<string, CompBand> = {
  'faang-senior': {
    band: 'FAANG / FAANG-adjacent Senior (L5)',
    base: [180_000, 250_000],
    total: [350_000, 550_000],
    notes: 'Base + RSU + bonus. Higher in NYC/SF; lower remote. Use levels.fyi for company-specific.',
  },
  'faang-staff': {
    band: 'FAANG Staff (L6)',
    base: [220_000, 320_000],
    total: [500_000, 900_000],
    notes: 'Big equity step-up vs Senior. Staff at hyperscalers can be 7-figure TC.',
  },
  'late-stage-startup-senior': {
    band: 'Late-stage startup (Series D+) Senior',
    base: [170_000, 220_000],
    total: [250_000, 380_000],
    notes: 'Lower base, equity is the upside. Discount equity heavily for risk (40-60%).',
  },
  'series-b-c-senior': {
    band: 'Series B/C startup Senior',
    base: [150_000, 200_000],
    total: [180_000, 300_000],
    notes: 'Equity is mostly paper. Optimize for base + signing. Title flexibility is real here.',
  },
  'enterprise-senior': {
    band: 'Enterprise / Fortune-500 Senior',
    base: [160_000, 210_000],
    total: [200_000, 280_000],
    notes: 'Stable cash, lower upside. Strong benefits (401k match, pension at some cos).',
  },
  'remote-senior': {
    band: 'Remote-first Senior (US-wide pay)',
    base: [150_000, 210_000],
    total: [200_000, 320_000],
    notes: 'Remote bands compress geographic spread. GitLab, Buffer, Doist publish theirs publicly.',
  },
};

/** Back-compat alias for callers using the original name. Same data. */
export const TIER_COMP_BANDS: Record<string, CompBand> = DEFAULT_TIER_COMP_BANDS;

// ── Public assembler ──────────────────────────────────────────────

export type FullPlaybook = {
  decisionTree: typeof DECISION_TREE;
  nonCompAsks: NonCompAsk[];
  dontAcceptVerbally: typeof DONT_ACCEPT_VERBALLY;
  tierBands: typeof TIER_COMP_BANDS;
};

export function loadPlaybook(): FullPlaybook {
  return {
    decisionTree: DECISION_TREE,
    nonCompAsks: NON_COMP_ASKS,
    dontAcceptVerbally: DONT_ACCEPT_VERBALLY,
    tierBands: TIER_COMP_BANDS,
  };
}

/** Quick check: does an offer's base fall in or below the recommended
 *  band for its tier? Used by the offer-arrival surface. */
export function classifyOfferVsBand(
  offer: OfferInput,
  tier: keyof typeof TIER_COMP_BANDS,
): { tier: string; base: number; verdict: 'below' | 'in-band' | 'above'; bandLow: number; bandHigh: number } {
  const band = TIER_COMP_BANDS[tier];
  if (!band) return { tier, base: offer.base, verdict: 'in-band', bandLow: 0, bandHigh: 0 };
  let verdict: 'below' | 'in-band' | 'above' = 'in-band';
  if (offer.base < band.base[0]) verdict = 'below';
  else if (offer.base > band.base[1]) verdict = 'above';
  return { tier, base: offer.base, verdict, bandLow: band.base[0], bandHigh: band.base[1] };
}

// Re-export for callers wanting to score in one shot.
export { evaluateOffer, type OfferEvaluation };
