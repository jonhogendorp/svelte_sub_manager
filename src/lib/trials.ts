import type { Subscription } from '../../generated/prisma/client';
import type { MoneyContext } from './money';
import {
	daysUntil,
	isActive,
	priceIn,
	trialEndOn,
	urgencyFor,
	type Urgency
} from './subscriptions';

export interface TrialAtRisk {
	subscription: Subscription;
	/** The last day of the trial; the first charge follows it. */
	endsOn: Date;
	days: number;
	urgency: Urgency;
	/** The first charge, in major units of the display currency; null when no rate is known. */
	charge: number | null;
}

/** Active subscriptions whose free trial is still running, soonest end first. */
export function trialsAtRisk(
	subscriptions: Subscription[],
	now: Date,
	money: MoneyContext
): TrialAtRisk[] {
	const trials: TrialAtRisk[] = [];
	for (const subscription of subscriptions) {
		if (!isActive(subscription)) continue;

		const endsOn = trialEndOn(subscription, now);
		if (!endsOn) continue;

		const days = daysUntil(endsOn, now);
		trials.push({
			subscription,
			endsOn,
			days,
			urgency: urgencyFor(days),
			charge: priceIn(subscription, money)
		});
	}
	return trials.sort((a, b) => a.days - b.days);
}

export interface TrialExposure {
	/** Sum of the first charges, in major units of the display currency. */
	total: number;
	/** Trials left out of the total because no exchange rate is known. */
	excluded: number;
}

/** What you will be charged if none of these trials is cancelled. */
export function trialExposure(trials: TrialAtRisk[]): TrialExposure {
	let total = 0;
	let excluded = 0;
	for (const { charge } of trials) {
		if (charge === null) excluded += 1;
		else total += charge;
	}
	return { total, excluded };
}
