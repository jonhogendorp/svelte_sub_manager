import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [subscriptions, priceChanges, bills, payments, { displayCurrency, budget }, rates] =
		await Promise.all([
			prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } }),
			prisma.priceChange.findMany({ orderBy: { changedAt: 'desc' } }),
			prisma.bill.findMany({ orderBy: { renewalDate: 'asc' } }),
			prisma.billPayment.findMany({ orderBy: { paidOn: 'desc' } }),
			getSettings(),
			getRates(now)
		]);
	return { subscriptions, priceChanges, bills, payments, now, displayCurrency, budget, rates };
};
