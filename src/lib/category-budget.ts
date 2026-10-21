import type { CategoryBudget, Subscription } from '../../generated/prisma/client';
import { budgetStatus, type BudgetStatus } from './budget';
import type { MoneyContext } from './money';
import { countsTowardSpend, monthlyCostIn } from './subscriptions';

/** Case-insensitive identity of a category, matching how the filters treat them. */
export function categoryKey(category: string): string {
	return category.trim().toLowerCase();
}

export interface CategoryBudgetRow {
	budget: CategoryBudget;
	/** This category's monthly-equivalent spend, in major units of the display currency. */
	spend: number;
	status: BudgetStatus;
}

const SEVERITY = { over: 0, near: 1, ok: 2, none: 3 } as const;

/**
 * Compares each category's monthly spend with its cap, worst first. Paused, cancelled and
 * one-off subscriptions, and those without a known rate, don't count towards spend.
 */
export function categoryBudgetRows(
	subscriptions: Subscription[],
	budgets: CategoryBudget[],
	money: MoneyContext
): CategoryBudgetRow[] {
	const spendByKey = new Map<string, number>();
	for (const subscription of subscriptions) {
		if (!countsTowardSpend(subscription)) continue;

		const monthly = monthlyCostIn(subscription, money);
		if (monthly === null) continue;
		const key = categoryKey(subscription.category);
		spendByKey.set(key, (spendByKey.get(key) ?? 0) + monthly);
	}

	return budgets
		.map((budget) => {
			const spend = spendByKey.get(categoryKey(budget.category)) ?? 0;
			return {
				budget,
				spend,
				status: budgetStatus(spend, { minor: budget.budgetMinor, currency: budget.currency }, money)
			};
		})
		.sort(
			(a, b) =>
				SEVERITY[a.status.state] - SEVERITY[b.status.state] ||
				b.status.percent - a.status.percent ||
				a.budget.category.localeCompare(b.budget.category)
		);
}
