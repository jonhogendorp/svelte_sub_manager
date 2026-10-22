import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { subscriptionsToCsv } from './csv';
import { duplicateKey, parseCsv, parseSubscriptionsCsv } from './csv-import';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		priceMinor: 1599,
		currency: 'EUR',
		category: 'Streaming',
		renewalDate: new Date('2026-11-20'),
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
		...overrides
	};
}

describe('parseCsv', () => {
	it('splits rows and cells, handling quotes, commas, doubled quotes and line breaks', () => {
		expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",z')).toEqual([
			['a', 'b'],
			['x, y', 'say "hi"'],
			['two\nlines', 'z']
		]);
	});

	it('drops blank lines and keeps a final row without a trailing newline', () => {
		expect(parseCsv('a,b\n\n1,2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('keeps empty cells', () => {
		expect(parseCsv('a,,c\n')).toEqual([['a', '', 'c']]);
	});
});

describe('parseSubscriptionsCsv', () => {
	it('reads back what the export wrote', () => {
		const original = [
			makeSubscription({ notes: 'Shared, "family" plan', paymentMethod: 'Visa' }),
			makeSubscription({
				name: '=SUM(A1)',
				priceMinor: 500,
				currency: 'JPY',
				billingCycle: 'custom',
				intervalCount: 3,
				status: 'paused',
				trialEndsAt: new Date('2026-12-01')
			})
		];
		const parsed = parseSubscriptionsCsv(subscriptionsToCsv(original));
		if ('fileError' in parsed) throw new Error(parsed.fileError);

		expect(parsed.errors).toEqual([]);
		expect(parsed.rows.map((row) => row.data)).toMatchObject([
			{ name: 'Netflix', priceMinor: 1599, notes: 'Shared, "family" plan', paymentMethod: 'Visa' },
			{
				name: '=SUM(A1)',
				priceMinor: 500,
				currency: 'JPY',
				billingCycle: 'custom',
				intervalCount: 3,
				status: 'paused',
				trialEndsAt: new Date('2026-12-01')
			}
		]);
	});

	it('accepts a BOM and header spelling variants, and applies defaults for blank cells', () => {
		const parsed = parseSubscriptionsCsv(
			'﻿Name,Price,Category,Renewal Date,Currency\nHulu,9.99,TV,2026-11-01,\n'
		);
		if ('fileError' in parsed) throw new Error(parsed.fileError);

		expect(parsed.rows[0].data).toMatchObject({
			name: 'Hulu',
			priceMinor: 999,
			currency: 'EUR',
			billingCycle: 'monthly',
			status: 'active'
		});
	});

	it('reports invalid rows with their line number and still imports the good ones', () => {
		const parsed = parseSubscriptionsCsv(
			'name,price,category,renewalDate\nGood,5,A,2026-11-01\nBad,abc,A,2026-11-01\n,5,A,2026-11-01'
		);
		if ('fileError' in parsed) throw new Error(parsed.fileError);

		expect(parsed.rows).toHaveLength(1);
		expect(parsed.errors.map((e) => e.line)).toEqual([3, 4]);
	});

	it('rejects a file that is empty or lacks required columns', () => {
		expect(parseSubscriptionsCsv('')).toEqual({ fileError: 'The file is empty.' });
		expect(parseSubscriptionsCsv('name,price\nA,1')).toEqual({
			fileError: 'Missing required columns: category, renewalDate.'
		});
	});
});

describe('duplicateKey', () => {
	it('ignores case and surrounding whitespace in the name only', () => {
		const a = { name: ' Netflix ', currency: 'EUR', priceMinor: 1, billingCycle: 'monthly' };
		expect(duplicateKey(a)).toBe(duplicateKey({ ...a, name: 'netflix' }));
		expect(duplicateKey(a)).not.toBe(duplicateKey({ ...a, priceMinor: 2 }));
		expect(duplicateKey(a)).not.toBe(duplicateKey({ ...a, currency: 'USD' }));
	});
});
