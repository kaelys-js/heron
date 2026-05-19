/**
 * lib/server/comp-math -- dense matrix of offer evaluations.
 *
 * Exercises every base/equity combination over a parametric grid.
 */
import { describe, expect, it } from 'vitest';
import { compareOffers, evaluateOffer, type OfferInput, type EquityType } from './comp-math';

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

describe('evaluateOffer — base scaling', () => {
  it.each([
    0, 50_000, 100_000, 150_000, 200_000, 250_000, 500_000, 1_000_000,
  ])('base $%i → fourYearNominal = 4 × base', (base) => {
    const r = evaluateOffer(offer({ base }));
    expect(r.fourYearNominal).toBe(4 * base);
  });
});

describe('evaluateOffer — signing bonus only paid year 1', () => {
  it.each([1_000, 5_000, 10_000, 25_000, 50_000, 100_000])('signing $%i', (signing) => {
    const r = evaluateOffer(offer({ signingBonus: signing }));
    expect(r.perYear[0].signing).toBe(signing);
    expect(r.perYear[1].signing).toBe(0);
    expect(r.perYear[2].signing).toBe(0);
    expect(r.perYear[3].signing).toBe(0);
  });
});

describe('evaluateOffer — annual bonus is paid every year', () => {
  it.each([5_000, 15_000, 25_000, 50_000])('bonus $%i', (bonus) => {
    const r = evaluateOffer(offer({ annualBonusTarget: bonus }));
    for (let y = 0; y < 4; y++) {
      expect(r.perYear[y].bonus).toBe(bonus);
    }
  });
});

describe('evaluateOffer — every equity type', () => {
  const types: EquityType[] = ['rsu-public', 'rsu-private', 'iso', 'nso', 'pre-ipo-rsu', 'none'];

  it.each(types)('type %s does not crash', (type) => {
    const r = evaluateOffer(
      offer({ equity: { type, grantValueToday: 100_000, growthRatePct: 0 } }),
    );
    expect(r.perYear.length).toBe(4);
  });

  it.each(
    types.filter((t) => t !== 'none'),
  )('type %s with 100k grant produces positive NPV', (type) => {
    const r = evaluateOffer(
      offer({ equity: { type, grantValueToday: 100_000, growthRatePct: 0 } }),
    );
    expect(r.equityNpv).toBeGreaterThan(0);
  });
});

describe('evaluateOffer — growth rate banding', () => {
  it.each([0, 5, 10, 15, 20, 25])('growth %i%% → higher total than lower growth', (growth) => {
    const lower = evaluateOffer(
      offer({ equity: { type: 'rsu-public', grantValueToday: 100_000, growthRatePct: 0 } }),
    );
    const higher = evaluateOffer(
      offer({ equity: { type: 'rsu-public', grantValueToday: 100_000, growthRatePct: growth } }),
    );
    if (growth > 0) expect(higher.equityNpv).toBeGreaterThan(lower.equityNpv);
    else expect(higher.equityNpv).toBeCloseTo(lower.equityNpv, 1);
  });
});

describe('evaluateOffer — discount rate banding', () => {
  it.each([0, 3, 5, 8, 10, 15, 20])('discount %i%% → discounted ≤ nominal', (rate) => {
    const r = evaluateOffer(offer({ base: 150_000, discountRatePct: rate }));
    expect(r.fourYearDiscounted).toBeLessThanOrEqual(r.fourYearNominal);
  });
});

describe('compareOffers — every pair', () => {
  it.each([
    [100_000, 200_000, 'b'],
    [200_000, 100_000, 'a'],
    [150_000, 150_000, 'tied'],
    [50_000, 1_000_000, 'b'],
    [1_000_000, 50_000, 'a'],
  ] as const)('base $%i vs $%i → preferred=%s', (baseA, baseB, expected) => {
    const r = compareOffers(offer({ base: baseA }), offer({ base: baseB }));
    expect(r.preferred).toBe(expected);
  });
});

describe('evaluateOffer — input clamping properties', () => {
  it.each([-1000, -100, -50, -1])('negative base %i → 0', (base) => {
    const r = evaluateOffer(offer({ base }));
    expect(r.perYear[0].base).toBe(0);
  });

  it.each([-1000, -500, -1])('negative signingBonus %i → 0', (signing) => {
    const r = evaluateOffer(offer({ signingBonus: signing }));
    expect(r.perYear[0].signing).toBe(0);
  });

  it.each([-100, -10, -1])('negative annualBonusTarget %i → 0', (bonus) => {
    const r = evaluateOffer(offer({ annualBonusTarget: bonus }));
    expect(r.perYear[0].bonus).toBe(0);
  });

  it.each([101, 150, 200, 999])('equityDiscount %i%% clamps to 100', (pct) => {
    const r = evaluateOffer(
      offer({
        equityDiscountPct: pct,
        equity: { type: 'rsu-public', grantValueToday: 100_000 },
      }),
    );
    expect(r.equityNpv).toBe(0); // 100% discount → 0
  });
});

describe('evaluateOffer — year1Cash combinations', () => {
  it.each([
    [100_000, 0, 0, 100_000],
    [100_000, 25_000, 0, 125_000],
    [100_000, 0, 10_000, 110_000],
    [100_000, 25_000, 10_000, 135_000],
    [150_000, 50_000, 20_000, 220_000],
  ] as const)('base=$%i signing=$%i bonus=$%i → year1Cash=$%i', (base, signing, bonus, expected) => {
    const r = evaluateOffer(offer({ base, signingBonus: signing, annualBonusTarget: bonus }));
    expect(r.year1Cash).toBe(expected);
  });
});
