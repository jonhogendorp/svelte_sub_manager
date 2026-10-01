import { describe, expect, it } from 'vitest';
import {
	CURRENCIES,
	convertMajor,
	formatMoney,
	formatSubscriptionPrice,
	isSupportedCurrency,
	minorDigits,
	parseMoneyInput,
	toMajor
} from './money';

describe('minorDigits', () => {
	it.each([
		['EUR', 2],
		['USD', 2],
		['JPY', 0],
		['HUF', 2]
	])('%s has %i decimals', (currency, expected) => {
		expect(minorDigits(currency)).toBe(expected);
	});

	it('falls back to two decimals for an unknown code', () => {
		expect(minorDigits('not-a-code')).toBe(2);
		expect(minorDigits('XXX')).toBe(2);
	});

	it('defines a number of decimals for every supported currency', () => {
		for (const code of CURRENCIES) expect(Number.isInteger(minorDigits(code))).toBe(true);
	});
});

describe('isSupportedCurrency', () => {
	it('accepts every listed currency', () => {
		expect(CURRENCIES.every((code) => isSupportedCurrency(code))).toBe(true);
	});

	it.each(['eur', 'XXX', '', null, undefined, 42])('rejects %s', (value) => {
		expect(isSupportedCurrency(value)).toBe(false);
	});
});

describe('parseMoneyInput', () => {
	it.each([
		['15.99', 'EUR', 1599],
		['15.9', 'EUR', 1590],
		['15', 'EUR', 1500],
		['0.1', 'EUR', 10],
		['0.07', 'EUR', 7],
		['1.005', 'EUR', undefined],
		['15.990', 'EUR', 1599],
		['  15.99  ', 'EUR', 1599],
		['1000', 'JPY', 1000],
		['1000.0', 'JPY', 1000]
	])('parses %s %s', (input, currency, expected) => {
		const result = parseMoneyInput(input, currency);
		if (expected === undefined) {
			expect(result).toEqual({ error: 'decimals' });
		} else {
			expect(result).toEqual({ minor: expected });
		}
	});

	it('avoids the floating point error of 19.99 * 100', () => {
		expect(19.99 * 100).not.toBe(1999);
		expect(parseMoneyInput('19.99', 'EUR')).toEqual({ minor: 1999 });
	});

	it('rejects more decimals than the currency has', () => {
		expect(parseMoneyInput('15.999', 'EUR')).toEqual({ error: 'decimals' });
		expect(parseMoneyInput('1000.5', 'JPY')).toEqual({ error: 'decimals' });
	});

	it.each(['', 'abc', '-5', '1e3', '1,5', '1.', '.5', 'Infinity', 'NaN'])(
		'rejects the malformed input "%s"',
		(input) => {
			expect(parseMoneyInput(input, 'EUR')).toEqual({ error: 'invalid' });
		}
	);

	it('rejects a price above the maximum', () => {
		expect(parseMoneyInput('10000000', 'EUR')).toEqual({ minor: 1_000_000_000 });
		expect(parseMoneyInput('10000000.01', 'EUR')).toEqual({ error: 'too-large' });
	});

	it('allows zero (the caller decides it is not a valid price)', () => {
		expect(parseMoneyInput('0', 'EUR')).toEqual({ minor: 0 });
	});
});

describe('toMajor', () => {
	it('divides by the currency exponent', () => {
		expect(toMajor(1599, 'EUR')).toBe(15.99);
		expect(toMajor(1000, 'JPY')).toBe(1000);
	});
});

describe('convertMajor', () => {
	const rates = { USD: 1.1, GBP: 0.8 };

	it('returns the amount untouched for the same currency, even without rates', () => {
		expect(convertMajor(10, 'SEK', 'SEK', {})).toBe(10);
	});

	it('converts from the base currency', () => {
		expect(convertMajor(10, 'EUR', 'USD', rates)).toBeCloseTo(11);
	});

	it('converts to the base currency', () => {
		expect(convertMajor(11, 'USD', 'EUR', rates)).toBeCloseTo(10);
	});

	it('converts between two non-base currencies through the base', () => {
		expect(convertMajor(11, 'USD', 'GBP', rates)).toBeCloseTo(8);
	});

	it('returns null when a rate is missing', () => {
		expect(convertMajor(10, 'EUR', 'CHF', rates)).toBeNull();
		expect(convertMajor(10, 'CHF', 'EUR', rates)).toBeNull();
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('treats the rate %s as unknown', (bad) => {
		expect(convertMajor(10, 'EUR', 'USD', { USD: bad })).toBeNull();
	});
});

describe('formatMoney', () => {
	it('formats euro with a euro sign and two decimals', () => {
		expect(formatMoney(15.99, 'EUR')).toBe('€15.99');
		expect(formatMoney(12, 'EUR')).toBe('€12.00');
		expect(formatMoney(0, 'EUR')).toBe('€0.00');
	});

	it('groups thousands', () => {
		expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
	});

	it('uses the currency decimals (no decimals for yen)', () => {
		expect(formatMoney(1000, 'JPY')).toMatch(/1,000$/);
		expect(formatMoney(1000, 'JPY')).not.toMatch(/\./);
	});

	it('shows the same decimals that storage uses, even where Intl would drop them', () => {
		expect(formatMoney(1500, 'HUF')).toMatch(/1,500\.00$/);
	});

	it('marks a non-euro currency', () => {
		expect(formatMoney(15, 'USD')).toMatch(/\$15\.00$/);
	});
});

describe('formatSubscriptionPrice', () => {
	it('formats minor units in the subscription’s own currency', () => {
		expect(formatSubscriptionPrice({ priceMinor: 1599, currency: 'EUR' })).toBe('€15.99');
		expect(formatSubscriptionPrice({ priceMinor: 1500, currency: 'USD' })).toMatch(/\$15\.00$/);
	});
});
