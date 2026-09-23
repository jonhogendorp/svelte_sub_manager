import { prisma } from '$lib/server/prisma';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const subscriptions = await prisma.subscription.findMany({
		orderBy: { renewalDate: 'asc' }
	});
	return { subscriptions };
};

function parseSubscriptionForm(formData: FormData) {
	const name = String(formData.get('name') ?? '').trim();
	const price = Number(formData.get('price'));
	const category = String(formData.get('category') ?? '').trim();
	const renewalDate = String(formData.get('renewalDate') ?? '');

	if (!name || !category || !renewalDate || Number.isNaN(price)) {
		return null;
	}

	return { name, price, category, renewalDate: new Date(renewalDate) };
}

export const actions: Actions = {
	create: async ({ request }) => {
		const data = parseSubscriptionForm(await request.formData());
		if (!data) return fail(400, { error: 'Please fill in all fields.' });

		await prisma.subscription.create({ data });
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		const data = parseSubscriptionForm(formData);
		if (!data) return fail(400, { error: 'Please fill in all fields.' });

		await prisma.subscription.update({ where: { id }, data });
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing subscription id.' });

		await prisma.subscription.delete({ where: { id } });
	}
};
