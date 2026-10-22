import { describe, expect, it } from 'vitest';
import { noticeDeadline, toCancelUrl } from './cancellation';

const now = new Date(2026, 9, 15); // 15 October 2026

const base = {
	renewalDate: new Date('2026-11-15'),
	billingCycle: 'monthly',
	intervalCount: 1,
	status: 'active',
	cancelNoticeDays: 30
};

describe('toCancelUrl', () => {
	it('accepts http and https addresses', () => {
		expect(toCancelUrl(' https://example.com/cancel ')).toBe('https://example.com/cancel');
		expect(toCancelUrl('http://example.com')).toBe('http://example.com/');
	});

	it('rejects anything else, including script URLs', () => {
		for (const value of ['javascript:alert(1)', 'ftp://x.com', 'example.com', '', null, 5]) {
			expect(toCancelUrl(value)).toBeNull();
		}
	});
});

describe('noticeDeadline', () => {
	it('counts back from the next charge', () => {
		const deadline = noticeDeadline(base, now);
		expect(deadline?.renewal).toEqual(new Date('2026-11-15'));
		expect(deadline?.by).toEqual(new Date('2026-10-16'));
		expect(deadline?.days).toBe(1);
	});

	it('goes negative once the deadline has passed', () => {
		expect(noticeDeadline({ ...base, cancelNoticeDays: 60 }, now)?.days).toBeLessThan(0);
	});

	it('is null without notice, when inactive, or for a finished one-off', () => {
		expect(noticeDeadline({ ...base, cancelNoticeDays: null }, now)).toBeNull();
		expect(noticeDeadline({ ...base, status: 'paused' }, now)).toBeNull();
		expect(
			noticeDeadline({ ...base, billingCycle: 'once', renewalDate: new Date('2026-01-01') }, now)
		).toBeNull();
	});
});
