import { describe, expect, it } from 'vitest';
import type { Subscription } from '../../generated/prisma/client';
import { runReminderCheck, type ReminderDeps, type ReminderState } from './reminder-job';

const now = new Date(2026, 9, 22);

function sub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'a',
		name: 'Netflix',
		priceMinor: 1599,
		currency: 'EUR',
		category: 'Streaming',
		renewalDate: new Date('2026-10-24'),
		billingCycle: 'monthly',
		reminderAckedOccurrence: null,
		reminderSnoozedUntil: null,
		intervalCount: 1,
		status: 'active',
		trialEndsAt: null,
		trialAckedAt: null,
		trialSnoozedUntil: null,
		accountEmail: null,
		paymentMethod: null,
		notes: null,
		usageRating: null,
		cancelledAt: null,
		yearlyPriceMinor: null,
		cancelUrl: null,
		cancelNoticeDays: null,
		startedOn: null,
		shareCount: 1,
		sharedWith: null,
		businessPercent: 0,
		...overrides
	};
}

/** In-memory stand-ins for the database and the mail server. */
function setup(overrides: Partial<ReminderState> = {}, options: { failSend?: boolean } = {}) {
	const state: ReminderState = {
		settings: { enabled: true, email: 'me@example.com', daysBefore: 3 },
		subscriptions: [sub()],
		sentKeys: new Set<string>(),
		...overrides
	};
	const sent: { to: string; subject: string; text: string }[] = [];
	const pruned: Date[] = [];
	let configured = true;

	const deps: ReminderDeps = {
		isConfigured: () => configured,
		load: async () => state,
		send: async (mail) => {
			if (options.failSend) throw new Error('SMTP down');
			sent.push(mail);
		},
		recordSent: async (keys) => {
			for (const key of keys) state.sentKeys.add(key);
		},
		pruneSent: async (before) => {
			pruned.push(before);
		}
	};
	return { deps, state, sent, pruned, setConfigured: (value: boolean) => (configured = value) };
}

describe('runReminderCheck', () => {
	it('emails one digest and remembers what it sent', async () => {
		const { deps, sent, state } = setup();

		const outcome = await runReminderCheck(now, deps);

		expect(outcome).toEqual({ status: 'sent', count: 1 });
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('me@example.com');
		expect(sent[0].text).toContain('Netflix renews in 2 days');
		expect([...state.sentKeys]).toEqual(['renewal:a:2026-10-24']);
	});

	it('never sends the same reminder twice', async () => {
		const { deps, sent } = setup();

		await runReminderCheck(now, deps);
		const second = await runReminderCheck(now, deps);

		expect(second).toEqual({ status: 'nothing-due', count: 0 });
		expect(sent).toHaveLength(1);
	});

	it('leaves the reminders unrecorded when sending fails, so the next run retries', async () => {
		const { deps, state } = setup({}, { failSend: true });

		const outcome = await runReminderCheck(now, deps);

		expect(outcome.status).toBe('failed');
		expect(outcome.count).toBe(1);
		expect(state.sentKeys.size).toBe(0);
	});

	it('does nothing when mail is not configured', async () => {
		const { deps, sent, setConfigured } = setup();
		setConfigured(false);

		expect(await runReminderCheck(now, deps)).toEqual({ status: 'not-configured', count: 0 });
		expect(sent).toEqual([]);
	});

	it('does nothing when reminders are off or there is no address', async () => {
		const off = setup({ settings: { enabled: false, email: 'me@example.com', daysBefore: 3 } });
		expect(await runReminderCheck(now, off.deps)).toEqual({ status: 'disabled', count: 0 });

		const noAddress = setup({ settings: { enabled: true, email: null, daysBefore: 3 } });
		expect(await runReminderCheck(now, noAddress.deps)).toEqual({ status: 'disabled', count: 0 });
		expect(off.sent.length + noAddress.sent.length).toBe(0);
	});

	it('says nothing when nothing is due', async () => {
		const { deps, sent } = setup({ subscriptions: [sub({ renewalDate: new Date('2026-12-24') })] });

		expect(await runReminderCheck(now, deps)).toEqual({ status: 'nothing-due', count: 0 });
		expect(sent).toEqual([]);
	});

	it('uses the configured number of days', async () => {
		const subscriptions = [sub({ renewalDate: new Date('2026-10-29') })]; // 7 days away
		const narrow = setup({ subscriptions });
		expect((await runReminderCheck(now, narrow.deps)).status).toBe('nothing-due');

		const wide = setup({
			subscriptions,
			settings: { enabled: true, email: 'me@example.com', daysBefore: 7 }
		});
		expect((await runReminderCheck(now, wide.deps)).status).toBe('sent');
	});

	it('prunes old records before checking', async () => {
		const { deps, pruned } = setup();

		await runReminderCheck(now, deps);

		expect(pruned).toHaveLength(1);
		expect(pruned[0].getTime()).toBe(now.getTime() - 120 * 86_400_000);
	});
});
