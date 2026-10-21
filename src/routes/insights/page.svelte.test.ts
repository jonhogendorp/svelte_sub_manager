import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { PriceChange, Subscription } from '../../../generated/prisma/client';
import Page from './+page.svelte';

const now = new Date(2026, 9, 12);

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
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
		...overrides
	};
}

function renderPage(subscriptions: Subscription[], priceChanges: PriceChange[] = []) {
	render(Page, {
		data: {
			subscriptions,
			priceChanges,
			bills: [],
			payments: [],
			now,
			displayCurrency: 'EUR',
			budget: null,
			rates: { EUR: 1 }
		},
		params: {},
		form: null
	});
}

describe('/insights/+page.svelte', () => {
	it('shows an empty state without subscriptions', async () => {
		renderPage([]);
		await expect.element(page.getByText('Add a few subscriptions')).toBeVisible();
	});

	it('ranks the biggest costs', async () => {
		renderPage([
			makeSubscription({ id: 'a', name: 'Netflix', priceMinor: 1000 }),
			makeSubscription({ id: 'b', name: 'Gym', priceMinor: 5000 })
		]);

		const list = page.getByRole('list', { name: 'Biggest costs' });
		await expect.element(list).toHaveTextContent('Gym');
		await expect.element(list).toHaveTextContent('€600.00/yr');
		await expect.element(list).toHaveTextContent('(83%)');
	});

	it('summarises price increases since the first recorded price', async () => {
		renderPage(
			[makeSubscription({ priceMinor: 1000 })],
			[
				{
					id: 'c1',
					subscriptionId: 'sub_1',
					oldMinor: 800,
					newMinor: 1000,
					currency: 'EUR',
					changedAt: new Date('2026-09-01')
				}
			]
		);

		const list = page.getByRole('list', { name: 'Price increases' });
		await expect.element(list).toHaveTextContent('€8.00 → €10.00');
		await expect.element(list).toHaveTextContent('+25%');
		await expect.element(list).toHaveTextContent('+€24.00/yr');
	});

	it('suggests low-rated subscriptions as cancellation candidates', async () => {
		renderPage([
			makeSubscription({ id: 'a', name: 'Netflix', priceMinor: 1000, usageRating: 1 }),
			makeSubscription({ id: 'b', name: 'Gym', priceMinor: 5000, usageRating: 5 })
		]);

		const list = page.getByRole('list', { name: 'Cancellation candidates' });
		await expect.element(list).toHaveTextContent('Netflix');
		await expect.element(list).toHaveTextContent('€120.00/yr');
		await expect.element(list).not.toHaveTextContent('Gym');
	});

	it('shows the 12-month forecast', async () => {
		renderPage([makeSubscription({ priceMinor: 1000 })]);

		await expect.element(page.getByText('12-month forecast', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Expected over the next 12 months:')).toBeVisible();
	});

	describe('renewal calendar', () => {
		it('shows a charge on its day and lists it when the day is selected', async () => {
			renderPage([makeSubscription({ renewalDate: new Date('2026-10-15') })]);

			await expect.element(page.getByRole('heading', { name: /October 2026/ })).toBeVisible();
			await page.getByRole('button', { name: /Thursday 15 October.*1 charge/ }).click();

			const details = page.getByLabelText('Charges on the selected day');
			await expect.element(details).toHaveTextContent('Netflix');
			await expect.element(details).toHaveTextContent('€10.00');
		});

		it('moves between months and back to today', async () => {
			renderPage([makeSubscription({ renewalDate: new Date('2026-11-20') })]);

			await page.getByRole('button', { name: 'Next month' }).click();
			await expect.element(page.getByRole('heading', { name: /November 2026/ })).toBeVisible();
			await expect
				.element(page.getByRole('button', { name: /Friday 20 November.*1 charge/ }))
				.toBeVisible();

			await page.getByRole('button', { name: 'Today' }).click();
			await expect.element(page.getByRole('heading', { name: /October 2026/ })).toBeVisible();
		});

		it('says so when a selected day has nothing charged', async () => {
			renderPage([makeSubscription({ renewalDate: new Date('2026-10-15') })]);

			await page.getByRole('button', { name: /Friday 16 October/ }).click();
			await expect.element(page.getByText('Nothing is charged on this day.')).toBeVisible();
		});

		it('links to the .ics feed', async () => {
			renderPage([makeSubscription()]);

			await expect
				.element(page.getByRole('link', { name: /Subscribe in your calendar app/ }))
				.toHaveAttribute('href', expect.stringContaining('/calendar.ics'));
		});
	});

	it('says so when no price has changed', async () => {
		renderPage([makeSubscription()]);
		await expect.element(page.getByText('No price increases recorded')).toBeVisible();
	});
});
