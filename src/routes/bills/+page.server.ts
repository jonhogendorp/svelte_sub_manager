import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import { fail } from '@sveltejs/kit';
import { parseBillForm, parsePaymentForm } from '$lib/bill-form';
import { SUBSCRIPTION_STATUSES, toSubscriptionStatus } from '$lib/subscriptions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const [bills, payments, { displayCurrency }, rates] = await Promise.all([
		prisma.bill.findMany({ orderBy: { renewalDate: 'asc' } }),
		prisma.billPayment.findMany({ orderBy: { paidOn: 'desc' } }),
		getSettings(),
		getRates(now)
	]);
	// `now` is sent along so server-rendered and hydrated urgency text agree.
	return { bills, payments, now, displayCurrency, rates };
};

const NOT_FOUND = 'Bill not found.';

export const actions: Actions = {
	create: async ({ request }) => {
		const parsed = parseBillForm(await request.formData());
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		await prisma.bill.create({ data: parsed.data });
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing bill id.' });

		const parsed = parseBillForm(formData);
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		const { count } = await prisma.bill.updateMany({ where: { id }, data: parsed.data });
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	delete: async ({ request }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing bill id.' });

		const { count } = await prisma.bill.deleteMany({ where: { id } });
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	setStatus: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing bill id.' });

		const status = formData.get('status');
		if (!SUBSCRIPTION_STATUSES.some((known) => known === status)) {
			return fail(400, { error: 'Please choose a valid status.' });
		}

		const { count } = await prisma.bill.updateMany({
			where: { id },
			data: { status: toSubscriptionStatus(status) }
		});
		if (count === 0) return fail(404, { error: NOT_FOUND });
	},

	// Records what was actually paid; the estimate follows from the latest payments.
	logPayment: async ({ request }) => {
		const formData = await request.formData();
		const billId = String(formData.get('id') ?? '');
		if (!billId) return fail(400, { error: 'Missing bill id.' });

		const parsed = parsePaymentForm(formData);
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { id: true } });
		if (!bill) return fail(404, { error: NOT_FOUND });

		await prisma.billPayment.create({ data: { billId, ...parsed.data } });
	}
};
