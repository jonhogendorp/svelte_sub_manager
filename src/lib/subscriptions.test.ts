import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import {
	daysUntil,
	monthlyCost,
	nextOccurrenceOnOrAfter,
	reminderIsActive,
	toBillingCycle,
	upcomingWithin,
	urgencyFor,
	yearlyCost
} from './subscriptions';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		price: 15.99,
		category: 'Streaming',
		renewalDate: new Date('2026-10-12'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		...overrides
	};
}

describe('toBillingCycle', () => {
	it.each([
		['yearly', 'yearly'],
		['monthly', 'monthly'],
		['weekly', 'monthly'],
		[null, 'monthly'],
		[undefined, 'monthly'],
		[42, 'monthly']
	])('narrows %s to %s', (input, expected) => {
		expect(toBillingCycle(input)).toBe(expected);
	});
});

describe('cost conversion', () => {
	it('leaves a monthly subscription untouched per month', () => {
		const sub = makeSubscription({ price: 12, billingCycle: 'monthly' });
		expect(monthlyCost(sub)).toBe(12);
		expect(yearlyCost(sub)).toBe(144);
	});

	it('spreads a yearly subscription across twelve months', () => {
		const sub = makeSubscription({ price: 120, billingCycle: 'yearly' });
		expect(monthlyCost(sub)).toBe(10);
		expect(yearlyCost(sub)).toBe(120);
	});
});

describe('nextOccurrenceOnOrAfter', () => {
	it('keeps an occurrence that already sits on the boundary', () => {
		const result = nextOccurrenceOnOrAfter('2026-10-12', new Date('2026-10-12'), 'monthly');
		expect(result.toISOString().slice(0, 10)).toBe('2026-10-12');
	});

	it('rolls a monthly subscription forward one month at a time', () => {
		const result = nextOccurrenceOnOrAfter('2026-10-12', new Date('2026-12-20'), 'monthly');
		expect(result.toISOString().slice(0, 10)).toBe('2027-01-12');
	});

	it('rolls a yearly subscription a full year, not a month', () => {
		const result = nextOccurrenceOnOrAfter('2026-03-01', new Date('2026-10-01'), 'yearly');
		expect(result.toISOString().slice(0, 10)).toBe('2027-03-01');
	});

	it('crosses a year boundary for monthly subscriptions', () => {
		const result = nextOccurrenceOnOrAfter('2025-11-30', new Date('2026-01-15'), 'monthly');
		expect(result.getUTCFullYear()).toBe(2026);
	});
});

describe('daysUntil', () => {
	it('returns 0 for a renewal landing today', () => {
		expect(daysUntil('2026-10-12', new Date(2026, 9, 12, 23, 30))).toBe(0);
	});

	it('is unaffected by the time of day', () => {
		const early = daysUntil('2026-10-15', new Date(2026, 9, 12, 0, 1));
		const late = daysUntil('2026-10-15', new Date(2026, 9, 12, 23, 59));
		expect(early).toBe(3);
		expect(late).toBe(3);
	});

	it('survives a spring-forward DST transition', () => {
		// Europe/Amsterdam springs forward on 2026-03-29.
		expect(daysUntil('2026-03-30', new Date(2026, 2, 27))).toBe(3);
	});

	it('goes negative for a past renewal', () => {
		expect(daysUntil('2026-10-01', new Date(2026, 9, 12))).toBe(-11);
	});
});

describe('urgencyFor', () => {
	it.each([
		[0, 'urgent'],
		[3, 'urgent'],
		[4, 'soon'],
		[7, 'soon'],
		[8, 'normal'],
		[30, 'normal']
	])('maps %i days to %s', (days, expected) => {
		expect(urgencyFor(days)).toBe(expected);
	});
});

describe('upcomingWithin', () => {
	const now = new Date(2026, 9, 12); // 12 Oct 2026, local

	it('includes a renewal due today and sorts by proximity', () => {
		const result = upcomingWithin(
			[
				makeSubscription({ id: 'later', renewalDate: new Date('2026-10-20') }),
				makeSubscription({ id: 'today', renewalDate: new Date('2026-10-12') })
			],
			now,
			30
		);

		expect(result.map((r) => r.subscription.id)).toEqual(['today', 'later']);
		expect(result[0].days).toBe(0);
		expect(result[0].urgency).toBe('urgent');
	});

	it('excludes renewals beyond the window', () => {
		const result = upcomingWithin(
			[makeSubscription({ renewalDate: new Date('2026-12-01') })],
			now,
			30
		);
		expect(result).toHaveLength(0);
	});

	it('rolls a stale past date forward instead of dropping it', () => {
		const result = upcomingWithin(
			[makeSubscription({ renewalDate: new Date('2025-10-14') })],
			now,
			30
		);
		expect(result).toHaveLength(1);
		expect(result[0].occurrence.toISOString().slice(0, 10)).toBe('2026-10-14');
	});

	it('does not surface a yearly subscription whose next charge is months away', () => {
		const result = upcomingWithin(
			[makeSubscription({ renewalDate: new Date('2026-03-01'), billingCycle: 'yearly' })],
			now,
			30
		);
		expect(result).toHaveLength(0);
	});
});

describe('reminderIsActive', () => {
	const now = new Date(2026, 9, 12);
	const currentOccurrence = new Date('2026-10-14');

	it('is active when nothing has been acknowledged', () => {
		const sub = makeSubscription({ renewalDate: currentOccurrence });
		expect(reminderIsActive(sub, now)).toBe(true);
	});

	it('is suppressed once the current occurrence is dismissed', () => {
		const sub = makeSubscription({
			renewalDate: currentOccurrence,
			reminderAckedOccurrence: currentOccurrence
		});
		expect(reminderIsActive(sub, now)).toBe(false);
	});

	it('stays suppressed while a snooze is still running', () => {
		const sub = makeSubscription({
			renewalDate: currentOccurrence,
			reminderAckedOccurrence: currentOccurrence,
			reminderSnoozedUntil: new Date(2026, 9, 13)
		});
		expect(reminderIsActive(sub, now)).toBe(false);
	});

	it('revives once the snooze has expired', () => {
		const sub = makeSubscription({
			renewalDate: currentOccurrence,
			reminderAckedOccurrence: currentOccurrence,
			reminderSnoozedUntil: new Date(2026, 9, 11)
		});
		expect(reminderIsActive(sub, now)).toBe(true);
	});

	it('revives by itself when the renewal rolls to the next period', () => {
		// Acknowledged last month; the upcoming occurrence is a different date.
		const sub = makeSubscription({
			renewalDate: new Date('2026-10-14'),
			reminderAckedOccurrence: new Date('2026-09-14')
		});
		expect(reminderIsActive(sub, now)).toBe(true);
	});
});
