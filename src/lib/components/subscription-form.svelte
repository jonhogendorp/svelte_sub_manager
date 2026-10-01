<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import BillingCycleField from '$lib/components/billing-cycle-field.svelte';
	import { toDateInputValue } from '$lib/format';
	import { toBillingCycle } from '$lib/subscriptions';

	let {
		editing,
		categories = [],
		onCancel
	}: { editing: Subscription | null; categories?: string[]; onCancel: () => void } = $props();

	let error = $state<string | null>(null);

	// Switching between add and edit (or between two items) shouldn't carry a stale error over.
	$effect(() => {
		void editing;
		error = null;
	});
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
		<Input
			id="price"
			type="number"
			step="0.01"
			min="0.01"
			name="price"
			placeholder="15.99"
			value={editing?.price ?? ''}
			required
		/>
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
	<BillingCycleField value={toBillingCycle(editing?.billingCycle)} />
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
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
	<Button type="submit">{editing ? 'Update' : 'Add'} Subscription</Button>
	{#if editing}
		<Button type="button" variant="secondary" onclick={onCancel}>Cancel Edit</Button>
	{/if}
</form>
