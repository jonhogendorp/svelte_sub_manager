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
	sub: {
		name: string;
		price: string;
		currency?: string;
		category: string;
		cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'once';
		/** Months between charges, for the "custom" cycle. */
		interval?: string;
		date: string;
		trialEnds?: string;
	}
) {
	const form = page.locator('form').filter({ has: page.locator('#name') });
	await form.locator('#name').fill(sub.name);
	if (sub.currency) await form.locator('#currency').selectOption(sub.currency);
	await form.locator('#price').fill(sub.price);
	await form.locator('#category').fill(sub.category);
	await form.locator('#billingCycle').selectOption(sub.cycle);
	if (sub.interval) await form.locator('#intervalCount').fill(sub.interval);
	await form.locator('#renewalDate').fill(sub.date);
	if (sub.trialEnds) await form.locator('#trialEndsAt').fill(sub.trialEnds);
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

test('a subscription in another currency keeps its own currency', async ({ page }) => {
	await page.goto('/');

	const name = `Dollar ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '15',
		currency: 'USD',
		category: `Cat ${Date.now()}`,
		cycle: 'monthly',
		date: isoDaysFromToday(200)
	});

	// The charge itself stays in dollars whatever the totals are shown in.
	await expect(page.getByText(/\$15\.00/).first()).toBeVisible();
});

test('weekly, quarterly and custom cycles show their own price suffix', async ({ page }) => {
	await page.goto('/');
	const stamp = Date.now();

	await addSubscription(page, {
		name: `Weekly ${stamp}`,
		price: '5',
		category: `Cat ${stamp}`,
		cycle: 'weekly',
		date: isoDaysFromToday(200)
	});
	await expect(page.getByText('/wk').first()).toBeVisible();

	await addSubscription(page, {
		name: `Quarterly ${stamp}`,
		price: '30',
		category: `Cat ${stamp}`,
		cycle: 'quarterly',
		date: isoDaysFromToday(200)
	});
	await expect(page.getByText('/qtr').first()).toBeVisible();

	await addSubscription(page, {
		name: `Custom ${stamp}`,
		price: '24',
		category: `Cat ${stamp}`,
		cycle: 'custom',
		interval: '3',
		date: isoDaysFromToday(200)
	});
	await expect(page.getByText('/3 mo').first()).toBeVisible();
});

test('the interval field only appears for the custom cycle', async ({ page }) => {
	await page.goto('/');
	const form = page.locator('form').filter({ has: page.locator('#name') });

	await expect(form.locator('#intervalCount')).toHaveCount(0);
	await form.locator('#billingCycle').selectOption('custom');
	await expect(form.locator('#intervalCount')).toBeVisible();
	await form.locator('#billingCycle').selectOption('monthly');
	await expect(form.locator('#intervalCount')).toHaveCount(0);
});

test('a one-off charge is labelled and not counted as recurring', async ({ page }) => {
	await page.goto('/');

	const name = `Once ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '49',
		category: `Cat ${Date.now()}`,
		cycle: 'once',
		date: isoDaysFromToday(200)
	});

	await expect(page.locator('[data-slot="badge"]', { hasText: 'One-off' }).first()).toBeVisible();
	await expect(page.getByText(/Charge date:/).first()).toBeVisible();
});

test('a subscription can be paused and stays paused after a reload', async ({ page }) => {
	await page.goto('/');

	const name = `Pausable ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '9.99',
		category: `Cat ${Date.now()}`,
		cycle: 'monthly',
		date: isoDaysFromToday(200)
	});

	const status = page.getByLabel(`Status of ${name}`);
	await expect(status).toHaveValue('active');
	await status.selectOption('paused');
	await expect(status).toHaveValue('paused');

	await page.reload();
	await expect(page.getByLabel(`Status of ${name}`)).toHaveValue('paused');
	await expect(page.locator('[data-slot="badge"]', { hasText: /^Paused$/ }).first()).toBeVisible();
});

test('a free trial shows when it ends and raises its own reminder', async ({ page }) => {
	await page.goto('/');

	const name = `Trial ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '12',
		category: `Cat ${Date.now()}`,
		cycle: 'monthly',
		date: isoDaysFromToday(20),
		trialEnds: isoDaysFromToday(2)
	});

	await expect(page.getByText(/Trial ends \d/).first()).toBeVisible();
	await expect(page.getByText('Needs attention')).toBeVisible();
	await expect(page.getByText('Trial ends · then').first()).toBeVisible();
});

test('the display currency is remembered across a reload', async ({ page }) => {
	await page.goto('/');
	const picker = page.getByLabel('Show totals in');

	await picker.selectOption('USD');
	await expect(picker).toHaveValue('USD');
	await page.reload();
	await expect(picker).toHaveValue('USD');

	// Put it back so the other tests see euro totals.
	await picker.selectOption('EUR');
	await expect(picker).toHaveValue('EUR');
	await page.reload();
	await expect(picker).toHaveValue('EUR');
});

test('invalid input shows an error and keeps the form usable', async ({ page }) => {
	await page.goto('/');

	const form = page.locator('form').filter({ has: page.locator('#name') });
	// Whitespace satisfies the browser's `required` check but not the server's trim.
	await form.locator('#name').fill('   ');
	await form.locator('#price').fill('9.99');
	await form.locator('#category').fill('Streaming');
	await form.locator('#renewalDate').fill(isoDaysFromToday(100));
	await form.getByRole('button', { name: 'Add Subscription' }).click();

	await expect(page.getByText('Please fill in all fields.')).toBeVisible();
	await expect(form.locator('#category')).toHaveValue('Streaming');
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
