import { MAX_REMINDER_DAYS, MIN_REMINDER_DAYS } from './reminders';
import { EMAIL_PATTERN, MAX_EMAIL_LENGTH } from './subscription-form';

export interface ReminderSettings {
	enabled: boolean;
	/** Where reminders are sent; null when not set. */
	email: string | null;
	/** How many days ahead of a charge, trial end or cancellation deadline to remind. */
	daysBefore: number;
}

export type ParsedReminderSettings =
	{ error: string; data?: undefined } | { error?: undefined; data: ReminderSettings };

/** Validates the reminder settings form. Turning reminders on needs an address to send them to. */
export function parseReminderSettings(formData: FormData): ParsedReminderSettings {
	const enabled = formData.has('enabled');

	const email = String(formData.get('email') ?? '').trim();
	if (email !== '' && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
		return { error: 'Please enter a valid email address.' };
	}
	if (enabled && email === '') {
		return { error: 'Enter the email address the reminders should be sent to.' };
	}

	const daysRaw = String(formData.get('daysBefore') ?? '').trim();
	const days = Number(daysRaw);
	if (!/^[0-9]+$/.test(daysRaw) || days < MIN_REMINDER_DAYS || days > MAX_REMINDER_DAYS) {
		return {
			error: `Remind me between ${MIN_REMINDER_DAYS} and ${MAX_REMINDER_DAYS} days ahead.`
		};
	}

	return { data: { enabled, email: email === '' ? null : email, daysBefore: days } };
}
