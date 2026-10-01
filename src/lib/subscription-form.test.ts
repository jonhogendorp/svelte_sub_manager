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
			priceMinor: 1599,
			currency: 'EUR',
			category: 'Streaming',
			renewalDate: new Date('2026-10-12T00:00:00.000Z'),
			billingCycle: 'monthly',
			intervalCount: 1,
			status: 'active',
			trialEndsAt: null
		});
	});

	describe('billing cycle', () => {
		it.each(['weekly', 'monthly', 'quarterly', 'yearly', 'once'])('accepts %s', (billingCycle) => {
			const result = parseSubscriptionForm(formWith({ billingCycle }));
			expect(result.data?.billingCycle).toBe(billingCycle);
			expect(result.data?.intervalCount).toBe(1);
		});

		it('reads the interval for a custom cycle', () => {
			const result = parseSubscriptionForm(formWith({ billingCycle: 'custom', intervalCount: '5' }));
			expect(result.data).toMatchObject({ billingCycle: 'custom', intervalCount: 5 });
		});

		it('ignores a leftover interval when the cycle is not custom', () => {
			const result = parseSubscriptionForm(formWith({ billingCycle: 'monthly', intervalCount: '7' }));
			expect(result.data?.intervalCount).toBe(1);
		});

		it.each(['', '0', '-1', '2.5', 'abc', '121', '1e1'])(
			'rejects the custom interval "%s"',
			(intervalCount) => {
				const result = parseSubscriptionForm(formWith({ billingCycle: 'custom', intervalCount }));
				expect(result.error).toBe('Enter a whole number of months between 1 and 120.');
			}
		);

		it('rejects a custom cycle with no interval at all', () => {
			expect(parseSubscriptionForm(formWith({ billingCycle: 'custom' })).error).toBe(
				'Enter a whole number of months between 1 and 120.'
			);
		});
	});

	describe('status', () => {
		it.each(['active', 'paused', 'cancelled'])('accepts %s', (status) => {
			expect(parseSubscriptionForm(formWith({ status })).data?.status).toBe(status);
		});

		it('defaults to active when absent or unknown', () => {
			expect(parseSubscriptionForm(formWith({})).data?.status).toBe('active');
			expect(parseSubscriptionForm(formWith({ status: 'zombie' })).data?.status).toBe('active');
		});
	});

	describe('free trial', () => {
		it('is optional', () => {
			expect(parseSubscriptionForm(formWith({ trialEndsAt: '' })).data?.trialEndsAt).toBeNull();
			expect(parseSubscriptionForm(formWith({ trialEndsAt: '   ' })).data?.trialEndsAt).toBeNull();
		});

		it('is parsed as UTC midnight like the renewal date', () => {
			const result = parseSubscriptionForm(formWith({ trialEndsAt: '2026-10-20' }));
			expect(result.data?.trialEndsAt).toEqual(new Date('2026-10-20T00:00:00.000Z'));
		});

		it('rejects an unparseable date', () => {
			expect(parseSubscriptionForm(formWith({ trialEndsAt: 'soon' })).error).toBe(
				'Please enter a valid trial end date.'
			);
		});
	});

	it('stores the price as integer minor units without float error', () => {
		expect(parseSubscriptionForm(formWith({ price: '19.99' })).data?.priceMinor).toBe(1999);
		expect(parseSubscriptionForm(formWith({ price: '0.29' })).data?.priceMinor).toBe(29);
		expect(parseSubscriptionForm(formWith({ price: '120' })).data?.priceMinor).toBe(12000);
	});

	describe('currency', () => {
		it('defaults to euro when the field is absent', () => {
			const formData = formWith({});
			formData.delete('currency');
			expect(parseSubscriptionForm(formData).data?.currency).toBe('EUR');
		});

		it('keeps a supported currency', () => {
			expect(parseSubscriptionForm(formWith({ currency: 'USD' })).data?.currency).toBe('USD');
		});

		it.each(['XXX', 'usd', ''])('rejects the currency "%s"', (currency) => {
			expect(parseSubscriptionForm(formWith({ currency })).error).toBe(
				'Please choose a supported currency.'
			);
		});

		it('uses the currency’s own number of decimals', () => {
			// Yen has no minor unit: 1500 is 1500 yen, not 15.00.
			expect(parseSubscriptionForm(formWith({ currency: 'JPY', price: '1500' })).data).toMatchObject({
				priceMinor: 1500,
				currency: 'JPY'
			});
			expect(parseSubscriptionForm(formWith({ currency: 'JPY', price: '1500.5' })).error).toBe(
				'JPY prices must be whole numbers.'
			);
		});

		it('rejects more decimals than the currency allows instead of rounding', () => {
			expect(parseSubscriptionForm(formWith({ price: '15.999' })).error).toBe(
				'EUR prices can have at most 2 decimals.'
			);
		});
	});

	it('rejects an absurdly large price', () => {
		expect(parseSubscriptionForm(formWith({ price: '99999999999' })).error).toBe(
			'That price is too large.'
		);
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
