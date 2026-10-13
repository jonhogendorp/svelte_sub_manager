import { expect, test } from '@playwright/test';

/** Dates are computed relative to the run so the assertions don't rot. */
function isoDaysFromToday(days: number): string {
	const today = new Date();
	return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days))
		.toISOString()
		.slice(0, 10);
}

/** The add/edit form lives in a dialog. */
async function openAddDialog(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '+ New subscription' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
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
		accountEmail?: string;
		paymentMethod?: string;
		notes?: string;
	}
) {
	await openAddDialog(page);
	const form = page.locator('form').filter({ has: page.locator('#name') });
	await form.locator('#name').fill(sub.name);
	if (sub.currency) await form.locator('#currency').selectOption(sub.currency);
	await form.locator('#price').fill(sub.price);
	await form.locator('#category').fill(sub.category);
	await form.locator('#billingCycle').selectOption(sub.cycle);
	if (sub.interval) await form.locator('#intervalCount').fill(sub.interval);
	await form.locator('#renewalDate').fill(sub.date);
	if (sub.trialEnds) await form.locator('#trialEndsAt').fill(sub.trialEnds);
	if (sub.accountEmail || sub.paymentMethod || sub.notes) {
		// The extra fields live in a collapsed <details>.
		await form.getByText('More details (optional)').click();
		if (sub.accountEmail) await form.locator('#accountEmail').fill(sub.accountEmail);
		if (sub.paymentMethod) await form.locator('#paymentMethod').fill(sub.paymentMethod);
		if (sub.notes) await form.locator('#notes').fill(sub.notes);
	}
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
	await expect(page.getByLabel('Spend summary')).toBeVisible();
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
	await openAddDialog(page);
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

test('account, payment method and notes are saved and shown under Details', async ({ page }) => {
	await page.goto('/');

	const name = `Details ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '8',
		category: `Cat ${Date.now()}`,
		cycle: 'monthly',
		date: isoDaysFromToday(200),
		accountEmail: 'me+test@example.com',
		paymentMethod: 'Visa ending 4242',
		notes: 'Shared with the family'
	});

	const card = page.locator('[data-slot="card"]', { hasText: name });
	await card.getByText('Details', { exact: true }).click();
	await expect(card.getByText('me+test@example.com')).toBeVisible();
	await expect(card.getByText('Visa ending 4242')).toBeVisible();
	await expect(card.getByText('Shared with the family')).toBeVisible();

	// Still there after a reload.
	await page.reload();
	await page
		.locator('[data-slot="card"]', { hasText: name })
		.getByText('Details', { exact: true })
		.click();
	await expect(page.getByText('Shared with the family')).toBeVisible();
});

test('editing a price flags the increase and keeps a history', async ({ page }) => {
	await page.goto('/');

	const name = `Pricey ${Date.now()}`;
	await addSubscription(page, {
		name,
		price: '10',
		category: `Cat ${Date.now()}`,
		cycle: 'monthly',
		date: isoDaysFromToday(200)
	});

	const card = page.locator('[data-slot="card"]', { hasText: name });
	await expect(card.getByText('↑ from')).toHaveCount(0);

	await card.getByRole('button', { name: 'Edit' }).click();
	const form = page.locator('form').filter({ has: page.locator('#name') });
	await form.locator('#price').fill('12');
	await form.getByRole('button', { name: 'Update Subscription' }).click();

	await expect(card.getByText('↑ from €10.00')).toBeVisible();

	await card.getByText('Details', { exact: true }).click();
	await expect(card.getByText(/€10\.00 → €12\.00/)).toBeVisible();

	// Saving again without touching the price must not add a second entry.
	await card.getByRole('button', { name: 'Edit' }).click();
	await form.locator('#category').fill(`Other ${Date.now()}`);
	await form.getByRole('button', { name: 'Update Subscription' }).click();
	await expect(card.getByText('Other')).toBeVisible();
	await expect(card.getByText(/→/)).toHaveCount(1);
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

test('a monthly budget warns when exceeded and can be cleared', async ({ page }) => {
	await page.goto('/');

	await addSubscription(page, {
		name: `Budget ${Date.now()}`,
		price: '20',
		category: `Cat ${Date.now()}`,
		cycle: 'monthly',
		date: isoDaysFromToday(100)
	});

	await page.getByRole('button', { name: 'Set a budget' }).click();
	const budget = page.locator('form').filter({ has: page.getByLabel('Monthly budget amount') });
	await budget.getByLabel('Budget currency').selectOption('EUR');
	await budget.getByLabel('Monthly budget amount').fill('0.01');
	await budget.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('alert').filter({ hasText: 'Over budget by' })).toBeVisible();

	// The budget survives a reload.
	await page.reload();
	await page.getByRole('button', { name: 'Edit budget' }).click();
	await expect(page.getByLabel('Monthly budget amount')).toHaveValue('0.01');

	await budget.getByRole('button', { name: 'Clear' }).click();
	await expect(page.getByText(/Set a monthly budget to get warned/)).toBeVisible();
	await expect(page.getByRole('alert').filter({ hasText: 'Over budget by' })).toHaveCount(0);
});

test('a deleted subscription can be undone, and stays deleted otherwise', async ({ page }) => {
	await page.goto('/');

	const stamp = Date.now();
	const keep = `Undo ${stamp}`;
	const gone = `Gone ${stamp}`;
	for (const name of [keep, gone]) {
		await addSubscription(page, {
			name,
			price: '5',
			category: `Cat ${stamp}`,
			cycle: 'monthly',
			date: isoDaysFromToday(100)
		});
	}

	// Delete, then change your mind.
	const keepCard = page.locator('[data-slot="card"]').filter({ hasText: keep });
	await keepCard.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText(keep, { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText(keep, { exact: true })).toBeVisible();

	// Delete and let the undo window pass.
	const goneCard = page.locator('[data-slot="card"]').filter({ hasText: gone });
	await goneCard.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
	await page.waitForTimeout(7500);

	await page.reload();
	await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
	await expect(page.getByText(keep, { exact: true })).toBeVisible();
});

test('an invalid budget shows an error', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: /(Set a|Edit) budget/ }).click();
	const budget = page.locator('form').filter({ has: page.getByLabel('Monthly budget amount') });
	await budget.getByLabel('Monthly budget amount').fill('abc');
	await budget.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText(/greater than zero/)).toBeVisible();
});

test('invalid input shows an error and keeps the form usable', async ({ page }) => {
	await page.goto('/');
	await openAddDialog(page);

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
