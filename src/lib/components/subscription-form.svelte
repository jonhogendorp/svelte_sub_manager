<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let { editing, onCancel }: { editing: Subscription | null; onCancel: () => void } = $props();

	function toDateInputValue(date: Date | string) {
		return new Date(date).toISOString().slice(0, 10);
	}
</script>

<form
	class="flex flex-col gap-3"
	method="POST"
	action={editing ? '?/update' : '?/create'}
	use:enhance={() => {
		return async ({ update }) => {
			await update();
			onCancel();
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
			placeholder="Streaming"
			value={editing?.category ?? ''}
			required
		/>
	</div>
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
	<Button type="submit">{editing ? 'Update' : 'Add'} Subscription</Button>
	{#if editing}
		<Button type="button" variant="secondary" onclick={onCancel}>Cancel Edit</Button>
	{/if}
</form>
