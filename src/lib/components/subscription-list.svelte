<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import type { MoneyContext } from '$lib/money';
	import {
		ALL_FILTER,
		BILLING_CYCLES,
		BILLING_CYCLE_LABELS,
		STATUS_LABELS,
		SUBSCRIPTION_STATUSES,
		distinctCategories,
		filterAndSortSubscriptions,
		type SubscriptionFilters
	} from '$lib/subscriptions';
	import SubscriptionItem from './subscription-item.svelte';

	let {
		subscriptions,
		now,
		money,
		onEdit
	}: {
		subscriptions: Subscription[];
		now: Date;
		money: MoneyContext;
		onEdit: (sub: Subscription) => void;
	} = $props();

	let query = $state('');
	let category = $state<string>(ALL_FILTER);
	let cycle = $state<SubscriptionFilters['cycle']>(ALL_FILTER);
	let status = $state<SubscriptionFilters['status']>(ALL_FILTER);
	let sortBy = $state<SubscriptionFilters['sortBy']>('renewal');

	let categories = $derived(distinctCategories(subscriptions));
	let visible = $derived(
		filterAndSortSubscriptions(subscriptions, { query, category, cycle, status, sortBy }, now, money)
	);

	// A category filter pointing at a category that no longer exists would hide everything.
	$effect(() => {
		if (category !== ALL_FILTER && !categories.some((c) => c.toLowerCase() === category.toLowerCase())) {
			category = ALL_FILTER;
		}
	});
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
			<NativeSelect aria-label="Filter by category" bind:value={category}>
				<option value={ALL_FILTER}>All categories</option>
				{#each categories as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</NativeSelect>
			<NativeSelect aria-label="Filter by billing cycle" bind:value={cycle}>
				<option value={ALL_FILTER}>All cycles</option>
				{#each BILLING_CYCLES as option (option)}
					<option value={option}>{BILLING_CYCLE_LABELS[option]}</option>
				{/each}
			</NativeSelect>
			<NativeSelect aria-label="Filter by status" bind:value={status}>
				<option value={ALL_FILTER}>All statuses</option>
				{#each SUBSCRIPTION_STATUSES as option (option)}
					<option value={option}>{STATUS_LABELS[option]}</option>
				{/each}
			</NativeSelect>
			<NativeSelect aria-label="Sort by" bind:value={sortBy}>
				<option value="renewal">Next renewal</option>
				<option value="price">Price (high to low)</option>
				<option value="name">Name</option>
			</NativeSelect>
		</div>
	{/if}

	{#if subscriptions.length === 0}
		<p class="text-sm text-muted-foreground">No subscriptions found.</p>
	{:else if visible.length === 0}
		<p class="text-sm text-muted-foreground">No subscriptions match your filters.</p>
	{/if}
	{#each visible as sub (sub.id)}
		<SubscriptionItem {sub} {now} {onEdit} />
	{/each}
</div>
