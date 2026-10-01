<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import BillingCycleField from '$lib/components/billing-cycle-field.svelte';
	import { toDateInputValue } from '$lib/format';
	import { BASE_CURRENCY, CURRENCIES, minorDigits, toMajor } from '$lib/money';
	import {
		STATUS_LABELS,
		SUBSCRIPTION_STATUSES,
		toBillingCycle,
		toSubscriptionStatus
	} from '$lib/subscriptions';

	let {
		editing,
		categories = [],
		onCancel
	}: { editing: Subscription | null; categories?: string[]; onCancel: () => void } = $props();

	let error = $state<string | null>(null);
	let currency = $state<string>(BASE_CURRENCY);

	// Switching between add and edit (or between two items) shouldn't carry a stale error
	// or the previous item's currency over.
	$effect(() => {
		error = null;
		currency = editing?.currency ?? BASE_CURRENCY;
	});

	// JPY has no minor unit, EUR has two decimals: the input follows the chosen currency.
	let priceStep = $derived(10 ** -minorDigits(currency));
	let editingPrice = $derived(
		editing
			? toMajor(editing.priceMinor, editing.currency).toFixed(minorDigits(editing.currency))
			: ''
	);
</script>

<form
	class="flex flex-col gap-3"
	method="POST"
	action={editing ? '?/update' : '?/create'}
	use:enhance={() => {
		error = null;
		return async ({ result, update }) => {
			await update();
			if (result.type === 'failure') {
				error = typeof result.data?.error === 'string' ? result.data.error : 'Something went wrong.';
				return;
			}
			if (result.type === 'success') onCancel();
		};
	}}
>
	{#if editing}
		<input type="hidden" name="id" value={editing.id} />
	{/if}
	<div class="flex flex-col gap-1.5">
		<Label for="name">Name</Label>
		<Input
			id="name"
			type="text"
			name="name"
			placeholder="Netflix"
			value={editing?.name ?? ''}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="price">Price</Label>
		<div class="flex gap-2">
			<Input
				id="price"
				type="number"
				step={priceStep}
				min={priceStep}
				name="price"
				placeholder="15.99"
				value={editingPrice}
				class="flex-1"
				required
			/>
			<NativeSelect id="currency" name="currency" aria-label="Currency" bind:value={currency}>
				{#each CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</NativeSelect>
		</div>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="category">Category</Label>
		<Input
			id="category"
			type="text"
			name="category"
			list="category-suggestions"
			autocomplete="off"
			placeholder="Streaming"
			value={editing?.category ?? ''}
			required
		/>
		<datalist id="category-suggestions">
			{#each categories as category (category)}
				<option value={category}></option>
			{/each}
		</datalist>
	</div>
	<BillingCycleField
		value={toBillingCycle(editing?.billingCycle)}
		intervalCount={editing?.intervalCount ?? 1}
	/>
	<div class="flex flex-col gap-1.5">
		<Label for="renewalDate">Renewal date</Label>
		<Input
			id="renewalDate"
			type="date"
			name="renewalDate"
			value={editing ? toDateInputValue(editing.renewalDate) : ''}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="trialEndsAt">Free trial ends <span class="text-muted-foreground">(optional)</span></Label>
		<Input
			id="trialEndsAt"
			type="date"
			name="trialEndsAt"
			value={editing?.trialEndsAt ? toDateInputValue(editing.trialEndsAt) : ''}
		/>
		<p class="text-xs text-muted-foreground">You'll get a reminder before the trial turns into a charge.</p>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="status">Status</Label>
		<NativeSelect
			id="status"
			name="status"
			class="w-fit"
			value={toSubscriptionStatus(editing?.status)}
		>
			{#each SUBSCRIPTION_STATUSES as option (option)}
				<option value={option}>{STATUS_LABELS[option]}</option>
			{/each}
		</NativeSelect>
	</div>
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
	<Button type="submit">{editing ? 'Update' : 'Add'} Subscription</Button>
	{#if editing}
		<Button type="button" variant="secondary" onclick={onCancel}>Cancel Edit</Button>
	{/if}
</form>
