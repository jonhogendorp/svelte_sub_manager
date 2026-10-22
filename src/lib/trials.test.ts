import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { trialExposure, trialsAtRisk } from './trials';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };
const now = new Date(2026, 9, 15); // 15 October 2026, local

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

describe('trialsAtRisk', () => {
	it('lists running trials of active subscriptions, soonest first', () => {
		const trials = trialsAtRisk(
			[
				sub({ id: 'later', trialEndsAt: new Date('2026-10-30') }),
				sub({ id: 'soon', trialEndsAt: new Date('2026-10-17') }),
				sub({ id: 'none' }),
				sub({ id: 'ended', trialEndsAt: new Date('2026-10-01') }),
				sub({ id: 'paused', status: 'paused', trialEndsAt: new Date('2026-10-20') })
			],
			now,
			money
		);

		expect(trials.map((t) => t.subscription.id)).toEqual(['soon', 'later']);
		expect(trials[0]).toMatchObject({ days: 2, urgency: 'urgent', charge: 10 });
		expect(trials[1].days).toBe(15);
	});

	it('counts a trial that ends today', () => {
		const [trial] = trialsAtRisk([sub({ trialEndsAt: new Date('2026-10-15') })], now, money);
		expect(trial.days).toBe(0);
	});

	it('converts the first charge to the display currency', () => {
		const [trial] = trialsAtRisk(
			[sub({ currency: 'USD', priceMinor: 2000, trialEndsAt: new Date('2026-10-20') })],
			now,
			money
		);
		expect(trial.charge).toBeCloseTo(10);
	});
});

describe('trialExposure', () => {
	it('sums the first charges and counts trials without a rate', () => {
		const trials = trialsAtRisk(
			[
				sub({ id: 'a', priceMinor: 1000, trialEndsAt: new Date('2026-10-20') }),
				sub({ id: 'b', priceMinor: 550, trialEndsAt: new Date('2026-10-21') }),
				sub({ id: 'c', currency: 'GBP', trialEndsAt: new Date('2026-10-22') })
			],
			now,
			money
		);
		const exposure = trialExposure(trials);
		expect(exposure.total).toBeCloseTo(15.5);
		expect(exposure.excluded).toBe(1);
	});

	it('is zero without trials', () => {
		expect(trialExposure([])).toEqual({ total: 0, excluded: 0 });
	});
});
