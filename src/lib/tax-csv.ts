import { csvCell } from './csv';
import { minorDigits } from './money';
import type { TaxReport } from './tax';

export const TAX_CSV_COLUMNS = [
	'category',
	'name',
	'type',
	'businessPercent',
	'spent',
	'deductible',
	'estimated'
] as const;

/** Rounded to the display currency's own decimals so the file matches what the page shows. */
const amount = (value: number, currency: string) => value.toFixed(minorDigits(currency));

/**
 * The report as CSV (CRLF line endings, header row first, totals last). Numbers are written raw so
 * a spreadsheet can add them up; text goes through {@link csvCell} to defuse formulas.
 */
export function taxReportToCsv(report: TaxReport, currency: string): string {
	const rows = report.rows.map((row) =>
		[
			csvCell(row.category),
			csvCell(row.name),
			row.kind,
			String(row.businessPercent),
			amount(row.spent, currency),
			amount(row.deductible, currency),
			row.estimated ? 'yes' : 'no'
		].join(',')
	);
	const totals = [
		'Total',
		'',
		'',
		'',
		amount(report.totalSpent, currency),
		amount(report.totalDeductible, currency),
		''
	].join(',');
	return [TAX_CSV_COLUMNS.join(','), ...rows, totals].join('\r\n') + '\r\n';
}
