import type { PriceChange } from '../../generated/prisma/client';

/** How long after a price rise it is still flagged on the subscription. */
export const PRICE_INCREASE_WINDOW_DAYS = 90;

const MS_PER_DAY = 86_400_000;

type Change = Pick<PriceChange, 'oldMinor' | 'newMinor' | 'currency' | 'changedAt'>;

/** The price changes of one subscription, newest first. Does not mutate the input. */
export function changesFor<T extends Change & Pick<PriceChange, 'subscriptionId'>>(
	changes: T[],
	subscriptionId: string
): T[] {
	return changes
		.filter((change) => change.subscriptionId === subscriptionId)
		.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
}

export interface PriceIncrease {
	fromMinor: number;
	toMinor: number;
	currency: string;
	changedAt: Date;
}

/**
 * The price rise worth flagging: only the most recent change counts, so a rise that was
 * later reversed isn't reported, and only while it is still recent.
 */
export function recentIncrease(
	changes: Change[],
	now: Date,
	windowDays = PRICE_INCREASE_WINDOW_DAYS
): PriceIncrease | null {
	const cutoff = now.getTime() - windowDays * MS_PER_DAY;

	const latest = [...changes].sort(
		(a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
	)[0];

	if (!latest) return null;
	const changedAt = new Date(latest.changedAt);
	if (changedAt.getTime() < cutoff || latest.newMinor <= latest.oldMinor) return null;

	return {
		fromMinor: latest.oldMinor,
		toMinor: latest.newMinor,
		currency: latest.currency,
		changedAt
	};
}
