import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import { availableYears, taxReport } from '$lib/tax';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const now = new Date();
	const [subscriptions, bills, payments, { displayCurrency }, rates] = await Promise.all([
		prisma.subscription.findMany({ orderBy: { name: 'asc' } }),
		prisma.bill.findMany({ orderBy: { name: 'asc' } }),
		prisma.billPayment.findMany({ orderBy: { paidOn: 'desc' } }),
		getSettings(),
		getRates(now)
	]);

	const years = availableYears(subscriptions, payments, now);
	const requested = Number(url.searchParams.get('year'));
	const year = years.includes(requested) ? requested : now.getFullYear();

	const report = taxReport(subscriptions, bills, payments, year, now, {
		display: displayCurrency,
		rates
	});

	return { report, years, displayCurrency };
};
