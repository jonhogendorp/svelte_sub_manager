import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import {
	NO_PAYMENT_METHOD,
	currencyExposure,
	fxImpact,
	paymentMethodBreakdown,
	totalYearlySaving,
	yearlySwitches
} from './breakdowns';

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
		cancelUrl: null,
		cancelNoticeDays: null,
		startedOn: null,
		shareCount: 1,
		sharedWith: null,
		businessPercent: 0,
		...overrides
	};
}

describe('paymentMethodBreakdown', () => {
	it('groups by method ignoring case and puts unspecified last', () => {
		const rows = paymentMethodBreakdown(
			[
				sub({ id: '1', priceMinor: 1000, paymentMethod: 'Visa 4242' }),
				sub({ id: '2', priceMinor: 500, paymentMethod: ' visa 4242 ' }),
				sub({ id: '3', priceMinor: 9000 }), // largest, but has no method
				sub({ id: '4', priceMinor: 2000, paymentMethod: 'PayPal' })
			],
			money
		);

		expect(rows.map((r) => r.method)).toEqual(['PayPal', 'Visa 4242', NO_PAYMENT_METHOD]);
		expect(rows[1]).toMatchObject({ count: 2 });
		expect(rows[1].monthly).toBeCloseTo(15);
		expect(rows.reduce((sum, r) => sum + r.percent, 0)).toBeCloseTo(100);
	});

	it('skips paused, cancelled and one-off subscriptions', () => {
		const rows = paymentMethodBreakdown(
			[sub({ status: 'paused' }), sub({ status: 'cancelled' }), sub({ billingCycle: 'once' })],
			money
		);
		expect(rows).toEqual([]);
	});
});

describe('currencyExposure', () => {
	it('splits spend by charged currency and totals the foreign part', () => {
		const exposure = currencyExposure(
			[
				sub({ id: '1', priceMinor: 3000 }), // 30 EUR
				sub({ id: '2', priceMinor: 2000, currency: 'USD' }), // 10 EUR
				sub({ id: '3', priceMinor: 9999, currency: 'GBP' }) // no rate: left out
			],
			money
		);

		expect(exposure.shares.map((s) => s.currency)).toEqual(['EUR', 'USD']);
		expect(exposure.shares[1].percent).toBeCloseTo(25);
		expect(exposure.foreignMonthly).toBeCloseTo(10);
	});

	it('estimates the effect of a currency move on the foreign part only', () => {
		const exposure = currencyExposure(
			[sub({ priceMinor: 3000 }), sub({ id: '2', priceMinor: 2000, currency: 'USD' })],
			money
		);
		expect(fxImpact(exposure, 5)).toBeCloseTo(0.5);
		expect(fxImpact(exposure, -5)).toBeCloseTo(-0.5);
	});
});

describe('yearlySwitches', () => {
	it('lists monthly plans whose yearly price is lower, biggest saving first', () => {
		const switches = yearlySwitches(
			[
				sub({ id: 'small', priceMinor: 1000, yearlyPriceMinor: 10000 }), // 120 vs 100 = 20
				sub({ id: 'big', priceMinor: 2000, yearlyPriceMinor: 18000 }), // 240 vs 180 = 60
				sub({ id: 'worse', priceMinor: 1000, yearlyPriceMinor: 13000 }),
				sub({ id: 'none', priceMinor: 1000 }),
				sub({ id: 'quarterly', billingCycle: 'quarterly', yearlyPriceMinor: 100 }),
				sub({ id: 'paused', status: 'paused', yearlyPriceMinor: 100 })
			],
			money
		);

		expect(switches.map((s) => s.subscription.id)).toEqual(['big', 'small']);
		expect(switches[0].yearlySaving).toBeCloseTo(60);
		expect(switches[0].percent).toBeCloseTo(25);
		expect(totalYearlySaving(switches)).toBeCloseTo(80);
	});

	it('converts the saving to the display currency', () => {
		const [item] = yearlySwitches(
			[sub({ currency: 'USD', priceMinor: 1000, yearlyPriceMinor: 10000 })], // saves 20 USD = 10 EUR
			money
		);
		expect(item.yearlySaving).toBeCloseTo(10);
	});
});
