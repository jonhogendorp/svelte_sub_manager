import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { csvCell, subscriptionsToCsv } from './csv';

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
		...overrides
	};
}

describe('csvCell', () => {
	it('leaves plain text alone', () => {
		expect(csvCell('Netflix')).toBe('Netflix');
	});

	it('quotes commas, quotes and newlines', () => {
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
	});

	it('defuses spreadsheet formulas', () => {
		expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
		expect(csvCell('@cmd')).toBe("'@cmd");
	});
});

describe('subscriptionsToCsv', () => {
	it('writes a header and one row per subscription', () => {
		const lines = subscriptionsToCsv([makeSubscription()]).trimEnd().split('\r\n');

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/^name,price,currency,/);
		expect(lines[1]).toBe('Netflix,15.99,EUR,Streaming,monthly,1,active,2026-10-12,,15.99,,,');
	});

	it('uses the currency\'s own decimals', () => {
		const row = subscriptionsToCsv([makeSubscription({ priceMinor: 1500, currency: 'JPY' })])
			.trimEnd()
			.split('\r\n')[1];

		expect(row).toContain(',1500,JPY,');
	});

	it('normalises a yearly price to its monthly cost', () => {
		const row = subscriptionsToCsv([makeSubscription({ priceMinor: 12000, billingCycle: 'yearly' })])
			.trimEnd()
			.split('\r\n')[1];

		expect(row).toContain(',120.00,EUR,');
		expect(row).toContain(',10.00,');
	});

	it('keeps free-text details in one cell each', () => {
		const row = subscriptionsToCsv([makeSubscription({ notes: 'shared, with "Sam"' })])
			.trimEnd()
			.split('\r\n')[1];

		expect(row.endsWith('"shared, with ""Sam"""')).toBe(true);
	});
});
