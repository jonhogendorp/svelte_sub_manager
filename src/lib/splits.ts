import type { Subscription } from '../../generated/prisma/client';
import type { MoneyContext } from './money';
import { countsTowardSpend, monthlyCostIn, toShareCount } from './subscriptions';

export interface SharedPlan {
	subscription: Subscription;
	/** Everyone paying, you included. */
	people: number;
	/** Monthly-equivalent cost of the whole plan, in major units of the display currency. */
	fullMonthly: number;
	/** Your part of it. */
	yourMonthly: number;
	/** What the others owe you each month, all together. */
	owedMonthly: number;
	/** What each of the others owes you each month. */
	perPerson: number;
}

export interface SplitSummary {
	plans: SharedPlan[];
	/** What everyone else owes you each month across all shared plans. */
	owedMonthly: number;
}

/**
 * The shared plans that count towards spend, with what the other people owe you. You pay the
 * full price and get the others' parts back, so this is the money to collect. Plans without a
 * known exchange rate are left out.
 */
export function splitSummary(subscriptions: Subscription[], money: MoneyContext): SplitSummary {
	const plans: SharedPlan[] = [];

	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;

		const people = toShareCount(subscription.shareCount);
		if (people < 2) continue;

		const fullMonthly = monthlyCostIn({ ...subscription, shareCount: 1 }, money);
		const yourMonthly = monthlyCostIn(subscription, money);
		if (fullMonthly === null || yourMonthly === null) continue;

		const owedMonthly = fullMonthly - yourMonthly;
		plans.push({
			subscription,
			people,
			fullMonthly,
			yourMonthly,
			owedMonthly,
			perPerson: owedMonthly / (people - 1)
		});
	}

	plans.sort((a, b) => b.owedMonthly - a.owedMonthly);
	return { plans, owedMonthly: plans.reduce((sum, plan) => sum + plan.owedMonthly, 0) };
}
