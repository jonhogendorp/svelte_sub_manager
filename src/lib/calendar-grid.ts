import type { Subscription } from '../../generated/prisma/client';
import type { MoneyContext } from './money';
import { isActive, fullPriceIn, occurrencesBetween, toBillingCycle } from './subscriptions';

export interface CalendarCharge {
	subscription: Subscription;
	/** A free trial ending, or a regular charge. */
	kind: 'renewal' | 'trial';
	/** Major units of the display currency; null when no exchange rate is known. */
	amount: number | null;
}

export interface CalendarDay {
	/** UTC midnight of the day, matching how renewal dates are stored. */
	date: Date;
	/** Whether the day belongs to the month being shown (the grid also shows its neighbours). */
	inMonth: boolean;
	charges: CalendarCharge[];
	/** Sum of the known amounts, in major units of the display currency. */
	total: number;
}

const MS_PER_DAY = 86_400_000;

const dayKey = (date: Date): number =>
	Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/**
 * The weeks (Monday first) covering a month, with what is charged on each day. `month` is
 * 0-based. Every occurrence is expanded from the renewal date and cycle, so a weekly plan
 * shows up every week. Paused and cancelled subscriptions are left out. When a trial ends on
 * the day of the first charge only the trial is shown, like in the reminders.
 */
export function monthGrid(
	subscriptions: Subscription[],
	year: number,
	month: number,
	money: MoneyContext
): CalendarDay[][] {
	const first = new Date(Date.UTC(year, month, 1));
	const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const leading = (first.getUTCDay() + 6) % 7;
	const weekCount = Math.ceil((leading + daysInMonth) / 7);

	const start = new Date(first.getTime() - leading * MS_PER_DAY);
	const end = new Date(start.getTime() + weekCount * 7 * MS_PER_DAY);

	const days = new Map<number, CalendarDay>();
	for (let i = 0; i < weekCount * 7; i++) {
		const date = new Date(start.getTime() + i * MS_PER_DAY);
		days.set(date.getTime(), {
			date,
			inMonth: date.getUTCMonth() === month,
			charges: [],
			total: 0
		});
	}

	const add = (date: Date, subscription: Subscription, kind: CalendarCharge['kind']) => {
		const day = days.get(dayKey(date));
		if (!day) return;
		// The calendar shows what the card is charged, so the full price rather than your share.
		const amount = fullPriceIn(subscription, money);
		day.charges.push({ subscription, kind, amount });
		day.total += amount ?? 0;
	};

	for (const subscription of subscriptions) {
		if (!isActive(subscription)) continue;

		const trialEnd = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
		const trialDay = trialEnd ? dayKey(trialEnd) : null;
		if (trialEnd && trialEnd >= start && trialEnd < end) add(trialEnd, subscription, 'trial');

		for (const occurrence of occurrencesBetween(
			subscription.renewalDate,
			start,
			end,
			toBillingCycle(subscription.billingCycle),
			subscription.intervalCount
		)) {
			if (dayKey(occurrence) !== trialDay) add(occurrence, subscription, 'renewal');
		}
	}

	const weeks: CalendarDay[][] = [];
	const ordered = [...days.values()];
	for (let w = 0; w < weekCount; w++) weeks.push(ordered.slice(w * 7, w * 7 + 7));
	return weeks;
}
