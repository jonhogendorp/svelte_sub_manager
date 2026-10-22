import { fail } from '@sveltejs/kit';
import { isSupportedCurrency, parseMoneyInput } from '$lib/money';
import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [subscriptions, priceChanges, bills, payments, { displayCurrency, budget, income }, rates] =
		await Promise.all([
			prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } }),
			prisma.priceChange.findMany({ orderBy: { changedAt: 'desc' } }),
			prisma.bill.findMany({ orderBy: { renewalDate: 'asc' } }),
			prisma.billPayment.findMany({ orderBy: { paidOn: 'desc' } }),
			getSettings(),
			getRates(now)
		]);
	return {
		subscriptions,
		priceChanges,
		bills,
		payments,
		now,
		displayCurrency,
		budget,
		income,
		rates
	};
};

export const actions: Actions = {
	// An empty amount clears the income.
	setIncome: async ({ request }) => {
		const formData = await request.formData();
		const amount = String(formData.get('amount') ?? '').trim();

		if (amount === '') {
			await prisma.settings.upsert({
				where: { id: 1 },
				create: { id: 1 },
				update: { incomeMinor: null, incomeCurrency: null }
			});
			return;
		}

		const currency = formData.get('currency');
		if (!isSupportedCurrency(currency)) {
			return fail(400, { error: 'Please choose a supported currency.' });
		}

		const parsed = parseMoneyInput(amount, currency);
		if ('error' in parsed || parsed.minor <= 0) {
			return fail(400, {
				error: 'Please enter an income greater than zero, like 2500 or 2500.50.'
			});
		}

		await prisma.settings.upsert({
			where: { id: 1 },
			create: { id: 1, incomeMinor: parsed.minor, incomeCurrency: currency },
			update: { incomeMinor: parsed.minor, incomeCurrency: currency }
		});
	}
};
