import { describe, expect, it } from 'vitest';
import { budgetStatus } from './budget';
import type { MoneyContext } from './money';

const eur: MoneyContext = { display: 'EUR', rates: { EUR: 1, USD: 1.1 } };

describe('budgetStatus', () => {
	it('is "none" without a budget', () => {
		expect(budgetStatus(50, null, eur).state).toBe('none');
		expect(budgetStatus(50, { minor: 0, currency: 'EUR' }, eur).state).toBe('none');
	});

	it('is "ok" well under the limit', () => {
		const status = budgetStatus(50, { minor: 10000, currency: 'EUR' }, eur);
		expect(status).toMatchObject({ state: 'ok', limit: 100, percent: 50, remaining: 50 });
	});

	it('is "near" from 80% up to and including the limit', () => {
		expect(budgetStatus(80, { minor: 10000, currency: 'EUR' }, eur).state).toBe('near');
		expect(budgetStatus(100, { minor: 10000, currency: 'EUR' }, eur).state).toBe('near');
	});

	it('is "over" above the limit, with a negative remainder', () => {
		const status = budgetStatus(120, { minor: 10000, currency: 'EUR' }, eur);
		expect(status.state).toBe('over');
		expect(status.remaining).toBeCloseTo(-20);
	});

	it('converts a budget set in another currency into the display currency', () => {
		// $110 is €100 at 1.1.
		const status = budgetStatus(90, { minor: 11000, currency: 'USD' }, eur);
		expect(status.limit).toBeCloseTo(100);
		expect(status.state).toBe('near');
	});

	it('is "none" when the budget currency has no known rate', () => {
		expect(budgetStatus(50, { minor: 10000, currency: 'SEK' }, eur).state).toBe('none');
	});
});
