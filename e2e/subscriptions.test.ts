import { expect, test } from '@playwright/test';

/** Dates are computed relative to the run so the assertions don't rot. */
function isoDaysFromToday(days: number): string {
	const today = new Date();
	return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days))
		.toISOString()
		.slice(0, 10);
}

async function addSubscription(
	page: import('@playwright/test').Page,
	sub: { name: string; price: string; category: string; cycle: 'monthly' | 'yearly'; date: string }
) {
	const form = page.locator('form').filter({ has: page.locator('#name') });
	await form.locator('#name').fill(sub.name);
	await form.locator('#price').fill(sub.price);
	await form.locator('#category').fill(sub.category);
	await form.locator(`input[name="billingCycle"][value="${sub.cycle}"]`).check({ force: true });
	await form.locator('#renewalDate').fill(sub.date);
	await form.getByRole('button', { name: 'Add Subscription' }).click();
	await expect(page.getByText(sub.name).first()).toBeVisible();
}

test('home page shows the subscriptions heading', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Subscriptions');
});

test('a yearly subscription is normalized in the spend summary', async ({ page }) => {
	await page.goto('/');

	const name = `Yearly ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '120',
		category: `Cat ${Date.now()}`,
		cycle: 'yearly',
		// Far enough out that it stays clear of the 30-day timeline.
		date: isoDaysFromToday(200)
	});

	// €120/yr must read as €10.00/mo, never €120.00/mo.
	await expect(page.getByText(name).first()).toBeVisible();
	await expect(page.getByText('€120.00/yr').first()).toBeVisible();
	await expect(page.getByText(/You spend/)).toBeVisible();
});

test('an imminent renewal can be dismissed and stays dismissed', async ({ page }) => {
	await page.goto('/');

	const name = `Imminent ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '9.99',
		category: 'Streaming',
		cycle: 'monthly',
		date: isoDaysFromToday(2)
	});

	await expect(page.getByText('Needs attention')).toBeVisible();
	await expect(page.getByText('In 2 days').first()).toBeVisible();

	const dismissForms = page.locator('form[action="?/dismissReminder"]');
	const before = await dismissForms.count();
	expect(before).toBeGreaterThan(0);

	await dismissForms.first().getByRole('button').click();
	await page.reload();

	// The acknowledgement is persisted, so the reminder stays gone across a reload
	// while the subscription itself remains listed.
	await expect(dismissForms).toHaveCount(before - 1);
	await expect(page.getByText(name).first()).toBeVisible();
});
