import { describe, expect, it, vi } from 'vitest';
import {
	FALLBACK_RATES,
	RATES_MAX_AGE_MS,
	isStale,
	parseFrankfurterResponse,
	refreshRates,
	resolveRates
} from './rates';

const now = new Date('2026-10-12T12:00:00Z');
const fresh = { EUR: 1, USD: 1.1, GBP: 0.8 };

function deps(overrides: Partial<Parameters<typeof resolveRates>[0]> = {}) {
	return {
		now,
		cached: null,
		fetchLatest: vi.fn(async () => fresh),
		save: vi.fn(async () => {}),
		...overrides
	};
}

/** Lets a fire-and-forget refresh settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('parseFrankfurterResponse', () => {
	it('keeps supported currencies and adds the base', () => {
		const result = parseFrankfurterResponse({
			base: 'EUR',
			rates: { USD: 1.1, GBP: 0.85, BRL: 6.1 }
		});
		expect(result).toEqual({ EUR: 1, USD: 1.1, GBP: 0.85 });
	});

	it('drops unusable values', () => {
		const result = parseFrankfurterResponse({ rates: { USD: 1.1, GBP: 0, CHF: 'x', SEK: -2 } });
		expect(result).toEqual({ EUR: 1, USD: 1.1 });
	});

	it.each([null, undefined, 42, 'x', {}, { rates: null }, { rates: 'x' }, { rates: {} }])(
		'returns null for the unusable payload %j',
		(payload) => {
			expect(parseFrankfurterResponse(payload)).toBeNull();
		}
	);
});

describe('isStale', () => {
	it('is fresh just under a day old and stale from a day on', () => {
		expect(isStale(new Date(now.getTime() - RATES_MAX_AGE_MS + 1), now)).toBe(false);
		expect(isStale(new Date(now.getTime() - RATES_MAX_AGE_MS), now)).toBe(true);
	});
});

describe('refreshRates', () => {
	it('saves what it fetched', async () => {
		const d = deps();
		expect(await refreshRates(d)).toEqual(fresh);
		expect(d.save).toHaveBeenCalledWith(fresh, now);
	});

	it('returns null and saves nothing when the source has no data', async () => {
		const d = deps({ fetchLatest: vi.fn(async () => null) });
		expect(await refreshRates(d)).toBeNull();
		expect(d.save).not.toHaveBeenCalled();
	});

	it('swallows a failing fetch', async () => {
		const d = deps({
			fetchLatest: vi.fn(async () => {
				throw new Error('offline');
			})
		});
		expect(await refreshRates(d)).toBeNull();
		expect(d.save).not.toHaveBeenCalled();
	});

	it('swallows a failing save', async () => {
		const d = deps({
			save: vi.fn(async () => {
				throw new Error('db locked');
			})
		});
		expect(await refreshRates(d)).toBeNull();
	});
});

describe('resolveRates', () => {
	it('uses a fresh cache without touching the network', async () => {
		const cached = { rates: { EUR: 1, USD: 1.2 }, fetchedAt: new Date(now.getTime() - 1000) };
		const d = deps({ cached });

		expect(await resolveRates(d)).toEqual(cached.rates);
		expect(d.fetchLatest).not.toHaveBeenCalled();
	});

	it('serves a stale cache immediately and refreshes in the background', async () => {
		const cached = {
			rates: { EUR: 1, USD: 1.2 },
			fetchedAt: new Date(now.getTime() - RATES_MAX_AGE_MS * 2)
		};
		const d = deps({ cached });

		expect(await resolveRates(d)).toEqual(cached.rates);
		await flush();
		expect(d.fetchLatest).toHaveBeenCalledOnce();
		expect(d.save).toHaveBeenCalledWith(fresh, now);
	});

	it('keeps serving the stale cache when the background refresh fails', async () => {
		const cached = {
			rates: { EUR: 1, USD: 1.2 },
			fetchedAt: new Date(now.getTime() - RATES_MAX_AGE_MS * 2)
		};
		const d = deps({
			cached,
			fetchLatest: vi.fn(async () => {
				throw new Error('offline');
			})
		});

		expect(await resolveRates(d)).toEqual(cached.rates);
		await flush();
		expect(d.save).not.toHaveBeenCalled();
	});

	it('waits for the fetch only when nothing is cached', async () => {
		const d = deps();
		expect(await resolveRates(d)).toEqual(fresh);
		expect(d.save).toHaveBeenCalledOnce();
	});

	it('falls back to euro-only rates when there is no cache and no network', async () => {
		const d = deps({
			fetchLatest: vi.fn(async () => {
				throw new Error('offline');
			})
		});
		expect(await resolveRates(d)).toEqual(FALLBACK_RATES);
	});
});
