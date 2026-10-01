import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { fail } from '@sveltejs/kit';
import { BASE_CURRENCY, isSupportedCurrency, type Currency } from '$lib/money';
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
async function getDisplayCurrency(): Promise<Currency> {
	const settings = await prisma.settings.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: {}
	});
	return isSupportedCurrency(settings.displayCurrency) ? settings.displayCurrency : BASE_CURRENCY;
}

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [subscriptions, displayCurrency, rates] = await Promise.all([
		prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } }),
		getDisplayCurrency(),
		getRates(now)
	]);
	// `now` is sent along so server-rendered and hydrated urgency text agree.
	return { subscriptions, now, displayCurrency, rates };
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
		kind === 'trial' ? trialEndOn(subscription, now) : nextOccurrenceFor(subscription, startOfToday);

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

		const { count } = await prisma.subscription.updateMany({ where: { id }, data: parsed.data });
		if (count === 0) return fail(404, { error: NOT_FOUND });
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
