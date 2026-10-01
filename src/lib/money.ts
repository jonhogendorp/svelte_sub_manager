/**
 * Money helpers. Amounts are stored as integer minor units (cents) of a currency and
 * only turned into decimal "major" units for display and conversion, so a price like
 * 15.99 is never held as a float.
 */

/** Supported currencies; every one of them is covered by the ECB reference rates. */
export const CURRENCIES = [
	'EUR',
	'USD',
	'GBP',
	'CHF',
	'SEK',
	'NOK',
	'DKK',
	'PLN',
	'CZK',
	'HUF',
	'CAD',
	'AUD',
	'NZD',
	'JPY'
] as const;

export type Currency = (typeof CURRENCIES)[number];

export const BASE_CURRENCY: Currency = 'EUR';

export function isSupportedCurrency(value: unknown): value is Currency {
	return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** How much of each currency one euro buys. The base currency is implicitly 1. */
export type Rates = Record<string, number>;

/** What totals and charts are expressed in, and the rates used to get there. */
export interface MoneyContext {
	display: string;
	rates: Rates;
}

/** Largest accepted price, in major units, so minor units always stay safe integers. */
export const MAX_PRICE_MAJOR = 10_000_000;

/**
 * Decimal places in each currency's minor unit (ISO 4217). Deliberately a fixed table
 * rather than read from `Intl`: stored amounts are only meaningful relative to this
 * number, and ICU data differs between runtimes (some report HUF with no decimals), so
 * deriving it at runtime could silently change what a stored value means.
 */
const MINOR_DIGITS: Record<Currency, number> = {
	EUR: 2,
	USD: 2,
	GBP: 2,
	CHF: 2,
	SEK: 2,
	NOK: 2,
	DKK: 2,
	PLN: 2,
	CZK: 2,
	HUF: 2,
	CAD: 2,
	AUD: 2,
	NZD: 2,
	JPY: 0
};

/** Decimal places in a currency's minor unit: EUR 2, JPY 0. */
export function minorDigits(currency: string): number {
	return isSupportedCurrency(currency) ? MINOR_DIGITS[currency] : 2;
}

export function toMajor(minor: number, currency: string): number {
	return minor / 10 ** minorDigits(currency);
}

export type MoneyInputError = 'invalid' | 'decimals' | 'too-large';

/**
 * Parses what a user typed ("15.99") into minor units using string arithmetic, because
 * 15.99 * 100 is 1598.9999999999998 in floating point. More decimals than the currency
 * has are rejected rather than silently rounded.
 */
export function parseMoneyInput(
	input: string,
	currency: string
): { minor: number } | { error: MoneyInputError } {
	const match = /^(\d+)(?:\.(\d+))?$/.exec(input.trim());
	if (!match) return { error: 'invalid' };

	const digits = minorDigits(currency);
	const [, whole, fraction = ''] = match;

	// "15.990" is fine for a 2-decimal currency; "15.995" is not.
	if (/[^0]/.test(fraction.slice(digits))) return { error: 'decimals' };

	const minor = Number(whole + fraction.slice(0, digits).padEnd(digits, '0'));
	if (minor > MAX_PRICE_MAJOR * 10 ** digits) return { error: 'too-large' };
	return { minor };
}

function rateOf(currency: string, rates: Rates): number | null {
	if (currency === BASE_CURRENCY) return 1;
	const rate = rates[currency];
	return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Converts a major-unit amount between currencies, or null when a rate is unknown. */
export function convertMajor(
	amount: number,
	from: string,
	to: string,
	rates: Rates
): number | null {
	if (from === to) return amount;
	const fromRate = rateOf(from, rates);
	const toRate = rateOf(to, rates);
	if (fromRate === null || toRate === null) return null;
	return (amount / fromRate) * toRate;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats a major-unit amount, e.g. `formatMoney(15.99, 'EUR')` gives "€15.99". */
export function formatMoney(major: number, currency: string, locale = 'en-IE'): string {
	const key = `${locale}|${currency}`;
	let formatter = formatters.get(key);
	if (!formatter) {
		// Same decimals as storage, so what is shown always matches what was entered.
		const digits = minorDigits(currency);
		formatter = new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
		formatters.set(key, formatter);
	}
	return formatter.format(major);
}

/** A subscription's price in the currency it is actually charged in. */
export function formatSubscriptionPrice(
	sub: { priceMinor: number; currency: string },
	locale?: string
): string {
	return formatMoney(toMajor(sub.priceMinor, sub.currency), sub.currency, locale);
}
