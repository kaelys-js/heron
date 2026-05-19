/**
 * lib/server/comp-math -- offer evaluation + side-by-side comparison.
 *
 * Pure math, no IO. Tests cover input clamping, 4-year totals, equity
 * vesting, discounting, signing-bonus year-1 timing, and the comparator.
 */
import { describe, expect, it } from 'vitest';
import { compareOffers, evaluateOffer, type OfferInput } from './comp-math';

function offer(over: Partial<OfferInput> = {}): OfferInput {
  return {
    base: 150_000,
    signingBonus: 0,
    annualBonusTarget: 0,
    benefitsAnnualValue: 0,
    equityDiscountPct: 0,
    discountRatePct: 5,
    ...over,
  };
}

describe('evaluateOffer — base case', () => {
  it('returns 4 years of perYear breakdown', () => {
    const r = evaluateOffer(offer());
    expect(r.perYear.length).toBe(4);
    expect(r.perYear[0].year).toBe(1);
    expect(r.perYear[3].year).toBe(4);
  });

  it('base is paid every year', () => {
    const r = evaluateOffer(offer({ base: 100_000 }));
    expect(r.perYear[0].base).toBe(100_000);
    expect(r.perYear[3].base).toBe(100_000);
  });

  it('signing bonus only paid year 1', () => {
    const r = evaluateOffer(offer({ signingBonus: 25_000 }));
    expect(r.perYear[0].signing).toBe(25_000);
    expect(r.perYear[1].signing).toBe(0);
    expect(r.perYear[2].signing).toBe(0);
    expect(r.perYear[3].signing).toBe(0);
  });

  it('4-year nominal = 4 × base when no extras', () => {
    const r = evaluateOffer(offer({ base: 100_000 }));
    expect(r.fourYearNominal).toBe(400_000);
  });

  it('4-year discounted is less than 4-year nominal', () => {
    const r = evaluateOffer(offer({ base: 100_000, discountRatePct: 5 }));
    expect(r.fourYearDiscounted).toBeLessThan(r.fourYearNominal);
  });

  it('year1Cash = base + signing + bonus', () => {
    const r = evaluateOffer(
      offer({ base: 100_000, signingBonus: 20_000, annualBonusTarget: 10_000 }),
    );
    expect(r.year1Cash).toBe(130_000);
  });

  it('effectiveAnnual = fourYearNominal / 4', () => {
    const r = evaluateOffer(offer({ base: 100_000 }));
    expect(r.effectiveAnnual).toBe(100_000);
  });
});

describe('evaluateOffer — input clamping', () => {
  it('negative base clamps to 0', () => {
    const r = evaluateOffer(offer({ base: -10_000 }));
    expect(r.perYear[0].base).toBe(0);
  });

  it('negative signingBonus clamps to 0', () => {
    const r = evaluateOffer(offer({ signingBonus: -1000 }));
    expect(r.perYear[0].signing).toBe(0);
  });

  it('equityDiscount > 100 clamps to 100', () => {
    const r = evaluateOffer(
      offer({
        equityDiscountPct: 200,
        equity: { type: 'rsu-public', grantValueToday: 100_000, growthRatePct: 0 },
      }),
    );
    // 100% discount → equity value 0
    expect(r.equityNpv).toBe(0);
  });

  it('discountRate > 50 clamps to 50', () => {
    const r = evaluateOffer(offer({ base: 100_000, discountRatePct: 999 }));
    // Heavy discount → 4-year discounted close to 0 but not negative
    expect(r.fourYearDiscounted).toBeGreaterThan(0);
    expect(r.fourYearDiscounted).toBeLessThan(r.fourYearNominal);
  });
});

describe('evaluateOffer — equity', () => {
  it('"none" type gives 0 equity NPV', () => {
    const r = evaluateOffer(offer({ equity: { type: 'none', grantValueToday: 100_000 } }));
    expect(r.equityNpv).toBe(0);
  });

  it('RSU-public grants vest over 4 years', () => {
    const r = evaluateOffer(
      offer({
        equity: { type: 'rsu-public', grantValueToday: 400_000, growthRatePct: 0 },
      }),
    );
    // 4 years of vesting sums to grant value (no growth, no discount)
    const totalEquity = r.perYear.reduce((sum, y) => sum + y.equityVested, 0);
    expect(totalEquity).toBeCloseTo(400_000, -2);
  });

  it('growthRatePct compounds equity year-over-year', () => {
    const flat = evaluateOffer(
      offer({
        equity: { type: 'rsu-public', grantValueToday: 100_000, growthRatePct: 0 },
      }),
    );
    const growing = evaluateOffer(
      offer({
        equity: { type: 'rsu-public', grantValueToday: 100_000, growthRatePct: 10 },
      }),
    );
    const flatTotal = flat.perYear.reduce((s, y) => s + y.equityVested, 0);
    const growTotal = growing.perYear.reduce((s, y) => s + y.equityVested, 0);
    expect(growTotal).toBeGreaterThan(flatTotal);
  });

  it('equityDiscountPct reduces equity value', () => {
    const full = evaluateOffer(
      offer({
        equity: { type: 'pre-ipo-rsu', grantValueToday: 100_000, growthRatePct: 0 },
        equityDiscountPct: 0,
      }),
    );
    const half = evaluateOffer(
      offer({
        equity: { type: 'pre-ipo-rsu', grantValueToday: 100_000, growthRatePct: 0 },
        equityDiscountPct: 50,
      }),
    );
    expect(half.equityNpv).toBeLessThan(full.equityNpv);
  });

  it('handles 0 grantValue gracefully', () => {
    const r = evaluateOffer(
      offer({
        equity: { type: 'rsu-public', grantValueToday: 0 },
      }),
    );
    expect(r.equityNpv).toBe(0);
  });
});

describe('compareOffers', () => {
  it('prefers higher 4-year discounted by default', () => {
    const a = offer({ base: 100_000 });
    const b = offer({ base: 200_000 });
    const r = compareOffers(a, b);
    expect(r.preferred).toBe('b');
    expect(r.delta).toBeGreaterThan(0);
  });

  it('returns "tied" when offers are equal', () => {
    const a = offer({ base: 150_000 });
    const b = offer({ base: 150_000 });
    const r = compareOffers(a, b);
    expect(r.preferred).toBe('tied');
    expect(r.delta).toBe(0);
  });

  it('includes both evaluation results', () => {
    const r = compareOffers(offer({ base: 100_000 }), offer({ base: 150_000 }));
    expect(r.a).toBeDefined();
    expect(r.b).toBeDefined();
    expect(r.a.fourYearNominal).toBe(400_000);
    expect(r.b.fourYearNominal).toBe(600_000);
  });

  it('delta is always non-negative', () => {
    const r = compareOffers(offer({ base: 50_000 }), offer({ base: 200_000 }));
    expect(r.delta).toBeGreaterThanOrEqual(0);
  });
});

describe('evaluateOffer — determinism', () => {
  it('same input → same output', () => {
    const input = offer({ base: 175_000, signingBonus: 50_000, annualBonusTarget: 30_000 });
    const a = evaluateOffer(input);
    const b = evaluateOffer(input);
    expect(a.fourYearNominal).toBe(b.fourYearNominal);
    expect(a.fourYearDiscounted).toBe(b.fourYearDiscounted);
    expect(a.equityNpv).toBe(b.equityNpv);
  });
});
