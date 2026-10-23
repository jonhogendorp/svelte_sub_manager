import type { Subscription } from '../../generated/prisma/client';
import { noticeDeadline } from './cancellation';
import { formatSubscriptionPrice } from './money';
import { eventReminderIsActive, upcomingWithin } from './subscriptions';

export const MIN_REMINDER_DAYS = 1;
export const MAX_REMINDER_DAYS = 14;

/** A whole number of days between the minimum and maximum; anything else counts as 3. */
export function toReminderDays(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(n) && n >= MIN_REMINDER_DAYS && n <= MAX_REMINDER_DAYS ? n : 3;
}

export type ReminderKind = 'renewal' | 'trial' | 'notice';

export interface DueReminder {
	/** Identifies this reminder for good: kind, subscription and the date it is about. */
	key: string;
	kind: ReminderKind;
	subscription: Subscription;
	/** The charge, trial end or notice deadline the reminder is about. */
	date: Date;
	days: number;
	line: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Names come from the user; keep them on one line so they can't break the email headers. */
const oneLine = (text: string) => text.replace(/[\r\n\t]+/g, ' ').trim();

function whenLabel(days: number): string {
	if (days <= 0) return 'today';
	if (days === 1) return 'tomorrow';
	return `in ${days} days`;
}

function lineFor(
	kind: ReminderKind,
	subscription: Subscription,
	date: Date,
	days: number,
	renewal: Date | null
): string {
	const name = oneLine(subscription.name);
	const price = formatSubscriptionPrice(subscription);
	const day = `${whenLabel(days)} (${isoDay(date)})`;
	switch (kind) {
		case 'renewal':
			return `${name} renews ${day} for ${price}.`;
		case 'trial':
			return `The free trial of ${name} ends ${day}; then ${price} is charged.`;
		case 'notice':
			return `Last day to cancel ${name} ${day} to avoid the ${price} charge on ${isoDay(renewal ?? date)}.`;
	}
}

/**
 * The reminders that should go out now: renewals and trial ends within `daysBefore` days, plus the
 * last day to give notice when a cancellation period is set. Reminders already emailed (by key) or
 * dismissed/snoozed in the app are left out. Prices are the full charge, as on the card.
 */
export function dueReminders(
	subscriptions: Subscription[],
	now: Date,
	daysBefore: number,
	sentKeys: ReadonlySet<string>
): DueReminder[] {
	const reminders: DueReminder[] = [];
	const add = (reminder: DueReminder) => {
		if (!sentKeys.has(reminder.key)) reminders.push(reminder);
	};

	for (const event of upcomingWithin(subscriptions, now, daysBefore)) {
		if (!eventReminderIsActive(event, now)) continue;
		add({
			key: `${event.kind}:${event.subscription.id}:${isoDay(event.occurrence)}`,
			kind: event.kind,
			subscription: event.subscription,
			date: event.occurrence,
			days: event.days,
			line: lineFor(event.kind, event.subscription, event.occurrence, event.days, null)
		});
	}

	for (const subscription of subscriptions) {
		const deadline = noticeDeadline(subscription, now);
		if (!deadline || deadline.days < 0 || deadline.days > daysBefore) continue;
		add({
			key: `notice:${subscription.id}:${isoDay(deadline.by)}`,
			kind: 'notice',
			subscription,
			date: deadline.by,
			days: deadline.days,
			line: lineFor('notice', subscription, deadline.by, deadline.days, deadline.renewal)
		});
	}

	return reminders.sort((a, b) => a.days - b.days || a.line.localeCompare(b.line));
}

export interface Digest {
	subject: string;
	text: string;
}

/** One plain-text email for all due reminders: no markup, so there is nothing to escape. */
export function buildDigest(reminders: DueReminder[]): Digest | null {
	if (reminders.length === 0) return null;

	const first = reminders[0];
	const subject =
		reminders.length === 1
			? `Reminder: ${first.line.replace(/\.$/, '')}`
			: `${reminders.length} subscription reminders, first: ${oneLine(first.subscription.name)} ${whenLabel(first.days)}`;

	const text = [
		reminders.length === 1 ? 'You have 1 reminder:' : `You have ${reminders.length} reminders:`,
		'',
		...reminders.map((reminder) => `- ${reminder.line}`),
		'',
		'Sent by your Subscription Manager. Change or turn off reminders under Settings.'
	].join('\n');

	return { subject, text };
}
