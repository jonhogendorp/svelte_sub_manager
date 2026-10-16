import { describe, expect, it } from 'vitest';
import { MAX_BULK_IDS, describeBulkStatus, groupByPreviousStatus, parseBulkIds } from './bulk';

function form(ids: string[]): FormData {
	const data = new FormData();
	for (const id of ids) data.append('id', id);
	return data;
}

describe('parseBulkIds', () => {
	it('collects distinct ids and drops blanks', () => {
		expect(parseBulkIds(form(['a', ' b ', 'a', '']))).toEqual({ ids: ['a', 'b'] });
	});

	it('asks for a selection when there is none', () => {
		expect(parseBulkIds(form([]))).toEqual({ error: 'Select at least one subscription.' });
		expect(parseBulkIds(form(['', ' ']))).toEqual({ error: 'Select at least one subscription.' });
	});

	it('refuses an oversized request', () => {
		const ids = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `id${i}`);
		expect(parseBulkIds(form(ids))).toHaveProperty('error');
		expect(parseBulkIds(form(ids.slice(1)))).toHaveProperty('ids');
	});
});

describe('groupByPreviousStatus', () => {
	const subs = [
		{ id: '1', status: 'active' },
		{ id: '2', status: 'paused' },
		{ id: '3', status: 'active' },
		{ id: '4', status: 'cancelled' }
	];

	it('groups what would change by its current status', () => {
		expect(groupByPreviousStatus(subs, 'cancelled')).toEqual(
			new Map([
				['active', ['1', '3']],
				['paused', ['2']]
			])
		);
	});

	it('skips subscriptions that already have the target status', () => {
		expect(groupByPreviousStatus(subs, 'active')).toEqual(
			new Map([
				['paused', ['2']],
				['cancelled', ['4']]
			])
		);
		expect(groupByPreviousStatus([{ id: '1', status: 'paused' }], 'paused').size).toBe(0);
	});

	it('treats an unknown status as active', () => {
		expect(groupByPreviousStatus([{ id: '1', status: 'weird' }], 'paused')).toEqual(
			new Map([['active', ['1']]])
		);
	});
});

describe('describeBulkStatus', () => {
	it('words the result and pluralises', () => {
		expect(describeBulkStatus(1, 'paused')).toBe('Paused 1 subscription.');
		expect(describeBulkStatus(3, 'active')).toBe('Resumed 3 subscriptions.');
		expect(describeBulkStatus(2, 'cancelled')).toBe('Marked as cancelled 2 subscriptions.');
	});
});
