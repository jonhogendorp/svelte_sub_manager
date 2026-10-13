import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from './toast.svelte';

describe('toast', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		for (const item of [...toast.items]) toast.dismiss(item.id);
		vi.useRealTimers();
	});

	it('shows a message and removes it after a few seconds', () => {
		toast.show('Saved.');
		expect(toast.items.map((item) => item.message)).toEqual(['Saved.']);

		vi.advanceTimersByTime(4001);
		expect(toast.items).toHaveLength(0);
	});

	it('keeps a message with an action on screen longer', () => {
		toast.show('Deleted.', { action: { label: 'Undo', onclick: () => {} } });

		vi.advanceTimersByTime(4001);
		expect(toast.items).toHaveLength(1);
		vi.advanceTimersByTime(3000);
		expect(toast.items).toHaveLength(0);
	});

	it('dismisses one message without touching the others', () => {
		const first = toast.show('One');
		toast.show('Two');

		toast.dismiss(first);

		expect(toast.items.map((item) => item.message)).toEqual(['Two']);
	});
});
