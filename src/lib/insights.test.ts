import { describe, expect, it } from 'vitest';
import type { PriceChange, Subscription } from '../../generated/prisma/client';
import { cycleBreakdown, priceHikes, savings, topCosts, totalYearlyImpact } from './insights';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'A',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'X',
		renewalDate: new Date('2026-11-20'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		accountEmail: null,
		paymentMethod: null,
		notes: null,
		usageRating: null,
		...overrides
	};
}

function change(overrides: Partial<PriceChange> = {}): PriceChange {
	return {
		id: 'c1',
		subscriptionId: 'a',
		oldMinor: 800,
		newMinor: 1000,
		currency: 'EUR',
		changedAt: new Date('2026-09-01'),
		...overrides
	};
}

describe('topCosts', () => {
	it('ranks by yearly cost with shares, skipping inactive and one-off subscriptions', () => {
		const result = topCosts(
			[
				sub({ id: 'm', name: 'Monthly', priceMinor: 1000 }), // 120/yr
				sub({ id: 'y', name: 'Yearly', priceMinor: 3000, billingCycle: 'yearly' }), // 30/yr
				sub({ id: 'p', name: 'Paused', status: 'paused' }),
				sub({ id: 'o', name: 'Once', billingCycle: 'once' })
			],
			money
		);

		expect(result.map((r) => r.subscription.id)).toEqual(['m', 'y']);
		expect(result[0].yearly).toBeCloseTo(120);
		expect(result[0].percent).toBeCloseTo(80);
		expect(result[1].percent).toBeCloseTo(20);
	});

	it('honours the limit and converts currencies', () => {
		const result = topCosts(
			[sub({ id: 'u', priceMinor: 2400, currency: 'USD' }), sub({ id: 'e', priceMinor: 100 })],
			money,
			1
		);
		expect(result).toHaveLength(1);
		// $24/mo at 2 USD per EUR is €12/mo = €144/yr
		expect(result[0].yearly).toBeCloseTo(144);
	});
});

describe('priceHikes', () => {
	it('measures from the oldest recorded price and values the yearly impact', () => {
		const hikes = priceHikes(
			[sub({ priceMinor: 1000 })],
			[
				change({ id: 'c1', oldMinor: 800, newMinor: 900, changedAt: new Date('2026-06-01') }),
				change({ id: 'c2', oldMinor: 900, newMinor: 1000, changedAt: new Date('2026-09-01') })
			],
			money
		);

		expect(hikes).toHaveLength(1);
		expect(hikes[0].originalMinor).toBe(800);
		expect(hikes[0].percent).toBeCloseTo(25);
		// (10 - 8) × 12
		expect(hikes[0].yearlyImpact).toBeCloseTo(24);
		expect(hikes[0].lastChangedAt).toEqual(new Date('2026-09-01'));
		expect(totalYearlyImpact(hikes)).toBeCloseTo(24);
	});

	it('ignores subscriptions that are not more expensive than at the start', () => {
		expect(
			priceHikes([sub({ priceMinor: 700 })], [change({ oldMinor: 800, newMinor: 700 })], money)
		).toEqual([]);
		expect(priceHikes([sub()], [], money)).toEqual([]);
	});

	it('sorts the biggest yearly impact first', () => {
		const hikes = priceHikes(
			[sub({ id: 'a', priceMinor: 1000 }), sub({ id: 'b', priceMinor: 5000 })],
			[
				change({ subscriptionId: 'a', oldMinor: 900, newMinor: 1000 }),
				change({ id: 'c2', subscriptionId: 'b', oldMinor: 4000, newMinor: 5000 })
			],
			money
		);
		expect(hikes.map((h) => h.subscription.id)).toEqual(['b', 'a']);
	});
});

describe('cycleBreakdown', () => {
	it('groups monthly-equivalent spend per cycle', () => {
		const result = cycleBreakdown(
			[
				sub({ id: '1', priceMinor: 1000 }),
				sub({ id: '2', priceMinor: 500 }),
				sub({ id: '3', priceMinor: 12000, billingCycle: 'yearly' })
			],
			money
		);
		expect(result).toEqual([
			{ cycle: 'monthly', monthly: 15, count: 2 },
			{ cycle: 'yearly', monthly: 10, count: 1 }
		]);
	});
});

describe('savings', () => {
	it('adds up paused and cancelled recurring subscriptions', () => {
		expect(
			savings(
				[
					sub({ id: '1', status: 'cancelled' }),
					sub({ id: '2', status: 'paused', priceMinor: 500 }),
					sub({ id: '3' }),
					sub({ id: '4', status: 'cancelled', billingCycle: 'once' })
				],
				money
			)
		).toEqual({ yearly: 180, cancelled: 1, paused: 1 });
	});
});
