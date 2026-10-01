import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import type { MoneyContext } from './money';
import {
	eventReminderIsActive,
	nextOccurrenceOnOrAfter,
	occurrencesBetween,
	reminderIsActive,
	summarizeSpend,
	trialEndOn,
	upcomingWithin
} from './subscriptions';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		priceMinor: 1599,
		currency: 'EUR',
		category: 'Streaming',
		renewalDate: new Date('2026-10-12'),
		billingCycle: 'monthly',
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		...overrides
	};
}

/** `YYYY-MM-DD` of a date, or null when there is none. */
const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

describe('nextOccurrenceOnOrAfter by cycle', () => {
	it('steps a weekly subscription in sevens', () => {
		// 1 Oct 2026 is a Thursday; the next Thursdays are 8, 15, 22 Oct.
		const result = nextOccurrenceOnOrAfter('2026-10-01', new Date('2026-10-12'), 'weekly');
		expect(isoDay(result)).toBe('2026-10-15');
	});

	it('keeps a weekly occurrence that lands exactly on the boundary', () => {
		const result = nextOccurrenceOnOrAfter('2026-10-01', new Date('2026-10-15'), 'weekly');
		expect(isoDay(result)).toBe('2026-10-15');
	});

	it('stays on the same weekday across a daylight-saving change', () => {
		// Europe/Amsterdam falls back on 2026-10-25; dates are UTC so the weekday must not move.
		const result = nextOccurrenceOnOrAfter('2026-10-02', new Date('2026-11-01'), 'weekly');
		expect(isoDay(result)).toBe('2026-11-06');
		expect(result?.getUTCDay()).toBe(new Date('2026-10-02').getUTCDay());
	});

	it('clamps a quarterly 31st instead of drifting', () => {
		const february = nextOccurrenceOnOrAfter('2026-01-31', new Date('2026-02-10'), 'quarterly');
		expect(isoDay(february)).toBe('2026-04-30');

		const may = nextOccurrenceOnOrAfter('2026-01-31', new Date('2026-05-01'), 'quarterly');
		expect(isoDay(may)).toBe('2026-07-31');
	});

	it('steps a custom cycle by its own interval', () => {
		const everyTwo = nextOccurrenceOnOrAfter('2026-01-15', new Date('2026-02-01'), 'custom', 2);
		expect(isoDay(everyTwo)).toBe('2026-03-15');

		const everyFive = nextOccurrenceOnOrAfter('2026-01-15', new Date('2026-04-01'), 'custom', 5);
		expect(isoDay(everyFive)).toBe('2026-06-15');
	});

	it('reads a custom cycle with a bad interval as monthly', () => {
		const result = nextOccurrenceOnOrAfter('2026-01-15', new Date('2026-02-01'), 'custom', 0);
		expect(isoDay(result)).toBe('2026-02-15');
	});

	it('returns a future one-off date as is', () => {
		const result = nextOccurrenceOnOrAfter('2026-12-01', new Date('2026-10-12'), 'once');
		expect(isoDay(result)).toBe('2026-12-01');
	});

	it('counts a one-off dated today as still to come', () => {
		const result = nextOccurrenceOnOrAfter('2026-10-12', new Date('2026-10-12'), 'once');
		expect(isoDay(result)).toBe('2026-10-12');
	});

	it('returns null for a one-off that has already happened', () => {
		expect(nextOccurrenceOnOrAfter('2026-10-01', new Date('2026-10-12'), 'once')).toBeNull();
	});
});

describe('occurrencesBetween', () => {
	const start = new Date('2026-10-01');
	const end = new Date('2026-11-01');
	const days = (dates: Date[]) => dates.map((d) => isoDay(d));

	it('lists every weekly charge in the range', () => {
		expect(days(occurrencesBetween('2026-10-02', start, end, 'weekly'))).toEqual([
			'2026-10-02',
			'2026-10-09',
			'2026-10-16',
			'2026-10-23',
			'2026-10-30'
		]);
	});

	it('finds weekly charges for an anchor long in the past', () => {
		expect(days(occurrencesBetween('2024-01-05', start, end, 'weekly'))).toEqual([
			'2026-10-02',
			'2026-10-09',
			'2026-10-16',
			'2026-10-23',
			'2026-10-30'
		]);
	});

	it('treats the end of the range as exclusive', () => {
		expect(days(occurrencesBetween('2026-10-30', start, end, 'weekly'))).toEqual(['2026-10-30']);
		expect(days(occurrencesBetween('2026-10-04', start, end, 'weekly'))).toEqual([
			'2026-10-04',
			'2026-10-11',
			'2026-10-18',
			'2026-10-25'
		]);
	});

	it('lists one monthly charge, and a quarterly one only in its month', () => {
		expect(days(occurrencesBetween('2026-03-15', start, end, 'monthly'))).toEqual(['2026-10-15']);
		expect(occurrencesBetween('2026-03-15', start, end, 'quarterly')).toEqual([]);
		expect(days(occurrencesBetween('2026-01-15', start, end, 'quarterly'))).toEqual(['2026-10-15']);
	});

	it('lists nothing for a recurring plan that starts after the range', () => {
		expect(occurrencesBetween('2026-12-01', start, end, 'weekly')).toEqual([]);
	});

	it('lists a one-off charge once, only when it falls inside the range', () => {
		expect(days(occurrencesBetween('2026-10-20', start, end, 'once'))).toEqual(['2026-10-20']);
		expect(occurrencesBetween('2026-09-20', start, end, 'once')).toEqual([]);
		expect(occurrencesBetween('2026-11-20', start, end, 'once')).toEqual([]);
	});
});

describe('summarizeSpend by status and cycle', () => {
	const money: MoneyContext = { display: 'EUR', rates: { EUR: 1 } };

	it('ignores paused, cancelled and one-off subscriptions', () => {
		const summary = summarizeSpend(
			[
				makeSubscription({ id: 'a', priceMinor: 1000 }),
				makeSubscription({ id: 'b', priceMinor: 1000, status: 'paused' }),
				makeSubscription({ id: 'c', priceMinor: 1000, status: 'cancelled' }),
				makeSubscription({ id: 'd', priceMinor: 9000, billingCycle: 'once' })
			],
			money
		);

		expect(summary).toEqual({ monthly: 10, yearly: 120, counted: 1, excluded: 0 });
	});

	it('does not report an inactive subscription as "excluded"', () => {
		const summary = summarizeSpend(
			[makeSubscription({ priceMinor: 1000, currency: 'CHF', status: 'paused' })],
			money
		);
		expect(summary.excluded).toBe(0);
	});

	it('includes weekly and quarterly plans in their monthly equivalent', () => {
		const summary = summarizeSpend(
			[
				makeSubscription({ id: 'w', priceMinor: 1200, billingCycle: 'weekly' }),
				makeSubscription({ id: 'q', priceMinor: 3000, billingCycle: 'quarterly' })
			],
			money
		);

		expect(summary.monthly).toBeCloseTo((12 * 52) / 12 + 10);
		expect(summary.counted).toBe(2);
	});
});

describe('trialEndOn', () => {
	const now = new Date(2026, 9, 12);

	it('is null without a trial', () => {
		expect(trialEndOn(makeSubscription(), now)).toBeNull();
	});

	it('returns a trial ending today or later', () => {
		const today = makeSubscription({ trialEndsAt: new Date('2026-10-12') });
		expect(isoDay(trialEndOn(today, now))).toBe('2026-10-12');

		const later = makeSubscription({ trialEndsAt: new Date('2026-11-01') });
		expect(isoDay(trialEndOn(later, now))).toBe('2026-11-01');
	});

	it('is null once the trial is over', () => {
		expect(trialEndOn(makeSubscription({ trialEndsAt: new Date('2026-10-11') }), now)).toBeNull();
	});
});

describe('upcomingWithin: status, trials and one-off charges', () => {
	const now = new Date(2026, 9, 12);

	it('skips paused and cancelled subscriptions', () => {
		const renewalDate = new Date('2026-10-14');
		const result = upcomingWithin(
			[
				makeSubscription({ id: 'active', renewalDate }),
				makeSubscription({ id: 'paused', renewalDate, status: 'paused' }),
				makeSubscription({ id: 'gone', renewalDate, status: 'cancelled' })
			],
			now,
			30
		);
		expect(result.map((e) => e.subscription.id)).toEqual(['active']);
	});

	it('reports a trial ending as its own event', () => {
		const result = upcomingWithin(
			[
				makeSubscription({
					renewalDate: new Date('2026-10-25'),
					trialEndsAt: new Date('2026-10-15')
				})
			],
			now,
			30
		);

		expect(result.map((e) => [e.kind, isoDay(e.occurrence)])).toEqual([
			['trial', '2026-10-15'],
			['renewal', '2026-10-25']
		]);
	});

	it('reports only the trial when it ends on the first charge date', () => {
		const result = upcomingWithin(
			[
				makeSubscription({
					renewalDate: new Date('2026-10-15'),
					trialEndsAt: new Date('2026-10-15')
				})
			],
			now,
			30
		);
		expect(result.map((e) => e.kind)).toEqual(['trial']);
	});

	it('ignores a trial that is already over', () => {
		const result = upcomingWithin(
			[
				makeSubscription({
					renewalDate: new Date('2026-10-20'),
					trialEndsAt: new Date('2026-10-01')
				})
			],
			now,
			30
		);
		expect(result.map((e) => e.kind)).toEqual(['renewal']);
	});

	it('includes a future one-off charge but not a finished one', () => {
		const result = upcomingWithin(
			[
				makeSubscription({ id: 'soon', billingCycle: 'once', renewalDate: new Date('2026-10-20') }),
				makeSubscription({ id: 'done', billingCycle: 'once', renewalDate: new Date('2026-09-01') })
			],
			now,
			30
		);
		expect(result.map((e) => e.subscription.id)).toEqual(['soon']);
	});

	it('finds the next weekly charge', () => {
		const result = upcomingWithin(
			[makeSubscription({ billingCycle: 'weekly', renewalDate: new Date('2026-10-01') })],
			now,
			30
		);
		expect(isoDay(result[0].occurrence)).toBe('2026-10-15');
		expect(result[0].days).toBe(3);
	});

	it('orders trial and renewal events by date across subscriptions', () => {
		const result = upcomingWithin(
			[
				makeSubscription({ id: 'a', renewalDate: new Date('2026-10-20') }),
				makeSubscription({
					id: 'b',
					renewalDate: new Date('2026-10-30'),
					trialEndsAt: new Date('2026-10-14')
				})
			],
			now,
			30
		);
		expect(result.map((e) => `${e.subscription.id}:${e.kind}`)).toEqual([
			'b:trial',
			'a:renewal',
			'b:renewal'
		]);
	});
});

describe('trial reminders', () => {
	const now = new Date(2026, 9, 12);
	const trialEnd = new Date('2026-10-15');
	const trialSub = (overrides: Partial<Subscription> = {}) =>
		makeSubscription({ renewalDate: new Date('2026-10-25'), trialEndsAt: trialEnd, ...overrides });
	const trialEvent = (subscription: Subscription) => ({
		subscription,
		kind: 'trial' as const,
		occurrence: trialEnd
	});

	it('is active until acknowledged', () => {
		expect(eventReminderIsActive(trialEvent(trialSub()), now)).toBe(true);
	});

	it('is suppressed once the trial reminder is dismissed', () => {
		const dismissed = trialSub({ trialAckedAt: trialEnd });
		expect(eventReminderIsActive(trialEvent(dismissed), now)).toBe(false);
	});

	it('stays suppressed during a snooze and revives when it ends', () => {
		const snoozed = trialSub({ trialAckedAt: trialEnd, trialSnoozedUntil: new Date(2026, 9, 13) });
		expect(eventReminderIsActive(trialEvent(snoozed), now)).toBe(false);

		const expired = trialSub({ trialAckedAt: trialEnd, trialSnoozedUntil: new Date(2026, 9, 11) });
		expect(eventReminderIsActive(trialEvent(expired), now)).toBe(true);
	});

	it('does not share its acknowledgement with the renewal reminder', () => {
		// Dismissing the trial reminder leaves the later renewal reminder alone…
		const dismissedTrial = trialSub({ trialAckedAt: trialEnd });
		const renewal = {
			subscription: dismissedTrial,
			kind: 'renewal' as const,
			occurrence: new Date('2026-10-25')
		};
		expect(eventReminderIsActive(renewal, now)).toBe(true);

		// …and dismissing the renewal reminder leaves the trial reminder alone.
		const dismissedRenewal = trialSub({ reminderAckedOccurrence: new Date('2026-10-25') });
		expect(eventReminderIsActive(trialEvent(dismissedRenewal), now)).toBe(true);
	});

	it('revives for a different trial end date', () => {
		const sub = trialSub({ trialAckedAt: new Date('2026-10-01') });
		expect(eventReminderIsActive(trialEvent(sub), now)).toBe(true);
	});
});

describe('reminderIsActive for a one-off charge', () => {
	it('has nothing to remind about once the charge has happened', () => {
		const sub = makeSubscription({ billingCycle: 'once', renewalDate: new Date('2026-09-01') });
		expect(reminderIsActive(sub, new Date(2026, 9, 12))).toBe(false);
	});
});
