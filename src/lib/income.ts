import type { Bill, BillPayment, Subscription } from '../../generated/prisma/client';
import { summarizeBills } from './bills';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { summarizeSpend } from './subscriptions';

/** Monthly take-home income, in minor units of the currency it was entered in. */
export interface Income {
	minor: number;
	currency: string;
}

export interface IncomeShare {
	/** Major units of the display currency. */
	income: number;
	subscriptions: number;
	bills: number;
	/** Subscriptions plus bills. */
	fixed: number;
	/** Share of income going to subscriptions and bills, 0–100 (can exceed 100). */
	percent: number;
	/** Income left after fixed costs; negative when they exceed income. */
	remaining: number;
}

/**
 * How much of the monthly income is already committed to subscriptions and bills. Null when
 * no income is set or it can't be converted to the display currency.
 */
export function incomeShare(
	subscriptions: Subscription[],
	bills: Bill[],
	payments: BillPayment[],
	income: Income | null,
	money: MoneyContext
): IncomeShare | null {
	if (!income || income.minor <= 0) return null;

	const monthlyIncome = convertMajor(
		toMajor(income.minor, income.currency),
		income.currency,
		money.display,
		money.rates
	);
	if (monthlyIncome === null || monthlyIncome <= 0) return null;

	const subs = summarizeSpend(subscriptions, money).monthly;
	const billTotal = summarizeBills(bills, payments, money).monthly;
	const fixed = subs + billTotal;

	return {
		income: monthlyIncome,
		subscriptions: subs,
		bills: billTotal,
		fixed,
		percent: (fixed / monthlyIncome) * 100,
		remaining: monthlyIncome - fixed
	};
}
