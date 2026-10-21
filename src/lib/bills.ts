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

/** A payment this much above the recent average is flagged as a spike. */
export const SPIKE_THRESHOLD_PERCENT = 25;

/** How many earlier payments the latest one is compared against. */
export const SPIKE_BASELINE_WINDOW = 3;

export interface BillSpike {
	latestMinor: number;
	/** Average of the payments before the latest one, in minor units of `currency`. */
	averageMinor: number;
	currency: string;
	/** How far the latest payment is above the average, in percent. */
	percent: number;
}

/**
 * Flags a bill whose latest payment is unusually high compared with the few before it. Needs at
 * least one earlier payment in the bill's currency; a payment below the average is never a spike.
 */
export function detectSpike(
	bill: Pick<Bill, 'id' | 'currency'>,
	payments: Payment[],
	thresholdPercent = SPIKE_THRESHOLD_PERCENT
): BillSpike | null {
	const history = paymentsFor(bill, payments).filter(
		(payment) => payment.currency === bill.currency
	);
	const [latest, ...earlier] = history;
	const baseline = earlier.slice(0, SPIKE_BASELINE_WINDOW);
	if (!latest || baseline.length === 0) return null;

	const averageMinor =
		baseline.reduce((sum, payment) => sum + payment.amountMinor, 0) / baseline.length;
	if (averageMinor <= 0) return null;

	const percent = ((latest.amountMinor - averageMinor) / averageMinor) * 100;
	if (percent < thresholdPercent) return null;

	return {
		latestMinor: latest.amountMinor,
		averageMinor: Math.round(averageMinor),
		currency: bill.currency,
		percent
	};
}

/** The bill's most recent payments in its own currency, oldest first, for a trend sparkline. */
export function recentAmounts(
	bill: Pick<Bill, 'id' | 'currency'>,
	payments: Payment[],
	limit = 6
): number[] {
	return paymentsFor(bill, payments)
		.filter((payment) => payment.currency === bill.currency)
		.slice(0, limit)
		.reverse()
		.map((payment) => payment.amountMinor);
}
