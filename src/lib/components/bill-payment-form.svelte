<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Bill } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toDateInputValue } from '$lib/format';
	import { minorDigits, toMajor } from '$lib/money';

	let {
		bill,
		suggestedMinor,
		today,
		onCancel,
		onSaved = onCancel
	}: {
		bill: Bill;
		/** The current estimate, prefilled so a typical payment is one click. */
		suggestedMinor: number;
		today: Date;
		onCancel: () => void;
		onSaved?: () => void;
	} = $props();

	let error = $state<string | null>(null);

	let step = $derived(10 ** -minorDigits(bill.currency));
	let suggested = $derived(
		toMajor(suggestedMinor, bill.currency).toFixed(minorDigits(bill.currency))
	);
</script>

<form
	class="flex flex-col gap-3"
	method="POST"
	action="?/logPayment"
	use:enhance={() => {
		error = null;
		return async ({ result, update }) => {
			await update();
			if (result.type === 'failure') {
				error =
					typeof result.data?.error === 'string' ? result.data.error : 'Something went wrong.';
				return;
			}
			if (result.type === 'success') onSaved();
		};
	}}
>
	<input type="hidden" name="id" value={bill.id} />
	<input type="hidden" name="currency" value={bill.currency} />
	<div class="flex flex-col gap-1.5">
		<Label for="payment-amount">Amount paid ({bill.currency})</Label>
		<Input
			id="payment-amount"
			type="number"
			name="amount"
			{step}
			min={step}
			value={suggested}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="payment-date">Paid on</Label>
		<Input id="payment-date" type="date" name="paidOn" value={toDateInputValue(today)} required />
	</div>
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
	<Button type="submit">Log payment</Button>
	<Button type="button" variant="secondary" onclick={onCancel}>Cancel</Button>
</form>
