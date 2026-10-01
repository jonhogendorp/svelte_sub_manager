import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../../generated/prisma/client';
import type { MoneyContext } from '../money';
import { categoryTotals, niceMax, niceStep, upcomingSpendBuckets } from './chart-data';

const eur: MoneyContext = { display: 'EUR', rates: { EUR: 1 } };
const inEur: MoneyContext = { display: 'EUR', rates: { EUR: 1, USD: 1.1 } };

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'Streaming',
		renewalDate: new Date('2026-10-20'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		...overrides
	};
}

describe('categoryTotals', () => {
	it('returns an empty list for no subscriptions', () => {
		expect(categoryTotals([], eur)).toEqual([]);
	});

	it('sums monthly-equivalent cost per category, largest first', () => {
		const result = categoryTotals([
			makeSubscription({ id: 'a', category: 'Music', priceMinor: 1000 }),
			makeSubscription({ id: 'b', category: 'Streaming', priceMinor: 1500 }),
			makeSubscription({ id: 'c', category: 'Music', priceMinor: 500 }),
			makeSubscription({ id: 'd', category: 'Software', priceMinor: 12000, billingCycle: 'yearly' })
		], eur);

		// Streaming 15, Music 10 + 5 = 15, Software 120/12 = 10
		expect(result).toHaveLength(3);
		expect(result.map(([category]) => category).sort()).toEqual(['Music', 'Software', 'Streaming']);
		expect(Object.fromEntries(result)).toEqual({ Music: 15, Streaming: 15, Software: 10 });
		expect(result[2]).toEqual(['Software', 10]);
	});
});

describe('categoryTotals with several currencies', () => {
	it('adds a foreign-currency subscription to its category in the display currency', () => {
		const result = categoryTotals(
			[
				makeSubscription({ id: 'a', category: 'Music', priceMinor: 1000, currency: 'EUR' }),
				makeSubscription({ id: 'b', category: 'Music', priceMinor: 1100, currency: 'USD' })
			],
			inEur
		);

		// €10 + $11 (= €10)
		expect(result).toHaveLength(1);
		expect(result[0][0]).toBe('Music');
		expect(result[0][1]).toBeCloseTo(20);
	});

	it('leaves out a subscription whose currency has no rate', () => {
		const result = categoryTotals(
			[
				makeSubscription({ id: 'a', category: 'Music', priceMinor: 1000 }),
				makeSubscription({ id: 'b', category: 'Travel', priceMinor: 9999, currency: 'CHF' })
			],
			inEur
		);

		expect(result).toEqual([['Music', 10]]);
	});
});

describe('upcomingSpendBuckets with several currencies', () => {
	const now = new Date(2026, 9, 12);

	it('converts each charge into the display currency', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 1100, currency: 'USD' })],
			now,
			2,
			inEur
		);
		expect(buckets[0].total).toBeCloseTo(10);
		expect(buckets[1].total).toBeCloseTo(10);
	});

	it('skips a subscription it cannot convert', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 9999, currency: 'CHF' })],
			now,
			2,
			inEur
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 0]);
	});
});

describe('upcomingSpendBuckets', () => {
	const now = new Date(2026, 9, 12); // 12 Oct 2026, local

	it('creates one bucket per month starting with the current month', () => {
		const buckets = upcomingSpendBuckets([], now, 6, eur);

		expect(buckets).toHaveLength(6);
		expect(buckets[0].monthStart).toEqual(new Date(2026, 9, 1));
		expect(buckets[5].monthStart).toEqual(new Date(2027, 2, 1));
		expect(buckets.every((b) => b.total === 0)).toBe(true);
	});

	it('charges a monthly subscription in every bucket', () => {
		const buckets = upcomingSpendBuckets([makeSubscription({ priceMinor: 1000 })], now, 6, eur);
		expect(buckets.map((b) => b.total)).toEqual([10, 10, 10, 10, 10, 10]);
	});

	it('charges a yearly subscription only in its renewal month', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 12000, billingCycle: 'yearly', renewalDate: new Date('2026-12-05') })],
			now,
			6,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 0, 120, 0, 0, 0]);
	});

	it('rolls a stale renewal date forward into the window', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 12000, billingCycle: 'yearly', renewalDate: new Date('2024-11-15') })],
			now,
			6,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 120, 0, 0, 0, 0]);
	});

	it('keeps charging a 31st-of-the-month subscription in short months', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 1000, renewalDate: new Date('2026-10-31') })],
			now,
			6,
			eur
		);
		// Nov, Feb and Apr have no 31st; each should still be charged once.
		expect(buckets.map((b) => b.total)).toEqual([10, 10, 10, 10, 10, 10]);
	});

	it('omits a renewal that is still in the future beyond the window', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ renewalDate: new Date('2027-09-10'), billingCycle: 'yearly' })],
			now,
			6,
			eur
		);
		expect(buckets.every((b) => b.total === 0)).toBe(true);
	});
});

describe('chart data by cycle and status', () => {
	const now = new Date(2026, 9, 12);

	it('counts a weekly subscription every week of the month', () => {
		// Fridays in Oct 2026: 2, 9, 16, 23, 30 (five); Nov 2026: 6, 13, 20, 27 (four).
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 1000, billingCycle: 'weekly', renewalDate: new Date('2026-10-02') })],
			now,
			2,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([50, 40]);
	});

	it('charges a quarterly subscription only every third month', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 3000, billingCycle: 'quarterly', renewalDate: new Date('2026-11-15') })],
			now,
			6,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 30, 0, 0, 30, 0]);
	});

	it('charges a custom every-two-months subscription every other month', () => {
		const buckets = upcomingSpendBuckets(
			[
				makeSubscription({
					priceMinor: 2000,
					billingCycle: 'custom',
					intervalCount: 2,
					renewalDate: new Date('2026-10-20')
				})
			],
			now,
			4,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([20, 0, 20, 0]);
	});

	it('shows a future one-off charge once, in its month', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 5000, billingCycle: 'once', renewalDate: new Date('2026-12-10') })],
			now,
			6,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 0, 50, 0, 0, 0]);
	});

	it('shows nothing for a one-off that has already happened', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ priceMinor: 5000, billingCycle: 'once', renewalDate: new Date('2026-08-10') })],
			now,
			6,
			eur
		);
		expect(buckets.every((b) => b.total === 0)).toBe(true);
	});

	it('leaves paused and cancelled subscriptions out of the upcoming spend', () => {
		const buckets = upcomingSpendBuckets(
			[
				makeSubscription({ id: 'a', priceMinor: 1000 }),
				makeSubscription({ id: 'b', priceMinor: 1000, status: 'paused' }),
				makeSubscription({ id: 'c', priceMinor: 1000, status: 'cancelled' })
			],
			now,
			2,
			eur
		);
		expect(buckets.map((b) => b.total)).toEqual([10, 10]);
	});

	it('leaves paused, cancelled and one-off subscriptions out of the category totals', () => {
		const result = categoryTotals(
			[
				makeSubscription({ id: 'a', category: 'Music', priceMinor: 1000 }),
				makeSubscription({ id: 'b', category: 'Music', priceMinor: 1000, status: 'paused' }),
				makeSubscription({ id: 'c', category: 'Travel', priceMinor: 9000, status: 'cancelled' }),
				makeSubscription({ id: 'd', category: 'Gear', priceMinor: 9000, billingCycle: 'once' })
			],
			eur
		);
		expect(result).toEqual([['Music', 10]]);
	});

	it('uses the weekly-to-monthly equivalent in the category totals', () => {
		const result = categoryTotals(
			[makeSubscription({ category: 'Gym', priceMinor: 1200, billingCycle: 'weekly' })],
			eur
		);
		expect(result[0][0]).toBe('Gym');
		expect(result[0][1]).toBeCloseTo((12 * 52) / 12);
	});
});

describe('niceMax', () => {
	it.each([
		[0, 1],
		[0.7, 1],
		[1, 1],
		[1.2, 2],
		[7, 10],
		[120, 200],
		[500, 500],
		[501, 1000]
	])('rounds %d up to %d', (input, expected) => {
		expect(niceMax(input)).toBe(expected);
	});
});

describe('niceStep', () => {
	it.each([
		[4, 1],
		[8, 2],
		[100, 50],
		[1000, 500]
	])('picks %d → %d as the gridline interval', (input, expected) => {
		expect(niceStep(input)).toBe(expected);
	});
});
