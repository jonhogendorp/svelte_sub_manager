import { describe, expect, it } from 'vitest';
import { formatRenewalDay, toDateInputValue } from './format';

describe('toDateInputValue', () => {
	it('reads a stored UTC-midnight date back as the same calendar day', () => {
		expect(toDateInputValue(new Date('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
	});

	it('does not shift the day late in the UTC day', () => {
		expect(toDateInputValue(new Date('2026-10-12T23:59:00Z'))).toBe('2026-10-12');
	});

	it('accepts an ISO string', () => {
		expect(toDateInputValue('2026-03-01')).toBe('2026-03-01');
	});
});

describe('formatRenewalDay', () => {
	it('shows day and short month', () => {
		expect(formatRenewalDay('2026-10-12')).toBe('12 Oct');
	});

	it('is stable regardless of local timezone (reads the date in UTC)', () => {
		expect(formatRenewalDay(new Date('2026-01-01T00:00:00Z'))).toBe('1 Jan');
	});
});
