import type { Bill, BillPayment, Subscription } from '../../generated/prisma/client';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { toSubscriptionStatus, yearlyCost, yourShareMinor } from './subscriptions';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/** A whole percentage from 0 to 100; anything else counts as 0 (not a business expense). */
export function toBusinessPercent(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 0;
}

export interface TaxRow {
	kind: 'subscription' | 'bill';
	name: string;
	category: string;
	businessPercent: number;
	/** What you paid in the year, in major units of the display currency. */
	spent: number;
	/** The business part of it: `spent` x `businessPercent`. */
	deductible: number;
	/** True when `spent` is calculated from the current price rather than from recorded payments. */
	estimated: boolean;
}

export interface TaxCategoryTotal {
	category: string;
	spent: number;
	deductible: number;
}

export interface TaxReport {
	year: number;
	rows: TaxRow[];
	categories: TaxCategoryTotal[];
	totalSpent: number;
	totalDeductible: number;
	hasEstimates: boolean;
	/** Business expenses left out because no exchange rate is known for their currency. */
	excluded: number;
}

function yearBounds(year: number): { start: number; end: number } {
	return { start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
}

/**
 * Roughly what a subscription cost you in `year`, in minor units of its own currency: your
 * share of the yearly cost over the days it was running. Running means from the start date (or
 * the start of the year when unknown, or the end of a free trial if later) to the end of the
 * year, today or the cancellation date, whichever comes first. Paused subscriptions and
 * cancelled ones without a date can't be placed in time and give null.
 */
export function subscriptionSpentInYear(
	subscription: Subscription,
	year: number,
	now: Date
): number | null {
	const status = toSubscriptionStatus(subscription.status);
	if (status === 'paused') return null;
	if (status === 'cancelled' && !subscription.cancelledAt) return null;

	const bounds = yearBounds(year);

	// A one-off charge belongs to the year it was made in.
	if (subscription.billingCycle === 'once') {
		const chargedOn = new Date(subscription.renewalDate).getTime();
		const inYear =
			chargedOn >= bounds.start && chargedOn < bounds.end && chargedOn <= now.getTime();
		return inYear ? yourShareMinor(subscription) : 0;
	}

	let start = subscription.startedOn ? new Date(subscription.startedOn).getTime() : bounds.start;
	if (subscription.trialEndsAt)
		start = Math.max(start, new Date(subscription.trialEndsAt).getTime());
	start = Math.max(start, bounds.start);

	let end = Math.min(bounds.end, now.getTime());
	if (status === 'cancelled' && subscription.cancelledAt) {
		end = Math.min(end, new Date(subscription.cancelledAt).getTime());
	}

	const days = Math.max(0, (end - start) / MS_PER_DAY);
	return Math.round((yearlyCost(subscription) * days) / DAYS_PER_YEAR);
}

/** The years worth offering in the report: every year with a start date or payment, plus this one. */
export function availableYears(
	subscriptions: Pick<Subscription, 'startedOn'>[],
	payments: Pick<BillPayment, 'paidOn'>[],
	now: Date
): number[] {
	const years = new Set<number>([now.getFullYear()]);
	for (const { startedOn } of subscriptions) {
		if (startedOn) years.add(new Date(startedOn).getUTCFullYear());
	}
	for (const { paidOn } of payments) years.add(new Date(paidOn).getUTCFullYear());
	return [...years].sort((a, b) => b - a);
}

/**
 * Business expenses for one calendar year, in the display currency: subscriptions estimated
 * from their price, bills summed from the payments you logged. Anything with 0% business use is
 * left out.
 */
export function taxReport(
	subscriptions: Subscription[],
	bills: Bill[],
	payments: BillPayment[],
	year: number,
	now: Date,
	money: MoneyContext
): TaxReport {
	const rows: TaxRow[] = [];
	let excluded = 0;

	const toDisplay = (minor: number, currency: string) =>
		convertMajor(toMajor(minor, currency), currency, money.display, money.rates);

	for (const subscription of subscriptions) {
		const businessPercent = toBusinessPercent(subscription.businessPercent);
		if (businessPercent === 0) continue;

		const minor = subscriptionSpentInYear(subscription, year, now);
		if (minor === null || minor === 0) continue;

		const spent = toDisplay(minor, subscription.currency);
		if (spent === null) {
			excluded += 1;
			continue;
		}
		rows.push({
			kind: 'subscription',
			name: subscription.name,
			category: subscription.category,
			businessPercent,
			spent,
			deductible: (spent * businessPercent) / 100,
			estimated: true
		});
	}

	const bounds = yearBounds(year);
	for (const bill of bills) {
		const businessPercent = toBusinessPercent(bill.businessPercent);
		if (businessPercent === 0) continue;

		let spent = 0;
		let found = false;
		let unconvertible = false;
		for (const payment of payments) {
			if (payment.billId !== bill.id) continue;
			const paidOn = new Date(payment.paidOn).getTime();
			if (paidOn < bounds.start || paidOn >= bounds.end) continue;

			const amount = toDisplay(payment.amountMinor, payment.currency);
			if (amount === null) unconvertible = true;
			else spent += amount;
			found = true;
		}
		if (!found) continue;
		if (unconvertible) excluded += 1;

		rows.push({
			kind: 'bill',
			name: bill.name,
			category: bill.kind,
			businessPercent,
			spent,
			deductible: (spent * businessPercent) / 100,
			estimated: false
		});
	}

	rows.sort((a, b) => a.category.localeCompare(b.category) || b.deductible - a.deductible);

	const byCategory = new Map<string, TaxCategoryTotal>();
	for (const row of rows) {
		const entry = byCategory.get(row.category) ?? {
			category: row.category,
			spent: 0,
			deductible: 0
		};
		entry.spent += row.spent;
		entry.deductible += row.deductible;
		byCategory.set(row.category, entry);
	}

	return {
		year,
		rows,
		categories: [...byCategory.values()],
		totalSpent: rows.reduce((sum, row) => sum + row.spent, 0),
		totalDeductible: rows.reduce((sum, row) => sum + row.deductible, 0),
		hasEstimates: rows.some((row) => row.estimated),
		excluded
	};
}
