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
		...overrides
	};
}

function renderPage(subscriptions: Subscription[], priceChanges: PriceChange[] = []) {
	render(Page, {
		data: {
			subscriptions,
			priceChanges,
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

	it('says so when no price has changed', async () => {
		renderPage([makeSubscription()]);
		await expect.element(page.getByText('No price increases recorded')).toBeVisible();
	});
});
