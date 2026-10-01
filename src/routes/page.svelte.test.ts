import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Subscription } from '../../generated/prisma/client';
import type { Currency, Rates } from '$lib/money';
import Page from './+page.svelte';

const now = new Date(2026, 9, 12);

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		priceMinor: 1200,
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
		...overrides
	};
}

/** Text of every badge on the page; the same words also appear in <option>s, so getByText is ambiguous. */
const badgeTexts = () =>
	[...document.querySelectorAll('[data-slot="badge"]')].map((el) => el.textContent?.trim());

// One euro buys 1.1 US dollars.
const rates = { EUR: 1, USD: 1.1 };

function renderPage(
	subscriptions: Subscription[],
	{
		displayCurrency = 'EUR',
		ratesInUse = rates
	}: { displayCurrency?: Currency; ratesInUse?: Rates } = {}
) {
	render(Page, {
		data: { subscriptions, now, displayCurrency, rates: ratesInUse },
		params: {},
		form: null
	});
}

describe('/+page.svelte', () => {
	it('should render the subscriptions heading', async () => {
		renderPage([]);

		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toHaveTextContent('Your Subscriptions');
	});

	it('totals monthly and yearly spend across billing cycles', async () => {
		renderPage([
			makeSubscription({ id: 'monthly', priceMinor: 1200, billingCycle: 'monthly' }),
			makeSubscription({ id: 'yearly', priceMinor: 12000, billingCycle: 'yearly' })
		]);

		// €12/mo + €120/yr (€10/mo) = €22/mo, €264/yr
		const summary = page.getByText(/You spend/);
		await expect.element(summary).toHaveTextContent('€22.00');
		await expect.element(summary).toHaveTextContent('€264.00');
	});

	describe('currencies', () => {
		const usd = makeSubscription({ id: 'usd', name: 'Figma', priceMinor: 1100, currency: 'USD' });

		it('shows each subscription in its own currency and totals in the display currency', async () => {
			renderPage([makeSubscription({ id: 'eur', priceMinor: 1000 }), usd]);

			// $11 is €10 at 1.1, so €10 + €10 = €20/mo, €240/yr.
			const summary = page.getByText(/You spend/);
			await expect.element(summary).toHaveTextContent('€20.00');
			await expect.element(summary).toHaveTextContent('€240.00');
			await expect.element(page.getByText(/\$11\.00/).first()).toBeInTheDocument();
		});

		it('re-expresses totals when the display currency changes', async () => {
			renderPage([makeSubscription({ id: 'eur', priceMinor: 1000 }), usd], {
				displayCurrency: 'USD'
			});

			// €10 is $11 and the $11 subscription stays $11: $22/mo.
			await expect.element(page.getByText(/You spend/)).toHaveTextContent('$22.00');
		});

		it('says so when a subscription cannot be converted', async () => {
			renderPage([makeSubscription({ id: 'eur', priceMinor: 1000 }), usd], {
				ratesInUse: { EUR: 1 }
			});

			const summary = page.getByText(/You spend/);
			await expect.element(summary).toHaveTextContent('€10.00');
			await expect.element(page.getByText(/not included/)).toBeInTheDocument();
		});
	});

	describe('status and billing cycles', () => {
		it('leaves paused and cancelled subscriptions out of the totals', async () => {
			renderPage([
				makeSubscription({ id: 'on', priceMinor: 1000 }),
				makeSubscription({ id: 'break', priceMinor: 1000, status: 'paused' }),
				makeSubscription({ id: 'gone', priceMinor: 1000, status: 'cancelled' })
			]);

			const summary = page.getByText(/You spend/);
			await expect.element(summary).toHaveTextContent('€10.00');
			await expect.element(summary).toHaveTextContent('€120.00');
			await expect.element(summary).toHaveTextContent('across 1 subscription');
		});

		it('labels paused and cancelled subscriptions in the list', async () => {
			renderPage([
				makeSubscription({ id: 'break', name: 'Hulu', status: 'paused' }),
				makeSubscription({ id: 'gone', name: 'Sky', status: 'cancelled' })
			]);

			expect(badgeTexts()).toContain('Paused');
			expect(badgeTexts()).toContain('Cancelled');
		});

		it('can filter the list by status', async () => {
			renderPage([
				makeSubscription({ id: 'a', name: 'Netflix' }),
				makeSubscription({ id: 'b', name: 'Dropbox', status: 'paused' })
			]);

			await page.getByLabelText('Filter by status').selectOptions('paused');

			await expect.element(page.getByText('Dropbox').first()).toBeInTheDocument();
			await expect.element(page.getByText('Netflix')).not.toBeInTheDocument();
		});

		it('shows each cycle’s price suffix', async () => {
			renderPage([
				makeSubscription({ id: 'w', name: 'Gym', billingCycle: 'weekly' }),
				makeSubscription({ id: 'q', name: 'Insurance', billingCycle: 'quarterly' }),
				makeSubscription({ id: 'c', name: 'Magazine', billingCycle: 'custom', intervalCount: 2 }),
				makeSubscription({ id: 'o', name: 'Domain', billingCycle: 'once' })
			]);

			await expect.element(page.getByText('/wk')).toBeInTheDocument();
			await expect.element(page.getByText('/qtr')).toBeInTheDocument();
			await expect.element(page.getByText('/2 mo')).toBeInTheDocument();
			expect(badgeTexts()).toContain('One-off');
		});

		it('raises a reminder when a free trial is about to end', async () => {
			renderPage([
				makeSubscription({
					renewalDate: new Date('2026-11-12'),
					trialEndsAt: new Date('2026-10-14')
				})
			]);

			await expect.element(page.getByText('Needs attention')).toBeInTheDocument();
			await expect.element(page.getByText(/Trial ends · then/)).toBeInTheDocument();
		});

		it('does not remind about a paused subscription', async () => {
			renderPage([
				makeSubscription({ renewalDate: new Date('2026-10-14'), status: 'paused' })
			]);

			await expect.element(page.getByText('Needs attention')).not.toBeInTheDocument();
		});
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
