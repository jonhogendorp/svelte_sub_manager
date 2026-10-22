import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { monthGrid } from './calendar-grid';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'A',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'X',
		renewalDate: new Date('2026-10-15'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		accountEmail: null,
		paymentMethod: null,
		notes: null,
		usageRating: null,
		cancelledAt: null,
		yearlyPriceMinor: null,
		cancelUrl: null,
		cancelNoticeDays: null,
		startedOn: null,
		...overrides
	};
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const flat = (weeks: ReturnType<typeof monthGrid>) => weeks.flat();
const dayOf = (weeks: ReturnType<typeof monthGrid>, date: string) =>
	flat(weeks).find((day) => iso(day.date) === date);

describe('monthGrid layout', () => {
	it('starts weeks on Monday and covers the whole month', () => {
		// October 2026 starts on a Thursday and has 31 days: 4 days before + 31 = 35 = 5 weeks.
		const weeks = monthGrid([], 2026, 9, money);
		expect(weeks).toHaveLength(5);
		expect(weeks.every((week) => week.length === 7)).toBe(true);
		expect(iso(weeks[0][0].date)).toBe('2026-09-28');
		expect(weeks[0][0].date.getUTCDay()).toBe(1);
		expect(iso(weeks[4][6].date)).toBe('2026-11-01');
	});

	it('marks the days outside the month', () => {
		const days = flat(monthGrid([], 2026, 9, money));
		expect(days.filter((day) => day.inMonth)).toHaveLength(31);
		expect(dayOf(monthGrid([], 2026, 9, money), '2026-09-30')?.inMonth).toBe(false);
	});

	it('needs six rows when a 31-day month starts late in the week', () => {
		// August 2026 starts on a Saturday: 5 days before + 31 = 36 → 6 weeks.
		expect(monthGrid([], 2026, 7, money)).toHaveLength(6);
	});

	it('handles a month that starts on Monday and fits four weeks', () => {
		// February 2027 starts on a Monday and has 28 days.
		expect(monthGrid([], 2027, 1, money)).toHaveLength(4);
	});
});

describe('monthGrid charges', () => {
	it('places a monthly renewal on its day, with the converted amount', () => {
		const weeks = monthGrid([sub({ priceMinor: 2000, currency: 'USD' })], 2026, 9, money);
		const day = dayOf(weeks, '2026-10-15');
		expect(day?.charges).toHaveLength(1);
		expect(day?.charges[0]).toMatchObject({ kind: 'renewal', amount: 10 });
		expect(day?.total).toBe(10);
		expect(flat(weeks).filter((d) => d.charges.length > 0)).toHaveLength(1);
	});

	it('shows charges in the neighbouring months that the grid displays', () => {
		const weeks = monthGrid([sub({ renewalDate: new Date('2026-09-30') })], 2026, 9, money);
		const day = dayOf(weeks, '2026-09-30');
		expect(day?.inMonth).toBe(false);
		expect(day?.charges).toHaveLength(1);
	});

	it('repeats a weekly plan every week', () => {
		const weeks = monthGrid(
			[sub({ billingCycle: 'weekly', renewalDate: new Date('2026-10-01') })],
			2026,
			9,
			money
		);
		const charged = flat(weeks)
			.filter((day) => day.charges.length > 0)
			.map((day) => iso(day.date));
		expect(charged).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']);
	});

	it('clamps a 31st renewal to the end of a short month', () => {
		const weeks = monthGrid([sub({ renewalDate: new Date('2026-01-31') })], 2026, 1, money);
		expect(dayOf(weeks, '2026-02-28')?.charges).toHaveLength(1);
	});

	it('shows a yearly plan only in its month', () => {
		const yearly = sub({ billingCycle: 'yearly', renewalDate: new Date('2025-10-15') });
		expect(dayOf(monthGrid([yearly], 2026, 9, money), '2026-10-15')?.charges).toHaveLength(1);
		expect(flat(monthGrid([yearly], 2026, 10, money)).some((d) => d.charges.length > 0)).toBe(
			false
		);
	});

	it('shows a one-off charge once, and not before it exists', () => {
		const once = sub({ billingCycle: 'once', renewalDate: new Date('2026-10-20') });
		expect(dayOf(monthGrid([once], 2026, 9, money), '2026-10-20')?.charges).toHaveLength(1);
		expect(flat(monthGrid([once], 2026, 10, money)).some((d) => d.charges.length > 0)).toBe(false);
		expect(flat(monthGrid([once], 2026, 8, money)).some((d) => d.charges.length > 0)).toBe(false);
	});

	it('shows a trial ending, and only the trial when it is also the first charge day', () => {
		const trial = sub({
			renewalDate: new Date('2026-10-15'),
			trialEndsAt: new Date('2026-10-15')
		});
		const day = dayOf(monthGrid([trial], 2026, 9, money), '2026-10-15');
		expect(day?.charges.map((c) => c.kind)).toEqual(['trial']);

		const earlier = sub({ trialEndsAt: new Date('2026-10-10') });
		const weeks = monthGrid([earlier], 2026, 9, money);
		expect(dayOf(weeks, '2026-10-10')?.charges.map((c) => c.kind)).toEqual(['trial']);
		expect(dayOf(weeks, '2026-10-15')?.charges.map((c) => c.kind)).toEqual(['renewal']);
	});

	it('leaves out paused and cancelled subscriptions', () => {
		const weeks = monthGrid(
			[sub({ id: '1', status: 'paused' }), sub({ id: '2', status: 'cancelled' })],
			2026,
			9,
			money
		);
		expect(flat(weeks).some((day) => day.charges.length > 0)).toBe(false);
	});

	it('keeps a charge without an exchange rate but adds nothing to the total', () => {
		const weeks = monthGrid([sub({ currency: 'JPY' })], 2026, 9, money);
		const day = dayOf(weeks, '2026-10-15');
		expect(day?.charges[0].amount).toBeNull();
		expect(day?.total).toBe(0);
	});

	it('sums several charges on one day', () => {
		const weeks = monthGrid(
			[sub({ id: '1', priceMinor: 1000 }), sub({ id: '2', priceMinor: 550 })],
			2026,
			9,
			money
		);
		expect(dayOf(weeks, '2026-10-15')?.total).toBeCloseTo(15.5);
	});
});
