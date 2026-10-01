import type { Subscription } from '../../../generated/prisma/client';
import type { MoneyContext } from '../money';
import {
	countsTowardSpend,
	isActive,
	monthlyCostIn,
	occurrencesBetween,
	priceIn,
	toBillingCycle
} from '../subscriptions';

/**
 * Monthly-equivalent spend per category, largest first, in major units of the display
 * currency. Paused, cancelled and one-off subscriptions, and those without a known
 * exchange rate, are left out.
 */
export function categoryTotals(
	subscriptions: Subscription[],
	money: MoneyContext
): [string, number][] {
	const byCategory = new Map<string, number>();
	for (const sub of subscriptions) {
		if (!countsTowardSpend(sub)) continue;

		const monthly = monthlyCostIn(sub, money);
		if (monthly === null) continue;
		byCategory.set(sub.category, (byCategory.get(sub.category) ?? 0) + monthly);
	}
	return [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
}

export interface MonthBucket {
	label: string;
	monthStart: Date;
	monthEnd: Date;
	total: number;
}

/**
 * What will actually be charged in each of the next `monthsAhead` calendar months
 * (starting with the month containing `now`), based on each renewal date and cycle,
 * in major units of the display currency. A weekly plan is charged every week, so it
 * counts four or five times a month; a future one-off charge counts once.
 */
export function upcomingSpendBuckets(
	subscriptions: Subscription[],
	now: Date,
	monthsAhead: number,
	money: MoneyContext,
	locale?: string
): MonthBucket[] {
	const months: MonthBucket[] = [];
	for (let i = 0; i < monthsAhead; i++) {
		const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1);
		const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
		months.push({
			label: monthStart.toLocaleDateString(locale, { month: 'short' }),
			monthStart,
			monthEnd,
			total: 0
		});
	}

	for (const sub of subscriptions) {
		if (!isActive(sub)) continue;

		const charge = priceIn(sub, money);
		if (charge === null) continue;

		const cycle = toBillingCycle(sub.billingCycle);
		for (const bucket of months) {
			const charges = occurrencesBetween(
				sub.renewalDate,
				bucket.monthStart,
				bucket.monthEnd,
				cycle,
				sub.intervalCount
			);
			bucket.total += charge * charges.length;
		}
	}
	return months;
}

/** Rounds `max / 4` up to a 1/2/5 × 10ⁿ gridline interval. */
export function niceStep(max: number): number {
	const rough = max / 4;
	const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
	const normalized = rough / magnitude;
	const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return step * magnitude;
}

/** Rounds `max` up to a 1/2/5 × 10ⁿ axis ceiling. */
export function niceMax(max: number): number {
	const magnitude = 10 ** Math.floor(Math.log10(max || 1));
	const normalized = max / magnitude;
	const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return step * magnitude;
}
