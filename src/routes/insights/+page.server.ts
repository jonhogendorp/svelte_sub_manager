import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [subscriptions, priceChanges, { displayCurrency, budget }, rates] = await Promise.all([
		prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } }),
		prisma.priceChange.findMany({ orderBy: { changedAt: 'desc' } }),
		getSettings(),
		getRates(now)
	]);
	return { subscriptions, priceChanges, now, displayCurrency, budget, rates };
};
