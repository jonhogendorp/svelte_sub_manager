import type { Subscription } from '../../generated/prisma/client';
import type { MoneyContext } from './money';
import { countsTowardSpend, yearlyCostIn } from './subscriptions';

export const USAGE_RATINGS = [1, 2, 3, 4, 5] as const;

export type UsageRating = (typeof USAGE_RATINGS)[number];

export const USAGE_RATING_LABELS: Record<UsageRating, string> = {
	1: 'Barely use it',
	2: 'Rarely use it',
	3: 'Sometimes',
	4: 'Often',
	5: 'Use it constantly'
};

/** Ratings up to this one count as low value. */
export const LOW_VALUE_MAX_RATING = 2;

/** The rating as a valid 1–5 value, or null when unrated or out of range. */
export function toUsageRating(value: unknown): UsageRating | null {
	return USAGE_RATINGS.find((rating) => rating === value) ?? null;
}

export interface CancellationCandidate {
	subscription: Subscription;
	rating: UsageRating;
	/** Major units of the display currency. */
	yearly: number;
}

export interface ValueReview {
	/** Low-rated recurring subscriptions, most expensive first. */
	candidates: CancellationCandidate[];
	/** Yearly cost of all candidates, in major units of the display currency. */
	candidatesYearly: number;
	/** Active recurring subscriptions that haven't been rated yet. */
	unrated: number;
}

/**
 * Flags active recurring subscriptions rated as low value, costliest first, so the biggest
 * savings come up first. Those without a known exchange rate can't be ranked and are left out.
 */
export function reviewValue(subscriptions: Subscription[], money: MoneyContext): ValueReview {
	const candidates: CancellationCandidate[] = [];
	let unrated = 0;

	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;

		const rating = toUsageRating(subscription.usageRating);
		if (rating === null) {
			unrated += 1;
			continue;
		}
		if (rating > LOW_VALUE_MAX_RATING) continue;

		const yearly = yearlyCostIn(subscription, money);
		if (yearly === null) continue;
		candidates.push({ subscription, rating, yearly });
	}

	candidates.sort((a, b) => b.yearly - a.yearly);
	return {
		candidates,
		candidatesYearly: candidates.reduce((sum, candidate) => sum + candidate.yearly, 0),
		unrated
	};
}
