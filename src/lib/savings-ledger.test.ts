import { describe, expect, it } from 'vitest';
import { cancellationChange, ledgerSummary, savedSoFar } from './savings-ledger';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };
const now = new Date('2026-10-21T12:00:00Z');

function cancelled(overrides: Record<string, unknown> = {}) {
	return {
		priceMinor: 1000,
		currency: 'EUR',
		billingCycle: 'monthly',
		intervalCount: 1,
		status: 'cancelled',
		cancelledAt: new Date('2026-07-23T12:00:00Z'), // 90 days before `now`
		...overrides
	} as Parameters<typeof savedSoFar>[0];
}

describe('cancellationChange', () => {
	it('sets the date when a subscription becomes cancelled', () => {
		expect(cancellationChange('active', 'cancelled', now)).toBe(now);
		expect(cancellationChange('paused', 'cancelled', now)).toBe(now);
	});

	it('clears the date when it stops being cancelled', () => {
		expect(cancellationChange('cancelled', 'active', now)).toBeNull();
		expect(cancellationChange('cancelled', 'paused', now)).toBeNull();
	});

	it('leaves the date alone otherwise', () => {
		expect(cancellationChange('cancelled', 'cancelled', now)).toBeUndefined();
		expect(cancellationChange('active', 'paused', now)).toBeUndefined();
	});
});

describe('savedSoFar', () => {
	it('spreads the yearly cost over the days since cancelling', () => {
		// 120/yr x 90/365
		expect(savedSoFar(cancelled(), now, money)).toBeCloseTo((120 * 90) / 365);
	});

	it('is null without a date, for active subscriptions, and without a rate', () => {
		expect(savedSoFar(cancelled({ cancelledAt: null }), now, money)).toBeNull();
		expect(savedSoFar(cancelled({ status: 'active' }), now, money)).toBeNull();
		expect(savedSoFar(cancelled({ currency: 'GBP' }), now, money)).toBeNull();
	});

	it('is zero for a one-off charge and never negative', () => {
		expect(savedSoFar(cancelled({ billingCycle: 'once' }), now, money)).toBe(0);
		expect(savedSoFar(cancelled({ cancelledAt: new Date('2027-01-01') }), now, money)).toBe(0);
	});
});

describe('ledgerSummary', () => {
	it('totals dated cancellations and counts undated ones', () => {
		const summary = ledgerSummary(
			[
				cancelled(),
				cancelled({ currency: 'USD', priceMinor: 2000 }), // same cost in EUR
				cancelled({ cancelledAt: null }),
				cancelled({ status: 'paused' })
			],
			now,
			money
		);
		expect(summary.counted).toBe(2);
		expect(summary.undated).toBe(1);
		expect(summary.savedSoFar).toBeCloseTo(2 * ((120 * 90) / 365));
	});
});
