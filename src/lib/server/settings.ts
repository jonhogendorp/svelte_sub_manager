import { prisma } from '$lib/server/prisma';
import type { Budget } from '$lib/budget';
import { BASE_CURRENCY, isSupportedCurrency, type Currency } from '$lib/money';

/** The single settings row is created on first read. */
export async function getSettings(): Promise<{
	displayCurrency: Currency;
	budget: Budget | null;
}> {
	const settings = await prisma.settings.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: {}
	});
	return {
		displayCurrency: isSupportedCurrency(settings.displayCurrency)
			? settings.displayCurrency
			: BASE_CURRENCY,
		budget:
			settings.budgetMinor !== null && settings.budgetCurrency !== null
				? { minor: settings.budgetMinor, currency: settings.budgetCurrency }
				: null
	};
}
