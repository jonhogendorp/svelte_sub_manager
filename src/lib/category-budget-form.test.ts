import { describe, expect, it } from 'vitest';
import { parseCategoryBudgetForm } from './category-budget-form';

function formWith(values: Record<string, string>): FormData {
	const formData = new FormData();
	const defaults = { category: 'Streaming', amount: '25', currency: 'EUR' };
	for (const [key, value] of Object.entries({ ...defaults, ...values })) formData.set(key, value);
	return formData;
}

describe('parseCategoryBudgetForm', () => {
	it('parses a valid form into minor units', () => {
		expect(
			parseCategoryBudgetForm(formWith({ category: '  Streaming ', amount: '25.50' }))
		).toEqual({ data: { category: 'Streaming', budgetMinor: 2550, currency: 'EUR' } });
	});

	it('requires a category', () => {
		expect(parseCategoryBudgetForm(formWith({ category: '  ' })).error).toBe(
			'Please choose a category.'
		);
	});

	it('rejects unsupported currencies', () => {
		expect(parseCategoryBudgetForm(formWith({ currency: 'XXX' })).error).toBe(
			'Please choose a supported currency.'
		);
	});

	it('rejects zero, empty and malformed amounts', () => {
		for (const amount of ['0', '', 'abc', '-5']) {
			expect(parseCategoryBudgetForm(formWith({ amount })).error).toBe(
				'Please enter a budget greater than zero, like 50 or 50.50.'
			);
		}
	});

	it('rejects too many decimals for the currency', () => {
		expect(parseCategoryBudgetForm(formWith({ amount: '1.234' })).error).toBe(
			'EUR budgets can have at most 2 decimals.'
		);
		expect(parseCategoryBudgetForm(formWith({ amount: '100.5', currency: 'JPY' })).error).toBe(
			'JPY budgets must be whole numbers.'
		);
	});
});
