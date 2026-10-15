import { describe, expect, it } from 'vitest';
import type { PriceChange } from '../../generated/prisma/client';
import { changesFor, recentIncrease } from './price-history';

const now = new Date('2026-10-12T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function change(overrides: Partial<PriceChange> = {}): PriceChange {
	return {
		id: 'c1',
		subscriptionId: 'sub_1',
		oldMinor: 1000,
		newMinor: 1200,
		currency: 'EUR',
		changedAt: daysAgo(10),
		...overrides
	};
}

describe('changesFor', () => {
	it('keeps only the subscription’s own changes, newest first', () => {
		const result = changesFor(
			[
				change({ id: 'old', changedAt: daysAgo(30) }),
				change({ id: 'other', subscriptionId: 'sub_2' }),
				change({ id: 'new', changedAt: daysAgo(2) })
			],
			'sub_1'
		);
		expect(result.map((c) => c.id)).toEqual(['new', 'old']);
	});

	it('does not mutate the input', () => {
		const input = [change({ id: 'a', changedAt: daysAgo(30) }), change({ id: 'b' })];
		const copy = [...input];
		changesFor(input, 'sub_1');
		expect(input).toEqual(copy);
	});

	it('returns an empty list when there are none', () => {
		expect(changesFor([], 'sub_1')).toEqual([]);
	});
});

describe('recentIncrease', () => {
	it('is null with no history', () => {
		expect(recentIncrease([], now)).toBeNull();
	});

	it('reports a recent rise', () => {
		const result = recentIncrease([change({ oldMinor: 1000, newMinor: 1200 })], now);
		expect(result).toMatchObject({ fromMinor: 1000, toMinor: 1200, currency: 'EUR' });
	});

	it('stops reporting a rise after the window', () => {
		expect(recentIncrease([change({ changedAt: daysAgo(89) })], now)).not.toBeNull();
		expect(recentIncrease([change({ changedAt: daysAgo(91) })], now)).toBeNull();
	});

	it('honours a custom window', () => {
		expect(recentIncrease([change({ changedAt: daysAgo(20) })], now, 7)).toBeNull();
		expect(recentIncrease([change({ changedAt: daysAgo(20) })], now, 30)).not.toBeNull();
	});

	it('does not flag a price drop', () => {
		expect(recentIncrease([change({ oldMinor: 1200, newMinor: 1000 })], now)).toBeNull();
	});

	it('only the latest change counts: a rise that was reversed is not flagged', () => {
		const result = recentIncrease(
			[
				change({ id: 'rise', oldMinor: 1000, newMinor: 1200, changedAt: daysAgo(20) }),
				change({ id: 'back', oldMinor: 1200, newMinor: 1000, changedAt: daysAgo(5) })
			],
			now
		);
		expect(result).toBeNull();
	});

	it('reports the latest of several rises, whatever the input order', () => {
		const result = recentIncrease(
			[
				change({ id: 'second', oldMinor: 1200, newMinor: 1500, changedAt: daysAgo(3) }),
				change({ id: 'first', oldMinor: 1000, newMinor: 1200, changedAt: daysAgo(30) })
			],
			now
		);
		expect(result).toMatchObject({ fromMinor: 1200, toMinor: 1500 });
	});

	it('measures the percentage from the oldest recorded price', () => {
		const result = recentIncrease(
			[
				change({ id: 'second', oldMinor: 1200, newMinor: 1500, changedAt: daysAgo(3) }),
				change({ id: 'first', oldMinor: 1000, newMinor: 1200, changedAt: daysAgo(30) })
			],
			now
		);
		expect(result).toMatchObject({ originalMinor: 1000, percent: 50 });
	});

	it('falls back to the latest rise when the price started higher', () => {
		const result = recentIncrease(
			[
				change({ id: 'drop', oldMinor: 2000, newMinor: 1000, changedAt: daysAgo(30) }),
				change({ id: 'rise', oldMinor: 1000, newMinor: 1500, changedAt: daysAgo(3) })
			],
			now
		);
		expect(result).toMatchObject({ originalMinor: 1000, percent: 50 });
	});

	it('does not flag an unchanged price', () => {
		expect(recentIncrease([change({ oldMinor: 1000, newMinor: 1000 })], now)).toBeNull();
	});
});
