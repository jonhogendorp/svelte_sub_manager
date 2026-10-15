import type { PriceChange, Subscription } from '../../generated/prisma/client';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { changesFor } from './price-history';
import { countsTowardSpend, monthlyCostIn, yearlyCost, yearlyCostIn } from './subscriptions';

export interface CostShare {
	subscription: Subscription;
	/** Major units of the display currency. */
	yearly: number;
	/** Share of the total yearly spend, 0–100. */
	percent: number;
}

/**
 * The costliest recurring subscriptions by yearly cost, largest first. Paused, cancelled and
 * one-off subscriptions, and those without a known exchange rate, are left out.
 */
export function topCosts(
	subscriptions: Subscription[],
	money: MoneyContext,
	limit = 5
): CostShare[] {
	const priced: { subscription: Subscription; yearly: number }[] = [];
	let total = 0;
	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;
		const yearly = yearlyCostIn(subscription, money);
		if (yearly === null) continue;
		priced.push({ subscription, yearly });
		total += yearly;
	}

	return priced
		.sort((a, b) => b.yearly - a.yearly)
		.slice(0, limit)
		.map((item) => ({ ...item, percent: total > 0 ? (item.yearly / total) * 100 : 0 }));
}

export interface PriceHike {
	subscription: Subscription;
	/** The price before the first recorded change, in minor units of `currency`. */
	originalMinor: number;
	currentMinor: number;
	currency: string;
	/** Percentage change from the original to the current price. */
	percent: number;
	/** Extra spend per year compared with the original price, in major units of the display currency. */
	yearlyImpact: number | null;
	lastChangedAt: Date;
}

/**
 * Subscriptions that cost more than when they were first recorded, biggest yearly impact first.
 * The original price is the "old" price of the oldest logged change; changes are only logged
 * within one currency, so the whole history shares the subscription's currency.
 */
export function priceHikes(
	subscriptions: Subscription[],
	changes: PriceChange[],
	money: MoneyContext
): PriceHike[] {
	const hikes: PriceHike[] = [];

	for (const subscription of subscriptions) {
		// Newest first; the last element is the oldest change.
		const history = changesFor(changes, subscription.id).filter(
			(change) => change.currency === subscription.currency
		);
		const oldest = history[history.length - 1];
		if (!oldest || oldest.oldMinor <= 0 || subscription.priceMinor <= oldest.oldMinor) continue;

		const extraYearlyMinor =
			yearlyCost(subscription) - yearlyCost({ ...subscription, priceMinor: oldest.oldMinor });
		const impact = countsTowardSpend(subscription)
			? convertMajor(
					toMajor(extraYearlyMinor, subscription.currency),
					subscription.currency,
					money.display,
					money.rates
				)
			: null;

		hikes.push({
			subscription,
			originalMinor: oldest.oldMinor,
			currentMinor: subscription.priceMinor,
			currency: subscription.currency,
			percent: ((subscription.priceMinor - oldest.oldMinor) / oldest.oldMinor) * 100,
			yearlyImpact: impact,
			lastChangedAt: new Date(history[0].changedAt)
		});
	}

	return hikes.sort((a, b) => (b.yearlyImpact ?? -1) - (a.yearlyImpact ?? -1));
}

/** Total extra yearly spend caused by the given hikes, in major units of the display currency. */
export function totalYearlyImpact(hikes: PriceHike[]): number {
	return hikes.reduce((sum, hike) => sum + (hike.yearlyImpact ?? 0), 0);
}

export interface CycleShare {
	cycle: string;
	/** Monthly-equivalent spend in major units of the display currency. */
	monthly: number;
	count: number;
}

/** Monthly-equivalent spend and count per billing cycle, largest first. */
export function cycleBreakdown(subscriptions: Subscription[], money: MoneyContext): CycleShare[] {
	const byCycle = new Map<string, CycleShare>();
	for (const sub of subscriptions) {
		if (!countsTowardSpend(sub)) continue;
		const monthly = monthlyCostIn(sub, money);
		if (monthly === null) continue;
		const entry = byCycle.get(sub.billingCycle) ?? {
			cycle: sub.billingCycle,
			monthly: 0,
			count: 0
		};
		entry.monthly += monthly;
		entry.count += 1;
		byCycle.set(sub.billingCycle, entry);
	}
	return [...byCycle.values()].sort((a, b) => b.monthly - a.monthly);
}

export interface SavingsSummary {
	/** Yearly cost of paused and cancelled subscriptions, in major units of the display currency. */
	yearly: number;
	cancelled: number;
	paused: number;
}

/** What paused and cancelled recurring subscriptions would cost per year if they were active. */
export function savings(subscriptions: Subscription[], money: MoneyContext): SavingsSummary {
	const summary: SavingsSummary = { yearly: 0, cancelled: 0, paused: 0 };
	for (const sub of subscriptions) {
		if (sub.status !== 'cancelled' && sub.status !== 'paused') continue;
		const yearly = yearlyCostIn(sub, money);
		if (yearly === null || yearly === 0) continue;
		summary.yearly += yearly;
		summary[sub.status] += 1;
	}
	return summary;
}
