import { fail } from '@sveltejs/kit';
import { parseReminderSettings } from '$lib/reminder-settings';
import { isMailConfigured, sendMail } from '$lib/server/mailer';
import { prisma } from '$lib/server/prisma';
import { getSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

/** Minimum time between test emails, so the button can't be used to flood an inbox. */
const TEST_EMAIL_COOLDOWN_MS = 60_000;
let lastTestEmailAt = 0;

export const load: PageServerLoad = async () => {
	const { reminders } = await getSettings();
	return { reminders, mailConfigured: isMailConfigured() };
};

export const actions: Actions = {
	saveReminders: async ({ request }) => {
		const parsed = parseReminderSettings(await request.formData());
		if (parsed.error !== undefined) return fail(400, { error: parsed.error });

		const { enabled, email, daysBefore } = parsed.data;
		await prisma.settings.upsert({
			where: { id: 1 },
			create: {
				id: 1,
				remindersEnabled: enabled,
				reminderEmail: email,
				reminderDaysBefore: daysBefore
			},
			update: { remindersEnabled: enabled, reminderEmail: email, reminderDaysBefore: daysBefore }
		});
		return { saved: true };
	},

	// Always goes to the saved address, never to one supplied with the request.
	sendTestEmail: async () => {
		if (!isMailConfigured()) {
			return fail(400, { testError: 'Email is not set up on the server yet (see .env.example).' });
		}

		const { reminders } = await getSettings();
		if (!reminders.email) {
			return fail(400, { testError: 'Save an email address first.' });
		}

		const wait = lastTestEmailAt + TEST_EMAIL_COOLDOWN_MS - Date.now();
		if (wait > 0) {
			return fail(429, {
				testError: `Please wait ${Math.ceil(wait / 1000)} seconds before sending another test.`
			});
		}
		lastTestEmailAt = Date.now();

		try {
			await sendMail({
				to: reminders.email,
				subject: 'Subscription Manager: test email',
				text: 'This is a test email. Reminders will arrive at this address.'
			});
		} catch (error) {
			console.error('Could not send the test email:', error);
			return fail(502, { testError: 'The mail server did not accept the message.' });
		}
		return { testSent: true };
	}
};
