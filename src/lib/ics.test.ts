import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { escapeIcsText, foldLine, subscriptionsToIcs } from './ics';

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
		...overrides
	};
}

const now = new Date(2026, 9, 12, 9, 30);
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('escapeIcsText', () => {
	it('escapes separators, backslashes and newlines', () => {
		expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
	});
});

describe('foldLine', () => {
	it('leaves short lines alone', () => {
		expect(foldLine('SUMMARY:Short')).toBe('SUMMARY:Short');
	});

	it('folds long lines at 75 octets and unfolds back to the original', () => {
		const long = `SUMMARY:${'é'.repeat(100)}`;
		const folded = foldLine(long);

		for (const line of folded.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
		expect(folded.replaceAll('\r\n ', '')).toBe(long);
	});
});

describe('subscriptionsToIcs', () => {
	it('is a well-formed calendar with CRLF line endings', () => {
		const ics = subscriptionsToIcs([makeSubscription()], now);

		expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(ics).not.toMatch(/[^\r]\n/);
	});

	it('lists a monthly subscription once a month for the coming year', () => {
		const ics = subscriptionsToIcs([makeSubscription()], now);

		expect(count(ics, 'BEGIN:VEVENT')).toBe(12);
		expect(ics).toContain('DTSTART;VALUE=DATE:20261012');
		expect(ics).toContain('DTSTART;VALUE=DATE:20261112');
		expect(ics).toContain('DTEND;VALUE=DATE:20261013');
		expect(ics).toContain('SUMMARY:Netflix renews');
	});

	it('gives every event a unique, stable UID', () => {
		const first = subscriptionsToIcs([makeSubscription()], now);
		const uids = first.match(/^UID:.*$/gm) ?? [];

		expect(new Set(uids).size).toBe(uids.length);
		expect(subscriptionsToIcs([makeSubscription()], now).match(/^UID:.*$/gm)).toEqual(uids);
	});

	it('skips paused and cancelled subscriptions', () => {
		const ics = subscriptionsToIcs(
			[makeSubscription({ status: 'paused' }), makeSubscription({ id: 'b', status: 'cancelled' })],
			now
		);

		expect(count(ics, 'BEGIN:VEVENT')).toBe(0);
	});

	it('adds an event for the end of a free trial', () => {
		const ics = subscriptionsToIcs(
			[makeSubscription({ billingCycle: 'once', trialEndsAt: new Date('2026-10-20') })],
			now
		);

		expect(ics).toContain('SUMMARY:Netflix free trial ends');
		expect(ics).toContain('DTSTART;VALUE=DATE:20261020');
	});

	it('lists a one-off charge once', () => {
		const ics = subscriptionsToIcs([makeSubscription({ billingCycle: 'once' })], now);

		expect(count(ics, 'BEGIN:VEVENT')).toBe(1);
	});

	it('escapes names with special characters', () => {
		const ics = subscriptionsToIcs(
			[makeSubscription({ name: 'Tom, Dick; & Harry', billingCycle: 'once' })],
			now
		);

		expect(ics).toContain('SUMMARY:Tom\\, Dick\\; & Harry renews');
	});
});
