import { expect, test } from '@playwright/test';

function isoDaysFromToday(days: number): string {
	const today = new Date();
	return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days))
		.toISOString()
		.slice(0, 10);
}

test('a bill can be added, and logged payments drive its estimate', async ({ page }) => {
	await page.goto('/bills');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Bills');

	await page.getByRole('button', { name: '+ New bill' }).click();
	const form = page.locator('form').filter({ has: page.locator('#bill-name') });
	await form.locator('#bill-name').fill('Electricity E2E');
	await form.locator('#bill-estimate').fill('100');
	await form.locator('#bill-kind').fill('Utilities');
	await form.locator('#billingCycle').selectOption('monthly');
	await form.locator('#bill-renewalDate').fill(isoDaysFromToday(10));
	await form.getByRole('button', { name: 'Add Bill' }).click();

	const card = page.locator('li').filter({ hasText: 'Electricity E2E' });
	await expect(card).toContainText('~€100.00');
	await expect(card).toContainText('Estimate only');

	for (const amount of ['80', '120']) {
		await card.getByRole('button', { name: 'Log payment' }).click();
		const payForm = page.locator('form').filter({ has: page.locator('#payment-amount') });
		await payForm.locator('#payment-amount').fill(amount);
		await payForm.getByRole('button', { name: 'Log payment' }).click();
		await expect(page.getByRole('dialog')).toBeHidden();
	}

	// The average of 80 and 120 replaces the entered estimate.
	await expect(card).toContainText('~€100.00');
	await expect(card).toContainText('Last paid €120.00');
	await expect(card).not.toContainText('Estimate only');
});

test('bills do not appear among subscriptions', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByText('Electricity E2E')).toHaveCount(0);
});
