<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import {
		ALL_FILTER,
		distinctCategories,
		filterAndSortSubscriptions,
		type SubscriptionFilters
	} from '$lib/subscriptions';
	import SubscriptionItem from './subscription-item.svelte';

	let {
		subscriptions,
		now,
		onEdit
	}: { subscriptions: Subscription[]; now: Date; onEdit: (sub: Subscription) => void } = $props();

	let query = $state('');
	let category = $state<string>(ALL_FILTER);
	let cycle = $state<SubscriptionFilters['cycle']>(ALL_FILTER);
	let sortBy = $state<SubscriptionFilters['sortBy']>('renewal');

	let categories = $derived(distinctCategories(subscriptions));
	let visible = $derived(
		filterAndSortSubscriptions(subscriptions, { query, category, cycle, sortBy }, now)
	);

	// A category filter pointing at a category that no longer exists would hide everything.
	$effect(() => {
		if (category !== ALL_FILTER && !categories.some((c) => c.toLowerCase() === category.toLowerCase())) {
			category = ALL_FILTER;
		}
	});

	const selectClass = cn(
		'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30',
		'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
	);
</script>

<div class="flex flex-col gap-2">
	{#if subscriptions.length > 0}
		<div class="flex flex-wrap items-center gap-2">
			<Input
				type="search"
				placeholder="Search subscriptions"
				aria-label="Search subscriptions"
				class="min-w-40 flex-1"
				bind:value={query}
			/>
			<select class={selectClass} aria-label="Filter by category" bind:value={category}>
				<option value={ALL_FILTER}>All categories</option>
				{#each categories as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
			<select class={selectClass} aria-label="Filter by billing cycle" bind:value={cycle}>
				<option value={ALL_FILTER}>All cycles</option>
				<option value="monthly">Monthly</option>
				<option value="yearly">Yearly</option>
			</select>
			<select class={selectClass} aria-label="Sort by" bind:value={sortBy}>
				<option value="renewal">Next renewal</option>
				<option value="price">Price (high to low)</option>
				<option value="name">Name</option>
			</select>
		</div>
	{/if}

	{#if subscriptions.length === 0}
		<p class="text-sm text-muted-foreground">No subscriptions found.</p>
	{:else if visible.length === 0}
		<p class="text-sm text-muted-foreground">No subscriptions match your filters.</p>
	{/if}
	{#each visible as sub (sub.id)}
		<SubscriptionItem {sub} {onEdit} />
	{/each}
</div>
