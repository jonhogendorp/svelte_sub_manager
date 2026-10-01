import type { Subscription } from '../../generated/prisma/client';

export type BillingCycle = 'monthly' | 'yearly';

export const BILLING_CYCLES = ['monthly', 'yearly'] as const satisfies readonly BillingCycle[];

export function toBillingCycle(value: unknown): BillingCycle {
	return value === 'yearly' ? 'yearly' : 'monthly';
}

type Priced = Pick<Subscription, 'price' | 'billingCycle'>;

export function monthlyCost(sub: Priced): number {
	return toBillingCycle(sub.billingCycle) === 'yearly' ? sub.price / 12 : sub.price;
}

export function yearlyCost(sub: Priced): number {
	return toBillingCycle(sub.billingCycle) === 'yearly' ? sub.price : sub.price * 12;
}

/**
 * Adds calendar months in UTC (how renewal dates are stored), clamping the day to
 * the target month's last day so 31 Jan + 1 month is 28/29 Feb rather than 3 Mar.
 */
export function addMonthsClamped(anchor: Date, months: number): Date {
	const year = anchor.getUTCFullYear();
	const month = anchor.getUTCMonth() + months;
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return new Date(
		Date.UTC(
			year,
			month,
			Math.min(anchor.getUTCDate(), lastDay),
			anchor.getUTCHours(),
			anchor.getUTCMinutes(),
			anchor.getUTCSeconds(),
			anchor.getUTCMilliseconds()
		)
	);
}

/**
 * Rolls a renewal date forward by whole billing periods until it lands on or after `from`.
 * Every occurrence is computed from the original date rather than the previous
 * occurrence, so a clamped month (Feb) doesn't permanently pull the day earlier.
 */
export function nextOccurrenceOnOrAfter(
	renewalDate: Date | string,
	from: Date,
	cycle: BillingCycle
): Date {
	const anchor = new Date(renewalDate);
	if (anchor >= from) return anchor;

	const step = cycle === 'yearly' ? 12 : 1;
	const monthsApart =
		(from.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
		(from.getUTCMonth() - anchor.getUTCMonth());

	let periods = Math.max(0, Math.floor(monthsApart / step));
	let occurrence = addMonthsClamped(anchor, periods * step);
	while (occurrence < from) {
		periods += 1;
		occurrence = addMonthsClamped(anchor, periods * step);
	}
	return occurrence;
}

/**
 * Whole calendar days between today and a renewal. Compared as calendar days
 * rather than elapsed milliseconds so "due tomorrow" doesn't flip at the wrong
 * hour; the renewal is read in UTC (how it was stored), today in local time.
 */
export function daysUntil(renewalDate: Date | string, now: Date): number {
	const renewal = new Date(renewalDate);
	const renewalDay = Date.UTC(
		renewal.getUTCFullYear(),
		renewal.getUTCMonth(),
		renewal.getUTCDate()
	);
	const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
	return Math.round((renewalDay - today) / 86_400_000);
}

export type Urgency = 'urgent' | 'soon' | 'normal';

export function urgencyFor(days: number): Urgency {
	if (days <= 3) return 'urgent';
	if (days <= 7) return 'soon';
	return 'normal';
}

export interface UpcomingRenewal {
	subscription: Subscription;
	occurrence: Date;
	days: number;
	urgency: Urgency;
}

/**
 * Today's calendar date expressed as UTC midnight, matching how renewal dates
 * are stored. Comparing against local midnight instead would roll a renewal due
 * today forward a whole period for anyone west of UTC.
 */
function startOfTodayUtc(now: Date): Date {
	return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function upcomingWithin(
	subscriptions: Subscription[],
	now: Date,
	withinDays: number
): UpcomingRenewal[] {
	const startOfToday = startOfTodayUtc(now);

	return subscriptions
		.map((subscription) => {
			const occurrence = nextOccurrenceOnOrAfter(
				subscription.renewalDate,
				startOfToday,
				toBillingCycle(subscription.billingCycle)
			);
			const days = daysUntil(occurrence, now);
			return { subscription, occurrence, days, urgency: urgencyFor(days) };
		})
		.filter(({ days }) => days >= 0 && days <= withinDays)
		.sort((a, b) => a.days - b.days);
}

export const ALL_FILTER = 'all';

export type SubscriptionSort = 'renewal' | 'price' | 'name';

export interface SubscriptionFilters {
	query: string;
	category: string;
	cycle: BillingCycle | typeof ALL_FILTER;
	sortBy: SubscriptionSort;
}

/** Distinct categories, case-insensitively de-duplicated, keeping the first spelling seen. */
export function distinctCategories(subscriptions: Pick<Subscription, 'category'>[]): string[] {
	const seen = new Map<string, string>();
	for (const { category } of subscriptions) {
		const key = category.trim().toLowerCase();
		if (key && !seen.has(key)) seen.set(key, category.trim());
	}
	return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Filters by name/category text, category and cycle, then sorts. Does not mutate the input. */
export function filterAndSortSubscriptions(
	subscriptions: Subscription[],
	filters: SubscriptionFilters,
	now: Date
): Subscription[] {
	const query = filters.query.trim().toLowerCase();
	const category = filters.category.toLowerCase();
	const startOfToday = startOfTodayUtc(now);

	const nextRenewal = (sub: Subscription) =>
		nextOccurrenceOnOrAfter(
			sub.renewalDate,
			startOfToday,
			toBillingCycle(sub.billingCycle)
		).getTime();

	const matches = subscriptions.filter((sub) => {
		if (
			query &&
			!sub.name.toLowerCase().includes(query) &&
			!sub.category.toLowerCase().includes(query)
		) {
			return false;
		}
		if (filters.category !== ALL_FILTER && sub.category.trim().toLowerCase() !== category) {
			return false;
		}
		if (filters.cycle !== ALL_FILTER && toBillingCycle(sub.billingCycle) !== filters.cycle) {
			return false;
		}
		return true;
	});

	switch (filters.sortBy) {
		case 'price':
			return matches.sort((a, b) => monthlyCost(b) - monthlyCost(a));
		case 'name':
			return matches.sort((a, b) => a.name.localeCompare(b.name));
		case 'renewal':
			return matches.sort((a, b) => nextRenewal(a) - nextRenewal(b));
	}
}

/**
 * A reminder is suppressed only while the acknowledgement still points at the
 * occurrence now coming up, so it revives by itself once the date rolls forward
 * — no cleanup job needed.
 */
export function reminderIsActive(subscription: Subscription, now: Date): boolean {
	const startOfToday = startOfTodayUtc(now);
	const occurrence = nextOccurrenceOnOrAfter(
		subscription.renewalDate,
		startOfToday,
		toBillingCycle(subscription.billingCycle)
	);

	const acked = subscription.reminderAckedOccurrence;
	if (!acked || new Date(acked).getTime() !== occurrence.getTime()) return true;

	const snoozedUntil = subscription.reminderSnoozedUntil;
	if (snoozedUntil && now >= new Date(snoozedUntil)) return true;

	return false;
}
