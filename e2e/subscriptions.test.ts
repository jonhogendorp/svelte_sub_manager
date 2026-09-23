import { expect, test } from '@playwright/test';

test('home page shows the subscriptions heading', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your Subscriptions');
});
