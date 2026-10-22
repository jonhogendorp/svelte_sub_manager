import { page } from '@vitest/browser/context';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { CategoryBudget, PriceChange, Subscription } from '../../generated/prisma/client';
import type { Budget } from '$lib/budget';
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
		accountEmail: null,
		paymentMethod: null,
		notes: null,
		usageRating: null,
		cancelledAt: null,
		yearlyPriceMinor: null,
		cancelUrl: null,
		cancelNoticeDays: null,
		startedOn: null,
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
		ratesInUse = rates,
		priceChanges = [],
		categoryBudgets = [],
		budget = null
	}: {
		displayCurrency?: Currency;
		ratesInUse?: Rates;
		priceChanges?: PriceChange[];
		categoryBudgets?: CategoryBudget[];
		budget?: Budget | null;
	} = {}
) {
	render(Page, {
		data: {
			subscriptions,
			priceChanges,
			categoryBudgets,
			now,
			displayCurrency,
			budget,
			rates: ratesInUse
		},
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
		const summary = page.getByLabelText('Spend summary');
		await expect.element(summary).toHaveTextContent('€22.00');
		await expect.element(summary).toHaveTextContent('€264.00');
	});

	it('shows the cost per day', async () => {
		// €36.50/mo is €438/yr, which is €1.20 a day.
		renderPage([makeSubscription({ priceMinor: 3650 })]);

		await expect.element(page.getByLabelText('Spend summary')).toHaveTextContent('€1.20');
	});

	describe('monthly budget', () => {
		const subscriptions = [makeSubscription({ priceMinor: 12000 })];

		it('invites you to set a budget when there is none', async () => {
			renderPage(subscriptions);

			await expect
				.element(page.getByText(/Set a monthly budget to get warned/))
				.toBeInTheDocument();
			expect(document.querySelector('[role="alert"]')).toBeNull();
		});

		it('shows what is left while under budget', async () => {
			renderPage(subscriptions, { budget: { minor: 30000, currency: 'EUR' } });

			await expect.element(page.getByText(/€180\.00 left this month/)).toBeInTheDocument();
			expect(document.querySelector('[role="alert"]')).toBeNull();
		});

		it('alerts when spend exceeds the budget', async () => {
			renderPage(subscriptions, { budget: { minor: 10000, currency: 'EUR' } });

			await expect.element(page.getByRole('alert')).toHaveTextContent('Over budget by €20.00');
		});

		it('compares a budget set in another currency after conversion', async () => {
			// $110 is €100 at 1.1, so €120 of spend is €20 over.
			renderPage(subscriptions, { budget: { minor: 11000, currency: 'USD' } });

			await expect.element(page.getByRole('alert')).toHaveTextContent('Over budget by €20.00');
		});
	});

	it('shows the cost per week', async () => {
		// €52/yr-equivalent: €10/mo is €120/yr, which is about €2.31 a week.
		renderPage([makeSubscription({ priceMinor: 1000 })]);

		await expect.element(page.getByLabelText('Spend summary')).toHaveTextContent('€2.31');
	});

	describe('category budgets', () => {
		const subscriptions = [
			makeSubscription({ id: 'a', priceMinor: 1200 }),
			makeSubscription({ id: 'b', name: 'Gym', category: 'Fitness', priceMinor: 3000 })
		];

		it('offers to set one when there are categories but no caps', async () => {
			renderPage(subscriptions);

			await expect
				.element(page.getByRole('button', { name: 'Set a category budget' }))
				.toBeVisible();
		});

		it('shows progress and warns when a category is over its cap', async () => {
			renderPage(subscriptions, {
				categoryBudgets: [
					{ id: 'cb1', category: 'Streaming', budgetMinor: 2000, currency: 'EUR' },
					{ id: 'cb2', category: 'Fitness', budgetMinor: 2000, currency: 'EUR' }
				]
			});

			const section = page.getByLabelText('Category budgets');
			await expect.element(section).toHaveTextContent('Fitness is over budget by €10.00.');
			await expect.element(section).toHaveTextContent('€8.00 left.');
		});
	});

	describe('trial guard', () => {
		it('shows the money at risk from a running trial', async () => {
			renderPage([makeSubscription({ priceMinor: 1200, trialEndsAt: new Date('2026-10-15') })]);

			const section = page.getByLabelText('Free trials', { exact: true });
			await expect.element(section).toHaveTextContent('€12.00');
			await expect.element(section).toHaveTextContent('will be charged');
			await expect.element(page.getByRole('button', { name: 'Cancel Netflix' })).toBeVisible();
		});

		it('is hidden without a running trial', async () => {
			renderPage([makeSubscription({ trialEndsAt: new Date('2026-09-01') })]);

			expect(document.querySelector('[aria-label="Free trials"]')).toBeNull();
		});
	});

	describe('currencies', () => {
		const usd = makeSubscription({ id: 'usd', name: 'Figma', priceMinor: 1100, currency: 'USD' });

		it('shows each subscription in its own currency and totals in the display currency', async () => {
			renderPage([makeSubscription({ id: 'eur', priceMinor: 1000 }), usd]);

			// $11 is €10 at 1.1, so €10 + €10 = €20/mo, €240/yr.
			const summary = page.getByLabelText('Spend summary');
			await expect.element(summary).toHaveTextContent('€20.00');
			await expect.element(summary).toHaveTextContent('€240.00');
			await expect.element(page.getByText(/\$11\.00/).first()).toBeInTheDocument();
		});

		it('re-expresses totals when the display currency changes', async () => {
			renderPage([makeSubscription({ id: 'eur', priceMinor: 1000 }), usd], {
				displayCurrency: 'USD'
			});

			// €10 is $11 and the $11 subscription stays $11: $22/mo.
			await expect.element(page.getByLabelText('Spend summary')).toHaveTextContent('$22.00');
		});

		it('says so when a subscription cannot be converted', async () => {
			renderPage([makeSubscription({ id: 'eur', priceMinor: 1000 }), usd], {
				ratesInUse: { EUR: 1 }
			});

			const summary = page.getByLabelText('Spend summary');
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

			const summary = page.getByLabelText('Spend summary');
			await expect.element(summary).toHaveTextContent('€10.00');
			await expect.element(summary).toHaveTextContent('€120.00');
			await expect.element(summary).toHaveTextContent('Across 1 active subscription');
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
			renderPage([makeSubscription({ renewalDate: new Date('2026-10-14'), status: 'paused' })]);

			await expect.element(page.getByText('Needs attention')).not.toBeInTheDocument();
		});
	});

	describe('details and price history', () => {
		const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
		const change = (overrides: Partial<PriceChange> = {}): PriceChange => ({
			id: 'c1',
			subscriptionId: 'sub_1',
			oldMinor: 1000,
			newMinor: 1200,
			currency: 'EUR',
			changedAt: daysAgo(10),
			...overrides
		});

		it('shows the account, payment method and notes under Details', async () => {
			renderPage([
				makeSubscription({
					accountEmail: 'me@example.com',
					paymentMethod: 'Visa ending 4242',
					notes: 'Family plan'
				})
			]);

			await expect.element(page.getByText('Details', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('me@example.com')).toBeInTheDocument();
			await expect.element(page.getByText('Visa ending 4242')).toBeInTheDocument();
			await expect.element(page.getByText('Family plan')).toBeInTheDocument();
		});

		it('offers no Details for a subscription with nothing to show', async () => {
			renderPage([makeSubscription()]);

			await expect.element(page.getByText('Details', { exact: true })).not.toBeInTheDocument();
		});

		it('renders notes as text, never as markup', async () => {
			renderPage([makeSubscription({ notes: '<img src=x onerror="window.__pwned = true">' })]);

			await expect
				.element(page.getByText('<img src=x onerror="window.__pwned = true">'))
				.toBeInTheDocument();
			expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
		});

		it('flags a recent price rise with the old price', async () => {
			renderPage([makeSubscription()], { priceChanges: [change()] });

			expect(badgeTexts().some((text) => text?.includes('↑ 20% from €10.00'))).toBe(true);
		});

		it('lists the price history', async () => {
			renderPage([makeSubscription()], { priceChanges: [change()] });

			await expect.element(page.getByText('Price history')).toBeInTheDocument();
			await expect.element(page.getByText(/€10\.00 → €12\.00/)).toBeInTheDocument();
		});

		it('does not flag a rise from long ago, but still lists it', async () => {
			renderPage([makeSubscription()], { priceChanges: [change({ changedAt: daysAgo(200) })] });

			expect(badgeTexts().some((text) => text?.includes('↑'))).toBe(false);
			await expect.element(page.getByText(/€10\.00 → €12\.00/)).toBeInTheDocument();
		});

		it('does not flag a price drop', async () => {
			renderPage([makeSubscription()], {
				priceChanges: [change({ oldMinor: 1200, newMinor: 1000 })]
			});

			expect(badgeTexts().some((text) => text?.includes('↑'))).toBe(false);
		});

		it('only shows a subscription its own history', async () => {
			renderPage(
				[
					makeSubscription({ id: 'a', name: 'Netflix' }),
					makeSubscription({ id: 'b', name: 'Hulu' })
				],
				{ priceChanges: [change({ subscriptionId: 'b', oldMinor: 700, newMinor: 900 })] }
			);

			const rises = badgeTexts().filter((text) => text?.includes('↑'));
			expect(rises).toEqual(['↑ 29% from €7.00']);
		});
	});

	describe('overlap alerts', () => {
		afterEach(() => localStorage.clear());

		const music = [
			makeSubscription({ id: 'sp', name: 'Spotify', category: 'Audio' }),
			makeSubscription({ id: 'am', name: 'Apple Music', category: 'Tunes' })
		];

		it('flags two services of the same kind', async () => {
			renderPage(music);

			const list = page.getByRole('list', { name: 'Possible overlap' });
			await expect.element(list).toHaveTextContent('Several music services');
			await expect.element(list).toHaveTextContent('Apple Music + Spotify');
		});

		it('stays quiet when nothing overlaps', async () => {
			renderPage([makeSubscription({ category: 'Video' })]);

			await expect.element(page.getByText('Possible overlap')).not.toBeInTheDocument();
		});

		it('can be dismissed, and stays dismissed', async () => {
			renderPage(music);
			await page.getByRole('button', { name: /Dismiss: Several music services/ }).click();
			await expect.element(page.getByText('Possible overlap')).not.toBeInTheDocument();
			expect(localStorage.getItem('overlap-dismissed')).toContain('group:music');
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

	describe('add dialog', () => {
		it('opens from the header button', async () => {
			renderPage([makeSubscription()]);

			await page.getByRole('button', { name: '+ New subscription' }).click();

			await expect.element(page.getByRole('dialog')).toBeVisible();
			await expect.element(page.getByLabelText('Name')).toBeVisible();
		});

		it('preselects the display currency for a new subscription', async () => {
			renderPage([], { displayCurrency: 'USD' });

			await page.getByRole('button', { name: '+ New subscription' }).click();

			await expect.element(page.getByLabelText('Currency')).toHaveValue('USD');
		});
	});

	describe('empty state', () => {
		it('invites you to add the first subscription', async () => {
			renderPage([]);

			await expect.element(page.getByText('No subscriptions yet')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Add your first subscription' }).click();
			await expect.element(page.getByRole('dialog')).toBeVisible();
		});
	});

	describe('deleting', () => {
		it('hides the subscription at once and takes it out of the totals', async () => {
			renderPage([
				makeSubscription({ id: 'a', name: 'Netflix', priceMinor: 1000 }),
				makeSubscription({ id: 'b', name: 'Dropbox', priceMinor: 500 })
			]);
			await expect.element(page.getByLabelText('Spend summary')).toHaveTextContent('€15.00');

			await page.getByRole('button', { name: 'Delete' }).first().click();

			await expect.element(page.getByText('Netflix', { exact: true })).not.toBeInTheDocument();
			await expect.element(page.getByLabelText('Spend summary')).toHaveTextContent('€5.00');
		});
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

		it('shows active filters as chips with a result count', async () => {
			renderTwo();
			await expect.element(page.getByText('2 subscriptions')).toBeInTheDocument();

			await page.getByLabelText('Filter by category').selectOptions('Storage');

			await expect.element(page.getByText('Showing 1 of 2')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Remove filter: Category: Storage' }).click();
			await expect.element(page.getByText('2 subscriptions')).toBeInTheDocument();
		});

		it('clears every filter at once', async () => {
			renderTwo();
			await page.getByLabelText('Search subscriptions').fill('zzz');
			await page.getByLabelText('Filter by category').selectOptions('Storage');

			await page.getByRole('button', { name: 'Clear filters' }).first().click();

			await expect.element(page.getByText('Dropbox').first()).toBeInTheDocument();
			await expect.element(page.getByText('Netflix').first()).toBeInTheDocument();
		});

		it('filters by category', async () => {
			renderTwo();

			await page.getByLabelText('Filter by category').selectOptions('Storage');

			await expect.element(page.getByText('Dropbox').first()).toBeInTheDocument();
			await expect.element(page.getByText('Netflix')).not.toBeInTheDocument();
		});
	});
});
