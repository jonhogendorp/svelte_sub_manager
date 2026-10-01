import { describe, expect, it } from 'vitest';
import { parseSubscriptionForm } from './subscription-form';

function formWith(fields: Record<string, string>): FormData {
	const formData = new FormData();
	const defaults = {
		name: 'Netflix',
		price: '15.99',
		category: 'Streaming',
		renewalDate: '2026-10-12',
		billingCycle: 'monthly'
	};
	for (const [key, value] of Object.entries({ ...defaults, ...fields })) {
		formData.set(key, value);
	}
	return formData;
}

describe('parseSubscriptionForm', () => {
	it('parses a valid form', () => {
		const result = parseSubscriptionForm(formWith({}));

		expect(result.error).toBeUndefined();
		expect(result.data).toEqual({
			name: 'Netflix',
			price: 15.99,
			category: 'Streaming',
			renewalDate: new Date('2026-10-12T00:00:00.000Z'),
			billingCycle: 'monthly'
		});
	});

	it('trims whitespace around text fields', () => {
		const result = parseSubscriptionForm(formWith({ name: '  Netflix ', category: ' Streaming  ' }));

		expect(result.data?.name).toBe('Netflix');
		expect(result.data?.category).toBe('Streaming');
	});

	it('keeps a yearly cycle and narrows anything unknown to monthly', () => {
		expect(parseSubscriptionForm(formWith({ billingCycle: 'yearly' })).data?.billingCycle).toBe(
			'yearly'
		);
		expect(parseSubscriptionForm(formWith({ billingCycle: 'fortnightly' })).data?.billingCycle).toBe(
			'monthly'
		);
	});

	it.each([
		['name', { name: '' }],
		['whitespace-only name', { name: '   ' }],
		['category', { category: '' }],
		['price', { price: '' }],
		['renewal date', { renewalDate: '' }]
	])('rejects a missing %s', (_label, fields) => {
		expect(parseSubscriptionForm(formWith(fields))).toEqual({
			error: 'Please fill in all fields.'
		});
	});

	it('rejects a form with no fields at all', () => {
		expect(parseSubscriptionForm(new FormData()).error).toBe('Please fill in all fields.');
	});

	it.each(['0', '-5', '-0.01', 'abc', 'Infinity', 'NaN'])('rejects the price "%s"', (price) => {
		expect(parseSubscriptionForm(formWith({ price })).error).toBe(
			'Price must be greater than zero.'
		);
	});

	it('rejects an unparseable renewal date', () => {
		expect(parseSubscriptionForm(formWith({ renewalDate: 'not-a-date' })).error).toBe(
			'Please enter a valid renewal date.'
		);
	});
});
