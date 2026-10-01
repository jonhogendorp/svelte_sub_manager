import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../../generated/prisma/client';
import { categoryTotals, niceMax, niceStep, upcomingSpendBuckets } from './chart-data';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		price: 10,
		category: 'Streaming',
		renewalDate: new Date('2026-10-20'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		...overrides
	};
}

describe('categoryTotals', () => {
	it('returns an empty list for no subscriptions', () => {
		expect(categoryTotals([])).toEqual([]);
	});

	it('sums monthly-equivalent cost per category, largest first', () => {
		const result = categoryTotals([
			makeSubscription({ id: 'a', category: 'Music', price: 10 }),
			makeSubscription({ id: 'b', category: 'Streaming', price: 15 }),
			makeSubscription({ id: 'c', category: 'Music', price: 5 }),
			makeSubscription({ id: 'd', category: 'Software', price: 120, billingCycle: 'yearly' })
		]);

		// Streaming 15, Music 10 + 5 = 15, Software 120/12 = 10
		expect(result).toHaveLength(3);
		expect(result.map(([category]) => category).sort()).toEqual(['Music', 'Software', 'Streaming']);
		expect(Object.fromEntries(result)).toEqual({ Music: 15, Streaming: 15, Software: 10 });
		expect(result[2]).toEqual(['Software', 10]);
	});
});

describe('upcomingSpendBuckets', () => {
	const now = new Date(2026, 9, 12); // 12 Oct 2026, local

	it('creates one bucket per month starting with the current month', () => {
		const buckets = upcomingSpendBuckets([], now, 6);

		expect(buckets).toHaveLength(6);
		expect(buckets[0].monthStart).toEqual(new Date(2026, 9, 1));
		expect(buckets[5].monthStart).toEqual(new Date(2027, 2, 1));
		expect(buckets.every((b) => b.total === 0)).toBe(true);
	});

	it('charges a monthly subscription in every bucket', () => {
		const buckets = upcomingSpendBuckets([makeSubscription({ price: 10 })], now, 6);
		expect(buckets.map((b) => b.total)).toEqual([10, 10, 10, 10, 10, 10]);
	});

	it('charges a yearly subscription only in its renewal month', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ price: 120, billingCycle: 'yearly', renewalDate: new Date('2026-12-05') })],
			now,
			6
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 0, 120, 0, 0, 0]);
	});

	it('rolls a stale renewal date forward into the window', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ price: 120, billingCycle: 'yearly', renewalDate: new Date('2024-11-15') })],
			now,
			6
		);
		expect(buckets.map((b) => b.total)).toEqual([0, 120, 0, 0, 0, 0]);
	});

	it('keeps charging a 31st-of-the-month subscription in short months', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ price: 10, renewalDate: new Date('2026-10-31') })],
			now,
			6
		);
		// Nov, Feb and Apr have no 31st; each should still be charged once.
		expect(buckets.map((b) => b.total)).toEqual([10, 10, 10, 10, 10, 10]);
	});

	it('omits a renewal that is still in the future beyond the window', () => {
		const buckets = upcomingSpendBuckets(
			[makeSubscription({ renewalDate: new Date('2027-09-10'), billingCycle: 'yearly' })],
			now,
			6
		);
		expect(buckets.every((b) => b.total === 0)).toBe(true);
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
