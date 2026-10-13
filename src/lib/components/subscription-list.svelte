<script lang="ts">
	import type { PriceChange, Subscription } from '../../../generated/prisma/client';
	import { changesFor } from '$lib/price-history';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
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
		priceChanges = [],
		now,
		money,
		onEdit,
		onDelete,
		onAdd
	}: {
		subscriptions: Subscription[];
		priceChanges?: PriceChange[];
		now: Date;
		money: MoneyContext;
		onEdit: (sub: Subscription) => void;
		onDelete: (sub: Subscription) => void;
		onAdd: () => void;
	} = $props();

	let query = $state('');
	let category = $state<string>(ALL_FILTER);
	let cycle = $state<SubscriptionFilters['cycle']>(ALL_FILTER);
	let status = $state<SubscriptionFilters['status']>(ALL_FILTER);
	let sortBy = $state<SubscriptionFilters['sortBy']>('renewal');

	let categories = $derived(distinctCategories(subscriptions));
	let visible = $derived(
		filterAndSortSubscriptions(
			subscriptions,
			{ query, category, cycle, status, sortBy },
			now,
			money
		)
	);

	/** The filters that are narrowing the list right now, each with how to switch it off. */
	let activeFilters = $derived.by(() => {
		const chips: { key: string; label: string; clear: () => void }[] = [];
		if (query.trim())
			chips.push({ key: 'query', label: `Search: "${query.trim()}"`, clear: () => (query = '') });
		if (category !== ALL_FILTER) {
			chips.push({
				key: 'category',
				label: `Category: ${category}`,
				clear: () => (category = ALL_FILTER)
			});
		}
		if (cycle !== ALL_FILTER) {
			chips.push({
				key: 'cycle',
				label: BILLING_CYCLE_LABELS[cycle],
				clear: () => (cycle = ALL_FILTER)
			});
		}
		if (status !== ALL_FILTER) {
			chips.push({
				key: 'status',
				label: STATUS_LABELS[status],
				clear: () => (status = ALL_FILTER)
			});
		}
		return chips;
	});

	function clearFilters() {
		query = '';
		category = ALL_FILTER;
		cycle = ALL_FILTER;
		status = ALL_FILTER;
	}

	// A category filter pointing at a category that no longer exists would hide everything.
	$effect(() => {
		if (
			category !== ALL_FILTER &&
			!categories.some((c) => c.toLowerCase() === category.toLowerCase())
		) {
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

	{#if subscriptions.length > 0}
		<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			<p aria-live="polite">
				{#if activeFilters.length > 0}
					Showing {visible.length} of {subscriptions.length}
				{:else}
					{subscriptions.length}
					{subscriptions.length === 1 ? 'subscription' : 'subscriptions'}
				{/if}
			</p>
			{#each activeFilters as chip (chip.key)}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-input bg-card px-2.5 py-0.5 text-xs text-foreground hover:bg-muted"
					aria-label="Remove filter: {chip.label}"
					onclick={chip.clear}
				>
					{chip.label} <span aria-hidden="true">×</span>
				</button>
			{/each}
			{#if activeFilters.length > 1}
				<Button variant="ghost" size="sm" onclick={clearFilters}>Clear filters</Button>
			{/if}
		</div>
	{/if}

	{#if subscriptions.length === 0}
		<Card>
			<CardContent class="flex flex-col items-center gap-3 py-8 text-center">
				<p class="font-medium">No subscriptions yet</p>
				<p class="max-w-sm text-sm text-muted-foreground">
					Add the first one to see what you spend per month, get renewal reminders and track price
					changes.
				</p>
				<Button onclick={onAdd}>Add your first subscription</Button>
			</CardContent>
		</Card>
	{:else if visible.length === 0}
		<Card>
			<CardContent class="flex flex-col items-center gap-3 py-6 text-center">
				<p class="text-sm text-muted-foreground">No subscriptions match your filters.</p>
				<Button variant="outline" size="sm" onclick={clearFilters}>Clear filters</Button>
			</CardContent>
		</Card>
	{/if}
	{#each visible as sub (sub.id)}
		<SubscriptionItem {sub} {now} changes={changesFor(priceChanges, sub.id)} {onEdit} {onDelete} />
	{/each}
</div>
