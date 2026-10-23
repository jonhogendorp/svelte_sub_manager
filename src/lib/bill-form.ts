import { BASE_CURRENCY, isSupportedCurrency, minorDigits, parseMoneyInput } from './money';
import { BILL_CYCLES } from './bills';
import { MAX_INTERVAL_MONTHS, toBillingCycle, toSubscriptionStatus } from './subscriptions';
import type { BillingCycle, SubscriptionStatus } from './subscriptions';
import type { Currency } from './money';

export interface BillInput {
	name: string;
	kind: string;
	/** Integer minor units of `currency`. */
	estimateMinor: number;
	currency: Currency;
	billingCycle: BillingCycle;
	/** Months between charges; 1 unless the cycle is "custom". */
	intervalCount: number;
	renewalDate: Date;
	status: SubscriptionStatus;
	notes: string | null;
	/** Share of the bill that is a business expense, 0-100. */
	businessPercent: number;
}

export interface PaymentInput {
	/** Integer minor units of `currency`. */
	amountMinor: number;
	currency: Currency;
	paidOn: Date;
}

export const MAX_BILL_NOTES_LENGTH = 2000;

export type ParsedBill =
	{ error: string; data?: undefined } | { error?: undefined; data: BillInput };

export type ParsedPayment =
	{ error: string; data?: undefined } | { error?: undefined; data: PaymentInput };

function decimalsError(currency: string): string {
	const digits = minorDigits(currency);
	return digits === 0
		? `${currency} amounts must be whole numbers.`
		: `${currency} amounts can have at most ${digits} decimal${digits === 1 ? '' : 's'}.`;
}

/** A positive amount in the chosen currency, as integer minor units. */
function parseAmount(raw: string, currency: string): { minor: number } | { error: string } {
	const amount = parseMoneyInput(raw, currency);
	if ('error' in amount) {
		if (amount.error === 'decimals') return { error: decimalsError(currency) };
		if (amount.error === 'too-large') return { error: 'That amount is too large.' };
		return { error: 'Amount must be greater than zero.' };
	}
	if (amount.minor <= 0) return { error: 'Amount must be greater than zero.' };
	return amount;
}

/** Validates the add/edit bill form. Pure so every error path can be unit tested. */
export function parseBillForm(formData: FormData): ParsedBill {
	const name = String(formData.get('name') ?? '').trim();
	const kind = String(formData.get('kind') ?? '').trim();
	const amountRaw = String(formData.get('estimate') ?? '').trim();
	const renewalRaw = String(formData.get('renewalDate') ?? '');
	const billingCycle = toBillingCycle(formData.get('billingCycle'));
	const currencyRaw = formData.get('currency') ?? BASE_CURRENCY;

	if (!name || !kind || !amountRaw || !renewalRaw) {
		return { error: 'Please fill in all fields.' };
	}
	if (!isSupportedCurrency(currencyRaw)) {
		return { error: 'Please choose a supported currency.' };
	}
	if (!BILL_CYCLES.includes(billingCycle)) {
		return { error: 'A bill has to repeat. Please choose a billing cycle.' };
	}

	const amount = parseAmount(amountRaw, currencyRaw);
	if ('error' in amount) return { error: amount.error };

	const renewalDate = new Date(renewalRaw);
	if (Number.isNaN(renewalDate.getTime())) {
		return { error: 'Please enter a valid due date.' };
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

	const businessRaw = String(formData.get('businessPercent') ?? '').trim();
	let businessPercent = 0;
	if (businessRaw) {
		const n = Number(businessRaw);
		if (!/^[0-9]+$/.test(businessRaw) || n > 100) {
			return { error: 'Business use must be a whole number from 0 to 100.' };
		}
		businessPercent = n;
	}

	const notesRaw = String(formData.get('notes') ?? '').trim();
	if (notesRaw.length > MAX_BILL_NOTES_LENGTH) {
		return { error: `Notes can be at most ${MAX_BILL_NOTES_LENGTH} characters.` };
	}

	return {
		data: {
			name,
			kind,
			estimateMinor: amount.minor,
			currency: currencyRaw,
			billingCycle,
			intervalCount,
			renewalDate,
			status: toSubscriptionStatus(formData.get('status')),
			notes: notesRaw === '' ? null : notesRaw,
			businessPercent
		}
	};
}

/** Validates the "log payment" form. */
export function parsePaymentForm(formData: FormData): ParsedPayment {
	const amountRaw = String(formData.get('amount') ?? '').trim();
	const paidRaw = String(formData.get('paidOn') ?? '');
	const currencyRaw = formData.get('currency') ?? BASE_CURRENCY;

	if (!amountRaw || !paidRaw) return { error: 'Please fill in all fields.' };
	if (!isSupportedCurrency(currencyRaw)) {
		return { error: 'Please choose a supported currency.' };
	}

	const amount = parseAmount(amountRaw, currencyRaw);
	if ('error' in amount) return { error: amount.error };

	const paidOn = new Date(paidRaw);
	if (Number.isNaN(paidOn.getTime())) return { error: 'Please enter a valid payment date.' };

	return { data: { amountMinor: amount.minor, currency: currencyRaw, paidOn } };
}
