/**
 * POST /api/comp-eval -- evaluate or compare an offer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evalCalls: unknown[] = [];
const compareCalls: { a: unknown; b: unknown; metric: string }[] = [];

vi.mock('$lib/server/comp-math', () => ({
  evaluateOffer: (input: unknown) => {
    evalCalls.push(input);
    return { year1Cash: 200000, fourYearTc: 1_000_000, equityNpv: 400_000 };
  },
  compareOffers: (a: unknown, b: unknown, metric: string) => {
    compareCalls.push({ a, b, metric });
    return { winner: 'a', delta: 50000 };
  },
}));

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  evalCalls.length = 0;
  compareCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/comp-eval'),
    request: new Request('http://localhost/api/comp-eval', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('pOST /api/comp-eval — single-offer evaluation', () => {
  it('400 when base is missing', async () => {
    const r = await post({});
    expect(r.status).toBe(400);
  });

  it('400 when base is non-numeric', async () => {
    const r = await post({ base: 'a lot' });
    expect(r.status).toBe(400);
  });

  it('evaluates a single offer', async () => {
    const r = await post({ base: 180000, equity: 200000 });
    expect(r.status).toBe(200);
    expect(r.body.year1Cash).toBe(200000);
    expect(evalCalls.length).toBe(1);
  });
});

describe('pOST /api/comp-eval — comparison mode', () => {
  it('400 when compare=true and offer a is missing', async () => {
    const r = await post({ compare: true, b: { base: 100 } });
    expect(r.status).toBe(400);
  });

  it('400 when compare=true and offer b is missing', async () => {
    const r = await post({ compare: true, a: { base: 100 } });
    expect(r.status).toBe(400);
  });

  it('uses the default 4yr-discounted metric when none provided', async () => {
    const r = await post({ compare: true, a: { base: 100 }, b: { base: 200 } });
    expect(r.status).toBe(200);
    expect(compareCalls[0].metric).toBe('4yr-discounted');
  });

  it('honours an explicit metric', async () => {
    await post({ compare: true, a: { base: 100 }, b: { base: 200 }, metric: 'year1' });
    expect(compareCalls[0].metric).toBe('year1');
  });
});
