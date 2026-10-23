import { describe, expect, it } from 'vitest';
import type { Bill, BillPayment } from '../../generated/prisma/client';
import {
	detectSpike,
	estimatedAmountMinor,
	paymentsFor,
	recentAmounts,
	summarizeBills
} from './bills';

function bill(overrides: Partial<Bill> = {}): Bill {
	return {
		id: 'b1',
		name: 'Electricity',
		kind: 'Utilities',
		estimateMinor: 10000,
		currency: 'EUR',
		billingCycle: 'monthly',
		intervalCount: 1,
		renewalDate: new Date('2026-10-01'),
		status: 'active',
		notes: null,
		businessPercent: 0,
		...overrides
	};
}

function payment(amountMinor: number, paidOn: string, overrides: Partial<BillPayment> = {}) {
	return {
		id: `${paidOn}-${amountMinor}`,
		billId: 'b1',
		amountMinor,
		currency: 'EUR',
		paidOn: new Date(paidOn),
		...overrides
	} satisfies BillPayment;
}

describe('estimatedAmountMinor', () => {
	it('falls back to the entered estimate without payments', () => {
		expect(estimatedAmountMinor(bill(), [])).toBe(10000);
	});

	it('averages the last three payments', () => {
		const payments = [
			payment(1000, '2026-06-01'), // too old to count
			payment(9000, '2026-07-01'),
			payment(12000, '2026-08-01'),
			payment(15000, '2026-09-01')
		];
		expect(estimatedAmountMinor(bill(), payments)).toBe(12000);
	});

	it('ignores payments of other bills and other currencies', () => {
		const payments = [
			payment(500, '2026-09-01', { billId: 'other' }),
			payment(700, '2026-09-02', { currency: 'USD' })
		];
		expect(estimatedAmountMinor(bill(), payments)).toBe(10000);
	});
});

describe('paymentsFor', () => {
	it('returns the bill’s payments newest first', () => {
		const older = payment(1, '2026-01-01');
		const newer = payment(2, '2026-02-01');
		expect(paymentsFor(bill(), [older, newer, payment(3, '2026-03-01', { billId: 'x' })])).toEqual([
			newer,
			older
		]);
	});
});

describe('summarizeBills', () => {
	const money = { display: 'EUR', rates: { USD: 2 } };

	it('totals active bills from their estimates', () => {
		const summary = summarizeBills(
			[bill(), bill({ id: 'b2', billingCycle: 'yearly', estimateMinor: 24000 })],
			[],
			money
		);
		expect(summary).toMatchObject({ monthly: 120, yearly: 1440, counted: 2, excluded: 0 });
	});

	it('skips paused bills and counts unconvertible ones as excluded', () => {
		const summary = summarizeBills(
			[bill({ status: 'paused' }), bill({ id: 'b2', currency: 'SEK' })],
			[],
			money
		);
		expect(summary).toMatchObject({ monthly: 0, counted: 0, excluded: 1 });
	});
});

describe('detectSpike', () => {
	it('flags a latest payment well above the earlier average', () => {
		const spike = detectSpike(bill(), [
			payment(10000, '2026-06-01'),
			payment(10000, '2026-07-01'),
			payment(10000, '2026-08-01'),
			payment(15000, '2026-09-01')
		]);
		expect(spike).toMatchObject({ latestMinor: 15000, averageMinor: 10000, currency: 'EUR' });
		expect(spike?.percent).toBeCloseTo(50);
	});

	it('ignores a rise below the threshold, a drop, and a single payment', () => {
		const steady = [payment(10000, '2026-08-01'), payment(11000, '2026-09-01')];
		expect(detectSpike(bill(), steady)).toBeNull();
		expect(
			detectSpike(bill(), [payment(10000, '2026-08-01'), payment(5000, '2026-09-01')])
		).toBeNull();
		expect(detectSpike(bill(), [payment(99999, '2026-09-01')])).toBeNull();
	});

	it('compares only against the three payments before the latest', () => {
		const spike = detectSpike(bill(), [
			payment(100000, '2026-05-01'), // outside the baseline window
			payment(10000, '2026-06-01'),
			payment(10000, '2026-07-01'),
			payment(10000, '2026-08-01'),
			payment(13000, '2026-09-01')
		]);
		expect(spike?.averageMinor).toBe(10000);
	});

	it('ignores payments of other bills and currencies', () => {
		const payments = [
			payment(10000, '2026-08-01'),
			payment(90000, '2026-09-01', { billId: 'other' }),
			payment(90000, '2026-09-02', { currency: 'USD' })
		];
		expect(detectSpike(bill(), payments)).toBeNull();
	});
});

describe('recentAmounts', () => {
	it('returns the latest amounts oldest first, in the bill currency', () => {
		const payments = [
			payment(100, '2026-01-01'),
			payment(200, '2026-02-01'),
			payment(300, '2026-03-01'),
			payment(999, '2026-03-02', { currency: 'USD' })
		];
		expect(recentAmounts(bill(), payments, 2)).toEqual([200, 300]);
	});
});
