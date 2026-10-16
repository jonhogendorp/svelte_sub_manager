import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { findOverlaps, normalizeName } from './overlap';

const money = { display: 'EUR', rates: { EUR: 1, USD: 2 } };

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'A',
		priceMinor: 1000,
		currency: 'EUR',
		category: 'Misc stuff',
		renewalDate: new Date('2026-11-20'),
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
		...overrides
	};
}

describe('normalizeName', () => {
	it('ignores case and extra whitespace', () => {
		expect(normalizeName('  Net   Flix ')).toBe('net flix');
	});
});

describe('findOverlaps', () => {
	it('is empty when nothing overlaps', () => {
		expect(
			findOverlaps(
				[
					sub({ id: '1', name: 'Gym', category: 'Health' }),
					sub({ id: '2', name: 'Spotify', category: 'Music' })
				],
				money
			)
		).toEqual([]);
	});

	it('flags the same name added twice', () => {
		const result = findOverlaps(
			[
				sub({ id: '1', name: 'Gym', category: 'Health' }),
				sub({ id: '2', name: ' gym ', category: 'Fitness' })
			],
			money
		);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ kind: 'duplicate', label: 'Gym', monthly: 20 });
	});

	it('does not treat the same name in different currencies as a duplicate', () => {
		expect(
			findOverlaps(
				[
					sub({ id: '1', name: 'Gym', category: 'A' }),
					sub({ id: '2', name: 'Gym', currency: 'USD', category: 'B' })
				],
				money
			)
		).toEqual([]);
	});

	it('flags different well-known services of one kind', () => {
		const result = findOverlaps(
			[
				sub({ id: '1', name: 'Spotify Premium', category: 'A' }),
				sub({ id: '2', name: 'Apple Music', category: 'B' }),
				sub({ id: '3', name: 'Netflix', category: 'C' })
			],
			money
		);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ kind: 'group', label: 'Music', monthly: 20 });
		expect(result[0].subscriptions.map((s) => s.id)).toEqual(['2', '1']);
	});

	it('flags a shared category, ignoring case', () => {
		const result = findOverlaps(
			[
				sub({ id: '1', name: 'Foo', category: 'Tools' }),
				sub({ id: '2', name: 'Bar', category: ' tools ' })
			],
			money
		);
		expect(result).toMatchObject([{ kind: 'category', label: 'Tools' }]);
	});

	it('ignores vague categories', () => {
		expect(
			findOverlaps(
				[
					sub({ id: '1', name: 'Foo', category: 'Other' }),
					sub({ id: '2', name: 'Bar', category: 'other' })
				],
				money
			)
		).toEqual([]);
	});

	it('does not repeat a category finding that a group finding already covers', () => {
		const result = findOverlaps(
			[
				sub({ id: '1', name: 'Netflix', category: 'Streaming' }),
				sub({ id: '2', name: 'Hulu', category: 'Streaming' })
			],
			money
		);
		expect(result.map((f) => f.kind)).toEqual(['group']);
	});

	it('only counts active recurring subscriptions', () => {
		expect(
			findOverlaps(
				[
					sub({ id: '1', name: 'Spotify', category: 'A' }),
					sub({ id: '2', name: 'Apple Music', category: 'B', status: 'paused' }),
					sub({ id: '3', name: 'Tidal', category: 'C', status: 'cancelled' }),
					sub({ id: '4', name: 'Deezer', category: 'D', billingCycle: 'once' })
				],
				money
			)
		).toEqual([]);
	});

	it('gives each finding an id that changes with its members and sorts by cost', () => {
		const pair = [
			sub({ id: '1', name: 'Foo', category: 'T' }),
			sub({ id: '2', name: 'Bar', category: 'T' })
		];
		const [before] = findOverlaps(pair, money);
		const [after] = findOverlaps([...pair, sub({ id: '3', name: 'Baz', category: 'T' })], money);
		expect(before.id).not.toBe(after.id);

		const result = findOverlaps(
			[
				...pair,
				sub({ id: '5', name: 'Gym', category: 'H', priceMinor: 9000 }),
				sub({ id: '6', name: 'Gym', category: 'H2', priceMinor: 9000 })
			],
			money
		);
		expect(result.map((f) => f.label)).toEqual(['Gym', 'T']);
	});
});
