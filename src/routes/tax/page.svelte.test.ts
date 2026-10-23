import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { TaxReport } from '$lib/tax';
import Page from './+page.svelte';

function makeReport(overrides: Partial<TaxReport> = {}): TaxReport {
	return {
		year: 2025,
		rows: [],
		categories: [],
		totalSpent: 0,
		totalDeductible: 0,
		hasEstimates: false,
		excluded: 0,
		...overrides
	};
}

function renderPage(report: TaxReport) {
	render(Page, {
		data: { report, years: [2026, 2025], displayCurrency: 'EUR' },
		params: {},
		form: null
	});
}

describe('/tax/+page.svelte', () => {
	it('explains how to get expenses on the report when there are none', async () => {
		renderPage(makeReport());

		await expect.element(page.getByRole('heading', { name: 'Tax report 2025' })).toBeVisible();
		await expect.element(page.getByText('No business expenses for 2025')).toBeVisible();
	});

	it('lists expenses by category with totals and an estimate note', async () => {
		renderPage(
			makeReport({
				rows: [
					{
						kind: 'subscription',
						name: 'Adobe',
						category: 'Software',
						businessPercent: 50,
						spent: 120,
						deductible: 60,
						estimated: true
					}
				],
				categories: [{ category: 'Software', spent: 120, deductible: 60 }],
				totalSpent: 120,
				totalDeductible: 60,
				hasEstimates: true
			})
		);

		const table = page.getByRole('table', { name: 'Software expenses' });
		await expect.element(table).toHaveTextContent('Adobe');
		await expect.element(table).toHaveTextContent('50%');
		await expect.element(table).toHaveTextContent('€60.00');
		await expect.element(page.getByText('Subscription amounts are estimates')).toBeVisible();
		await expect.element(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
	});
});
