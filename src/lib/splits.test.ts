import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { splitSummary } from './splits';
import {
	fullPriceIn,
	monthlyCost,
	priceIn,
	summarizeSpend,
	toShareCount,
	yearlyCost,
	yourShareMinor
} from './subscriptions';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'A',
		priceMinor: 1200,
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
		cancelledAt: null,
		yearlyPriceMinor: null,
		cancelUrl: null,
		cancelNoticeDays: null,
		startedOn: null,
		shareCount: 1,
		sharedWith: null,
		...overrides
	};
}

describe('toShareCount', () => {
	it('accepts whole numbers from 1 to 20 and defaults everything else to 1', () => {
		expect(toShareCount(3)).toBe(3);
		expect(toShareCount('4')).toBe(4);
		for (const value of [0, -1, 21, 2.5, 'x', null, undefined]) {
			expect(toShareCount(value)).toBe(1);
		}
	});
});

describe('your share in the cost functions', () => {
	it('divides the price by the number of people', () => {
		const shared = sub({ shareCount: 3 });
		expect(yourShareMinor(shared)).toBe(400);
		expect(monthlyCost(shared)).toBe(400);
		expect(yearlyCost(shared)).toBe(4800);
		expect(priceIn(shared, money)).toBeCloseTo(4);
	});

	it('rounds an uneven split to the nearest cent', () => {
		expect(yourShareMinor(sub({ priceMinor: 1000, shareCount: 3 }))).toBe(333);
	});

	it('leaves unshared and legacy objects untouched', () => {
		expect(yourShareMinor(sub())).toBe(1200);
		expect(yourShareMinor({ priceMinor: 1200 })).toBe(1200);
	});

	it('still reports the full card charge separately', () => {
		expect(fullPriceIn(sub({ shareCount: 3 }), money)).toBeCloseTo(12);
	});

	it('is what the spend totals use', () => {
		const summary = summarizeSpend([sub({ shareCount: 3 }), sub({ id: 'b' })], money);
		expect(summary.monthly).toBeCloseTo(16); // 4 + 12
	});
});

describe('splitSummary', () => {
	it('shows what the others owe, in total and per person', () => {
		const { plans, owedMonthly } = splitSummary([sub({ shareCount: 3 })], money);

		expect(plans).toHaveLength(1);
		expect(plans[0]).toMatchObject({ people: 3, fullMonthly: 12, yourMonthly: 4, owedMonthly: 8 });
		expect(plans[0].perPerson).toBeCloseTo(4);
		expect(owedMonthly).toBeCloseTo(8);
	});

	it('ignores unshared, inactive and unconvertible plans', () => {
		const { plans } = splitSummary(
			[
				sub({ id: '1' }),
				sub({ id: '2', shareCount: 2, status: 'paused' }),
				sub({ id: '3', shareCount: 2, billingCycle: 'once' }),
				sub({ id: '4', shareCount: 2, currency: 'GBP' })
			],
			money
		);
		expect(plans).toEqual([]);
	});

	it('lists the biggest amount owed first', () => {
		const { plans } = splitSummary(
			[
				sub({ id: 'small', priceMinor: 1000, shareCount: 2 }),
				sub({ id: 'big', priceMinor: 6000, shareCount: 4 })
			],
			money
		);
		expect(plans.map((plan) => plan.subscription.id)).toEqual(['big', 'small']);
	});
});
