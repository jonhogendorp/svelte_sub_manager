import { parseCsv } from './csv-import';
import { isSupportedCurrency, minorDigits, type Currency } from './money';
import { nextOccurrenceOnOrAfter, type BillingCycle } from './subscriptions';

/** Upper bound on rows read from one statement, so a huge file can't tie up the server. */
export const MAX_BANK_ROWS = 10_000;

export type Delimiter = ',' | ';' | '\t';

/** Picks the delimiter that splits the first lines into the most consistent number of cells. */
export function detectDelimiter(text: string): Delimiter {
	const lines = text
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.filter((line) => line.trim() !== '')
		.slice(0, 10);

	let best: Delimiter = ',';
	let bestScore = 0;
	for (const delimiter of [',', ';', '\t'] as const) {
		// Quoted cells can hold the delimiter, so count on the parsed rows rather than raw characters.
		const widths = parseCsv(lines.join('\n'), delimiter).map((row) => row.length);
		const first = widths[0] ?? 0;
		if (first < 2) continue;
		const consistent = widths.filter((width) => width === first).length;
		const score = consistent * first;
		if (score > bestScore) {
			best = delimiter;
			bestScore = score;
		}
	}
	return best;
}

/** Which column holds what; `null` when the statement has no such column. */
export interface ColumnMapping {
	date: number | null;
	description: number | null;
	/** One signed column, or null when debit and credit are separate. */
	amount: number | null;
	debit: number | null;
	credit: number | null;
	currency: number | null;
}

const normalizeHeader = (header: string) =>
	header
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z]/g, '');

// Common header names in English, Dutch and German. Matched on the normalised header.
const HEADER_NAMES: Record<keyof ColumnMapping, string[]> = {
	date: [
		'date',
		'bookingdate',
		'transactiondate',
		'valuedate',
		'datum',
		'boekingsdatum',
		'transactiedatum',
		'buchungstag',
		'buchungsdatum',
		'valuta'
	],
	description: [
		'description',
		'details',
		'memo',
		'payee',
		'merchant',
		'narrative',
		'reference',
		'omschrijving',
		'naamomschrijving',
		'naam',
		'mededelingen',
		'buchungstext',
		'verwendungszweck',
		'beguenstigter',
		'auftraggeber'
	],
	amount: ['amount', 'value', 'bedrag', 'betrag', 'amounteur', 'transactionamount'],
	debit: ['debit', 'withdrawal', 'withdrawals', 'moneyout', 'paidout', 'af', 'soll'],
	credit: ['credit', 'deposit', 'deposits', 'moneyin', 'paidin', 'bij', 'haben'],
	currency: ['currency', 'valuta', 'munt', 'waehrung', 'wahrung', 'ccy']
};

/** Guesses the column mapping from the header row; null when no date or description column is found. */
export function guessMapping(headers: string[]): ColumnMapping | null {
	const normalized = headers.map(normalizeHeader);
	const find = (field: keyof ColumnMapping, taken: (number | null)[]): number | null => {
		// An exact match wins; otherwise a header that starts with a longer name ("Bedrag (EUR)").
		for (const exact of [true, false]) {
			for (const name of HEADER_NAMES[field]) {
				if (!exact && name.length < 5) continue;
				const index = normalized.findIndex(
					(header, i) => !taken.includes(i) && (exact ? header === name : header.startsWith(name))
				);
				if (index !== -1) return index;
			}
		}
		return null;
	};

	const date = find('date', []);
	const description = find('description', [date]);
	const amount = find('amount', [date, description]);
	const debit = amount === null ? find('debit', [date, description]) : null;
	const credit = amount === null ? find('credit', [date, description, debit]) : null;
	// "valuta" is a date in Dutch/German exports and a currency elsewhere: only use it as currency
	// when it isn't already the date column.
	const currency = find('currency', [date, description, amount, debit, credit]);

	if (date === null || description === null || (amount === null && debit === null)) return null;
	return { date, description, amount, debit, credit, currency };
}

/**
 * Parses a money amount as banks write it: "1.234,56", "1,234.56", "-12.50", "(12.50)",
 * "12.50-", "€ 12,50". Returns major units, signed, or null when it isn't a number.
 */
export function parseAmount(text: string): number | null {
	let value = text.trim();
	if (value === '') return null;

	let negative = false;
	if (/^\(.*\)$/.test(value)) {
		negative = true;
		value = value.slice(1, -1);
	}
	// Drop currency symbols and codes, spaces (also non-breaking) and apostrophes used as thousands.
	value = value.replace(/[A-Za-z€$£¥\s\u00a0'’]/g, '');
	if (value.endsWith('-')) {
		negative = !negative;
		value = value.slice(0, -1);
	}
	if (value.startsWith('-')) {
		negative = !negative;
		value = value.slice(1);
	} else if (value.startsWith('+')) {
		value = value.slice(1);
	}
	if (!/^[0-9.,]+$/.test(value) || !/[0-9]/.test(value)) return null;

	const lastDot = value.lastIndexOf('.');
	const lastComma = value.lastIndexOf(',');
	let decimalAt = -1;
	if (lastDot !== -1 && lastComma !== -1) {
		decimalAt = Math.max(lastDot, lastComma);
	} else {
		const separator = lastDot !== -1 ? '.' : lastComma !== -1 ? ',' : '';
		if (separator) {
			const count = value.split(separator).length - 1;
			const last = value.lastIndexOf(separator);
			const digitsAfter = value.length - last - 1;
			const integerPart = value.slice(0, last);
			// "1,234" and "1.234.567" are thousands; "12,50" and "0,500" are decimals.
			const looksLikeThousands = count > 1 || (digitsAfter === 3 && integerPart !== '0');
			if (!looksLikeThousands) decimalAt = last;
		}
	}

	const integer = (decimalAt === -1 ? value : value.slice(0, decimalAt)).replace(/[.,]/g, '');
	const fraction = decimalAt === -1 ? '' : value.slice(decimalAt + 1).replace(/[.,]/g, '');
	if (integer === '' && fraction === '') return null;

	const number = Number(`${integer || '0'}${fraction ? `.${fraction}` : ''}`);
	if (!Number.isFinite(number)) return null;
	return negative ? -number : number;
}

function utcDate(year: number, month: number, day: number): Date | null {
	const date = new Date(Date.UTC(year, month - 1, day));
	const valid =
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
	return valid ? date : null;
}

/**
 * Parses the date formats banks use (2026-03-04, 20260304, 04-03-2026, 4/3/26, 04.03.2026) as
 * UTC midnight. When both parts could be the day, `dayFirst` decides; a part above 12 settles it.
 */
export function parseBankDate(text: string, dayFirst = true): Date | null {
	const value = text.trim();

	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(value);
	if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

	const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
	if (compact) return utcDate(Number(compact[1]), Number(compact[2]), Number(compact[3]));

	const parts = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[\s,T].*)?$/.exec(value);
	if (!parts) return null;

	const first = Number(parts[1]);
	const second = Number(parts[2]);
	let year = Number(parts[3]);
	if (parts[3].length === 2) year += 2000;

	let day = dayFirst ? first : second;
	let month = dayFirst ? second : first;
	if (first > 12) {
		day = first;
		month = second;
	} else if (second > 12) {
		day = second;
		month = first;
	}
	return utcDate(year, month, day);
}

export interface BankCharge {
	date: Date;
	description: string;
	/** The money that left the account, in integer minor units of `currency`. */
	amountMinor: number;
	currency: Currency;
}

export interface ExtractOptions {
	dayFirst: boolean;
	/** For banks that list spending as positive numbers. */
	invertSign: boolean;
	/** Used when the statement has no currency column, or it holds something unsupported. */
	currency: Currency;
}

export interface RowError {
	/** 1-based line in the file, counting the header as line 1. */
	line: number;
	message: string;
}

export interface ExtractResult {
	charges: BankCharge[];
	errors: RowError[];
	/** Rows that were money coming in, left out on purpose. */
	skippedIncoming: number;
}

const cell = (row: string[], index: number | null) => (index === null ? '' : (row[index] ?? ''));

/**
 * Turns the data rows of a statement into outgoing charges. Money coming in is skipped, rows that
 * can't be read are reported rather than failing the whole file.
 */
export function extractCharges(
	rows: string[][],
	mapping: ColumnMapping,
	options: ExtractOptions
): ExtractResult {
	const result: ExtractResult = { charges: [], errors: [], skippedIncoming: 0 };

	rows.forEach((row, index) => {
		const line = index + 2;
		const date = parseBankDate(cell(row, mapping.date), options.dayFirst);
		if (!date) {
			result.errors.push({ line, message: 'Could not read the date.' });
			return;
		}

		let signed: number | null;
		if (mapping.amount !== null) {
			signed = parseAmount(cell(row, mapping.amount));
			if (signed !== null && options.invertSign) signed = -signed;
		} else {
			const debit = parseAmount(cell(row, mapping.debit));
			const credit = parseAmount(cell(row, mapping.credit));
			signed = debit !== null && debit !== 0 ? -Math.abs(debit) : credit !== null ? credit : null;
		}
		if (signed === null) {
			result.errors.push({ line, message: 'Could not read the amount.' });
			return;
		}
		if (signed >= 0) {
			result.skippedIncoming += 1;
			return;
		}

		const currencyCell = cell(row, mapping.currency).trim().toUpperCase();
		const currency = isSupportedCurrency(currencyCell) ? currencyCell : options.currency;
		const amountMinor = Math.round(Math.abs(signed) * 10 ** minorDigits(currency));
		if (amountMinor <= 0) return;

		result.charges.push({
			date,
			description: cell(row, mapping.description).trim(),
			amountMinor,
			currency
		});
	});
	return result;
}

// Words that say how a payment was made or who the legal entity is, not what was bought.
const NOISE_WORDS = new Set([
	'paypal',
	'sp',
	'sq',
	'tst',
	'pos',
	'card',
	'payment',
	'purchase',
	'recurring',
	'sepa',
	'direct',
	'debit',
	'incasso',
	'betaling',
	'aan',
	'to',
	'via',
	'the',
	'www',
	'com',
	'net',
	'org',
	'nl',
	'de',
	'eu',
	'co',
	'uk',
	'bv',
	'nv',
	'ab',
	'ltd',
	'llc',
	'inc',
	'gmbh',
	'sa',
	'limited',
	'international',
	'europe',
	'subscription',
	'abonnement'
]);

/**
 * A stable name for the merchant behind a bank description: lower case, without payment
 * prefixes, reference numbers, dates, domains and legal suffixes, limited to the first two words.
 * "PAYPAL *NETFLIX 4029357733" and "NETFLIX.COM 1234 AMSTERDAM" both give "netflix".
 */
export function normalizeMerchant(description: string): string {
	const words = description
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z\s]/g, ' ')
		.split(/\s+/)
		.filter((word) => word.length > 1 && !NOISE_WORDS.has(word));
	return words.slice(0, 2).join(' ');
}

/** "netflix" -> "Netflix", "apple music" -> "Apple Music". */
function titleCase(text: string): string {
	return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

const CYCLES: {
	cycle: BillingCycle;
	min: number;
	max: number;
	days: number;
	minCharges: number;
}[] = [
	{ cycle: 'weekly', min: 6, max: 8, days: 7, minCharges: 3 },
	{ cycle: 'monthly', min: 27, max: 34, days: 30, minCharges: 3 },
	{ cycle: 'quarterly', min: 84, max: 98, days: 91, minCharges: 3 },
	{ cycle: 'yearly', min: 350, max: 380, days: 365, minCharges: 2 }
];

const MS_PER_DAY = 86_400_000;
const AMOUNT_TOLERANCE = 0.1;
/** Share of the gaps between charges that has to fit the cycle. */
const REGULARITY = 0.7;

export interface RecurringCandidate {
	/** Normalised merchant, used to match against existing subscriptions. */
	key: string;
	name: string;
	/** The latest charge, in integer minor units of `currency`. */
	priceMinor: number;
	currency: Currency;
	billingCycle: BillingCycle;
	firstChargedOn: Date;
	lastChargedOn: Date;
	/** The next charge date from today, rolled forward from the last one. */
	nextRenewal: Date;
	occurrences: number;
	confidence: 'high' | 'medium';
	/** The last charge is too long ago for the subscription to still be running. */
	mayHaveEnded: boolean;
	/** One of the existing subscriptions looks like the same one. */
	alreadyTracked: boolean;
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Splits charges of one merchant into groups whose amounts are within 10% of each other. */
function clusterByAmount(charges: BankCharge[]): BankCharge[][] {
	const clusters: BankCharge[][] = [];
	for (const charge of [...charges].sort((a, b) => a.amountMinor - b.amountMinor)) {
		const cluster = clusters.find((group) => {
			if (group[0].currency !== charge.currency) return false;
			const middle = median(group.map((item) => item.amountMinor));
			return Math.abs(charge.amountMinor - middle) <= middle * AMOUNT_TOLERANCE;
		});
		if (cluster) cluster.push(charge);
		else clusters.push([charge]);
	}
	return clusters;
}

/** One charge per day: a merchant billing twice on the same day is one payment for our purposes. */
function onePerDay(charges: BankCharge[]): BankCharge[] {
	const byDay = new Map<number, BankCharge>();
	for (const charge of charges) byDay.set(charge.date.getTime(), charge);
	return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface ExistingSubscription {
	name: string;
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

function isTracked(key: string, existing: ExistingSubscription[]): boolean {
	const candidate = squash(key);
	if (candidate.length < 3) return false;
	return existing.some((subscription) => {
		const name = squash(subscription.name);
		return name.length >= 3 && (name.includes(candidate) || candidate.includes(name));
	});
}

/**
 * Finds charges that repeat on a regular schedule for about the same amount: weekly, monthly,
 * quarterly or yearly. Needs three charges (two for yearly) so one-off purchases are ignored.
 * "Ended" is judged against the newest charge in the file, not today, so an old statement still
 * shows what was running then.
 */
export function detectRecurring(
	charges: BankCharge[],
	existing: ExistingSubscription[],
	now: Date
): RecurringCandidate[] {
	if (charges.length === 0) return [];

	const latest = Math.max(...charges.map((charge) => charge.date.getTime()));
	const byMerchant = new Map<string, BankCharge[]>();
	for (const charge of charges) {
		const key = normalizeMerchant(charge.description);
		if (!key) continue;
		byMerchant.set(key, [...(byMerchant.get(key) ?? []), charge]);
	}

	const startOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const candidates: RecurringCandidate[] = [];

	for (const [key, merchantCharges] of byMerchant) {
		for (const cluster of clusterByAmount(merchantCharges)) {
			const series = onePerDay(cluster);
			if (series.length < 2) continue;

			const gaps = series
				.slice(1)
				.map((charge, i) => (charge.date.getTime() - series[i].date.getTime()) / MS_PER_DAY);

			const match = CYCLES.find(
				(cycle) =>
					series.length >= cycle.minCharges &&
					gaps.filter((gap) => gap >= cycle.min && gap <= cycle.max).length / gaps.length >=
						REGULARITY
			);
			if (!match) continue;

			const first = series[0];
			const last = series[series.length - 1];
			const regular = gaps.filter((gap) => gap >= match.min && gap <= match.max).length;
			const nextRenewal = nextOccurrenceOnOrAfter(last.date, startOfToday, match.cycle);

			candidates.push({
				key,
				name: titleCase(key),
				priceMinor: last.amountMinor,
				currency: last.currency,
				billingCycle: match.cycle,
				firstChargedOn: first.date,
				lastChargedOn: last.date,
				nextRenewal: nextRenewal ?? last.date,
				occurrences: series.length,
				confidence: series.length >= 4 && regular === gaps.length ? 'high' : 'medium',
				mayHaveEnded: latest - last.date.getTime() > match.days * 1.5 * MS_PER_DAY,
				alreadyTracked: isTracked(key, existing)
			});
		}
	}

	// Still running and new first, then the costliest per year.
	return candidates.sort(
		(a, b) =>
			Number(a.alreadyTracked) - Number(b.alreadyTracked) ||
			Number(a.mayHaveEnded) - Number(b.mayHaveEnded) ||
			b.priceMinor - a.priceMinor
	);
}

export interface BankFile {
	delimiter: Delimiter;
	headers: string[];
	rows: string[][];
	/** The guessed mapping, or null when the headers don't make it obvious. */
	mapping: ColumnMapping | null;
}

/** Reads the shape of a statement: delimiter, header row, data rows and a first guess at the columns. */
export function readBankFile(text: string): BankFile | { fileError: string } {
	const body = text.replace(/^\uFEFF/, '');
	const delimiter = detectDelimiter(body);
	const table = parseCsv(body, delimiter);
	if (table.length < 2) return { fileError: 'The file has no transactions.' };
	if (table.length - 1 > MAX_BANK_ROWS) {
		return { fileError: `Please import at most ${MAX_BANK_ROWS} transactions at a time.` };
	}
	const [headers, ...rows] = table;
	return { delimiter, headers, rows, mapping: guessMapping(headers) };
}
