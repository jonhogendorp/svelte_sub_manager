import type { Subscription } from '../../generated/prisma/client';
import { findBrandIcon } from './brand-icons';
import type { MoneyContext } from './money';
import { countsTowardSpend, monthlyCostIn } from './subscriptions';

/**
 * Well-known services that do the same job, so paying for several is worth a second look.
 * Entries are lowercase brand titles (what {@link findBrandIcon} resolves a name to) or, for
 * services without an icon, the lowercase name itself. Keep this short and easy to extend.
 */
export const SERVICE_GROUPS: Record<string, string[]> = {
	Music: ['spotify', 'youtube music', 'apple music', 'soundcloud', 'pandora', 'deezer', 'tidal'],
	'Video streaming': [
		'netflix',
		'hbo max',
		'hbo',
		'disney+',
		'hulu',
		'prime video',
		'paramount+',
		'apple tv',
		'youtube tv',
		'crunchyroll'
	],
	'Cloud storage': ['dropbox', 'icloud', 'google one', 'onedrive'],
	VPN: ['expressvpn', 'nordvpn', 'proton vpn'],
	'Online courses': ['skillshare', 'coursera', 'udemy', 'pluralsight'],
	'Game subscriptions': ['xbox game pass', 'nintendo switch online', 'apple arcade'],
	'AI assistants': ['chatgpt', 'claude', 'openai', 'anthropic'],
	News: ['new york times', 'apple news']
};

/** Categories too vague to mean "the same kind of thing". */
const GENERIC_CATEGORIES = new Set([
	'other',
	'others',
	'misc',
	'miscellaneous',
	'general',
	'various'
]);

export type OverlapKind = 'duplicate' | 'group' | 'category';

export interface OverlapFinding {
	/** Stable across renders and tied to the members, so a dismissal ends when they change. */
	id: string;
	kind: OverlapKind;
	/** The service, group or category involved. */
	label: string;
	subscriptions: Subscription[];
	/** Combined monthly cost in major units of the display currency (unconvertible ones left out). */
	monthly: number;
}

/** Lowercase, trimmed, single-spaced: how names are compared. */
export function normalizeName(name: string): string {
	return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** The identity of a service: its brand title when known, else the normalized name. */
function serviceKey(sub: Pick<Subscription, 'name'>): string {
	const brand = findBrandIcon(sub.name);
	return brand ? brand.title.toLowerCase() : normalizeName(sub.name);
}

function groupOf(key: string): string | undefined {
	return Object.entries(SERVICE_GROUPS).find(([, members]) => members.includes(key))?.[0];
}

function finding(
	kind: OverlapKind,
	label: string,
	subscriptions: Subscription[],
	money: MoneyContext
): OverlapFinding {
	const members = [...subscriptions].sort((a, b) => a.name.localeCompare(b.name));
	const ids = members.map((sub) => sub.id).sort();
	return {
		id: `${kind}:${label.toLowerCase()}:${ids.join(',')}`,
		kind,
		label,
		subscriptions: members,
		monthly: members.reduce((sum, sub) => sum + (monthlyCostIn(sub, money) ?? 0), 0)
	};
}

function bucket<T>(items: T[], keyOf: (item: T) => string | undefined): Map<string, T[]> {
	const buckets = new Map<string, T[]>();
	for (const item of items) {
		const key = keyOf(item);
		if (key === undefined) continue;
		buckets.set(key, [...(buckets.get(key) ?? []), item]);
	}
	return buckets;
}

/**
 * Places where you may be paying twice: the same subscription added more than once, several
 * well-known services of one kind (two music apps), or several subscriptions sharing a
 * category. Only active recurring subscriptions count. A category finding is left out when a
 * more specific finding already covers all of its members.
 */
export function findOverlaps(subscriptions: Subscription[], money: MoneyContext): OverlapFinding[] {
	const live = subscriptions.filter(countsTowardSpend);
	const findings: OverlapFinding[] = [];

	// Same service entered twice (same name and currency).
	for (const members of bucket(
		live,
		(sub) => `${normalizeName(sub.name)}|${sub.currency}`
	).values()) {
		if (members.length > 1)
			findings.push(finding('duplicate', members[0].name.trim(), members, money));
	}

	// Different services in one curated group.
	for (const [group, members] of bucket(live, (sub) => groupOf(serviceKey(sub))).entries()) {
		if (new Set(members.map(serviceKey)).size > 1) {
			findings.push(finding('group', group, members, money));
		}
	}

	// Shared category, unless something more specific already explains it.
	const covered = findings.map((f) => new Set(f.subscriptions.map((sub) => sub.id)));
	const byCategory = bucket(live, (sub) => {
		const key = sub.category.trim().toLowerCase();
		return key && !GENERIC_CATEGORIES.has(key) ? key : undefined;
	});
	for (const members of byCategory.values()) {
		if (members.length < 2) continue;
		if (covered.some((ids) => members.every((sub) => ids.has(sub.id)))) continue;
		findings.push(finding('category', members[0].category.trim(), members, money));
	}

	return findings.sort((a, b) => b.monthly - a.monthly);
}
