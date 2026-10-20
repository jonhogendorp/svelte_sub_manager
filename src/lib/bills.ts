import type { Bill, BillPayment } from '../../generated/prisma/client';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { isActive, monthlyCost, yearlyCost, type BillingCycle } from './subscriptions';

/** Bills repeat, so a one-off charge isn't offered. */
export const BILL_CYCLES: readonly BillingCycle[] = [
	'weekly',
	'monthly',
	'quarterly',
	'yearly',
	'custom'
];

/** How many of the latest payments the estimate is averaged over. */
export const ESTIMATE_WINDOW = 3;

type Estimable = Pick<Bill, 'id' | 'estimateMinor' | 'currency'>;
type Payment = Pick<BillPayment, 'billId' | 'amountMinor' | 'currency' | 'paidOn'>;

/** A bill's payments, newest first. */
export function paymentsFor<T extends Pick<BillPayment, 'billId' | 'paidOn'>>(
	bill: Pick<Bill, 'id'>,
	payments: T[]
): T[] {
	return payments
		.filter((payment) => payment.billId === bill.id)
		.sort((a, b) => new Date(b.paidOn).getTime() - new Date(a.paidOn).getTime());
}

/**
 * What the next charge is expected to cost, in the bill's own minor units: the average of
 * the last few payments made in the bill's currency, or the entered estimate before any
 * payment has been logged.
 */
export function estimatedAmountMinor(bill: Estimable, payments: Payment[]): number {
	const recent = paymentsFor(bill, payments)
		.filter((payment) => payment.currency === bill.currency)
		.slice(0, ESTIMATE_WINDOW);
	if (recent.length === 0) return bill.estimateMinor;

	const total = recent.reduce((sum, payment) => sum + payment.amountMinor, 0);
	return Math.round(total / recent.length);
}

type Recurring = Pick<Bill, 'billingCycle' | 'intervalCount'>;

/** Monthly cost in the bill's own minor units, based on the estimate. */
export function monthlyBillCost(bill: Recurring, estimateMinor: number): number {
	return monthlyCost({ ...bill, priceMinor: estimateMinor });
}

/** Yearly cost in the bill's own minor units, based on the estimate. */
export function yearlyBillCost(bill: Recurring, estimateMinor: number): number {
	return yearlyCost({ ...bill, priceMinor: estimateMinor });
}

export interface BillSummary {
	/** Major units of the display currency. */
	monthly: number;
	yearly: number;
	/** Active bills included in the totals. */
	counted: number;
	/** Bills left out because no exchange rate is known for their currency. */
	excluded: number;
}

export function summarizeBills(
	bills: Bill[],
	payments: BillPayment[],
	money: MoneyContext
): BillSummary {
	const summary: BillSummary = { monthly: 0, yearly: 0, counted: 0, excluded: 0 };
	for (const bill of bills) {
		if (!isActive(bill)) continue;

		const estimate = estimatedAmountMinor(bill, payments);
		const monthly = convertMajor(
			toMajor(monthlyBillCost(bill, estimate), bill.currency),
			bill.currency,
			money.display,
			money.rates
		);
		const yearly = convertMajor(
			toMajor(yearlyBillCost(bill, estimate), bill.currency),
			bill.currency,
			money.display,
			money.rates
		);
		if (monthly === null || yearly === null) {
			summary.excluded += 1;
			continue;
		}
		summary.monthly += monthly;
		summary.yearly += yearly;
		summary.counted += 1;
	}
	return summary;
}
