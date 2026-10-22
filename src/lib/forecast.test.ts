import { describe, expect, it } from 'vitest';
import type { Bill, BillPayment, Subscription } from '../../generated/prisma/client';
import { forecastMonths, forecastTotal } from './forecast';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };
const now = new Date(2026, 9, 15); // October 2026

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 's',
		name: 'S',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'X',
		renewalDate: new Date('2026-10-20'),
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
		...overrides
	};
}

function bill(overrides: Partial<Bill> = {}): Bill {
	return {
		id: 'b',
		name: 'Water',
		kind: 'Utilities',
		estimateMinor: 5000,
		currency: 'EUR',
		billingCycle: 'monthly',
		intervalCount: 1,
		renewalDate: new Date('2026-10-05'),
		status: 'active',
		notes: null,
		...overrides
	};
}

function payment(amountMinor: number, paidOn: string): BillPayment {
	return { id: paidOn, billId: 'b', amountMinor, currency: 'EUR', paidOn: new Date(paidOn) };
}

describe('forecastMonths', () => {
	it('splits each month into subscription and bill spend', () => {
		const months = forecastMonths([sub()], [bill()], [], now, 3, money);

		expect(months).toHaveLength(3);
		for (const month of months) {
			expect(month.subscriptions).toBeCloseTo(10);
			expect(month.bills).toBeCloseTo(50);
			expect(month.total).toBeCloseTo(60);
		}
	});

	it('forecasts bills at the average of their latest payments', () => {
		const months = forecastMonths(
			[],
			[bill()],
			[payment(8000, '2026-08-05'), payment(10000, '2026-09-05')],
			now,
			1,
			money
		);
		expect(months[0].bills).toBeCloseTo(90);
	});

	it('counts a yearly bill only in the month it falls due', () => {
		const months = forecastMonths(
			[],
			[bill({ billingCycle: 'yearly', renewalDate: new Date('2026-12-10') })],
			[],
			now,
			4,
			money
		);
		expect(months.map((m) => Math.round(m.bills))).toEqual([0, 0, 50, 0]);
	});

	it('skips inactive bills and bills without an exchange rate', () => {
		const months = forecastMonths(
			[],
			[bill({ status: 'paused' }), bill({ id: 'x', currency: 'GBP' })],
			[],
			now,
			1,
			money
		);
		expect(months[0].bills).toBe(0);
	});
});

describe('forecastTotal', () => {
	it('sums every month', () => {
		const months = forecastMonths([sub()], [], [], now, 12, money);
		expect(forecastTotal(months)).toBeCloseTo(120);
	});
});
