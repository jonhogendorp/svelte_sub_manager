import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { reviewValue, toUsageRating } from './value';

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
		cancelledAt: null,
		yearlyPriceMinor: null,
		...overrides
	};
}

describe('toUsageRating', () => {
	it('accepts 1–5 and rejects everything else', () => {
		expect(toUsageRating(3)).toBe(3);
		expect(toUsageRating(0)).toBeNull();
		expect(toUsageRating(6)).toBeNull();
		expect(toUsageRating(2.5)).toBeNull();
		expect(toUsageRating(null)).toBeNull();
		expect(toUsageRating('3')).toBeNull();
	});
});

describe('reviewValue', () => {
	it('lists low-rated recurring subscriptions, costliest first', () => {
		const review = reviewValue(
			[
				sub({ id: 'cheap', usageRating: 1, priceMinor: 500 }), // 60/yr
				sub({ id: 'pricey', usageRating: 2, priceMinor: 2000 }), // 240/yr
				sub({ id: 'loved', usageRating: 5, priceMinor: 9000 }),
				sub({ id: 'meh', usageRating: 3, priceMinor: 9000 })
			],
			money
		);

		expect(review.candidates.map((c) => c.subscription.id)).toEqual(['pricey', 'cheap']);
		expect(review.candidates[0].yearly).toBeCloseTo(240);
		expect(review.candidatesYearly).toBeCloseTo(300);
	});

	it('skips paused, cancelled and one-off subscriptions', () => {
		const review = reviewValue(
			[
				sub({ id: 'p', usageRating: 1, status: 'paused' }),
				sub({ id: 'c', usageRating: 1, status: 'cancelled' }),
				sub({ id: 'o', usageRating: 1, billingCycle: 'once' })
			],
			money
		);
		expect(review.candidates).toEqual([]);
		expect(review.unrated).toBe(0);
	});

	it('counts unrated active subscriptions', () => {
		const review = reviewValue([sub({ id: 'a' }), sub({ id: 'b', usageRating: 4 })], money);
		expect(review.unrated).toBe(1);
	});

	it('converts currencies and leaves out those without a rate', () => {
		const review = reviewValue(
			[
				sub({ id: 'usd', usageRating: 1, currency: 'USD', priceMinor: 2000 }), // 20 USD = 10 EUR/mo
				sub({ id: 'xxx', usageRating: 1, currency: 'GBP' })
			],
			money
		);
		expect(review.candidates.map((c) => c.subscription.id)).toEqual(['usd']);
		expect(review.candidates[0].yearly).toBeCloseTo(120);
	});
});
