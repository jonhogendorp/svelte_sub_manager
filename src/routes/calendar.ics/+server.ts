import { prisma } from '$lib/server/prisma';
import { subscriptionsToIcs } from '$lib/ics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const subscriptions = await prisma.subscription.findMany({ orderBy: { renewalDate: 'asc' } });

	return new Response(subscriptionsToIcs(subscriptions, new Date()), {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': 'inline; filename="subscriptions.ics"',
			// Calendar apps poll this URL; always serve the current data.
			'Cache-Control': 'no-store'
		}
	});
};
