import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { fail } from '@sveltejs/kit';
import type { Budget } from '$lib/budget';
import { BASE_CURRENCY, isSupportedCurrency, parseMoneyInput, type Currency } from '$lib/money';
import { parseSubscriptionForm } from '$lib/subscription-form';
import {
	SUBSCRIPTION_STATUSES,
	nextOccurrenceFor,
	toSubscriptionStatus,
	trialEndOn,
	type ReminderKind
} from '$lib/subscriptions';
import type { Actions, PageServerLoad } from './$types';

/** The single settings row is created on first read. */
async function getSettings(): Promise<{ displayCurrency: Currency; budget: Budget | null }> {
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

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [subscriptions, priceChanges, { displayCurrency, budget }, rates] = await Promise.all([
		prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } }),
		prisma.priceChange.findMany({ orderBy: { changedAt: 'desc' } }),
		getSettings(),
		getRates(now)
	]);
	// `now` is sent along so server-rendered and hydrated urgency text agree.
	return { subscriptions, priceChanges, now, displayCurrency, budget, rates };
};

const NOT_FOUND = 'Subscription not found.';

function reminderKindOf(formData: FormData): ReminderKind {
	return formData.get('kind') === 'trial' ? 'trial' : 'renewal';
}

/** Resolves the occurrence a reminder acknowledgement should be pinned to. */
async function currentOccurrenceFor(
	id: string,
	kind: ReminderKind
): Promise<{ occurrence: Date } | { error: string }> {
	const subscription = await prisma.subscription.findUnique({ where: { id } });
	if (!subscription) return { error: NOT_FOUND };

	const now = new Date();
	const startOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const occurrence =
		kind === 'trial'
			? trialEndOn(subscription, now)
			: nextOccurrenceFor(subscription, startOfToday);

	return occurrence ? { occurrence } : { error: 'There is nothing to be reminded about.' };
}

export const actions: Actions = {
	create: async ({ request }) => {
		const parsed = parseSubscriptionForm(await request.formData());
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		await prisma.subscription.create({ data: parsed.data });
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const parsed = parseSubscriptionForm(formData);
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		// Read and write in one transaction so the recorded "old price" is the one that was
		// really replaced, even if two edits race.
		const found = await prisma.$transaction(async (tx) => {
			const existing = await tx.subscription.findUnique({ where: { id } });
			if (!existing) return false;

			await tx.subscription.update({ where: { id }, data: parsed.data });

			// A change of currency isn't a price rise, so only same-currency edits are logged.
			if (
				existing.currency === parsed.data.currency &&
				existing.priceMinor !== parsed.data.priceMinor
			) {
				await tx.priceChange.create({
					data: {
						subscriptionId: id,
						oldMinor: existing.priceMinor,
						newMinor: parsed.data.priceMinor,
						currency: parsed.data.currency
					}
				});
			}
			return true;
		});
		if (!found) return fail(404, { error: NOT_FOUND });
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const { count } = await prisma.subscription.deleteMany({ where: { id } });
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	setStatus: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const status = formData.get('status');
		if (!SUBSCRIPTION_STATUSES.some((known) => known === status)) {
			return fail(400, { error: 'Please choose a valid status.' });
		}

		const { count } = await prisma.subscription.updateMany({
			where: { id },
			data: { status: toSubscriptionStatus(status) }
		});
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	setDisplayCurrency: async ({ request }) => {
		const currency = (await request.formData()).get('currency');
		if (!isSupportedCurrency(currency)) {
			return fail(400, { error: 'Please choose a supported currency.' });
		}

		await prisma.settings.upsert({
			where: { id: 1 },
			create: { id: 1, displayCurrency: currency },
			update: { displayCurrency: currency }
		});
	},

	setBudget: async ({ request }) => {
		const formData = await request.formData();
		const amount = String(formData.get('amount') ?? '').trim();

		// An empty amount clears the budget.
		if (amount === '') {
			await prisma.settings.upsert({
				where: { id: 1 },
				create: { id: 1 },
				update: { budgetMinor: null, budgetCurrency: null }
			});
			return;
		}

		const currency = formData.get('currency');
		if (!isSupportedCurrency(currency)) {
			return fail(400, { error: 'Please choose a supported currency.' });
		}

		const parsed = parseMoneyInput(amount, currency);
		if ('error' in parsed || parsed.minor <= 0) {
			return fail(400, { error: 'Please enter a budget greater than zero, like 150 or 150.50.' });
		}

		await prisma.settings.upsert({
			where: { id: 1 },
			create: { id: 1, budgetMinor: parsed.minor, budgetCurrency: currency },
			update: { budgetMinor: parsed.minor, budgetCurrency: currency }
		});
	},

	snoozeReminder: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const days = Number(formData.get('days') ?? 3);
		if (Number.isNaN(days) || days <= 0) return fail(400, { error: 'Invalid snooze length.' });

		const kind = reminderKindOf(formData);
		const current = await currentOccurrenceFor(id, kind);
		if ('error' in current) return fail(400, { error: current.error });

		const snoozedUntil = new Date();
		snoozedUntil.setDate(snoozedUntil.getDate() + days);

		await prisma.subscription.update({
			where: { id },
			data:
				kind === 'trial'
					? { trialAckedAt: current.occurrence, trialSnoozedUntil: snoozedUntil }
					: { reminderAckedOccurrence: current.occurrence, reminderSnoozedUntil: snoozedUntil }
		});
	},

	dismissReminder: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const kind = reminderKindOf(formData);
		const current = await currentOccurrenceFor(id, kind);
		if ('error' in current) return fail(400, { error: current.error });

		await prisma.subscription.update({
			where: { id },
			data:
				kind === 'trial'
					? { trialAckedAt: current.occurrence, trialSnoozedUntil: null }
					: { reminderAckedOccurrence: current.occurrence, reminderSnoozedUntil: null }
		});
	}
};
