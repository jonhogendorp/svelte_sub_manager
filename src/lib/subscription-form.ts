import {
	BASE_CURRENCY,
	isSupportedCurrency,
	minorDigits,
	parseMoneyInput,
	type Currency
} from './money';
import { MAX_NOTICE_DAYS, MAX_URL_LENGTH, toCancelUrl } from './cancellation';
import {
	MAX_INTERVAL_MONTHS,
	toBillingCycle,
	toSubscriptionStatus,
	type BillingCycle,
	type SubscriptionStatus
} from './subscriptions';

export interface SubscriptionInput {
	name: string;
	/** Integer minor units of `currency`. */
	priceMinor: number;
	currency: Currency;
	category: string;
	renewalDate: Date;
	billingCycle: BillingCycle;
	/** Months between charges; 1 unless the cycle is "custom". */
	intervalCount: number;
	status: SubscriptionStatus;
	trialEndsAt: Date | null;
	/** The login this subscription is under; null when left blank. */
	accountEmail: string | null;
	paymentMethod: string | null;
	notes: string | null;
	/** 1–5 value rating; null when unrated. */
	usageRating: number | null;
	/** Price of a year paid up front, in minor units of `currency`; only kept for monthly plans. */
	yearlyPriceMinor: number | null;
	/** Where to cancel; an http(s) address, or null. */
	cancelUrl: string | null;
	/** Days of notice needed before a renewal; null when none. */
	cancelNoticeDays: number | null;
	/** When the subscription began; null when unknown. */
	startedOn: Date | null;
}

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PAYMENT_METHOD_LENGTH = 100;
export const MAX_NOTES_LENGTH = 2000;

/** A trimmed optional text field: blank becomes null. */
function optionalText(formData: FormData, field: string): string | null {
	const value = String(formData.get(field) ?? '').trim();
	return value === '' ? null : value;
}

// Deliberately loose: one @, something on each side, a dot in the domain, no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Blank means unrated (null); a whole number 1–5 is the rating; anything else is undefined (invalid). */
function toUsageRating(value: FormDataEntryValue | null): number | null | undefined {
	const raw = String(value ?? '').trim();
	if (raw === '') return null;
	const n = Number(raw);
	return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

export type ParsedSubscription =
	{ error: string; data?: undefined } | { error?: undefined; data: SubscriptionInput };

function decimalsError(currency: string): string {
	const digits = minorDigits(currency);
	return digits === 0
		? `${currency} prices must be whole numbers.`
		: `${currency} prices can have at most ${digits} decimal${digits === 1 ? '' : 's'}.`;
}

/** Validates the add/edit form. Pure so every error path can be unit tested without a database. */
export function parseSubscriptionForm(formData: FormData): ParsedSubscription {
	const name = String(formData.get('name') ?? '').trim();
	const priceRaw = String(formData.get('price') ?? '').trim();
	const category = String(formData.get('category') ?? '').trim();
	const renewalRaw = String(formData.get('renewalDate') ?? '');
	const billingCycle = toBillingCycle(formData.get('billingCycle'));
	const currencyRaw = formData.get('currency') ?? BASE_CURRENCY;

	if (!name || !category || !priceRaw || !renewalRaw) {
		return { error: 'Please fill in all fields.' };
	}
	if (!isSupportedCurrency(currencyRaw)) {
		return { error: 'Please choose a supported currency.' };
	}
	const currency = currencyRaw;

	const price = parseMoneyInput(priceRaw, currency);
	if ('error' in price) {
		if (price.error === 'decimals') return { error: decimalsError(currency) };
		if (price.error === 'too-large') return { error: 'That price is too large.' };
		return { error: 'Price must be greater than zero.' };
	}
	if (price.minor <= 0) {
		return { error: 'Price must be greater than zero.' };
	}

	// Parsed as UTC midnight, matching how renewal dates are stored and read back.
	const renewalDate = new Date(renewalRaw);
	if (Number.isNaN(renewalDate.getTime())) {
		return { error: 'Please enter a valid renewal date.' };
	}

	let intervalCount = 1;
	if (billingCycle === 'custom') {
		const raw = String(formData.get('intervalCount') ?? '').trim();
		const n = Number(raw);
		if (!/^\d+$/.test(raw) || n < 1 || n > MAX_INTERVAL_MONTHS) {
			return { error: `Enter a whole number of months between 1 and ${MAX_INTERVAL_MONTHS}.` };
		}
		intervalCount = n;
	}

	// Optional: blank means no trial.
	const trialRaw = String(formData.get('trialEndsAt') ?? '').trim();
	let trialEndsAt: Date | null = null;
	if (trialRaw) {
		trialEndsAt = new Date(trialRaw);
		if (Number.isNaN(trialEndsAt.getTime())) {
			return { error: 'Please enter a valid trial end date.' };
		}
	}

	const accountEmail = optionalText(formData, 'accountEmail');
	if (
		accountEmail !== null &&
		(accountEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(accountEmail))
	) {
		return { error: 'Please enter a valid account email address.' };
	}

	const paymentMethod = optionalText(formData, 'paymentMethod');
	if (paymentMethod !== null && paymentMethod.length > MAX_PAYMENT_METHOD_LENGTH) {
		return { error: `Payment method can be at most ${MAX_PAYMENT_METHOD_LENGTH} characters.` };
	}

	const notes = optionalText(formData, 'notes');
	if (notes !== null && notes.length > MAX_NOTES_LENGTH) {
		return { error: `Notes can be at most ${MAX_NOTES_LENGTH} characters.` };
	}

	const usageRating = toUsageRating(formData.get('usageRating'));
	if (usageRating === undefined) return { error: 'Please choose a rating from 1 to 5.' };

	// Optional: what a year would cost if paid up front. Only meaningful for monthly plans.
	const yearlyRaw = String(formData.get('yearlyPrice') ?? '').trim();
	let yearlyPriceMinor: number | null = null;
	if (yearlyRaw && billingCycle === 'monthly') {
		const yearly = parseMoneyInput(yearlyRaw, currency);
		if ('error' in yearly) {
			if (yearly.error === 'decimals') return { error: decimalsError(currency) };
			if (yearly.error === 'too-large') return { error: 'That yearly price is too large.' };
			return { error: 'The yearly price must be greater than zero.' };
		}
		if (yearly.minor <= 0) return { error: 'The yearly price must be greater than zero.' };
		yearlyPriceMinor = yearly.minor;
	}

	const cancelUrlRaw = optionalText(formData, 'cancelUrl');
	let cancelUrl: string | null = null;
	if (cancelUrlRaw !== null) {
		cancelUrl = cancelUrlRaw.length <= MAX_URL_LENGTH ? toCancelUrl(cancelUrlRaw) : null;
		if (cancelUrl === null) {
			return { error: 'Please enter a cancellation link starting with http:// or https://.' };
		}
	}

	const noticeRaw = String(formData.get('cancelNoticeDays') ?? '').trim();
	let cancelNoticeDays: number | null = null;
	if (noticeRaw) {
		const n = Number(noticeRaw);
		if (!/^\d+$/.test(noticeRaw) || n < 1 || n > MAX_NOTICE_DAYS) {
			return { error: `Notice must be a whole number of days between 1 and ${MAX_NOTICE_DAYS}.` };
		}
		cancelNoticeDays = n;
	}

	const startedRaw = String(formData.get('startedOn') ?? '').trim();
	let startedOn: Date | null = null;
	if (startedRaw) {
		startedOn = new Date(startedRaw);
		if (Number.isNaN(startedOn.getTime())) return { error: 'Please enter a valid start date.' };
	}

	return {
		data: {
			name,
			priceMinor: price.minor,
			currency,
			category,
			renewalDate,
			billingCycle,
			intervalCount,
			status: toSubscriptionStatus(formData.get('status')),
			trialEndsAt,
			accountEmail,
			paymentMethod,
			notes,
			usageRating,
			yearlyPriceMinor,
			cancelUrl,
			cancelNoticeDays,
			startedOn
		}
	};
}
