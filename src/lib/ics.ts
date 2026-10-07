import type { Subscription } from '../../generated/prisma/client';
import { formatSubscriptionPrice } from './money';
import {
	isActive,
	occurrencesBetween,
	toBillingCycle
} from './subscriptions';

const PRODUCT_ID = '-//Subscription Manager//EN';

/** How far ahead charges are listed. */
export const CALENDAR_HORIZON_DAYS = 365;

/** Escapes TEXT values per RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll(';', '\\;')
		.replaceAll(',', '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line to 75 octets, continuing on lines that start with a space (§3.1). */
export function foldLine(line: string): string {
	const encoder = new TextEncoder();
	if (encoder.encode(line).length <= 75) return line;

	const parts: string[] = [];
	let current = '';
	let currentBytes = 0;
	// The continuation lines lose one octet to their leading space.
	let limit = 75;
	for (const char of line) {
		const bytes = encoder.encode(char).length;
		if (currentBytes + bytes > limit) {
			parts.push(current);
			current = '';
			currentBytes = 0;
			limit = 74;
		}
		current += char;
		currentBytes += bytes;
	}
	parts.push(current);
	return parts.join('\r\n ');
}

/** `YYYYMMDD` of a date, read in UTC (how renewal dates are stored). */
function icsDate(date: Date): string {
	return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function nextDay(date: Date): Date {
	return new Date(date.getTime() + 86_400_000);
}

interface CalendarEvent {
	uid: string;
	day: Date;
	summary: string;
	description: string;
}

function eventsFor(sub: Subscription, start: Date, end: Date): CalendarEvent[] {
	const events: CalendarEvent[] = [];
	const details = [
		formatSubscriptionPrice(sub),
		sub.category,
		sub.paymentMethod ? `Paid with ${sub.paymentMethod}` : ''
	]
		.filter(Boolean)
		.join(' · ');

	for (const day of occurrencesBetween(
		sub.renewalDate,
		start,
		end,
		toBillingCycle(sub.billingCycle),
		sub.intervalCount
	)) {
		events.push({
			uid: `${sub.id}-${icsDate(day)}@subscription-manager`,
			day,
			summary: `${sub.name} renews`,
			description: details
		});
	}

	if (sub.trialEndsAt) {
		const trialEnd = new Date(sub.trialEndsAt);
		if (trialEnd >= start && trialEnd < end) {
			events.push({
				uid: `${sub.id}-trial-${icsDate(trialEnd)}@subscription-manager`,
				day: trialEnd,
				summary: `${sub.name} free trial ends`,
				description: `Cancel before the first charge (${details}).`
			});
		}
	}
	return events;
}

/**
 * An iCalendar feed of the coming year's charges and trial ends for active subscriptions,
 * as all-day events with a reminder the day before. `now` stamps the events.
 */
export function subscriptionsToIcs(subscriptions: Subscription[], now: Date): string {
	const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const end = new Date(start.getTime() + CALENDAR_HORIZON_DAYS * 86_400_000);
	const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:${PRODUCT_ID}`,
		'CALSCALE:GREGORIAN',
		'X-WR-CALNAME:Subscriptions'
	];

	for (const sub of subscriptions) {
		if (!isActive(sub)) continue;
		for (const event of eventsFor(sub, start, end)) {
			lines.push(
				'BEGIN:VEVENT',
				`UID:${event.uid}`,
				`DTSTAMP:${stamp}`,
				`DTSTART;VALUE=DATE:${icsDate(event.day)}`,
				`DTEND;VALUE=DATE:${icsDate(nextDay(event.day))}`,
				`SUMMARY:${escapeIcsText(event.summary)}`,
				`DESCRIPTION:${escapeIcsText(event.description)}`,
				'TRANSP:TRANSPARENT',
				'BEGIN:VALARM',
				'ACTION:DISPLAY',
				`DESCRIPTION:${escapeIcsText(event.summary)}`,
				'TRIGGER:-P1D',
				'END:VALARM',
				'END:VEVENT'
			);
		}
	}

	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}
