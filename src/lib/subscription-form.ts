import {
	BASE_CURRENCY,
	isSupportedCurrency,
	minorDigits,
	parseMoneyInput,
	type Currency
} from './money';
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
}

export type ParsedSubscription =
	| { error: string; data?: undefined }
	| { error?: undefined; data: SubscriptionInput };

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
			trialEndsAt
		}
	};
}
