import type { Subscription } from '../../generated/prisma/client';
import { daysUntil, isActive, nextOccurrenceFor } from './subscriptions';

export const MAX_NOTICE_DAYS = 365;
export const MAX_URL_LENGTH = 2000;

/** A web address that is safe to link to: http(s) only, so `javascript:` can never end up in an href. */
export function toCancelUrl(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const url = new URL(value.trim());
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

export interface NoticeDeadline {
	/** The last day to give notice. */
	by: Date;
	/** Days from today until then; negative when it has passed. */
	days: number;
	/** The charge the notice is meant to stop. */
	renewal: Date;
}

const MS_PER_DAY = 86_400_000;

/**
 * The last day to cancel before the next charge, for subscriptions that require notice. Null
 * when no notice period is set, the subscription isn't active, or nothing is due again.
 */
export function noticeDeadline(
	subscription: Pick<
		Subscription,
		'renewalDate' | 'billingCycle' | 'intervalCount' | 'status' | 'cancelNoticeDays'
	>,
	now: Date
): NoticeDeadline | null {
	if (!subscription.cancelNoticeDays || !isActive(subscription)) return null;

	const startOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const renewal = nextOccurrenceFor(subscription, startOfToday);
	if (!renewal) return null;

	const by = new Date(renewal.getTime() - subscription.cancelNoticeDays * MS_PER_DAY);
	return { by, days: daysUntil(by, now), renewal };
}
