<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/hooks/toast.svelte';
	import { MAX_REMINDER_DAYS, MIN_REMINDER_DAYS } from '$lib/reminders';
	import { MAX_EMAIL_LENGTH } from '$lib/subscription-form';

	let { data }: PageProps = $props();

	let error = $state<string | null>(null);
	let testError = $state<string | null>(null);
	let saving = $state(false);
	let testing = $state(false);
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-5 p-4">
	<h1 class="text-2xl font-bold tracking-tight">Settings</h1>

	<Card>
		<CardHeader><CardTitle>Email reminders</CardTitle></CardHeader>
		<CardContent class="flex flex-col gap-4 text-sm">
			<p class="text-muted-foreground">
				Get one email a day with renewals, free trials ending and the last day to cancel, even when
				the app is closed. Each reminder is sent once. The server must be running to send them.
			</p>

			{#if !data.mailConfigured}
				<p role="status" class="rounded-lg border border-input bg-muted/50 p-3">
					Email is not set up on the server yet. Add <code>SMTP_HOST</code> and
					<code>SMTP_FROM</code> (and usually <code>SMTP_USER</code>, <code>SMTP_PASS</code>) to
					<code>.env</code>, as shown in <code>.env.example</code>, then restart the app.
				</p>
			{/if}

			<form
				method="POST"
				action="?/saveReminders"
				class="flex flex-col gap-3"
				use:enhance={() => {
					saving = true;
					error = null;
					return async ({ result, update }) => {
						saving = false;
						await update({ reset: false });
						if (result.type === 'failure') {
							error =
								typeof result.data?.error === 'string'
									? result.data.error
									: 'Something went wrong.';
						} else if (result.type === 'success') {
							toast.show('Reminder settings saved.');
						}
					};
				}}
			>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						name="enabled"
						checked={data.reminders.enabled}
						disabled={!data.mailConfigured}
						class="size-4 accent-primary"
					/>
					Send me email reminders
				</label>
				<div class="flex flex-col gap-1.5">
					<Label for="reminder-email">Send them to</Label>
					<Input
						id="reminder-email"
						type="email"
						name="email"
						maxlength={MAX_EMAIL_LENGTH}
						autocomplete="email"
						placeholder="me@example.com"
						value={data.reminders.email ?? ''}
					/>
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="reminder-days">Remind me this many days ahead</Label>
					<Input
						id="reminder-days"
						type="number"
						name="daysBefore"
						min={MIN_REMINDER_DAYS}
						max={MAX_REMINDER_DAYS}
						step="1"
						class="w-24"
						value={data.reminders.daysBefore}
						required
					/>
				</div>
				{#if error}
					<p role="alert" class="text-destructive">{error}</p>
				{/if}
				<div>
					<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
				</div>
			</form>

			<form
				method="POST"
				action="?/sendTestEmail"
				class="flex flex-col gap-2"
				use:enhance={() => {
					testing = true;
					testError = null;
					return async ({ result }) => {
						testing = false;
						if (result.type === 'failure') {
							testError =
								typeof result.data?.testError === 'string'
									? result.data.testError
									: 'The test email could not be sent.';
						} else if (result.type === 'success') {
							toast.show('Test email sent.');
						}
					};
				}}
			>
				<div>
					<Button
						type="submit"
						variant="outline"
						disabled={testing || !data.mailConfigured || !data.reminders.email}
					>
						{testing ? 'Sending…' : 'Send test email'}
					</Button>
				</div>
				{#if testError}
					<p role="alert" class="text-destructive">{testError}</p>
				{/if}
			</form>
		</CardContent>
	</Card>
</div>
