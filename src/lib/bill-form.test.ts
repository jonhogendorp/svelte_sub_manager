import { describe, expect, it } from 'vitest';
import { parseBillForm, parsePaymentForm } from './bill-form';

function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

const valid = {
	name: 'Water',
	kind: 'Utilities',
	estimate: '45.50',
	currency: 'EUR',
	billingCycle: 'quarterly',
	renewalDate: '2026-11-01'
};

describe('parseBillForm', () => {
	it('parses a valid bill', () => {
		const parsed = parseBillForm(form(valid));
		expect(parsed.error).toBeUndefined();
		expect(parsed.data).toMatchObject({
			name: 'Water',
			kind: 'Utilities',
			estimateMinor: 4550,
			billingCycle: 'quarterly',
			intervalCount: 1,
			status: 'active',
			notes: null
		});
	});

	it('requires the main fields', () => {
		expect(parseBillForm(form({ ...valid, name: ' ' })).error).toBe('Please fill in all fields.');
	});

	it('rejects a one-off cycle', () => {
		expect(parseBillForm(form({ ...valid, billingCycle: 'once' })).error).toMatch(/repeat/);
	});

	it('rejects zero, extra decimals and unknown currencies', () => {
		expect(parseBillForm(form({ ...valid, estimate: '0' })).error).toMatch(/greater than zero/);
		expect(parseBillForm(form({ ...valid, estimate: '1.999' })).error).toMatch(/decimal/);
		expect(parseBillForm(form({ ...valid, currency: 'XXX' })).error).toMatch(/currency/);
	});

	it('validates the custom interval', () => {
		const custom = { ...valid, billingCycle: 'custom' };
		expect(parseBillForm(form({ ...custom, intervalCount: '0' })).error).toMatch(/months/);
		expect(parseBillForm(form({ ...custom, intervalCount: '2' })).data?.intervalCount).toBe(2);
	});

	it('rejects an invalid due date', () => {
		expect(parseBillForm(form({ ...valid, renewalDate: 'nope' })).error).toMatch(/due date/);
	});
});

describe('parsePaymentForm', () => {
	it('parses a valid payment', () => {
		const parsed = parsePaymentForm(
			form({ amount: '120.10', currency: 'EUR', paidOn: '2026-10-05' })
		);
		expect(parsed.data).toEqual({
			amountMinor: 12010,
			currency: 'EUR',
			paidOn: new Date('2026-10-05')
		});
	});

	it('rejects a missing amount or bad date', () => {
		expect(parsePaymentForm(form({ currency: 'EUR', paidOn: '2026-10-05' })).error).toBeDefined();
		expect(parsePaymentForm(form({ amount: '5', currency: 'EUR', paidOn: 'nope' })).error).toMatch(
			/date/
		);
	});
});
