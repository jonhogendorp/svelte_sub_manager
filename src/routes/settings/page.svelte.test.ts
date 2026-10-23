import { page } from '@vitest/browser/context';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

function renderPage(
	overrides: Partial<{
		mailConfigured: boolean;
		reminders: { enabled: boolean; email: string | null; daysBefore: number };
	}> = {}
) {
	render(Page, {
		data: {
			mailConfigured: true,
			reminders: { enabled: false, email: null, daysBefore: 3 },
			...overrides
		},
		params: {},
		form: null
	});
}

describe('/settings/+page.svelte', () => {
	it('shows the saved reminder settings', async () => {
		renderPage({ reminders: { enabled: true, email: 'me@example.com', daysBefore: 5 } });

		await expect.element(page.getByLabelText('Send them to')).toHaveValue('me@example.com');
		await expect.element(page.getByLabelText('Remind me this many days ahead')).toHaveValue(5);
		await expect.element(page.getByLabelText('Send me email reminders')).toBeChecked();
		await expect.element(page.getByRole('button', { name: 'Send test email' })).toBeEnabled();
	});

	it('explains how to set up email when the server has no SMTP settings', async () => {
		renderPage({ mailConfigured: false });

		await expect.element(page.getByText('Email is not set up on the server yet')).toBeVisible();
		await expect.element(page.getByLabelText('Send me email reminders')).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Send test email' })).toBeDisabled();
	});

	it('cannot send a test email before an address is saved', async () => {
		renderPage();

		await expect.element(page.getByRole('button', { name: 'Send test email' })).toBeDisabled();
	});
});
