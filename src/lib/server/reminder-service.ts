import { runReminderCheck, type ReminderDeps, type ReminderOutcome } from '$lib/reminder-job';
import { isMailConfigured, sendMail } from '$lib/server/mailer';
import { prisma } from '$lib/server/prisma';
import { getSettings } from '$lib/server/settings';

/** The real database and mail server behind the reminder check. */
const deps: ReminderDeps = {
	isConfigured: isMailConfigured,

	load: async () => {
		const [{ reminders }, subscriptions, sent] = await Promise.all([
			getSettings(),
			prisma.subscription.findMany(),
			prisma.sentReminder.findMany({ select: { key: true } })
		]);
		return {
			settings: reminders,
			subscriptions,
			sentKeys: new Set(sent.map((reminder) => reminder.key))
		};
	},

	send: sendMail,

	recordSent: async (keys, sentAt) => {
		// SQLite has no "skip duplicates" for createMany, so upsert one by one.
		await prisma.$transaction(
			keys.map((key) =>
				prisma.sentReminder.upsert({ where: { key }, create: { key, sentAt }, update: {} })
			)
		);
	},

	pruneSent: async (before) => {
		await prisma.sentReminder.deleteMany({ where: { sentAt: { lt: before } } });
	}
};

/** Runs one reminder check against the real database and SMTP server. */
export function checkReminders(now = new Date()): Promise<ReminderOutcome> {
	return runReminderCheck(now, deps);
}
