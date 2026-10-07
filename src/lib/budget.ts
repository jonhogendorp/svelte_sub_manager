import { convertMajor, toMajor, type MoneyContext } from './money';

/** A monthly spending cap, in minor units of the currency it was entered in. */
export interface Budget {
	minor: number;
	currency: string;
}

/** Share of the budget at which the page starts warning. */
export const NEAR_BUDGET_THRESHOLD = 0.8;

export type BudgetState = 'none' | 'ok' | 'near' | 'over';

export interface BudgetStatus {
	state: BudgetState;
	/** Budget in major units of the display currency; 0 when there is none. */
	limit: number;
	/** Spend as a percentage of the limit (can exceed 100). */
	percent: number;
	/** Limit minus spend; negative once over budget. */
	remaining: number;
}

const NO_BUDGET: BudgetStatus = { state: 'none', limit: 0, percent: 0, remaining: 0 };

/**
 * Compares monthly spend (major units of the display currency) with the budget. The
 * budget keeps the currency it was entered in and is converted here, so switching the
 * display currency doesn't change what was set. Without a usable rate there is nothing
 * trustworthy to compare, so the status is "none".
 */
export function budgetStatus(
	monthlySpend: number,
	budget: Budget | null,
	money: MoneyContext
): BudgetStatus {
	if (!budget || budget.minor <= 0) return NO_BUDGET;

	const limit = convertMajor(
		toMajor(budget.minor, budget.currency),
		budget.currency,
		money.display,
		money.rates
	);
	if (limit === null || limit <= 0) return NO_BUDGET;

	const ratio = monthlySpend / limit;
	const state: BudgetState =
		ratio > 1 ? 'over' : ratio >= NEAR_BUDGET_THRESHOLD ? 'near' : 'ok';
	return { state, limit, percent: ratio * 100, remaining: limit - monthlySpend };
}
