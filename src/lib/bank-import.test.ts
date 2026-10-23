import { describe, expect, it } from 'vitest';
import {
	detectDelimiter,
	detectRecurring,
	extractCharges,
	guessMapping,
	normalizeMerchant,
	parseAmount,
	parseBankDate,
	readBankFile,
	type BankCharge,
	type ColumnMapping
} from './bank-import';

const now = new Date(2026, 9, 22); // 22 October 2026

describe('detectDelimiter', () => {
	it('recognises comma, semicolon and tab files', () => {
		expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',');
		expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
		expect(detectDelimiter('a\tb\tc\n1\t2\t3\n')).toBe('\t');
	});

	it('is not fooled by decimal commas in a semicolon file', () => {
		expect(detectDelimiter('Datum;Bedrag;Naam\n01-01-2026;-12,50;Netflix\n')).toBe(';');
	});

	it('is not fooled by delimiters inside quoted cells', () => {
		expect(detectDelimiter('date,description,amount\n2026-01-01,"Shop; online",-5.00\n')).toBe(',');
	});
});

describe('parseAmount', () => {
	it.each([
		['-12.50', -12.5],
		['12,50', 12.5],
		['1.234,56', 1234.56],
		['1,234.56', 1234.56],
		['-1.234,56', -1234.56],
		['(12.50)', -12.5],
		['12.50-', -12.5],
		['€ 12,50', 12.5],
		['EUR -9,99', -9.99],
		['1,234', 1234],
		['1.234.567', 1234567],
		['0,500', 0.5],
		['+5', 5],
		['100', 100]
	])('reads %s as %d', (text, expected) => {
		expect(parseAmount(text)).toBeCloseTo(expected);
	});

	it('returns null for text that is not a number', () => {
		for (const text of ['', 'abc', '--', '-']) expect(parseAmount(text)).toBeNull();
	});
});

describe('parseBankDate', () => {
	const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

	it('reads the common formats', () => {
		expect(iso(parseBankDate('2026-03-04'))).toBe('2026-03-04');
		expect(iso(parseBankDate('2026-03-04T10:20:30Z'))).toBe('2026-03-04');
		expect(iso(parseBankDate('20260304'))).toBe('2026-03-04');
		expect(iso(parseBankDate('04-03-2026'))).toBe('2026-03-04');
		expect(iso(parseBankDate('04.03.2026'))).toBe('2026-03-04');
		expect(iso(parseBankDate('4/3/26'))).toBe('2026-03-04');
	});

	it('uses the day-first setting only when it is ambiguous', () => {
		expect(iso(parseBankDate('04/03/2026', true))).toBe('2026-03-04');
		expect(iso(parseBankDate('04/03/2026', false))).toBe('2026-04-03');
		expect(iso(parseBankDate('25/03/2026', false))).toBe('2026-03-25');
		expect(iso(parseBankDate('03/25/2026', true))).toBe('2026-03-25');
	});

	it('rejects impossible dates', () => {
		expect(parseBankDate('31-02-2026')).toBeNull();
		expect(parseBankDate('yesterday')).toBeNull();
		expect(parseBankDate('')).toBeNull();
	});
});

describe('guessMapping', () => {
	it('finds English columns', () => {
		expect(guessMapping(['Date', 'Description', 'Amount', 'Balance'])).toEqual({
			date: 0,
			description: 1,
			amount: 2,
			debit: null,
			credit: null,
			currency: null
		});
	});

	it('finds Dutch and German columns, with accents and spacing', () => {
		expect(guessMapping(['Datum', 'Naam / Omschrijving', 'Bedrag (EUR)'])).toMatchObject({
			date: 0,
			description: 1,
			amount: 2
		});
		expect(guessMapping(['Datum', 'Omschrijving', 'Bedrag'])).toMatchObject({
			date: 0,
			description: 1,
			amount: 2
		});
		expect(guessMapping(['Buchungstag', 'Buchungstext', 'Betrag', 'Währung'])).toMatchObject({
			date: 0,
			description: 1,
			amount: 2,
			currency: 3
		});
	});

	it('uses debit and credit columns when there is no single amount', () => {
		expect(guessMapping(['Date', 'Details', 'Debit', 'Credit'])).toMatchObject({
			amount: null,
			debit: 2,
			credit: 3
		});
	});

	it('gives up when the key columns are missing', () => {
		expect(guessMapping(['Foo', 'Bar'])).toBeNull();
	});
});

const mapping: ColumnMapping = {
	date: 0,
	description: 1,
	amount: 2,
	debit: null,
	credit: null,
	currency: null
};
const options = { dayFirst: true, invertSign: false, currency: 'EUR' as const };

describe('extractCharges', () => {
	it('keeps outgoing money in minor units and skips incoming', () => {
		const result = extractCharges(
			[
				['2026-01-05', 'NETFLIX', '-15,99'],
				['2026-01-06', 'SALARY', '2500,00']
			],
			mapping,
			options
		);
		expect(result.charges).toHaveLength(1);
		expect(result.charges[0]).toMatchObject({ amountMinor: 1599, currency: 'EUR' });
		expect(result.skippedIncoming).toBe(1);
	});

	it('reports unreadable rows with their line number and carries on', () => {
		const result = extractCharges(
			[
				['not a date', 'X', '-1'],
				['2026-01-05', 'Y', 'abc'],
				['2026-01-06', 'Z', '-2']
			],
			mapping,
			options
		);
		expect(result.errors).toEqual([
			{ line: 2, message: 'Could not read the date.' },
			{ line: 3, message: 'Could not read the amount.' }
		]);
		expect(result.charges).toHaveLength(1);
	});

	it('can flip the sign for banks that list spending as positive', () => {
		const result = extractCharges([['2026-01-05', 'NETFLIX', '15.99']], mapping, {
			...options,
			invertSign: true
		});
		expect(result.charges).toHaveLength(1);
	});

	it('reads separate debit and credit columns', () => {
		const result = extractCharges(
			[
				['2026-01-05', 'NETFLIX', '15.99', ''],
				['2026-01-06', 'REFUND', '', '5.00']
			],
			{ date: 0, description: 1, amount: null, debit: 2, credit: 3, currency: null },
			options
		);
		expect(result.charges.map((c) => c.amountMinor)).toEqual([1599]);
		expect(result.skippedIncoming).toBe(1);
	});

	it('uses a supported currency column, else the default', () => {
		const result = extractCharges(
			[
				['2026-01-05', 'A', '-10', 'usd'],
				['2026-01-05', 'B', '-10', '???']
			],
			{ ...mapping, currency: 3 },
			options
		);
		expect(result.charges.map((c) => c.currency)).toEqual(['USD', 'EUR']);
	});

	it('respects currencies without decimals', () => {
		const result = extractCharges([['2026-01-05', 'A', '-1500']], mapping, {
			...options,
			currency: 'JPY'
		});
		expect(result.charges[0].amountMinor).toBe(1500);
	});
});

describe('normalizeMerchant', () => {
	it('gives the same key for different bank descriptions of one merchant', () => {
		const keys = [
			'PAYPAL *NETFLIX 4029357733',
			'NETFLIX.COM 1234 AMSTERDAM',
			'Betaling aan Netflix International B.V. ref 99812',
			'SEPA Direct Debit NETFLIX 2026-03-04'
		].map(normalizeMerchant);
		expect(new Set(keys.map((key) => key.split(' ')[0]))).toEqual(new Set(['netflix']));
	});

	it('keeps distinct products of one company apart', () => {
		expect(normalizeMerchant('APPLE MUSIC')).not.toBe(normalizeMerchant('APPLE ICLOUD'));
	});

	it('returns an empty key for descriptions that are only noise', () => {
		expect(normalizeMerchant('1234 5678')).toBe('');
	});
});

function charge(date: string, description: string, euros: number): BankCharge {
	return {
		date: new Date(date),
		description,
		amountMinor: Math.round(euros * 100),
		currency: 'EUR'
	};
}

const monthly = (description: string, euros: number, count: number, start = '2026-01-05') =>
	Array.from({ length: count }, (_, i) => {
		const date = new Date(start);
		date.setUTCMonth(date.getUTCMonth() + i);
		return charge(date.toISOString().slice(0, 10), description, euros);
	});

describe('detectRecurring', () => {
	it('finds a monthly subscription and rolls the renewal forward', () => {
		const [candidate] = detectRecurring(monthly('NETFLIX.COM 1234', 15.99, 9), [], now);

		expect(candidate).toMatchObject({
			name: 'Netflix',
			priceMinor: 1599,
			currency: 'EUR',
			billingCycle: 'monthly',
			occurrences: 9,
			confidence: 'high',
			mayHaveEnded: false,
			alreadyTracked: false
		});
		expect(candidate.firstChargedOn.toISOString().slice(0, 10)).toBe('2026-01-05');
		expect(candidate.lastChargedOn.toISOString().slice(0, 10)).toBe('2026-09-05');
		expect(candidate.nextRenewal.toISOString().slice(0, 10)).toBe('2026-11-05');
	});

	it('finds weekly, quarterly and yearly patterns', () => {
		const weekly = Array.from({ length: 5 }, (_, i) =>
			charge(new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString(), 'GYM DAY PASS', 5)
		);
		const quarterly = [
			charge('2026-01-10', 'NEWSPAPER', 30),
			charge('2026-04-10', 'NEWSPAPER', 30),
			charge('2026-07-10', 'NEWSPAPER', 30)
		];
		const yearly = [
			charge('2025-02-01', 'DOMAIN HOST', 12),
			charge('2026-02-01', 'DOMAIN HOST', 12)
		];

		const byName = Object.fromEntries(
			detectRecurring([...weekly, ...quarterly, ...yearly], [], now).map((c) => [
				c.name,
				c.billingCycle
			])
		);
		expect(byName).toEqual({
			'Gym Day': 'weekly',
			Newspaper: 'quarterly',
			'Domain Host': 'yearly'
		});
	});

	it('ignores one-off purchases and irregular spending', () => {
		const result = detectRecurring(
			[
				charge('2026-01-05', 'IKEA', 120),
				charge('2026-02-17', 'GROCERY STORE', 40),
				charge('2026-02-20', 'GROCERY STORE', 40),
				charge('2026-06-01', 'GROCERY STORE', 40)
			],
			[],
			now
		);
		expect(result).toEqual([]);
	});

	it('needs three charges for a monthly pattern', () => {
		expect(detectRecurring(monthly('SPOTIFY', 10.99, 2), [], now)).toEqual([]);
	});

	it('splits one merchant into separate subscriptions by amount', () => {
		const result = detectRecurring(
			[...monthly('APPLE SERVICES', 2.99, 4), ...monthly('APPLE SERVICES', 10.99, 4)],
			[],
			now
		);
		expect(result.map((c) => c.priceMinor).sort()).toEqual([1099, 299]);
	});

	it('follows a small price change within tolerance and reports the latest price', () => {
		const charges = [...monthly('SPOTIFY', 10.0, 3), ...monthly('SPOTIFY', 10.5, 3, '2026-04-05')];
		const [candidate] = detectRecurring(charges, [], now);
		expect(candidate.occurrences).toBe(6);
		expect(candidate.priceMinor).toBe(1050);
	});

	it('counts two charges on one day as one payment', () => {
		const charges = monthly('NETFLIX', 9.99, 3);
		const result = detectRecurring([...charges, charges[0]], [], now);
		expect(result[0].occurrences).toBe(3);
	});

	it('marks subscriptions whose last charge is long before the end of the statement', () => {
		const result = detectRecurring(
			[...monthly('OLD GYM', 30, 3), charge('2026-09-20', 'COFFEE SHOP', 3)],
			[],
			now
		);
		expect(result.find((c) => c.name === 'Old Gym')?.mayHaveEnded).toBe(true);
	});

	it('marks subscriptions you already track, and lists them last', () => {
		const result = detectRecurring(
			[...monthly('NETFLIX', 15.99, 4), ...monthly('SPOTIFY', 9.99, 4)],
			[{ name: 'Netflix Premium' }],
			now
		);
		expect(result.map((c) => [c.name, c.alreadyTracked])).toEqual([
			['Spotify', false],
			['Netflix', true]
		]);
	});

	it('is empty without charges', () => {
		expect(detectRecurring([], [], now)).toEqual([]);
	});
});

describe('readBankFile', () => {
	const statement = [
		'Datum;Omschrijving;Bedrag',
		'05-01-2026;NETFLIX.COM;-15,99',
		'05-02-2026;NETFLIX.COM;-15,99',
		'05-03-2026;NETFLIX.COM;-15,99',
		'25-03-2026;SALARIS;2.500,00'
	].join('\n');

	it('reads a semicolon file end to end', () => {
		const file = readBankFile(statement);
		if ('fileError' in file) throw new Error(file.fileError);

		expect(file.delimiter).toBe(';');
		expect(file.headers).toEqual(['Datum', 'Omschrijving', 'Bedrag']);
		expect(file.mapping).toMatchObject({ date: 0, description: 1, amount: 2 });

		const { charges, skippedIncoming } = extractCharges(file.rows, file.mapping!, options);
		expect(charges).toHaveLength(3);
		expect(skippedIncoming).toBe(1);
		expect(detectRecurring(charges, [], now)[0]).toMatchObject({
			name: 'Netflix',
			priceMinor: 1599,
			billingCycle: 'monthly'
		});
	});

	it('strips a byte order mark', () => {
		const file = readBankFile('﻿' + statement);
		if ('fileError' in file) throw new Error(file.fileError);
		expect(file.headers[0]).toBe('Datum');
	});

	it('rejects empty files and files over the row limit', () => {
		expect(readBankFile('Date,Description,Amount')).toEqual({
			fileError: 'The file has no transactions.'
		});
		const huge = ['d,e,a', ...Array.from({ length: 10_001 }, () => 'x,y,z')].join('\n');
		expect(readBankFile(huge)).toEqual({
			fileError: 'Please import at most 10000 transactions at a time.'
		});
	});
});
