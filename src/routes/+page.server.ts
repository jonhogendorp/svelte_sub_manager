import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import { fail } from '@sveltejs/kit';
import { isSupportedCurrency, parseMoneyInput } from '$lib/money';
import { MAX_IMPORT_BYTES, duplicateKey, parseSubscriptionsCsv } from '$lib/csv-import';
import { parseBulkIds } from '$lib/bulk';
import { categoryKey } from '$lib/category-budget';
import { parseCategoryBudgetForm } from '$lib/category-budget-form';
import { cancellationChange } from '$lib/savings-ledger';
import { parseSubscriptionForm } from '$lib/subscription-form';
import {
	SUBSCRIPTION_STATUSES,
	nextOccurrenceFor,
	toSubscriptionStatus,
	trialEndOn,
	type ReminderKind,
	type SubscriptionStatus
} from '$lib/subscriptions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [subscriptions, priceChanges, categoryBudgets, { displayCurrency, budget }, rates] =
		await Promise.all([
			prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } }),
			prisma.priceChange.findMany({ orderBy: { changedAt: 'desc' } }),
			prisma.categoryBudget.findMany({ orderBy: { category: 'asc' } }),
			getSettings(),
			getRates(now)
		]);
	// `now` is sent along so server-rendered and hydrated urgency text agree.
	return { subscriptions, priceChanges, categoryBudgets, now, displayCurrency, budget, rates };
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

/**
 * Sets the status of several subscriptions and keeps `cancelledAt` in step: newly cancelled
 * ones get today's date, ones already cancelled keep theirs, and any that stop being
 * cancelled lose it. Returns how many subscriptions exist among the ids.
 */
async function setStatuses(ids: string[], status: SubscriptionStatus): Promise<number> {
	const now = new Date();
	return prisma.$transaction(async (tx) => {
		const cancelledAt = cancellationChange('active', status, now);
		if (cancelledAt) {
			await tx.subscription.updateMany({
				where: { id: { in: ids }, status: { not: 'cancelled' } },
				data: { cancelledAt }
			});
		}
		const { count } = await tx.subscription.updateMany({
			where: { id: { in: ids } },
			data: status === 'cancelled' ? { status } : { status, cancelledAt: null }
		});
		return count;
	});
}

export const actions: Actions = {
	create: async ({ request }) => {
		const parsed = parseSubscriptionForm(await request.formData());
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		await prisma.subscription.create({
			data: {
				...parsed.data,
				cancelledAt: cancellationChange('active', parsed.data.status, new Date())
			}
		});
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

	// Handles one subscription as well as a whole selection.
	bulkDelete: async ({ request }) => {
		const parsed = parseBulkIds(await request.formData());
		if ('error' in parsed) return fail(400, { error: parsed.error });

		const { count } = await prisma.subscription.deleteMany({ where: { id: { in: parsed.ids } } });
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	bulkSetStatus: async ({ request }) => {
		const formData = await request.formData();
		const parsed = parseBulkIds(formData);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		const status = formData.get('status');
		if (!SUBSCRIPTION_STATUSES.some((known) => known === status)) {
			return fail(400, { error: 'Please choose a valid status.' });
		}

		const count = await setStatuses(parsed.ids, toSubscriptionStatus(status));
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

		const count = await setStatuses([id], toSubscriptionStatus(status));
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	importCsv: async ({ request }) => {
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Please choose a CSV file to import.' });
		}
		if (file.size > MAX_IMPORT_BYTES) {
			return fail(400, { error: 'That file is too large to import.' });
		}

		const parsed = parseSubscriptionsCsv(await file.text());
		if ('fileError' in parsed) return fail(400, { error: parsed.fileError });

		// Rows that match an existing subscription (or an earlier row) are skipped, so importing
		// the same file twice doesn't double everything.
		const existing = await prisma.subscription.findMany({
			select: { name: true, currency: true, priceMinor: true, billingCycle: true }
		});
		const seen = new Set(existing.map(duplicateKey));
		const fresh = parsed.rows.filter(({ data }) => {
			const key = duplicateKey(data);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		await prisma.subscription.createMany({ data: fresh.map(({ data }) => data) });

		return {
			imported: fresh.length,
			skipped: parsed.rows.length - fresh.length,
			errors: parsed.errors
		};
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

	// One cap per category, matched ignoring case: setting it again replaces the earlier one.
	setCategoryBudget: async ({ request }) => {
		const parsed = parseCategoryBudgetForm(await request.formData());
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		const existing = (await prisma.categoryBudget.findMany()).find(
			(budget) => categoryKey(budget.category) === categoryKey(parsed.data.category)
		);
		if (existing) {
			await prisma.categoryBudget.update({ where: { id: existing.id }, data: parsed.data });
		} else {
			await prisma.categoryBudget.create({ data: parsed.data });
		}
	},

	clearCategoryBudget: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing category budget id.' });

		const { count } = await prisma.categoryBudget.deleteMany({ where: { id } });
		if (count === 0) return fail(404, { error: 'Category budget not found.' });
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
