import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Subscription } from '../../generated/prisma/client';
import Page from './+page.svelte';

const now = new Date(2026, 9, 12);

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		price: 12,
		category: 'Streaming',
		renewalDate: new Date('2026-11-20'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		...overrides
	};
}

function renderPage(subscriptions: Subscription[]) {
	render(Page, { data: { subscriptions, now }, params: {}, form: null });
}

describe('/+page.svelte', () => {
	it('should render the subscriptions heading', async () => {
		renderPage([]);

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toHaveTextContent('Your Subscriptions');
	});

	it('totals monthly and yearly spend across billing cycles', async () => {
		renderPage([
			makeSubscription({ id: 'monthly', price: 12, billingCycle: 'monthly' }),
			makeSubscription({ id: 'yearly', price: 120, billingCycle: 'yearly' })
		]);

		// €12/mo + €120/yr (€10/mo) = €22/mo, €264/yr
		const summary = page.getByText(/You spend/);
		await expect.element(summary).toHaveTextContent('€22.00');
		await expect.element(summary).toHaveTextContent('€264.00');
	});

	it('flags an imminent renewal as urgent', async () => {
		renderPage([makeSubscription({ renewalDate: new Date('2026-10-14') })]);

		await expect.element(page.getByText('In 2 days').first()).toBeInTheDocument();
	});

	it('shows an empty state when nothing renews soon', async () => {
		renderPage([makeSubscription({ renewalDate: new Date('2026-11-20') })]);

		await expect.element(page.getByText('No renewals in the next 30 days.')).toBeInTheDocument();
	});

	describe('list filtering', () => {
		const farOut = new Date('2027-06-20');

		function renderTwo() {
			renderPage([
				makeSubscription({ id: 'a', name: 'Netflix', category: 'Streaming', renewalDate: farOut }),
				makeSubscription({ id: 'b', name: 'Dropbox', category: 'Storage', renewalDate: farOut })
			]);
		}

		it('narrows the list as you search', async () => {
			renderTwo();

			await page.getByLabelText('Search subscriptions').fill('drop');

			await expect.element(page.getByText('Dropbox').first()).toBeInTheDocument();
			await expect.element(page.getByText('Netflix')).not.toBeInTheDocument();
		});

		it('says so when nothing matches', async () => {
			renderTwo();

			await page.getByLabelText('Search subscriptions').fill('zzz');

			await expect
				.element(page.getByText('No subscriptions match your filters.'))
				.toBeInTheDocument();
		});

		it('filters by category', async () => {
			renderTwo();

			await page.getByLabelText('Filter by category').selectOptions('Storage');

			await expect.element(page.getByText('Dropbox').first()).toBeInTheDocument();
			await expect.element(page.getByText('Netflix')).not.toBeInTheDocument();
		});
	});
});
