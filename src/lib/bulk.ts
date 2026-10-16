import type { Subscription } from '../../generated/prisma/client';
import { toSubscriptionStatus, type SubscriptionStatus } from './subscriptions';

/** Upper bound on one bulk request, so a crafted form can't build an enormous query. */
export const MAX_BULK_IDS = 500;

/** The distinct, non-empty `id` fields of a bulk form, or an error message. */
export function parseBulkIds(formData: FormData): { ids: string[] } | { error: string } {
	const ids = [...new Set(formData.getAll('id').map((value) => String(value).trim()))].filter(
		(id) => id !== ''
	);
	if (ids.length === 0) return { error: 'Select at least one subscription.' };
	if (ids.length > MAX_BULK_IDS) {
		return { error: `Please change at most ${MAX_BULK_IDS} subscriptions at once.` };
	}
	return { ids };
}

/**
 * The ids of the subscriptions that would actually change when set to `target`, grouped by the
 * status they have now. Undoing a bulk change restores each group to its own status.
 */
export function groupByPreviousStatus(
	subscriptions: Pick<Subscription, 'id' | 'status'>[],
	target: SubscriptionStatus
): Map<SubscriptionStatus, string[]> {
	const groups = new Map<SubscriptionStatus, string[]>();
	for (const { id, status } of subscriptions) {
		const previous = toSubscriptionStatus(status);
		if (previous === target) continue;
		groups.set(previous, [...(groups.get(previous) ?? []), id]);
	}
	return groups;
}

const PAST_TENSE: Record<SubscriptionStatus, string> = {
	active: 'Resumed',
	paused: 'Paused',
	cancelled: 'Marked as cancelled'
};

/** "Paused 3 subscriptions." */
export function describeBulkStatus(count: number, status: SubscriptionStatus): string {
	return `${PAST_TENSE[status]} ${count} ${count === 1 ? 'subscription' : 'subscriptions'}.`;
}
