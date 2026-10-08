import type { Subscription } from '../../generated/prisma/client';
import { minorDigits, toMajor } from './money';
import { monthlyCost } from './subscriptions';

export const CSV_COLUMNS = [
	'name',
	'price',
	'currency',
	'category',
	'billingCycle',
	'intervalCount',
	'status',
	'renewalDate',
	'trialEndsAt',
	'monthlyCost',
	'accountEmail',
	'paymentMethod',
	'notes'
] as const;

/**
 * Quotes a cell per RFC 4180. Text starting with `=`, `+`, `-`, `@` or a control character
 * is prefixed with an apostrophe so a spreadsheet won't run it as a formula.
 */
export function csvCell(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const isoDay = (date: Date | null): string =>
	date ? new Date(date).toISOString().slice(0, 10) : '';

/** Major units with the currency's own number of decimals ("15.99", "1500" for JPY). */
function amount(minor: number, currency: string): string {
	return toMajor(minor, currency).toFixed(minorDigits(currency));
}

/** All subscriptions as CSV (CRLF line endings, header row first). Prices stay in their own currency. */
export function subscriptionsToCsv(subscriptions: Subscription[]): string {
	const rows = subscriptions.map((sub) => {
		// Numbers are written raw (never quoted/escaped) so they stay numbers in a spreadsheet.
		const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
			name: csvCell(sub.name),
			price: amount(sub.priceMinor, sub.currency),
			currency: csvCell(sub.currency),
			category: csvCell(sub.category),
			billingCycle: csvCell(sub.billingCycle),
			intervalCount: String(sub.intervalCount),
			status: csvCell(sub.status),
			renewalDate: isoDay(sub.renewalDate),
			trialEndsAt: isoDay(sub.trialEndsAt),
			monthlyCost: amount(Math.round(monthlyCost(sub)), sub.currency),
			accountEmail: csvCell(sub.accountEmail ?? ''),
			paymentMethod: csvCell(sub.paymentMethod ?? ''),
			notes: csvCell(sub.notes ?? '')
		};
		return CSV_COLUMNS.map((column) => cells[column]).join(',');
	});
	return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
