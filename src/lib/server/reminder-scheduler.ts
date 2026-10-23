import { building } from '$app/environment';
import { checkReminders } from '$lib/server/reminder-service';

const FIRST_CHECK_DELAY_MS = 60_000;
const CHECK_INTERVAL_MS = 3_600_000;

// Hot reloads in dev re-evaluate this module; a flag on globalThis keeps it to one timer.
const STARTED = Symbol.for('subscription-manager.reminder-scheduler');
const registry = globalThis as unknown as Record<symbol, boolean | undefined>;

let running = false;

async function tick(): Promise<void> {
	// A slow mail server must not stack up overlapping checks.
	if (running) return;
	running = true;
	try {
		const outcome = await checkReminders();
		if (outcome.status === 'failed') {
			console.error('Could not send the reminder email:', outcome.error);
		}
	} catch (error) {
		console.error('The reminder check failed:', error);
	} finally {
		running = false;
	}
}

/**
 * Starts the hourly reminder check once per process. It does nothing while the app is being built,
 * and the check itself does nothing until SMTP is configured and reminders are switched on.
 */
export function startReminderScheduler(): void {
	if (building || registry[STARTED]) return;
	registry[STARTED] = true;

	setTimeout(() => void tick(), FIRST_CHECK_DELAY_MS).unref();
	setInterval(() => void tick(), CHECK_INTERVAL_MS).unref();
}
