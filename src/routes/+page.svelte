<script lang="ts">
	import { tick } from 'svelte';
	import type { Subscription } from '../../generated/prisma/client';
	import type { PageProps } from './$types';
	import SubscriptionList from '$lib/components/subscription-list.svelte';
	import SubscriptionForm from '$lib/components/subscription-form.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import CategorySpendChart from '$lib/charts/category-spend-chart.svelte';
	import UpcomingSpendChart from '$lib/charts/upcoming-spend-chart.svelte';
	import StatTiles from '$lib/components/stat-tiles.svelte';
	import UpcomingRenewals from '$lib/components/upcoming-renewals.svelte';
	import RenewalReminders from '$lib/components/renewal-reminders.svelte';
	import BudgetCard from '$lib/components/budget-card.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { toast } from '$lib/hooks/toast.svelte';
	import { CURRENCIES, type MoneyContext } from '$lib/money';
	import { distinctCategories, summarizeSpend } from '$lib/subscriptions';

	let { data }: PageProps = $props();

	/** How long a deleted subscription can be brought back before it is really removed. */
	const UNDO_WINDOW_MS = 10000;

	let editing = $state<Subscription | null>(null);
	let formOpen = $state(false);

	// Deleting hides the subscription at once and removes it for real after the undo window.
	let pendingDeleteIds = $state<string[]>([]);
	// Plain bookkeeping for timers; nothing renders from it, so it needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
	let deleteForm = $state<HTMLFormElement>();
	let deleteId = $state('');

	let subscriptions = $derived(
		data.subscriptions.filter((sub) => !pendingDeleteIds.includes(sub.id))
	);
	let categories = $derived(distinctCategories(subscriptions));
	let money = $derived<MoneyContext>({ display: data.displayCurrency, rates: data.rates });
	let spend = $derived(summarizeSpend(subscriptions, money));

	function startAdd() {
		editing = null;
		formOpen = true;
	}

	function startEdit(sub: Subscription) {
		editing = sub;
		formOpen = true;
	}

	function closeForm() {
		formOpen = false;
	}

	function onSaved(kind: 'created' | 'updated') {
		closeForm();
		toast.show(kind === 'created' ? 'Subscription added.' : 'Subscription updated.');
	}

	async function commitDelete(id: string) {
		deleteTimers.delete(id);
		deleteId = id;
		await tick();
		deleteForm?.requestSubmit();
	}

	function deleteWithUndo(sub: Subscription) {
		if (editing?.id === sub.id) closeForm();
		pendingDeleteIds.push(sub.id);
		deleteTimers.set(
			sub.id,
			setTimeout(() => commitDelete(sub.id), UNDO_WINDOW_MS)
		);
		toast.show(`Deleted "${sub.name}".`, {
			duration: UNDO_WINDOW_MS,
			action: {
				label: 'Undo',
				onclick: () => {
					clearTimeout(deleteTimers.get(sub.id));
					deleteTimers.delete(sub.id);
					pendingDeleteIds = pendingDeleteIds.filter((id) => id !== sub.id);
				}
			}
		});
	}

	/** Closing the tab inside the undo window must not quietly keep the subscription. */
	function flushPendingDeletes() {
		for (const [id, timer] of deleteTimers) {
			clearTimeout(timer);
			const body = new FormData();
			body.set('id', id);
			navigator.sendBeacon('?/delete', body);
		}
		deleteTimers.clear();
	}
</script>

<svelte:window onpagehide={flushPendingDeletes} />

<div class="mx-auto flex max-w-4xl flex-col gap-5 p-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Your Subscriptions</h1>
		<div class="flex flex-wrap items-center gap-2">
			<form
				method="POST"
				action="?/setDisplayCurrency"
				class="flex shrink-0 items-center gap-2"
				use:enhance
			>
				<NativeSelect
					name="currency"
					aria-label="Show totals in"
					value={data.displayCurrency}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					{#each CURRENCIES as code (code)}
						<option value={code}>{code}</option>
					{/each}
				</NativeSelect>
				<noscript><Button type="submit" size="sm" variant="outline">Apply</Button></noscript>
			</form>
			<details class="relative">
				<summary
					class="inline-flex h-9 cursor-pointer list-none items-center rounded-lg border border-input bg-card px-3 text-sm hover:bg-muted"
				>
					Export ▾
				</summary>
				<div
					class="absolute right-0 z-10 mt-1 flex w-48 flex-col rounded-lg border border-input bg-popover p-1 text-sm shadow-md"
				>
					<a href={resolve('/export.csv')} download class="rounded-md px-2 py-1.5 hover:bg-muted"
						>Download CSV</a
					>
					<a href={resolve('/calendar.ics')} class="rounded-md px-2 py-1.5 hover:bg-muted"
						>Calendar feed (.ics)</a
					>
				</div>
			</details>
			<Button onclick={startAdd}>+ New subscription</Button>
		</div>
	</div>

	<StatTiles {subscriptions} budget={data.budget} {money} />

	<BudgetCard
		budget={data.budget}
		monthlySpend={spend.monthly}
		{money}
		onSaved={(kind) => toast.show(kind === 'saved' ? 'Budget saved.' : 'Budget cleared.')}
	/>

	<RenewalReminders {subscriptions} now={data.now} />

	<SubscriptionList
		{subscriptions}
		priceChanges={data.priceChanges}
		now={data.now}
		{money}
		onEdit={startEdit}
		onDelete={deleteWithUndo}
		onAdd={startAdd}
	/>

	{#if subscriptions.length > 0}
		<section aria-label="Insights" class="flex flex-col gap-4">
			<h2 class="text-lg font-semibold tracking-tight">Insights</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Spend by category</CardTitle>
					</CardHeader>
					<CardContent>
						<CategorySpendChart {subscriptions} {money} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Upcoming spend</CardTitle>
					</CardHeader>
					<CardContent>
						<UpcomingSpendChart {subscriptions} {money} />
					</CardContent>
				</Card>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Next 30 days</CardTitle>
				</CardHeader>
				<CardContent>
					<UpcomingRenewals {subscriptions} now={data.now} />
				</CardContent>
			</Card>
		</section>
	{/if}

	<Dialog.Root bind:open={formOpen}>
		<Dialog.Content>
			<Dialog.Title>{editing ? 'Edit subscription' : 'Add subscription'}</Dialog.Title>
			<Dialog.Description class="sr-only">
				{editing
					? 'Change the details of this subscription.'
					: 'Enter the details of a new subscription.'}
			</Dialog.Description>
			{#key editing?.id ?? 'new'}
				<SubscriptionForm
					{editing}
					{categories}
					defaultCurrency={data.displayCurrency}
					onCancel={closeForm}
					{onSaved}
				/>
			{/key}
		</Dialog.Content>
	</Dialog.Root>

	<!-- Submitted by the undo timer once the window has passed. -->
	<form
		bind:this={deleteForm}
		method="POST"
		action="?/delete"
		hidden
		use:enhance={({ formData }) => {
			const id = String(formData.get('id') ?? '');
			return async ({ update }) => {
				await update();
				pendingDeleteIds = pendingDeleteIds.filter((pending) => pending !== id);
			};
		}}
	>
		<input type="hidden" name="id" value={deleteId} />
	</form>
</div>
