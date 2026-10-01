import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import {
	ALL_FILTER,
	BILLING_CYCLES,
	cycleSuffix,
	daysUntil,
	distinctCategories,
	filterAndSortSubscriptions,
	isActive,
	monthlyCost,
	monthlyCostIn,
	nextOccurrenceOnOrAfter,
	periodOf,
	priceIn,
	reminderIsActive,
	summarizeSpend,
	toBillingCycle,
	toIntervalCount,
	toSubscriptionStatus,
	upcomingWithin,
	urgencyFor,
	yearlyCost,
	yearlyCostIn,
	type SubscriptionFilters
} from './subscriptions';
import type { MoneyContext } from './money';

/** `YYYY-MM-DD` of a date, or null when there is none. */
const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'sub_1',
		name: 'Netflix',
		priceMinor: 1599,
		currency: 'EUR',
		category: 'Streaming',
		renewalDate: new Date('2026-10-12'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		...overrides
	};
}

describe('toBillingCycle', () => {
	it.each([
		['yearly', 'yearly'],
		['monthly', 'monthly'],
		['weekly', 'weekly'],
		['quarterly', 'quarterly'],
		['custom', 'custom'],
		['once', 'once'],
		['fortnightly', 'monthly'],
		[null, 'monthly'],
		[undefined, 'monthly'],
		[42, 'monthly']
	])('narrows %s to %s', (input, expected) => {
		expect(toBillingCycle(input)).toBe(expected);
	});

	it('knows every cycle it can produce', () => {
		expect(BILLING_CYCLES.map((cycle) => toBillingCycle(cycle))).toEqual([...BILLING_CYCLES]);
	});
});

describe('toIntervalCount', () => {
	it.each([
		[1, 1],
		[3, 3],
		['6', 6],
		[120, 120],
		[0, 1],
		[-2, 1],
		[121, 1],
		[2.5, 1],
		['abc', 1],
		[null, 1],
		[undefined, 1]
	])('reads %s as %s', (input, expected) => {
		expect(toIntervalCount(input)).toBe(expected);
	});
});

describe('subscription status', () => {
	it.each([
		['active', 'active'],
		['paused', 'paused'],
		['cancelled', 'cancelled'],
		['canceled', 'active'],
		[null, 'active'],
		[undefined, 'active']
	])('narrows %s to %s', (input, expected) => {
		expect(toSubscriptionStatus(input)).toBe(expected);
	});

	it('treats only active subscriptions as active', () => {
		expect(isActive({ status: 'active' })).toBe(true);
		expect(isActive({ status: 'paused' })).toBe(false);
		expect(isActive({ status: 'cancelled' })).toBe(false);
	});
});

describe('periodOf', () => {
	it.each([
		['weekly', 1, { unit: 'day', step: 7 }],
		['monthly', 1, { unit: 'month', step: 1 }],
		['quarterly', 1, { unit: 'month', step: 3 }],
		['yearly', 1, { unit: 'month', step: 12 }],
		['custom', 5, { unit: 'month', step: 5 }],
		['custom', 0, { unit: 'month', step: 1 }],
		['once', 1, null]
	] as const)('%s (interval %i)', (cycle, interval, expected) => {
		expect(periodOf(cycle, interval)).toEqual(expected);
	});

	it('ignores the interval for every cycle except custom', () => {
		expect(periodOf('monthly', 9)).toEqual({ unit: 'month', step: 1 });
	});
});

describe('cycleSuffix', () => {
	it.each([
		['weekly', 1, '/wk'],
		['monthly', 1, '/mo'],
		['quarterly', 1, '/qtr'],
		['yearly', 1, '/yr'],
		['custom', 2, '/2 mo'],
		['custom', 1, '/mo'],
		['once', 1, '']
	])('%s (interval %i) is "%s"', (billingCycle, intervalCount, expected) => {
		expect(cycleSuffix({ billingCycle, intervalCount })).toBe(expected);
	});
});

describe('cost conversion', () => {
	it('leaves a monthly subscription untouched per month', () => {
		const sub = makeSubscription({ priceMinor: 1200, billingCycle: 'monthly' });
		expect(monthlyCost(sub)).toBe(1200);
		expect(yearlyCost(sub)).toBe(14400);
	});

	it('spreads a yearly subscription across twelve months', () => {
		const sub = makeSubscription({ priceMinor: 12000, billingCycle: 'yearly' });
		expect(monthlyCost(sub)).toBe(1000);
		expect(yearlyCost(sub)).toBe(12000);
	});

	it('charges a weekly subscription 52 times a year', () => {
		const sub = makeSubscription({ priceMinor: 1000, billingCycle: 'weekly' });
		expect(yearlyCost(sub)).toBe(52000);
		expect(monthlyCost(sub)).toBeCloseTo((1000 * 52) / 12);
	});

	it('charges a quarterly subscription four times a year', () => {
		const sub = makeSubscription({ priceMinor: 3000, billingCycle: 'quarterly' });
		expect(monthlyCost(sub)).toBe(1000);
		expect(yearlyCost(sub)).toBe(12000);
	});

	it('spreads a custom every-N-months subscription over N months', () => {
		const sub = makeSubscription({ priceMinor: 2000, billingCycle: 'custom', intervalCount: 2 });
		expect(monthlyCost(sub)).toBe(1000);
		expect(yearlyCost(sub)).toBe(12000);

		const sixMonthly = makeSubscription({ priceMinor: 6000, billingCycle: 'custom', intervalCount: 6 });
		expect(monthlyCost(sixMonthly)).toBe(1000);
		expect(yearlyCost(sixMonthly)).toBe(12000);
	});

	it('counts a one-off charge as no recurring spend', () => {
		const sub = makeSubscription({ priceMinor: 5000, billingCycle: 'once' });
		expect(monthlyCost(sub)).toBe(0);
		expect(yearlyCost(sub)).toBe(0);
	});
});

describe('nextOccurrenceOnOrAfter', () => {
	it('keeps an occurrence that already sits on the boundary', () => {
		const result = nextOccurrenceOnOrAfter('2026-10-12', new Date('2026-10-12'), 'monthly');
		expect(isoDay(result)).toBe('2026-10-12');
	});

	it('rolls a monthly subscription forward one month at a time', () => {
		const result = nextOccurrenceOnOrAfter('2026-10-12', new Date('2026-12-20'), 'monthly');
		expect(isoDay(result)).toBe('2027-01-12');
	});

	it('rolls a yearly subscription a full year, not a month', () => {
		const result = nextOccurrenceOnOrAfter('2026-03-01', new Date('2026-10-01'), 'yearly');
		expect(isoDay(result)).toBe('2027-03-01');
	});

	it('crosses a year boundary for monthly subscriptions', () => {
		const result = nextOccurrenceOnOrAfter('2025-11-30', new Date('2026-01-15'), 'monthly');
		expect(result?.getUTCFullYear()).toBe(2026);
	});

	it('returns a future date unchanged', () => {
		const result = nextOccurrenceOnOrAfter('2026-12-31', new Date('2026-10-01'), 'monthly');
		expect(isoDay(result)).toBe('2026-12-31');
	});

	it('clamps a 31st to the end of a short month', () => {
		const result = nextOccurrenceOnOrAfter('2026-01-31', new Date('2026-02-10'), 'monthly');
		expect(isoDay(result)).toBe('2026-02-28');
	});

	it('does not drift after passing through a short month', () => {
		const result = nextOccurrenceOnOrAfter('2026-01-31', new Date('2026-03-10'), 'monthly');
		expect(isoDay(result)).toBe('2026-03-31');
	});

	it('uses 29 Feb in a leap year and clamps to 28 Feb otherwise (yearly)', () => {
		const leap = nextOccurrenceOnOrAfter('2024-02-29', new Date('2027-03-01'), 'yearly');
		expect(isoDay(leap)).toBe('2028-02-29');

		const common = nextOccurrenceOnOrAfter('2024-02-29', new Date('2025-01-01'), 'yearly');
		expect(isoDay(common)).toBe('2025-02-28');
	});

	it('rolls forward across many periods in one step', () => {
		const result = nextOccurrenceOnOrAfter('2020-05-15', new Date('2026-10-12'), 'monthly');
		expect(isoDay(result)).toBe('2026-10-15');
	});
});

describe('distinctCategories', () => {
	it('de-duplicates case-insensitively and sorts', () => {
		const result = distinctCategories([
			{ category: 'Streaming' },
			{ category: 'streaming ' },
			{ category: 'Music' },
			{ category: '' }
		]);
		expect(result).toEqual(['Music', 'Streaming']);
	});
});

const eur: MoneyContext = { display: 'EUR', rates: { EUR: 1 } };
// One euro buys 1.1 US dollars and 160 yen.
const rates = { EUR: 1, USD: 1.1, JPY: 160 };
const inEur: MoneyContext = { display: 'EUR', rates };
const inUsd: MoneyContext = { display: 'USD', rates };

describe('display-currency costs', () => {
	it('leaves a same-currency price unconverted, even with no rates', () => {
		const sub = makeSubscription({ priceMinor: 1599, currency: 'EUR' });
		expect(priceIn(sub, eur)).toBe(15.99);
	});

	it('converts a foreign price into the display currency', () => {
		const sub = makeSubscription({ priceMinor: 1100, currency: 'USD' });
		expect(priceIn(sub, inEur)).toBeCloseTo(10);
	});

	it('uses the currency exponent when reading minor units (yen has none)', () => {
		const sub = makeSubscription({ priceMinor: 1600, currency: 'JPY' });
		expect(priceIn(sub, inEur)).toBeCloseTo(10);
	});

	it('spreads a yearly plan over twelve months after converting', () => {
		const sub = makeSubscription({ priceMinor: 13200, currency: 'USD', billingCycle: 'yearly' });
		expect(monthlyCostIn(sub, inEur)).toBeCloseTo(10);
		expect(yearlyCostIn(sub, inEur)).toBeCloseTo(120);
		expect(monthlyCostIn(sub, inUsd)).toBeCloseTo(11);
	});

	it('returns null when there is no rate for the currency', () => {
		const sub = makeSubscription({ currency: 'CHF' });
		expect(priceIn(sub, inEur)).toBeNull();
		expect(monthlyCostIn(sub, inEur)).toBeNull();
		expect(yearlyCostIn(sub, inEur)).toBeNull();
	});
});

describe('summarizeSpend', () => {
	it('totals mixed currencies in the display currency', () => {
		const summary = summarizeSpend(
			[
				makeSubscription({ id: 'a', priceMinor: 1000, currency: 'EUR' }),
				makeSubscription({ id: 'b', priceMinor: 1100, currency: 'USD' }),
				makeSubscription({ id: 'c', priceMinor: 12000, currency: 'EUR', billingCycle: 'yearly' })
			],
			inEur
		);

		// €10 + $11 (€10) + €120/yr (€10/mo)
		expect(summary.monthly).toBeCloseTo(30);
		expect(summary.yearly).toBeCloseTo(360);
		expect(summary.counted).toBe(3);
		expect(summary.excluded).toBe(0);
	});

	it('leaves out subscriptions it cannot convert and counts them', () => {
		const summary = summarizeSpend(
			[
				makeSubscription({ id: 'a', priceMinor: 1000, currency: 'EUR' }),
				makeSubscription({ id: 'b', priceMinor: 5000, currency: 'CHF' })
			],
			inEur
		);

		expect(summary.monthly).toBeCloseTo(10);
		expect(summary.counted).toBe(1);
		expect(summary.excluded).toBe(1);
	});

	it('is all zeros for no subscriptions', () => {
		expect(summarizeSpend([], eur)).toEqual({ monthly: 0, yearly: 0, counted: 0, excluded: 0 });
	});
});

describe('filterAndSortSubscriptions', () => {
	const money = eur;
	const now = new Date(2026, 9, 12);
	const base: SubscriptionFilters = {
		query: '',
		category: ALL_FILTER,
		cycle: ALL_FILTER,
		status: ALL_FILTER,
		sortBy: 'renewal'
	};
	const subs = [
		makeSubscription({
			id: 'netflix',
			name: 'Netflix',
			priceMinor: 1500,
			category: 'Streaming',
			renewalDate: new Date('2026-10-20')
		}),
		makeSubscription({
			id: 'spotify',
			name: 'Spotify',
			priceMinor: 1000,
			category: 'Music',
			renewalDate: new Date('2026-10-14')
		}),
		makeSubscription({
			id: 'icloud',
			name: 'iCloud',
			priceMinor: 6000,
			category: 'Storage',
			billingCycle: 'yearly',
			renewalDate: new Date('2026-03-01')
		})
	];
	const ids = (result: Subscription[]) => result.map((s) => s.id);

	it('sorts by next occurrence, rolling stale dates forward', () => {
		expect(ids(filterAndSortSubscriptions(subs, base, now, money))).toEqual([
			'spotify',
			'netflix',
			'icloud'
		]);
	});

	it('sorts by monthly cost, highest first', () => {
		const result = filterAndSortSubscriptions(subs, { ...base, sortBy: 'price' }, now, money);
		expect(ids(result)).toEqual(['netflix', 'spotify', 'icloud']);
	});

	it('sorts price across currencies in the display currency, unconvertible last', () => {
		const mixed = [
			makeSubscription({ id: 'chf', priceMinor: 99999, currency: 'CHF' }),
			makeSubscription({ id: 'eur', priceMinor: 1000, currency: 'EUR' }),
			makeSubscription({ id: 'usd', priceMinor: 2200, currency: 'USD' }), // €20
			makeSubscription({ id: 'jpy', priceMinor: 4800, currency: 'JPY' }) // €30
		];
		const result = filterAndSortSubscriptions(mixed, { ...base, sortBy: 'price' }, now, inEur);
		expect(ids(result)).toEqual(['jpy', 'usd', 'eur', 'chf']);
	});

	it('sorts by name', () => {
		const result = filterAndSortSubscriptions(subs, { ...base, sortBy: 'name' }, now, money);
		expect(ids(result)).toEqual(['icloud', 'netflix', 'spotify']);
	});

	it('searches name and category, ignoring case', () => {
		expect(ids(filterAndSortSubscriptions(subs, { ...base, query: 'NETF' }, now, money))).toEqual([
			'netflix'
		]);
		expect(ids(filterAndSortSubscriptions(subs, { ...base, query: 'music' }, now, money))).toEqual([
			'spotify'
		]);
	});

	it('filters by category and cycle', () => {
		expect(ids(filterAndSortSubscriptions(subs, { ...base, category: 'streaming' }, now, money))).toEqual([
			'netflix'
		]);
		expect(ids(filterAndSortSubscriptions(subs, { ...base, cycle: 'yearly' }, now, money))).toEqual([
			'icloud'
		]);
	});

	it('filters by status', () => {
		const withStatuses = [
			makeSubscription({ id: 'on', status: 'active' }),
			makeSubscription({ id: 'break', status: 'paused' }),
			makeSubscription({ id: 'gone', status: 'cancelled' })
		];
		const only = (status: SubscriptionFilters['status']) =>
			ids(filterAndSortSubscriptions(withStatuses, { ...base, status }, now, money));

		expect(only('active')).toEqual(['on']);
		expect(only('paused')).toEqual(['break']);
		expect(only('cancelled')).toEqual(['gone']);
		expect(only(ALL_FILTER)).toHaveLength(3);
	});

	it('filters by any of the newer cycles', () => {
		const cycles = [
			makeSubscription({ id: 'week', billingCycle: 'weekly' }),
			makeSubscription({ id: 'quarter', billingCycle: 'quarterly' }),
			makeSubscription({ id: 'once', billingCycle: 'once' }),
			makeSubscription({ id: 'month', billingCycle: 'monthly' })
		];
		const only = (cycle: SubscriptionFilters['cycle']) =>
			ids(filterAndSortSubscriptions(cycles, { ...base, cycle }, now, money));

		expect(only('weekly')).toEqual(['week']);
		expect(only('quarterly')).toEqual(['quarter']);
		expect(only('once')).toEqual(['once']);
	});

	it('sorts a finished one-off charge after everything with a next date', () => {
		const mixed = [
			makeSubscription({ id: 'done', billingCycle: 'once', renewalDate: new Date('2026-01-01') }),
			makeSubscription({ id: 'later', renewalDate: new Date('2026-10-30') }),
			makeSubscription({ id: 'sooner', renewalDate: new Date('2026-10-14') })
		];
		expect(ids(filterAndSortSubscriptions(mixed, base, now, money))).toEqual([
			'sooner',
			'later',
			'done'
		]);
	});

	it('does not mutate the input array', () => {
		const copy = [...subs];
		filterAndSortSubscriptions(subs, { ...base, sortBy: 'name' }, now, money);
		expect(subs).toEqual(copy);
	});
});

describe('daysUntil', () => {
	it('returns 0 for a renewal landing today', () => {
		expect(daysUntil('2026-10-12', new Date(2026, 9, 12, 23, 30))).toBe(0);
	});

	it('is unaffected by the time of day', () => {
		const early = daysUntil('2026-10-15', new Date(2026, 9, 12, 0, 1));
		const late = daysUntil('2026-10-15', new Date(2026, 9, 12, 23, 59));
		expect(early).toBe(3);
		expect(late).toBe(3);
	});

	it('survives a spring-forward DST transition', () => {
		// Europe/Amsterdam springs forward on 2026-03-29.
		expect(daysUntil('2026-03-30', new Date(2026, 2, 27))).toBe(3);
	});

	it('goes negative for a past renewal', () => {
		expect(daysUntil('2026-10-01', new Date(2026, 9, 12))).toBe(-11);
	});
});

describe('urgencyFor', () => {
	it.each([
		[0, 'urgent'],
		[3, 'urgent'],
		[4, 'soon'],
		[7, 'soon'],
		[8, 'normal'],
		[30, 'normal']
	])('maps %i days to %s', (days, expected) => {
		expect(urgencyFor(days)).toBe(expected);
	});
});

describe('upcomingWithin', () => {
	const now = new Date(2026, 9, 12); // 12 Oct 2026, local

	it('includes a renewal due today and sorts by proximity', () => {
		const result = upcomingWithin(
			[
				makeSubscription({ id: 'later', renewalDate: new Date('2026-10-20') }),
				makeSubscription({ id: 'today', renewalDate: new Date('2026-10-12') })
			],
			now,
			30
		);

		expect(result.map((r) => r.subscription.id)).toEqual(['today', 'later']);
		expect(result[0].days).toBe(0);
		expect(result[0].urgency).toBe('urgent');
	});

	it('excludes renewals beyond the window', () => {
		const result = upcomingWithin(
			[makeSubscription({ renewalDate: new Date('2026-12-01') })],
			now,
			30
		);
		expect(result).toHaveLength(0);
	});

	it('rolls a stale past date forward instead of dropping it', () => {
		const result = upcomingWithin(
			[makeSubscription({ renewalDate: new Date('2025-10-14') })],
			now,
			30
		);
		expect(result).toHaveLength(1);
		expect(result[0].occurrence.toISOString().slice(0, 10)).toBe('2026-10-14');
	});

	it('does not surface a yearly subscription whose next charge is months away', () => {
		const result = upcomingWithin(
			[makeSubscription({ renewalDate: new Date('2026-03-01'), billingCycle: 'yearly' })],
			now,
			30
		);
		expect(result).toHaveLength(0);
	});
});

describe('reminderIsActive', () => {
	const now = new Date(2026, 9, 12);
	const currentOccurrence = new Date('2026-10-14');

	it('is active when nothing has been acknowledged', () => {
		const sub = makeSubscription({ renewalDate: currentOccurrence });
		expect(reminderIsActive(sub, now)).toBe(true);
	});

	it('is suppressed once the current occurrence is dismissed', () => {
		const sub = makeSubscription({
			renewalDate: currentOccurrence,
			reminderAckedOccurrence: currentOccurrence
		});
		expect(reminderIsActive(sub, now)).toBe(false);
	});

	it('stays suppressed while a snooze is still running', () => {
		const sub = makeSubscription({
			renewalDate: currentOccurrence,
			reminderAckedOccurrence: currentOccurrence,
			reminderSnoozedUntil: new Date(2026, 9, 13)
		});
		expect(reminderIsActive(sub, now)).toBe(false);
	});

	it('revives once the snooze has expired', () => {
		const sub = makeSubscription({
			renewalDate: currentOccurrence,
			reminderAckedOccurrence: currentOccurrence,
			reminderSnoozedUntil: new Date(2026, 9, 11)
		});
		expect(reminderIsActive(sub, now)).toBe(true);
	});

	it('revives by itself when the renewal rolls to the next period', () => {
		// Acknowledged last month; the upcoming occurrence is a different date.
		const sub = makeSubscription({
			renewalDate: new Date('2026-10-14'),
			reminderAckedOccurrence: new Date('2026-09-14')
		});
		expect(reminderIsActive(sub, now)).toBe(true);
	});
});
