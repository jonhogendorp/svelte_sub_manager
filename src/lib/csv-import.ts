import { parseSubscriptionForm, type SubscriptionInput } from './subscription-form';
import { CSV_COLUMNS } from './csv';

/** Upper bounds so one upload can't tie up the server. */
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 500;

/**
 * Splits CSV text into rows of cells per RFC 4180: quoted cells may contain commas, quotes
 * (doubled) and line breaks. Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;

	const endRow = () => {
		row.push(cell);
		cell = '';
		if (row.length > 1 || row[0] !== '') rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				cell += char;
			}
		} else if (char === '"') {
			inQuotes = true;
		} else if (char === ',') {
			row.push(cell);
			cell = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && text[i + 1] === '\n') i += 1;
			endRow();
		} else {
			cell += char;
		}
	}
	if (cell !== '' || row.length > 0) endRow();
	return rows;
}

/** Undoes the apostrophe that {@link csvCell} adds in front of formula-like text. */
function unescapeCell(value: string): string {
	return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

export interface ImportRowError {
	/** 1-based line in the file, counting the header as line 1. */
	line: number;
	message: string;
}

export interface ParsedImport {
	rows: { line: number; data: SubscriptionInput }[];
	errors: ImportRowError[];
}

// Header names are matched ignoring case and spaces, so "Renewal Date" works as well.
const normalize = (header: string) =>
	header
		.trim()
		.toLowerCase()
		.replaceAll(/[\s_-]/g, '');
const COLUMN_BY_HEADER = new Map(CSV_COLUMNS.map((column) => [normalize(column), column]));

const REQUIRED_COLUMNS = ['name', 'price', 'category', 'renewalDate'] as const;

/**
 * Turns the text of a CSV file (as written by the export, or any file with the same headers)
 * into validated subscriptions. Each row goes through the same validation as the add form, so
 * nothing can be imported that couldn't have been typed in. Bad rows are reported, not fatal.
 */
export function parseSubscriptionsCsv(text: string): ParsedImport | { fileError: string } {
	const table = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
	if (table.length === 0) return { fileError: 'The file is empty.' };

	const columns = table[0].map((header) => COLUMN_BY_HEADER.get(normalize(header)));
	const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
	if (missing.length > 0) {
		return {
			fileError: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`
		};
	}
	if (table.length - 1 > MAX_IMPORT_ROWS) {
		return { fileError: `Please import at most ${MAX_IMPORT_ROWS} subscriptions at a time.` };
	}

	const result: ParsedImport = { rows: [], errors: [] };
	table.slice(1).forEach((cells, index) => {
		const line = index + 2;
		const formData = new FormData();
		columns.forEach((column, position) => {
			// Blank cells are left out so the form's own defaults (EUR, monthly, active) apply.
			const value = unescapeCell((cells[position] ?? '').trim());
			if (column && value !== '') formData.set(column, value);
		});

		const parsed = parseSubscriptionForm(formData);
		if (parsed.error !== undefined) result.errors.push({ line, message: parsed.error });
		else result.rows.push({ line, data: parsed.data });
	});
	return result;
}

/** What identifies "the same subscription" when deciding whether an import row is a duplicate. */
export function duplicateKey(sub: {
	name: string;
	currency: string;
	priceMinor: number;
	billingCycle: string;
}): string {
	return [sub.name.trim().toLowerCase(), sub.currency, sub.priceMinor, sub.billingCycle].join('|');
}
