import type { Subscription } from '../../generated/prisma/client';
import { convertMajor, toMajor, type MoneyContext } from './money';

export const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom', 'once'] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
	weekly: 'Weekly',
	monthly: 'Monthly',
	quarterly: 'Quarterly',
	yearly: 'Yearly',
	custom: 'Every N months',
	once: 'One-off'
};

export function toBillingCycle(value: unknown): BillingCycle {
	return BILLING_CYCLES.find((cycle) => cycle === value) ?? 'monthly';
}

/** Upper bound for the "every N months" cycle (ten years). */
export const MAX_INTERVAL_MONTHS = 120;

/** A whole number of months between 1 and the maximum; anything else counts as 1. */
export function toIntervalCount(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(n) && n >= 1 && n <= MAX_INTERVAL_MONTHS ? n : 1;
}

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
	active: 'Active',
	paused: 'Paused',
	cancelled: 'Cancelled'
};

export function toSubscriptionStatus(value: unknown): SubscriptionStatus {
	return SUBSCRIPTION_STATUSES.find((status) => status === value) ?? 'active';
}

/** Paused and cancelled subscriptions don't cost anything or remind anyone. */
export function isActive(sub: Pick<Subscription, 'status'>): boolean {
	return toSubscriptionStatus(sub.status) === 'active';
}

/** How often a charge repeats: every `step` days or months. */
export interface Period {
	unit: 'day' | 'month';
	step: number;
}

/**
 * The single place that knows what each cycle means. Costs and occurrences are both
 * derived from it, so they can't disagree. `null` means "never repeats" (one-off).
 */
export function periodOf(cycle: BillingCycle, intervalCount = 1): Period | null {
	switch (cycle) {
		case 'weekly':
			return { unit: 'day', step: 7 };
		case 'monthly':
			return { unit: 'month', step: 1 };
		case 'quarterly':
			return { unit: 'month', step: 3 };
		case 'yearly':
			return { unit: 'month', step: 12 };
		case 'custom':
			return { unit: 'month', step: toIntervalCount(intervalCount) };
		case 'once':
			return null;
	}
}

type Recurring = Pick<Subscription, 'billingCycle' | 'intervalCount'>;

function periodOfSub(sub: Recurring): Period | null {
	return periodOf(toBillingCycle(sub.billingCycle), sub.intervalCount);
}

/** Short price suffix: "/mo", "/yr", "/3 mo". Empty for a one-off charge. */
export function cycleSuffix(sub: Recurring): string {
	const cycle = toBillingCycle(sub.billingCycle);
	switch (cycle) {
		case 'weekly':
			return '/wk';
		case 'monthly':
			return '/mo';
		case 'quarterly':
			return '/qtr';
		case 'yearly':
			return '/yr';
		case 'custom': {
			const n = toIntervalCount(sub.intervalCount);
			return n === 1 ? '/mo' : `/${n} mo`;
		}
		case 'once':
			return '';
	}
}

const WEEKS_PER_YEAR = 52;

function chargesPerYear(period: Period | null): number {
	if (!period) return 0;
	return period.unit === 'day' ? (WEEKS_PER_YEAR * 7) / period.step : 12 / period.step;
}

type Priced = Pick<Subscription, 'priceMinor' | 'billingCycle' | 'intervalCount'>;

/**
 * Cost per month in the subscription's own minor units (fractional for anything that
 * doesn't divide evenly). A one-off charge isn't recurring spend, so it is zero.
 */
export function monthlyCost(sub: Priced): number {
	return (sub.priceMinor * chargesPerYear(periodOfSub(sub))) / 12;
}

/** Cost per year in the subscription's own minor units. Zero for a one-off charge. */
export function yearlyCost(sub: Priced): number {
	return sub.priceMinor * chargesPerYear(periodOfSub(sub));
}

type MoneyPriced = Priced & Pick<Subscription, 'currency'>;

/** Minor units of the subscription's currency → major units of the display currency. */
function inDisplayCurrency(minor: number, sub: MoneyPriced, money: MoneyContext): number | null {
	return convertMajor(toMajor(minor, sub.currency), sub.currency, money.display, money.rates);
}

/** One charge, in major units of the display currency; null when no rate is known. */
export function priceIn(sub: MoneyPriced, money: MoneyContext): number | null {
	return inDisplayCurrency(sub.priceMinor, sub, money);
}

export function monthlyCostIn(sub: MoneyPriced, money: MoneyContext): number | null {
	return inDisplayCurrency(monthlyCost(sub), sub, money);
}

export function yearlyCostIn(sub: MoneyPriced, money: MoneyContext): number | null {
	return inDisplayCurrency(yearlyCost(sub), sub, money);
}

/** Whether a subscription belongs in spend totals and charts. */
export function countsTowardSpend(sub: Priced & Pick<Subscription, 'status'>): boolean {
	return isActive(sub) && periodOfSub(sub) !== null;
}

export interface SpendSummary {
	/** Major units of the display currency. */
	monthly: number;
	yearly: number;
	/** Active recurring subscriptions included in the totals. */
	counted: number;
	/** Subscriptions left out because no exchange rate is known for their currency. */
	excluded: number;
}

export function summarizeSpend(
	subscriptions: (MoneyPriced & Pick<Subscription, 'status'>)[],
	money: MoneyContext
): SpendSummary {
	const summary: SpendSummary = { monthly: 0, yearly: 0, counted: 0, excluded: 0 };
	for (const sub of subscriptions) {
		if (!countsTowardSpend(sub)) continue;

		const monthly = monthlyCostIn(sub, money);
		const yearly = yearlyCostIn(sub, money);
		if (monthly === null || yearly === null) {
			summary.excluded += 1;
			continue;
		}
		summary.monthly += monthly;
		summary.yearly += yearly;
		summary.counted += 1;
	}
	return summary;
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

const MS_PER_DAY = 86_400_000;

/** The n-th occurrence counted from the original date, never from the previous occurrence. */
function occurrenceAt(anchor: Date, period: Period, n: number): Date {
	return period.unit === 'day'
		? new Date(anchor.getTime() + n * period.step * MS_PER_DAY)
		: addMonthsClamped(anchor, n * period.step);
}

/** Index of the first occurrence on or after `from`. */
function firstIndexOnOrAfter(anchor: Date, period: Period, from: Date): number {
	if (anchor >= from) return 0;

	if (period.unit === 'day') {
		return Math.ceil((from.getTime() - anchor.getTime()) / (period.step * MS_PER_DAY));
	}

	const monthsApart =
		(from.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
		(from.getUTCMonth() - anchor.getUTCMonth());

	let n = Math.max(0, Math.floor(monthsApart / period.step));
	while (occurrenceAt(anchor, period, n) < from) n += 1;
	return n;
}

/**
 * Rolls a renewal date forward by whole billing periods until it lands on or after
 * `from`. Every occurrence is computed from the original date rather than the previous
 * one, so a clamped month (Feb) doesn't permanently pull the day earlier.
 *
 * Returns null for a one-off charge that is already in the past: there is no next one.
 */
export function nextOccurrenceOnOrAfter(
	renewalDate: Date | string,
	from: Date,
	cycle: BillingCycle,
	intervalCount = 1
): Date | null {
	const anchor = new Date(renewalDate);
	if (anchor >= from) return anchor;

	const period = periodOf(cycle, intervalCount);
	if (!period) return null;
	return occurrenceAt(anchor, period, firstIndexOnOrAfter(anchor, period, from));
}

/** Every charge date in `[start, end)`, so a weekly plan counts four or five times a month. */
export function occurrencesBetween(
	renewalDate: Date | string,
	start: Date,
	end: Date,
	cycle: BillingCycle,
	intervalCount = 1
): Date[] {
	const anchor = new Date(renewalDate);
	const period = periodOf(cycle, intervalCount);

	if (!period) return anchor >= start && anchor < end ? [anchor] : [];

	const MAX_OCCURRENCES = 1000; // a safety net against a runaway loop on bad input
	const occurrences: Date[] = [];
	let n = firstIndexOnOrAfter(anchor, period, start);
	for (let i = 0; i < MAX_OCCURRENCES; i++, n++) {
		const occurrence = occurrenceAt(anchor, period, n);
		if (occurrence >= end) break;
		occurrences.push(occurrence);
	}
	return occurrences;
}

/** The next charge date for a subscription on or after `from`, or null if there is none. */
export function nextOccurrenceFor(
	sub: Pick<Subscription, 'renewalDate' | 'billingCycle' | 'intervalCount'>,
	from: Date
): Date | null {
	return nextOccurrenceOnOrAfter(
		sub.renewalDate,
		from,
		toBillingCycle(sub.billingCycle),
		sub.intervalCount
	);
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
	return Math.round((renewalDay - today) / MS_PER_DAY);
}

export type Urgency = 'urgent' | 'soon' | 'normal';

export function urgencyFor(days: number): Urgency {
	if (days <= 3) return 'urgent';
	if (days <= 7) return 'soon';
	return 'normal';
}

/** What a reminder is about: the next charge, or the end of a free trial. */
export type ReminderKind = 'renewal' | 'trial';

export interface UpcomingRenewal {
	subscription: Subscription;
	kind: ReminderKind;
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

/** The day a still-running free trial ends (today counts), or null. */
export function trialEndOn(sub: Pick<Subscription, 'trialEndsAt'>, now: Date): Date | null {
	if (!sub.trialEndsAt) return null;
	const trialEnd = new Date(sub.trialEndsAt);
	return trialEnd >= startOfTodayUtc(now) ? trialEnd : null;
}

function sameDay(a: Date, b: Date): boolean {
	return a.getTime() === b.getTime();
}

/**
 * Upcoming events for active subscriptions within `withinDays`, soonest first. A
 * trial ending produces its own "trial" event; when that is also the first charge date
 * only the trial event is reported, so one day never produces two reminders.
 */
export function upcomingWithin(
	subscriptions: Subscription[],
	now: Date,
	withinDays: number
): UpcomingRenewal[] {
	const startOfToday = startOfTodayUtc(now);
	const events: UpcomingRenewal[] = [];

	for (const subscription of subscriptions) {
		if (!isActive(subscription)) continue;

		const trialEnd = trialEndOn(subscription, now);
		const renewal = nextOccurrenceFor(subscription, startOfToday);

		const candidates: { kind: ReminderKind; occurrence: Date }[] = [];
		if (trialEnd) candidates.push({ kind: 'trial', occurrence: trialEnd });
		if (renewal && !(trialEnd && sameDay(trialEnd, renewal))) {
			candidates.push({ kind: 'renewal', occurrence: renewal });
		}

		for (const { kind, occurrence } of candidates) {
			const days = daysUntil(occurrence, now);
			if (days >= 0 && days <= withinDays) {
				events.push({ subscription, kind, occurrence, days, urgency: urgencyFor(days) });
			}
		}
	}

	return events.sort((a, b) => a.days - b.days);
}

export const ALL_FILTER = 'all';

export type SubscriptionSort = 'renewal' | 'price' | 'name';

export interface SubscriptionFilters {
	query: string;
	category: string;
	cycle: BillingCycle | typeof ALL_FILTER;
	status: SubscriptionStatus | typeof ALL_FILTER;
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

/** Filters by name/category text, category, cycle and status, then sorts. Does not mutate the input. */
export function filterAndSortSubscriptions(
	subscriptions: Subscription[],
	filters: SubscriptionFilters,
	now: Date,
	money: MoneyContext
): Subscription[] {
	const query = filters.query.trim().toLowerCase();
	const category = filters.category.toLowerCase();
	const startOfToday = startOfTodayUtc(now);

	// A finished one-off charge has no next date; it sorts after everything else.
	const nextRenewal = (sub: Subscription) =>
		nextOccurrenceFor(sub, startOfToday)?.getTime() ?? Number.MAX_SAFE_INTEGER;

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
		if (filters.status !== ALL_FILTER && toSubscriptionStatus(sub.status) !== filters.status) {
			return false;
		}
		return true;
	});

	switch (filters.sortBy) {
		case 'price': {
			// Compared in the display currency; subscriptions without a rate sort last.
			// (A finite sentinel, so two unconvertible items compare equal rather than as NaN.)
			const cost = (sub: Subscription) => monthlyCostIn(sub, money) ?? -Number.MAX_VALUE;
			return matches.sort((a, b) => cost(b) - cost(a));
		}
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
function isSuppressed(
	acked: Date | null,
	snoozedUntil: Date | null,
	occurrence: Date,
	now: Date
): boolean {
	if (!acked || new Date(acked).getTime() !== occurrence.getTime()) return false;
	if (snoozedUntil && now >= new Date(snoozedUntil)) return false;
	return true;
}

/** Whether the renewal reminder for the next charge should currently be shown. */
export function reminderIsActive(subscription: Subscription, now: Date): boolean {
	const occurrence = nextOccurrenceFor(subscription, startOfTodayUtc(now));
	if (!occurrence) return false;

	return !isSuppressed(
		subscription.reminderAckedOccurrence,
		subscription.reminderSnoozedUntil,
		occurrence,
		now
	);
}

/** Same as {@link reminderIsActive}, for either kind of event. */
export function eventReminderIsActive(
	event: Pick<UpcomingRenewal, 'subscription' | 'kind' | 'occurrence'>,
	now: Date
): boolean {
	const { subscription, kind, occurrence } = event;
	return kind === 'trial'
		? !isSuppressed(subscription.trialAckedAt, subscription.trialSnoozedUntil, occurrence, now)
		: !isSuppressed(
				subscription.reminderAckedOccurrence,
				subscription.reminderSnoozedUntil,
				occurrence,
				now
			);
}
