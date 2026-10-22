import type { Subscription } from '../../generated/prisma/client';
import type { MoneyContext } from './money';
import { toSubscriptionStatus, yearlyCostIn } from './subscriptions';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/**
 * What `cancelledAt` should become when a subscription's status changes: `now` when it
 * becomes cancelled, `null` when it stops being cancelled, `undefined` to leave it alone
 * (so a repeated "cancel" keeps the original date).
 */
export function cancellationChange(
	previous: unknown,
	next: unknown,
	now: Date
): Date | null | undefined {
	const wasCancelled = toSubscriptionStatus(previous) === 'cancelled';
	const isCancelled = toSubscriptionStatus(next) === 'cancelled';
	if (isCancelled && !wasCancelled) return now;
	if (!isCancelled && wasCancelled) return null;
	return undefined;
}

type Cancelled = Pick<
	Subscription,
	| 'priceMinor'
	| 'shareCount'
	| 'currency'
	| 'billingCycle'
	| 'intervalCount'
	| 'status'
	| 'cancelledAt'
>;

/**
 * What a cancelled subscription would have cost since it was cancelled, in major units of the
 * display currency. Null when it isn't cancelled, has no date, is a one-off, or has no known rate.
 */
export function savedSoFar(subscription: Cancelled, now: Date, money: MoneyContext): number | null {
	if (toSubscriptionStatus(subscription.status) !== 'cancelled' || !subscription.cancelledAt) {
		return null;
	}

	const yearly = yearlyCostIn(subscription, money);
	if (yearly === null) return null;

	const elapsedDays = Math.max(
		0,
		(now.getTime() - new Date(subscription.cancelledAt).getTime()) / MS_PER_DAY
	);
	return (yearly * elapsedDays) / DAYS_PER_YEAR;
}

export interface LedgerSummary {
	/** Total not spent since the cancellations, in major units of the display currency. */
	savedSoFar: number;
	/** Cancelled subscriptions with a known date that are included in the total. */
	counted: number;
	/** Cancelled subscriptions with no recorded date, so nothing can be said about them. */
	undated: number;
}

export function ledgerSummary(
	subscriptions: Cancelled[],
	now: Date,
	money: MoneyContext
): LedgerSummary {
	const summary: LedgerSummary = { savedSoFar: 0, counted: 0, undated: 0 };
	for (const subscription of subscriptions) {
		if (toSubscriptionStatus(subscription.status) !== 'cancelled') continue;
		if (!subscription.cancelledAt) {
			summary.undated += 1;
			continue;
		}

		const saved = savedSoFar(subscription, now, money);
		if (saved === null) continue;
		summary.savedSoFar += saved;
		summary.counted += 1;
	}
	return summary;
}
