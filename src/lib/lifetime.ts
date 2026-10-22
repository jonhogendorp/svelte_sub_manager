import type { Subscription } from '../../generated/prisma/client';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { toSubscriptionStatus, yearlyCost } from './subscriptions';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

type Lifetime = Pick<
	Subscription,
	| 'priceMinor'
	| 'billingCycle'
	| 'intervalCount'
	| 'status'
	| 'startedOn'
	| 'trialEndsAt'
	| 'cancelledAt'
>;

/**
 * Roughly what has been paid since signing up, in minor units of the subscription's own
 * currency: the yearly cost spread over the time between the start (or the end of a free
 * trial, if later) and today, or the cancellation date. It uses today's price and ignores
 * price changes, so treat it as an estimate. Null when the start is unknown, the plan is
 * one-off, paused, or cancelled without a date.
 */
export function lifetimeCostMinor(subscription: Lifetime, now: Date): number | null {
	if (!subscription.startedOn) return null;

	const status = toSubscriptionStatus(subscription.status);
	if (status === 'paused') return null;
	if (status === 'cancelled' && !subscription.cancelledAt) return null;

	let start = new Date(subscription.startedOn).getTime();
	if (subscription.trialEndsAt) {
		start = Math.max(start, new Date(subscription.trialEndsAt).getTime());
	}

	const end =
		status === 'cancelled' && subscription.cancelledAt
			? new Date(subscription.cancelledAt).getTime()
			: now.getTime();
	const elapsedDays = Math.max(0, (end - start) / MS_PER_DAY);

	const yearly = yearlyCost(subscription);
	return yearly === 0 ? null : Math.round((yearly * elapsedDays) / DAYS_PER_YEAR);
}

export interface LifetimeRow {
	subscription: Subscription;
	/** Major units of the display currency. */
	total: number;
}

export interface LifetimeSummary {
	rows: LifetimeRow[];
	total: number;
}

/** Estimated lifetime cost per subscription in the display currency, biggest first. */
export function lifetimeSummary(
	subscriptions: Subscription[],
	now: Date,
	money: MoneyContext
): LifetimeSummary {
	const rows: LifetimeRow[] = [];
	for (const subscription of subscriptions) {
		const minor = lifetimeCostMinor(subscription, now);
		if (minor === null) continue;

		const total = convertMajor(
			toMajor(minor, subscription.currency),
			subscription.currency,
			money.display,
			money.rates
		);
		if (total !== null) rows.push({ subscription, total });
	}
	rows.sort((a, b) => b.total - a.total);
	return { rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
}
