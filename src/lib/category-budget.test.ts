import { describe, expect, it } from 'vitest';
import type { CategoryBudget, Subscription } from '../../generated/prisma/client';
import { categoryBudgetRows, categoryKey } from './category-budget';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'A',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'Streaming',
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

function budget(overrides: Partial<CategoryBudget> = {}): CategoryBudget {
	return { id: 'b', category: 'Streaming', budgetMinor: 3000, currency: 'EUR', ...overrides };
}

describe('categoryKey', () => {
	it('ignores case and surrounding whitespace', () => {
		expect(categoryKey('  Streaming ')).toBe(categoryKey('streaming'));
	});
});

describe('categoryBudgetRows', () => {
	it('compares each category spend with its cap, ignoring case', () => {
		const [row] = categoryBudgetRows(
			[
				sub({ id: '1', priceMinor: 1000 }),
				sub({ id: '2', priceMinor: 1500, category: 'streaming' }),
				sub({ id: '3', priceMinor: 9999, category: 'Gym' })
			],
			[budget()],
			money
		);

		expect(row.spend).toBeCloseTo(25);
		expect(row.status.state).toBe('near'); // 25 of 30
		expect(row.status.remaining).toBeCloseTo(5);
	});

	it('does not count paused, cancelled, one-off or unconvertible subscriptions', () => {
		const [row] = categoryBudgetRows(
			[
				sub({ id: '1', status: 'paused' }),
				sub({ id: '2', status: 'cancelled' }),
				sub({ id: '3', billingCycle: 'once' }),
				sub({ id: '4', currency: 'GBP' })
			],
			[budget()],
			money
		);
		expect(row.spend).toBe(0);
		expect(row.status.state).toBe('ok');
	});

	it('converts a cap set in another currency', () => {
		const [row] = categoryBudgetRows(
			[sub({ priceMinor: 1000 })],
			[budget({ currency: 'USD', budgetMinor: 4000 })], // 40 USD = 20 EUR
			money
		);
		expect(row.status.limit).toBeCloseTo(20);
		expect(row.status.state).toBe('ok');
	});

	it('sorts over-budget categories first', () => {
		const rows = categoryBudgetRows(
			[sub({ priceMinor: 500 }), sub({ id: '2', category: 'Gym', priceMinor: 9000 })],
			[budget({ id: 'x' }), budget({ id: 'y', category: 'Gym', budgetMinor: 2000 })],
			money
		);
		expect(rows.map((r) => r.budget.category)).toEqual(['Gym', 'Streaming']);
		expect(rows[0].status.state).toBe('over');
	});

	it('reports a cap with no usable rate as having no status', () => {
		const [row] = categoryBudgetRows([], [budget({ currency: 'GBP' })], money);
		expect(row.status.state).toBe('none');
	});
});
