import type { Subscription } from '../../../generated/prisma/client';
import { monthlyCost, nextOccurrenceOnOrAfter, toBillingCycle } from '../subscriptions';

/** Monthly-equivalent spend per category, largest first. */
export function categoryTotals(subscriptions: Subscription[]): [string, number][] {
	const byCategory = new Map<string, number>();
	for (const sub of subscriptions) {
		byCategory.set(sub.category, (byCategory.get(sub.category) ?? 0) + monthlyCost(sub));
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
 * (starting with the month containing `now`), based on each renewal date and cycle.
 */
export function upcomingSpendBuckets(
	subscriptions: Subscription[],
	now: Date,
	monthsAhead: number,
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
		const cycle = toBillingCycle(sub.billingCycle);
		for (const bucket of months) {
			const occurrence = nextOccurrenceOnOrAfter(sub.renewalDate, bucket.monthStart, cycle);
			if (occurrence >= bucket.monthStart && occurrence < bucket.monthEnd) {
				bucket.total += sub.price;
			}
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
