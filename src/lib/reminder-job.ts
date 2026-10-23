import type { Subscription } from '../../generated/prisma/client';
import { buildDigest, dueReminders } from './reminders';
import type { ReminderSettings } from './reminder-settings';

/** How long a record of a sent reminder is kept; far longer than any reminder window. */
export const SENT_RETENTION_DAYS = 120;

const MS_PER_DAY = 86_400_000;

export interface ReminderState {
	settings: ReminderSettings;
	subscriptions: Subscription[];
	/** Keys of the reminders that were already emailed. */
	sentKeys: Set<string>;
}

/** What the check needs from the outside world; injected so the logic can be tested without a database or SMTP server. */
export interface ReminderDeps {
	isConfigured: () => boolean;
	load: () => Promise<ReminderState>;
	send: (mail: { to: string; subject: string; text: string }) => Promise<void>;
	recordSent: (keys: string[], sentAt: Date) => Promise<void>;
	pruneSent: (before: Date) => Promise<void>;
}

export type ReminderOutcome =
	| { status: 'not-configured' | 'disabled' | 'nothing-due'; count: 0 }
	| { status: 'sent'; count: number }
	| { status: 'failed'; count: number; error: unknown };

/**
 * One pass of the hourly check: emails a single digest of everything due and not yet sent. The
 * reminders are recorded only after the mail was accepted, so a failed send is retried next time
 * and a successful one is never repeated.
 */
export async function runReminderCheck(now: Date, deps: ReminderDeps): Promise<ReminderOutcome> {
	if (!deps.isConfigured()) return { status: 'not-configured', count: 0 };

	const { settings, subscriptions, sentKeys } = await deps.load();
	if (!settings.enabled || !settings.email) return { status: 'disabled', count: 0 };

	await deps.pruneSent(new Date(now.getTime() - SENT_RETENTION_DAYS * MS_PER_DAY));

	const due = dueReminders(subscriptions, now, settings.daysBefore, sentKeys);
	const digest = buildDigest(due);
	if (!digest) return { status: 'nothing-due', count: 0 };

	try {
		await deps.send({ to: settings.email, subject: digest.subject, text: digest.text });
	} catch (error) {
		return { status: 'failed', count: due.length, error };
	}

	await deps.recordSent(
		due.map((reminder) => reminder.key),
		now
	);
	return { status: 'sent', count: due.length };
}
