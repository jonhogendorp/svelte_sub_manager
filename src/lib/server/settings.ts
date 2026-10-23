import { prisma } from '$lib/server/prisma';
import type { Budget } from '$lib/budget';
import type { Income } from '$lib/income';
import type { ReminderSettings } from '$lib/reminder-settings';
import { toReminderDays } from '$lib/reminders';
import { BASE_CURRENCY, isSupportedCurrency, type Currency } from '$lib/money';

/** The single settings row is created on first read. */
export async function getSettings(): Promise<{
	displayCurrency: Currency;
	budget: Budget | null;
	income: Income | null;
	reminders: ReminderSettings;
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
				: null,
		income:
			settings.incomeMinor !== null && settings.incomeCurrency !== null
				? { minor: settings.incomeMinor, currency: settings.incomeCurrency }
				: null,
		reminders: {
			enabled: settings.remindersEnabled,
			email: settings.reminderEmail,
			daysBefore: toReminderDays(settings.reminderDaysBefore)
		}
	};
}
