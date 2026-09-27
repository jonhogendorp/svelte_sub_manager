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

/** Rolls a renewal date forward by whole billing periods until it lands on or after `from`. */
export function nextOccurrenceOnOrAfter(
	renewalDate: Date | string,
	from: Date,
	cycle: BillingCycle
): Date {
	const occurrence = new Date(renewalDate);
	const step = cycle === 'yearly' ? 12 : 1;
	while (occurrence < from) {
		occurrence.setMonth(occurrence.getMonth() + step);
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
