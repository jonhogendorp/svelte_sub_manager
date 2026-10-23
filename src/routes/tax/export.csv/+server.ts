import { prisma } from '$lib/server/prisma';
import { getRates } from '$lib/server/rates';
import { getSettings } from '$lib/server/settings';
import { availableYears, taxReport } from '$lib/tax';
import { taxReportToCsv } from '$lib/tax-csv';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const now = new Date();
	const [subscriptions, bills, payments, { displayCurrency }, rates] = await Promise.all([
		prisma.subscription.findMany({ orderBy: { name: 'asc' } }),
		prisma.bill.findMany({ orderBy: { name: 'asc' } }),
		prisma.billPayment.findMany(),
		getSettings(),
		getRates(now)
	]);

	const requested = Number(url.searchParams.get('year'));
	const year = availableYears(subscriptions, payments, now).includes(requested)
		? requested
		: now.getFullYear();
	const report = taxReport(subscriptions, bills, payments, year, now, {
		display: displayCurrency,
		rates
	});

	// The BOM makes Excel read the file as UTF-8.
	return new Response('﻿' + taxReportToCsv(report, displayCurrency), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="tax-report-${year}.csv"`,
			'Cache-Control': 'no-store'
		}
	});
};
