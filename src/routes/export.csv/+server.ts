import { prisma } from '$lib/server/prisma';
import { subscriptionsToCsv } from '$lib/csv';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const subscriptions = await prisma.subscription.findMany({ orderBy: { name: 'asc' } });

	// The BOM makes Excel read the file as UTF-8.
	return new Response('﻿' + subscriptionsToCsv(subscriptions), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="subscriptions.csv"',
			'Cache-Control': 'no-store'
		}
	});
};
