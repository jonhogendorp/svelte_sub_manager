import { describe, expect, it } from 'vitest';
import { parseReminderSettings } from './reminder-settings';

function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.set(key, value);
	return data;
}

describe('parseReminderSettings', () => {
	it('parses a valid form', () => {
		expect(
			parseReminderSettings(form({ enabled: 'on', email: ' me@example.com ', daysBefore: '5' }))
		).toEqual({ data: { enabled: true, email: 'me@example.com', daysBefore: 5 } });
	});

	it('allows saving an address with reminders off, and clearing it', () => {
		expect(parseReminderSettings(form({ email: 'me@example.com', daysBefore: '3' })).data).toEqual({
			enabled: false,
			email: 'me@example.com',
			daysBefore: 3
		});
		expect(parseReminderSettings(form({ email: '', daysBefore: '3' })).data?.email).toBeNull();
	});

	it('needs an address to turn reminders on', () => {
		expect(parseReminderSettings(form({ enabled: 'on', email: '', daysBefore: '3' })).error).toBe(
			'Enter the email address the reminders should be sent to.'
		);
	});

	it('rejects a malformed or over-long address', () => {
		for (const email of ['nope', 'a@b', 'a b@c.d', `${'x'.repeat(250)}@example.com`]) {
			expect(parseReminderSettings(form({ email, daysBefore: '3' })).error).toBe(
				'Please enter a valid email address.'
			);
		}
	});

	it('rejects a number of days outside 1-14', () => {
		for (const daysBefore of ['0', '15', '2.5', 'soon', '']) {
			expect(parseReminderSettings(form({ email: 'me@example.com', daysBefore })).error).toBe(
				'Remind me between 1 and 14 days ahead.'
			);
		}
	});
});
