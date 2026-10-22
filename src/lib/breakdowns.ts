import type { Subscription } from '../../generated/prisma/client';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { countsTowardSpend, monthlyCost, monthlyCostIn, toBillingCycle } from './subscriptions';

export const NO_PAYMENT_METHOD = 'No payment method';

export interface PaymentMethodShare {
	method: string;
	/** Monthly-equivalent spend in major units of the display currency. */
	monthly: number;
	count: number;
	/** Share of the total monthly spend, 0–100. */
	percent: number;
}

/**
 * Monthly spend per payment method (ignoring case and surrounding spaces), largest first.
 * Subscriptions without one are grouped together and always listed last.
 */
export function paymentMethodBreakdown(
	subscriptions: Subscription[],
	money: MoneyContext
): PaymentMethodShare[] {
	const byKey = new Map<string, Omit<PaymentMethodShare, 'percent'>>();
	let total = 0;

	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;

		const monthly = monthlyCostIn(subscription, money);
		if (monthly === null) continue;

		const method = subscription.paymentMethod?.trim() ?? '';
		const key = method.toLowerCase();
		const entry = byKey.get(key) ?? { method: method || NO_PAYMENT_METHOD, monthly: 0, count: 0 };
		entry.monthly += monthly;
		entry.count += 1;
		byKey.set(key, entry);
		total += monthly;
	}

	return [...byKey.entries()]
		.sort(([keyA, a], [keyB, b]) => {
			if (keyA === '' || keyB === '') return keyA === '' ? 1 : -1;
			return b.monthly - a.monthly;
		})
		.map(([, entry]) => ({ ...entry, percent: total > 0 ? (entry.monthly / total) * 100 : 0 }));
}

export interface CurrencyShare {
	currency: string;
	/** Monthly-equivalent spend in major units of the display currency. */
	monthly: number;
	count: number;
	percent: number;
}

export interface CurrencyExposure {
	shares: CurrencyShare[];
	/** Monthly spend charged in a currency other than the display currency. */
	foreignMonthly: number;
}

/** Monthly spend by the currency it is charged in, largest first. */
export function currencyExposure(
	subscriptions: Subscription[],
	money: MoneyContext
): CurrencyExposure {
	const byCurrency = new Map<string, Omit<CurrencyShare, 'percent'>>();
	let total = 0;
	let foreignMonthly = 0;

	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;

		const monthly = monthlyCostIn(subscription, money);
		if (monthly === null) continue;

		const entry = byCurrency.get(subscription.currency) ?? {
			currency: subscription.currency,
			monthly: 0,
			count: 0
		};
		entry.monthly += monthly;
		entry.count += 1;
		byCurrency.set(subscription.currency, entry);
		total += monthly;
		if (subscription.currency !== money.display) foreignMonthly += monthly;
	}

	return {
		shares: [...byCurrency.values()]
			.sort((a, b) => b.monthly - a.monthly)
			.map((entry) => ({ ...entry, percent: total > 0 ? (entry.monthly / total) * 100 : 0 })),
		foreignMonthly
	};
}

/**
 * How much more per month the foreign-currency subscriptions would cost, in the display
 * currency, if those currencies gained `percent` against it. A negative percent is a loss.
 */
export function fxImpact(exposure: CurrencyExposure, percent: number): number {
	return (exposure.foreignMonthly * percent) / 100;
}

export interface YearlySwitch {
	subscription: Subscription;
	/** Saved per year by paying yearly, in major units of the display currency. */
	yearlySaving: number;
	/** The saving as a share of what twelve monthly payments cost, 0–100. */
	percent: number;
}

/**
 * Monthly subscriptions that have a yearly price lower than twelve monthly payments, biggest
 * saving first. Only plain monthly plans qualify: the yearly price is compared with 12 charges.
 */
export function yearlySwitches(subscriptions: Subscription[], money: MoneyContext): YearlySwitch[] {
	const switches: YearlySwitch[] = [];

	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;
		if (toBillingCycle(subscription.billingCycle) !== 'monthly') continue;
		if (!subscription.yearlyPriceMinor || subscription.yearlyPriceMinor <= 0) continue;

		const monthlyYear = monthlyCost(subscription) * 12;
		const savingMinor = monthlyYear - subscription.yearlyPriceMinor;
		if (savingMinor <= 0) continue;

		const yearlySaving = convertMajor(
			toMajor(savingMinor, subscription.currency),
			subscription.currency,
			money.display,
			money.rates
		);
		if (yearlySaving === null) continue;

		switches.push({ subscription, yearlySaving, percent: (savingMinor / monthlyYear) * 100 });
	}

	return switches.sort((a, b) => b.yearlySaving - a.yearlySaving);
}

export function totalYearlySaving(switches: YearlySwitch[]): number {
	return switches.reduce((sum, item) => sum + item.yearlySaving, 0);
}
