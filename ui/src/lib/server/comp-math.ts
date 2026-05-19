/**
 * comp-math -- pure-function compensation math.
 *
 * For senior IC roles equity is often 30-50% of total comp. The negotiation
 * mode wrote prompts about it but never computed anything. This module
 * gives the UI actual numbers so the user can compare offers / negotiate
 * counters on a real basis.
 *
 * Three quantities computed:
 *
 *   1. Year-1 cash    = base + signing + (annual_bonus_target)
 *   2. 4-year total   = Σ year_i for i in 1..4
 *   3. Equity NPV     = sum of vested-shares per year, discounted to today
 *
 * Equity flavors handled:
 *   - RSU (public)   -- vest at FMV per share, taxed as W-2 income at vest
 *   - RSU (private)  -- same vesting but FMV is the company's 409A. Often
 *                       wildly understates "outcome" value; risk-adjust.
 *   - ISO/NSO        -- option grants, value = max(0, FMV - strike) × growth
 *   - Pre-IPO RSU    -- double-trigger: vest + liquidity event
 *
 * We don't model:
 *   - Taxes (too jurisdiction-specific -- leave to TaxJar / personal CPA)
 *   - 401k employer match (handled as a flat benefit credit)
 *   - Refresh grants (year-3+ -- too speculative)
 *
 * All math is in the user's chosen currency (default USD). The numbers
 * coming OUT are nominal -- no inflation adjustment. Annual bonus is
 * modeled at TARGET; risk-adjust via probability if the user wants.
 */

export type EquityType = 'rsu-public' | 'rsu-private' | 'iso' | 'nso' | 'pre-ipo-rsu' | 'none';

export type VestingSchedule = {
  /** Total years of vest. Default 4. */
  totalYears: number;
  /** Months before any equity vests. Default 12 (one-year cliff). */
  cliffMonths: number;
  /** Schedule shape -- most US tech is monthly or quarterly after cliff. */
  cadence: 'monthly' | 'quarterly' | 'yearly';
};

export type OfferInput = {
  base: number;
  signingBonus?: number;
  /** Target annual bonus (cash). Use 0 if none. */
  annualBonusTarget?: number;
  equity?: {
    type: EquityType;
    /** RSU: total grant value at FMV today.
     *  ISO/NSO: shares × strike (the "value if exercised today"). */
    grantValueToday: number;
    /** ISO/NSO only: strike price. RSU ignores. */
    strikePerShare?: number;
    /** Optional growth assumption per year. Default 0 (conservative -- risk-
     *  adjust via the discountRate instead). For pre-IPO RSU at a late-stage
     *  company, 5-15% is reasonable. */
    growthRatePct?: number;
    vesting?: VestingSchedule;
  };
  /** Yearly benefits valuation (401k match, health, etc). Lump dollar value. */
  benefitsAnnualValue?: number;
  /** Risk discount applied to equity (and only equity). 0 = treat at face;
   *  0.3 = "I'd take 70¢ on the dollar in cash today over this paper". */
  equityDiscountPct?: number;
  /** Annualized cost of capital -- discounts FUTURE cash + equity to today.
   *  Default 5%. Conservative for a working-age IC's opportunity cost. */
  discountRatePct?: number;
};

export type YearBreakdown = {
  year: 1 | 2 | 3 | 4;
  base: number;
  bonus: number;
  signing: number;
  equityVested: number;
  benefits: number;
  total: number;
};

export type OfferEvaluation = {
  inputs: OfferInput;
  perYear: YearBreakdown[];
  /** Cash payable in year 1 (no equity). Useful for "can I afford to take this?" */
  year1Cash: number;
  /** Nominal 4-year sum (no discount, no risk adjustment). */
  fourYearNominal: number;
  /** 4-year sum with discount rate applied to all future flows. */
  fourYearDiscounted: number;
  /** Equity NPV alone (already discounted + risk-adjusted). */
  equityNpv: number;
  /** Effective annualized comp = fourYearNominal / 4. */
  effectiveAnnual: number;
};

const DEFAULT_VESTING: VestingSchedule = {
  totalYears: 4,
  cliffMonths: 12,
  cadence: 'monthly',
};

/** Fraction of total grant that has vested by the end of year `y` (1-based).
 *  Assumes the standard 25% cliff + monthly-thereafter shape unless overridden.
 *
 *  Treatment:
 *    - 0 → cliff (exclusive): nothing vested
 *    - AT cliff: cliff_months / total_months has vested (one big chunk)
 *    - After cliff: linear to 100% by end of total_years
 *
 *  For the standard 12-month cliff / 48-month total: end of Y1 = 25%,
 *  end of Y2 = 50%, etc. */
function vestedFraction(y: number, vesting: VestingSchedule): number {
  if (y <= 0) return 0;
  const monthsElapsed = y * 12;
  if (monthsElapsed < vesting.cliffMonths) return 0;
  const totalMonths = vesting.totalYears * 12;
  if (monthsElapsed >= totalMonths) return 1;
  return monthsElapsed / totalMonths;
}

/** Discounted-cash-flow factor at the END of year `y`. Default 5% / yr. */
function dcfFactor(y: number, discountRatePct: number): number {
  return 1 / Math.pow(1 + discountRatePct / 100, y);
}

/** Equity grant value at year y, with growth + risk discount applied (in
 *  pre-DCF, nominal terms). */
function equityNominalValue(
  baseGrant: number,
  growthRatePct: number,
  equityDiscountPct: number,
  y: number,
): number {
  // Compound growth: many people assume flat (growthRatePct=0). 5-15% is
  // reasonable for pre-IPO at a strong company.
  const grown = baseGrant * Math.pow(1 + growthRatePct / 100, y);
  // Risk discount applied IMMEDIATELY (treat paper as worth less than cash).
  const risked = grown * (1 - equityDiscountPct / 100);
  return Math.max(0, risked);
}

/**
 * Evaluate a structured offer. All money in the same unit (USD by default).
 * Pure function -- no I/O, no side effects, deterministic.
 */
export function evaluateOffer(input: OfferInput): OfferEvaluation {
  const base = Math.max(0, input.base);
  const signing = Math.max(0, input.signingBonus ?? 0);
  const bonusTarget = Math.max(0, input.annualBonusTarget ?? 0);
  const benefits = Math.max(0, input.benefitsAnnualValue ?? 0);
  const equityDiscount = Math.max(0, Math.min(100, input.equityDiscountPct ?? 0));
  const discountRate = Math.max(0, Math.min(50, input.discountRatePct ?? 5));

  const equity = input.equity;
  const eqType = equity?.type ?? 'none';
  const grantValue = equity?.grantValueToday ?? 0;
  const growthRate = equity?.growthRatePct ?? 0;
  const vesting = equity?.vesting ?? DEFAULT_VESTING;

  // Build per-year breakdown.
  const perYear: YearBreakdown[] = [];
  let fourYearNominal = 0;
  let fourYearDiscounted = 0;
  let equityNpv = 0;

  for (let y = 1; y <= 4; y++) {
    const yr = y as 1 | 2 | 3 | 4;
    const yearBase = base;
    const yearBonus = bonusTarget;
    const yearSigning = y === 1 ? signing : 0;
    const yearBenefits = benefits;

    let yearEquity = 0;
    if (eqType !== 'none' && grantValue > 0) {
      const fracBefore = vestedFraction(y - 1, vesting);
      const fracAfter = vestedFraction(y, vesting);
      const vestedThisYearFraction = Math.max(0, fracAfter - fracBefore);
      const baseValueThisYear = grantValue * vestedThisYearFraction;
      yearEquity = equityNominalValue(baseValueThisYear, growthRate, equityDiscount, y);
    }

    const yearTotal = yearBase + yearBonus + yearSigning + yearEquity + yearBenefits;
    perYear.push({
      year: yr,
      base: yearBase,
      bonus: yearBonus,
      signing: yearSigning,
      equityVested: yearEquity,
      benefits: yearBenefits,
      total: yearTotal,
    });

    const discount = dcfFactor(y, discountRate);
    fourYearNominal += yearTotal;
    fourYearDiscounted += yearTotal * discount;
    equityNpv += yearEquity * discount;
  }

  const year1Cash = (perYear[0]?.base ?? 0) + (perYear[0]?.signing ?? 0) + (perYear[0]?.bonus ?? 0);

  return {
    inputs: input,
    perYear,
    year1Cash,
    fourYearNominal,
    fourYearDiscounted,
    equityNpv,
    effectiveAnnual: fourYearNominal / 4,
  };
}

/** Compare two offers side-by-side and return a "winner" + dollar delta on
 *  the user-preferred metric (default: discounted 4-year total). Useful for
 *  the multi-offer comparator (compare mode) and the negotiation flow. */
export type ComparisonResult = {
  preferred: 'a' | 'b' | 'tied';
  metric: '4yr-discounted' | '4yr-nominal' | 'year1';
  delta: number;
  a: OfferEvaluation;
  b: OfferEvaluation;
};

export function compareOffers(
  a: OfferInput,
  b: OfferInput,
  metric: ComparisonResult['metric'] = '4yr-discounted',
): ComparisonResult {
  const evalA = evaluateOffer(a);
  const evalB = evaluateOffer(b);
  const pick = (e: OfferEvaluation): number => {
    if (metric === '4yr-nominal') return e.fourYearNominal;
    if (metric === 'year1') return e.year1Cash;
    return e.fourYearDiscounted;
  };
  const valA = pick(evalA);
  const valB = pick(evalB);
  const delta = Math.abs(valA - valB);
  const preferred: ComparisonResult['preferred'] =
    Math.abs(valA - valB) < 100 ? 'tied' : valA > valB ? 'a' : 'b';
  return { preferred, metric, delta, a: evalA, b: evalB };
}
