import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ImportBank from './import-bank.svelte';

describe('import-bank.svelte', () => {
	it('asks for a file and explains that nothing is stored', async () => {
		render(ImportBank, { open: true, categories: ['Streaming'] });

		await expect
			.element(page.getByRole('heading', { name: 'Import from a bank statement' }))
			.toBeVisible();
		await expect.element(page.getByLabelText('Bank CSV file')).toBeVisible();
		await expect.element(page.getByText('is not saved', { exact: false })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Analyse' })).toBeVisible();
	});

	it('shows nothing about detected subscriptions before a file is analysed', async () => {
		render(ImportBank, { open: true });

		expect(document.querySelector('[aria-label="Detected subscriptions"]')).toBeNull();
	});
});
