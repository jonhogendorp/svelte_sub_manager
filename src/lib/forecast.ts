import type { Bill, BillPayment, Subscription } from '../../generated/prisma/client';
import { upcomingSpendBuckets } from './charts/chart-data';
import { estimatedAmountMinor } from './bills';
import { convertMajor, toMajor, type MoneyContext } from './money';
import { isActive, occurrencesBetween, toBillingCycle } from './subscriptions';

export interface ForecastMonth {
	label: string;
	monthStart: Date;
	monthEnd: Date;
	/** Major units of the display currency. */
	subscriptions: number;
	bills: number;
	total: number;
}

/**
 * Expected spend in each of the next `monthsAhead` calendar months (starting with the one
 * containing `now`): subscription charges at their price, bill charges at the average of
 * their latest payments. Charges without a known exchange rate are left out.
 */
export function forecastMonths(
	subscriptions: Subscription[],
	bills: Bill[],
	payments: BillPayment[],
	now: Date,
	monthsAhead: number,
	money: MoneyContext,
	locale?: string
): ForecastMonth[] {
	const months: ForecastMonth[] = upcomingSpendBuckets(
		subscriptions,
		now,
		monthsAhead,
		money,
		locale
	).map(({ label, monthStart, monthEnd, total }) => ({
		label,
		monthStart,
		monthEnd,
		subscriptions: total,
		bills: 0,
		total
	}));

	for (const bill of bills) {
		if (!isActive(bill)) continue;

		const charge = convertMajor(
			toMajor(estimatedAmountMinor(bill, payments), bill.currency),
			bill.currency,
			money.display,
			money.rates
		);
		if (charge === null) continue;

		const cycle = toBillingCycle(bill.billingCycle);
		for (const month of months) {
			const charges = occurrencesBetween(
				bill.renewalDate,
				month.monthStart,
				month.monthEnd,
				cycle,
				bill.intervalCount
			);
			month.bills += charge * charges.length;
			month.total += charge * charges.length;
		}
	}
	return months;
}

/** Sum of all months, in major units of the display currency. */
export function forecastTotal(months: ForecastMonth[]): number {
	return months.reduce((sum, month) => sum + month.total, 0);
}
