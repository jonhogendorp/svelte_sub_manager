import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { lifetimeCostMinor, lifetimeSummary } from './lifetime';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };
const now = new Date('2026-10-22T00:00:00Z');

function life(overrides: Record<string, unknown> = {}) {
	return {
		priceMinor: 1000,
		billingCycle: 'monthly',
		intervalCount: 1,
		status: 'active',
		startedOn: new Date('2025-10-22T00:00:00Z'), // exactly 365 days earlier
		trialEndsAt: null,
		cancelledAt: null,
		...overrides
	} as Parameters<typeof lifetimeCostMinor>[0];
}

describe('lifetimeCostMinor', () => {
	it('spreads the yearly cost over the time since the start', () => {
		expect(lifetimeCostMinor(life(), now)).toBe(12000);
	});

	it('starts counting after a free trial', () => {
		const result = lifetimeCostMinor(life({ trialEndsAt: new Date('2026-04-22T00:00:00Z') }), now);
		// 183 days of 365 at 120/yr
		expect(result).toBe(Math.round((12000 * 183) / 365));
	});

	it('stops at the cancellation date', () => {
		const result = lifetimeCostMinor(
			life({ status: 'cancelled', cancelledAt: new Date('2026-04-22T00:00:00Z') }),
			now
		);
		expect(result).toBe(Math.round((12000 * 182) / 365));
	});

	it('is null when it cannot be known', () => {
		expect(lifetimeCostMinor(life({ startedOn: null }), now)).toBeNull();
		expect(lifetimeCostMinor(life({ status: 'paused' }), now)).toBeNull();
		expect(lifetimeCostMinor(life({ status: 'cancelled' }), now)).toBeNull();
		expect(lifetimeCostMinor(life({ billingCycle: 'once' }), now)).toBeNull();
	});

	it('is zero before the start date', () => {
		expect(lifetimeCostMinor(life({ startedOn: new Date('2027-01-01') }), now)).toBe(0);
	});
});

describe('lifetimeSummary', () => {
	it('converts, sorts and totals', () => {
		const summary = lifetimeSummary(
			[
				{ ...life(), id: 'a', currency: 'EUR' },
				{ ...life({ priceMinor: 4000 }), id: 'b', currency: 'USD' }, // 480 USD = 240 EUR
				{ ...life({ startedOn: null }), id: 'c', currency: 'EUR' }
			] as unknown as Subscription[],
			now,
			money
		);

		expect(summary.rows.map((row) => row.subscription.id)).toEqual(['b', 'a']);
		expect(summary.total).toBeCloseTo(360);
	});
});
