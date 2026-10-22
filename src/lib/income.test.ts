import { describe, expect, it } from 'vitest';
import type { Bill, Subscription } from '../../generated/prisma/client';
import { incomeShare } from './income';

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
		...overrides
	};
}

function bill(overrides: Partial<Bill> = {}): Bill {
	return {
		id: 'b',
		name: 'Water',
		kind: 'Utilities',
		estimateMinor: 4000,
		currency: 'EUR',
		billingCycle: 'monthly',
		intervalCount: 1,
		renewalDate: new Date('2026-10-05'),
		status: 'active',
		notes: null,
		...overrides
	};
}

describe('incomeShare', () => {
	it('is null without a usable income', () => {
		expect(incomeShare([sub()], [], [], null, money)).toBeNull();
		expect(incomeShare([sub()], [], [], { minor: 0, currency: 'EUR' }, money)).toBeNull();
		expect(incomeShare([sub()], [], [], { minor: 100, currency: 'GBP' }, money)).toBeNull();
	});

	it('shows the share going to subscriptions and bills', () => {
		const share = incomeShare([sub()], [bill()], [], { minor: 100000, currency: 'EUR' }, money);

		expect(share).toMatchObject({ income: 1000, subscriptions: 10, bills: 40, fixed: 50 });
		expect(share?.percent).toBeCloseTo(5);
		expect(share?.remaining).toBeCloseTo(950);
	});

	it('converts an income entered in another currency', () => {
		const share = incomeShare([sub()], [], [], { minor: 200000, currency: 'USD' }, money);
		expect(share?.income).toBeCloseTo(1000);
	});

	it('can exceed 100 percent', () => {
		const share = incomeShare(
			[sub({ priceMinor: 5000 })],
			[],
			[],
			{ minor: 2000, currency: 'EUR' },
			money
		);
		expect(share?.percent).toBeCloseTo(250);
		expect(share?.remaining).toBeLessThan(0);
	});
});
