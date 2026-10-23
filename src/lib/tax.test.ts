import { describe, expect, it } from 'vitest';
import type { Bill, BillPayment, Subscription } from '../../generated/prisma/client';
import { availableYears, subscriptionSpentInYear, taxReport, toBusinessPercent } from './tax';
import { taxReportToCsv } from './tax-csv';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };
const now = new Date('2026-10-22T00:00:00Z');

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'Adobe',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'Software',
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
		businessPercent: 100,
		...overrides
	};
}

function bill(overrides: Partial<Bill> = {}): Bill {
	return {
		id: 'b',
		name: 'Phone',
		kind: 'Telecom',
		estimateMinor: 3000,
		currency: 'EUR',
		billingCycle: 'monthly',
		intervalCount: 1,
		renewalDate: new Date('2026-10-05'),
		status: 'active',
		notes: null,
		businessPercent: 50,
		...overrides
	};
}

function payment(amountMinor: number, paidOn: string, overrides: Partial<BillPayment> = {}) {
	return {
		id: `${paidOn}-${amountMinor}`,
		billId: 'b',
		amountMinor,
		currency: 'EUR',
		paidOn: new Date(paidOn),
		...overrides
	} satisfies BillPayment;
}

describe('toBusinessPercent', () => {
	it('accepts whole numbers from 0 to 100 and treats everything else as 0', () => {
		expect(toBusinessPercent(60)).toBe(60);
		expect(toBusinessPercent('100')).toBe(100);
		for (const value of [-1, 101, 2.5, 'x', null, undefined]) {
			expect(toBusinessPercent(value)).toBe(0);
		}
	});
});

describe('subscriptionSpentInYear', () => {
	it('charges a full past year of a running subscription', () => {
		expect(subscriptionSpentInYear(sub(), 2025, now)).toBe(12000);
	});

	it('stops at today for the current year', () => {
		// 1 Jan to 22 Oct 2026 is 294 days.
		expect(subscriptionSpentInYear(sub(), 2026, now)).toBe(Math.round((12000 * 294) / 365));
	});

	it('counts from the start date, after a free trial', () => {
		const started = sub({
			startedOn: new Date('2025-07-01'),
			trialEndsAt: new Date('2025-10-01')
		});
		// 1 Oct to 31 Dec 2025 is 92 days.
		expect(subscriptionSpentInYear(started, 2025, now)).toBe(Math.round((12000 * 92) / 365));
		expect(subscriptionSpentInYear(started, 2024, now)).toBe(0);
	});

	it('stops at the cancellation date', () => {
		const cancelled = sub({ status: 'cancelled', cancelledAt: new Date('2025-04-01') });
		// 1 Jan to 1 Apr 2025 is 90 days.
		expect(subscriptionSpentInYear(cancelled, 2025, now)).toBe(Math.round((12000 * 90) / 365));
		expect(subscriptionSpentInYear(cancelled, 2026, now)).toBe(0);
	});

	it('uses your share of a split plan', () => {
		expect(subscriptionSpentInYear(sub({ shareCount: 2 }), 2025, now)).toBe(6000);
	});

	it('is unknown for paused or undated cancelled subscriptions', () => {
		expect(subscriptionSpentInYear(sub({ status: 'paused' }), 2025, now)).toBeNull();
		expect(subscriptionSpentInYear(sub({ status: 'cancelled' }), 2025, now)).toBeNull();
	});

	it('puts a one-off charge in the year it was made', () => {
		const once = sub({ billingCycle: 'once', renewalDate: new Date('2025-03-03') });
		expect(subscriptionSpentInYear(once, 2025, now)).toBe(1000);
		expect(subscriptionSpentInYear(once, 2026, now)).toBe(0);
	});
});

describe('taxReport', () => {
	it('splits business use from private use and totals by category', () => {
		const report = taxReport(
			[sub({ businessPercent: 50 })],
			[bill()],
			[payment(3000, '2025-03-01'), payment(5000, '2025-04-01')],
			2025,
			now,
			money
		);

		expect(report.rows.map((r) => [r.name, r.kind, r.estimated])).toEqual([
			['Adobe', 'subscription', true],
			['Phone', 'bill', false]
		]);
		expect(report.rows[0]).toMatchObject({ spent: 120, deductible: 60 });
		expect(report.rows[1]).toMatchObject({ spent: 80, deductible: 40 });
		expect(report.totalSpent).toBeCloseTo(200);
		expect(report.totalDeductible).toBeCloseTo(100);
		expect(report.hasEstimates).toBe(true);
		expect(report.categories.map((c) => c.category)).toEqual(['Software', 'Telecom']);
	});

	it('only counts bill payments made in the year', () => {
		const report = taxReport(
			[],
			[bill()],
			[payment(3000, '2024-12-31'), payment(4000, '2025-06-01'), payment(3000, '2026-01-01')],
			2025,
			now,
			money
		);
		expect(report.rows[0].spent).toBeCloseTo(40);
	});

	it('leaves out items with no business use and bills without payments in the year', () => {
		const report = taxReport(
			[sub({ businessPercent: 0 })],
			[bill(), bill({ id: 'c', businessPercent: 0 })],
			[],
			2025,
			now,
			money
		);
		expect(report.rows).toEqual([]);
		expect(report.hasEstimates).toBe(false);
	});

	it('converts other currencies and counts what cannot be converted', () => {
		const report = taxReport(
			[
				sub({ id: 'usd', currency: 'USD', priceMinor: 2000 }), // 240 USD/yr = 120 EUR
				sub({ id: 'gbp', currency: 'GBP' })
			],
			[],
			[],
			2025,
			now,
			money
		);
		expect(report.rows).toHaveLength(1);
		expect(report.rows[0].spent).toBeCloseTo(120);
		expect(report.excluded).toBe(1);
	});
});

describe('availableYears', () => {
	it('lists the current year, start years and payment years, newest first', () => {
		const years = availableYears(
			[{ startedOn: new Date('2023-05-01') }, { startedOn: null }],
			[{ paidOn: new Date('2024-02-02') }],
			now
		);
		expect(years).toEqual([2026, 2024, 2023]);
	});
});

describe('taxReportToCsv', () => {
	it('writes a header, one row per item and a totals row', () => {
		const report = taxReport([sub({ businessPercent: 50 })], [], [], 2025, now, money);
		const lines = taxReportToCsv(report, 'EUR').trimEnd().split('\r\n');

		expect(lines[0]).toBe('category,name,type,businessPercent,spent,deductible,estimated');
		expect(lines[1]).toBe('Software,Adobe,subscription,50,120.00,60.00,yes');
		expect(lines[2]).toBe('Total,,,,120.00,60.00,');
	});

	it('defuses spreadsheet formulas in names', () => {
		const report = taxReport([sub({ name: '=HYPERLINK("x")' })], [], [], 2025, now, money);
		expect(taxReportToCsv(report, 'EUR')).toContain(`"'=HYPERLINK(""x"")"`);
	});
});
