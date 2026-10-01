import { prisma } from '$lib/server/prisma';
import { fail } from '@sveltejs/kit';
import { nextOccurrenceOnOrAfter, toBillingCycle, type BillingCycle } from '$lib/subscriptions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const subscriptions = await prisma.subscription.findMany({
		orderBy: { renewalDate: 'asc' }
	});
	// Sent along so server-rendered and hydrated urgency text agree.
	return { subscriptions, now: new Date() };
};

type ParsedSubscription =
	| { error: string }
	| {
			error?: undefined;
			data: {
				name: string;
				price: number;
				category: string;
				renewalDate: Date;
				billingCycle: BillingCycle;
			};
	  };

function parseSubscriptionForm(formData: FormData): ParsedSubscription {
	const name = String(formData.get('name') ?? '').trim();
	const priceRaw = String(formData.get('price') ?? '').trim();
	const price = Number(priceRaw);
	const category = String(formData.get('category') ?? '').trim();
	const renewalRaw = String(formData.get('renewalDate') ?? '');
	const billingCycle = toBillingCycle(formData.get('billingCycle'));

	if (!name || !category || !priceRaw || !renewalRaw) {
		return { error: 'Please fill in all fields.' };
	}
	if (!Number.isFinite(price) || price <= 0) {
		return { error: 'Price must be greater than zero.' };
	}

	// Parsed as UTC midnight, matching how renewal dates are stored and read back.
	const renewalDate = new Date(renewalRaw);
	if (Number.isNaN(renewalDate.getTime())) {
		return { error: 'Please enter a valid renewal date.' };
	}

	return { data: { name, price, category, renewalDate, billingCycle } };
}

const NOT_FOUND = 'Subscription not found.';

/** Resolves the occurrence a reminder acknowledgement should be pinned to. */
async function currentOccurrenceFor(id: string): Promise<Date | null> {
	const subscription = await prisma.subscription.findUnique({ where: { id } });
	if (!subscription) return null;

	const now = new Date();
	const startOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	return nextOccurrenceOnOrAfter(
		subscription.renewalDate,
		startOfToday,
		toBillingCycle(subscription.billingCycle)
	);
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

	snoozeReminder: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const days = Number(formData.get('days') ?? 3);
		if (Number.isNaN(days) || days <= 0) return fail(400, { error: 'Invalid snooze length.' });

		const occurrence = await currentOccurrenceFor(id);
		if (!occurrence) return fail(400, { error: 'Subscription not found.' });

		const snoozedUntil = new Date();
		snoozedUntil.setDate(snoozedUntil.getDate() + days);

		await prisma.subscription.update({
			where: { id },
			data: { reminderAckedOccurrence: occurrence, reminderSnoozedUntil: snoozedUntil }
		});
	},

	dismissReminder: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const occurrence = await currentOccurrenceFor(id);
		if (!occurrence) return fail(400, { error: 'Subscription not found.' });

		await prisma.subscription.update({
			where: { id },
			data: { reminderAckedOccurrence: occurrence, reminderSnoozedUntil: null }
		});
	}
};
