<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../generated/prisma/client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let editing = $state<Subscription | null>(null);

	function toDateInputValue(date: Date | string) {
		return new Date(date).toISOString().slice(0, 10);
	}

	function startEdit(sub: Subscription) {
		editing = sub;
	}

	function cancelEdit() {
		editing = null;
	}
</script>

<div class="mx-auto max-w-xl p-4">
	<h1 class="mb-4 text-2xl font-bold">Your Subscriptions</h1>

	<ul class="flex flex-col space-y-2">
		{#if data.subscriptions.length === 0}
			<li class="text-gray-500">No subscriptions found.</li>
		{/if}
		{#each data.subscriptions as sub (sub.id)}
			<li
				class="flex items-center justify-between rounded-md border border-slate-300 bg-white px-4 py-3 shadow hover:bg-slate-50"
			>
				<div>
					<span class="font-semibold">{sub.name}</span> - ${sub.price} ({sub.category})<br />
					<span class="text-xs text-gray-500">Renewal: {toDateInputValue(sub.renewalDate)}</span>
				</div>
				<div class="flex gap-2">
					<button
						class="rounded-full border border-blue-500/50 bg-blue-500/30 px-5 py-0.5 text-white"
						onclick={() => startEdit(sub)}>Edit</button
					>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={sub.id} />
						<button
							class="rounded-full border border-red-500/50 bg-red-500/30 px-5 py-0.5 text-white"
							type="submit">Delete</button
						>
					</form>
				</div>
			</li>
		{/each}
	</ul>

	<form
		class="mt-4 space-y-2"
		method="POST"
		action={editing ? '?/update' : '?/create'}
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				editing = null;
			};
		}}
	>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<input
			class="w-full border px-2 py-1"
			type="text"
			name="name"
			placeholder="Name"
			value={editing?.name ?? ''}
			required
		/>
		<input
			class="w-full border px-2 py-1"
			type="number"
			step="0.01"
			name="price"
			placeholder="Price"
			value={editing?.price ?? ''}
			required
		/>
		<input
			class="w-full border px-2 py-1"
			type="text"
			name="category"
			placeholder="Category"
			value={editing?.category ?? ''}
			required
		/>
		<input
			class="w-full border px-2 py-1"
			type="date"
			name="renewalDate"
			value={editing ? toDateInputValue(editing.renewalDate) : ''}
			required
		/>
		<button class="w-full rounded bg-green-500 py-2 text-white" type="submit"
			>{editing ? 'Update' : 'Add'} Subscription</button
		>
		{#if editing}
			<button class="w-full rounded bg-gray-400 py-2 text-white" type="button" onclick={cancelEdit}
				>Cancel Edit</button
			>
		{/if}
	</form>
</div>
