import { toBillingCycle, type BillingCycle } from './subscriptions';

export interface SubscriptionInput {
	name: string;
	price: number;
	category: string;
	renewalDate: Date;
	billingCycle: BillingCycle;
}

export type ParsedSubscription =
	| { error: string; data?: undefined }
	| { error?: undefined; data: SubscriptionInput };

/** Validates the add/edit form. Pure so every error path can be unit tested without a database. */
export function parseSubscriptionForm(formData: FormData): ParsedSubscription {
	const name = String(formData.get('name') ?? '').trim();
	const priceRaw = String(formData.get('price') ?? '').trim();
	const price = Number(priceRaw);
	const category = String(formData.get('category') ?? '').trim();
	const renewalRaw = String(formData.get('renewalDate') ?? '');
	const billingCycle = toBillingCycle(formData.get('billingCycle'));

	if (!name || !category || !priceRaw || !renewalRaw) {
		return { error: 'Please fill in all fields.' };
	}
	if (!Number.isFinite(price) || price <= 0) {
		return { error: 'Price must be greater than zero.' };
	}

	// Parsed as UTC midnight, matching how renewal dates are stored and read back.
	const renewalDate = new Date(renewalRaw);
	if (Number.isNaN(renewalDate.getTime())) {
		return { error: 'Please enter a valid renewal date.' };
	}

	return { data: { name, price, category, renewalDate, billingCycle } };
}
