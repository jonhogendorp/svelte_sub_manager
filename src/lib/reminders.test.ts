import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { buildDigest, dueReminders, toReminderDays } from './reminders';

const now = new Date(2026, 9, 22); // 22 October 2026

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'Netflix',
		priceMinor: 1599,
		currency: 'EUR',
		category: 'Streaming',
		renewalDate: new Date('2026-10-24'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		accountEmail: null,
		paymentMethod: null,
		notes: null,
		usageRating: null,
		cancelledAt: null,
		yearlyPriceMinor: null,
		cancelUrl: null,
		cancelNoticeDays: null,
		startedOn: null,
		shareCount: 1,
		sharedWith: null,
		businessPercent: 0,
		...overrides
	};
}

const none = new Set<string>();

describe('toReminderDays', () => {
	it('accepts 1 to 14 and defaults to 3', () => {
		expect(toReminderDays(7)).toBe(7);
		expect(toReminderDays('5')).toBe(5);
		for (const value of [0, 15, 2.5, 'x', null, undefined]) expect(toReminderDays(value)).toBe(3);
	});
});

describe('dueReminders', () => {
	it('includes a renewal inside the window, with the full price', () => {
		const [reminder] = dueReminders([sub({ shareCount: 2 })], now, 3, none);

		expect(reminder).toMatchObject({
			key: 'renewal:a:2026-10-24',
			kind: 'renewal',
			days: 2
		});
		expect(reminder.line).toBe('Netflix renews in 2 days (2026-10-24) for €15.99.');
	});

	it('leaves out renewals beyond the window and inactive subscriptions', () => {
		const result = dueReminders(
			[
				sub({ id: 'far', renewalDate: new Date('2026-11-20') }),
				sub({ id: 'paused', status: 'paused' }),
				sub({ id: 'cancelled', status: 'cancelled' })
			],
			now,
			3,
			none
		);
		expect(result).toEqual([]);
	});

	it('skips reminders that were already emailed, but sends the next period', () => {
		const sent = new Set(['renewal:a:2026-10-24']);
		expect(dueReminders([sub()], now, 3, sent)).toEqual([]);

		const nextMonth = new Date(2026, 10, 22);
		const [next] = dueReminders([sub({ renewalDate: new Date('2026-11-24') })], nextMonth, 3, sent);
		expect(next.key).toBe('renewal:a:2026-11-24');
	});

	it('respects dismissed and snoozed reminders from the app', () => {
		const dismissed = sub({ reminderAckedOccurrence: new Date('2026-10-24') });
		expect(dueReminders([dismissed], now, 3, none)).toEqual([]);

		const snoozed = sub({
			reminderAckedOccurrence: new Date('2026-10-24'),
			reminderSnoozedUntil: new Date('2026-10-30')
		});
		expect(dueReminders([snoozed], now, 3, none)).toEqual([]);
	});

	it('reports a trial ending instead of a renewal on the same day', () => {
		const result = dueReminders(
			[sub({ trialEndsAt: new Date('2026-10-24'), renewalDate: new Date('2026-10-24') })],
			now,
			3,
			none
		);
		expect(result.map((r) => r.kind)).toEqual(['trial']);
		expect(result[0].line).toBe(
			'The free trial of Netflix ends in 2 days (2026-10-24); then €15.99 is charged.'
		);
	});

	it('warns about the last day to cancel when notice is required', () => {
		// Renews 24 Nov with 30 days notice: cancel by 25 Oct, which is 3 days away.
		const result = dueReminders(
			[sub({ renewalDate: new Date('2026-11-24'), cancelNoticeDays: 30 })],
			now,
			3,
			none
		);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ kind: 'notice', key: 'notice:a:2026-10-25', days: 3 });
		expect(result[0].line).toBe(
			'Last day to cancel Netflix in 3 days (2026-10-25) to avoid the €15.99 charge on 2026-11-24.'
		);
	});

	it('sorts the soonest first', () => {
		const result = dueReminders(
			[
				sub({ id: 'later', name: 'Later', renewalDate: new Date('2026-10-25') }),
				sub({ id: 'sooner', name: 'Sooner', renewalDate: new Date('2026-10-23') })
			],
			now,
			3,
			none
		);
		expect(result.map((r) => r.subscription.id)).toEqual(['sooner', 'later']);
	});

	it('keeps names on one line', () => {
		const [reminder] = dueReminders([sub({ name: 'Net\r\nBcc: x@y.z' })], now, 3, none);
		expect(reminder.line).not.toMatch(/[\r\n]/);
	});
});

describe('buildDigest', () => {
	it('is null without reminders', () => {
		expect(buildDigest([])).toBeNull();
	});

	it('words a single reminder in the subject', () => {
		const digest = buildDigest(dueReminders([sub()], now, 3, none));
		expect(digest?.subject).toBe('Reminder: Netflix renews in 2 days (2026-10-24) for €15.99');
		expect(digest?.text).toContain('You have 1 reminder:');
		expect(digest?.text).toContain('- Netflix renews in 2 days (2026-10-24) for €15.99.');
	});

	it('summarises several reminders', () => {
		const digest = buildDigest(
			dueReminders(
				[sub(), sub({ id: 'b', name: 'Spotify', renewalDate: new Date('2026-10-23') })],
				now,
				3,
				none
			)
		);
		expect(digest?.subject).toBe('2 subscription reminders, first: Spotify tomorrow');
		expect(digest?.text).toContain('You have 2 reminders:');
		expect(digest?.text.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(2);
	});
});
