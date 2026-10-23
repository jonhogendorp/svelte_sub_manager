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
	import CategoryBudgets from '$lib/components/category-budgets.svelte';
	import TrialGuard from '$lib/components/trial-guard.svelte';
	import OverlapAlerts from '$lib/components/overlap-alerts.svelte';
	import ImportCsv from '$lib/components/import-csv.svelte';
	import ImportBank from '$lib/components/import-bank.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { toast } from '$lib/hooks/toast.svelte';
	import { CURRENCIES, type MoneyContext } from '$lib/money';
	import { describeBulkStatus, groupByPreviousStatus } from '$lib/bulk';
	import { distinctCategories, summarizeSpend, type SubscriptionStatus } from '$lib/subscriptions';

	let { data }: PageProps = $props();

	/** How long a deleted subscription can be brought back before it is really removed. */
	const UNDO_WINDOW_MS = 10000;

	let editing = $state<Subscription | null>(null);
	let formOpen = $state(false);
	let importOpen = $state(false);
	let bankOpen = $state(false);

	// Deleting hides the subscriptions at once and removes them for real after the undo window.
	// One delete (a single row or a whole selection) is one batch with one timer and one Undo.
	let pendingDeleteIds = $state<string[]>([]);
	// Plain bookkeeping for timers; nothing renders from it, so it needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const deleteBatches = new Map<number, { ids: string[]; timer: ReturnType<typeof setTimeout> }>();
	let nextBatch = 1;
	let deleteForm = $state<HTMLFormElement>();
	let deleteIds = $state<string[]>([]);

	// Bulk status changes go through one hidden form so the Undo can reuse it.
	let statusForm = $state<HTMLFormElement>();
	let statusIds = $state<string[]>([]);
	let statusValue = $state<SubscriptionStatus>('active');
	let statusFinished: ((succeeded: boolean) => void) | null = null;

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

	async function commitDelete(batch: number) {
		const entry = deleteBatches.get(batch);
		if (!entry) return;
		deleteBatches.delete(batch);
		deleteIds = entry.ids;
		await tick();
		deleteForm?.requestSubmit();
	}

	function deleteWithUndo(subs: Subscription[]) {
		if (subs.length === 0) return;
		const ids = subs.map((sub) => sub.id);
		if (editing && ids.includes(editing.id)) closeForm();

		const batch = nextBatch++;
		pendingDeleteIds = [...pendingDeleteIds, ...ids];
		deleteBatches.set(batch, {
			ids,
			timer: setTimeout(() => commitDelete(batch), UNDO_WINDOW_MS)
		});
		toast.show(
			subs.length === 1 ? `Deleted "${subs[0].name}".` : `Deleted ${subs.length} subscriptions.`,
			{
				duration: UNDO_WINDOW_MS,
				action: {
					label: 'Undo',
					onclick: () => {
						clearTimeout(deleteBatches.get(batch)?.timer);
						deleteBatches.delete(batch);
						pendingDeleteIds = pendingDeleteIds.filter((id) => !ids.includes(id));
					}
				}
			}
		);
	}

	/** Closing the tab inside the undo window must not quietly keep the subscriptions. */
	function flushPendingDeletes() {
		for (const { ids, timer } of deleteBatches.values()) {
			clearTimeout(timer);
			const body = new FormData();
			for (const id of ids) body.append('id', id);
			navigator.sendBeacon('?/bulkDelete', body);
		}
		deleteBatches.clear();
	}

	/** Submits the hidden status form and reports whether the server accepted the change. */
	async function changeStatus(ids: string[], status: SubscriptionStatus): Promise<boolean> {
		statusIds = ids;
		statusValue = status;
		await tick();
		return new Promise((done) => {
			statusFinished = done;
			statusForm?.requestSubmit();
		});
	}

	async function setStatusWithUndo(subs: Subscription[], status: SubscriptionStatus) {
		const previous = groupByPreviousStatus(subs, status);
		const ids = [...previous.values()].flat();
		if (ids.length === 0) return;

		if (!(await changeStatus(ids, status))) return;
		toast.show(describeBulkStatus(ids.length, status), {
			action: {
				label: 'Undo',
				onclick: async () => {
					let restored = true;
					for (const [earlier, group] of previous) {
						restored = (await changeStatus(group, earlier)) && restored;
					}
					if (restored) toast.show('Restored the previous status.');
				}
			}
		});
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
					Import / Export ▾
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
					<a href="{resolve('/insights')}#calendar" class="rounded-md px-2 py-1.5 hover:bg-muted"
						>View calendar</a
					>
					<button
						type="button"
						class="rounded-md px-2 py-1.5 text-left hover:bg-muted"
						onclick={() => (importOpen = true)}
					>
						Import CSV…
					</button>
					<button
						type="button"
						class="rounded-md px-2 py-1.5 text-left hover:bg-muted"
						onclick={() => (bankOpen = true)}
					>
						Import bank statement…
					</button>
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

	<CategoryBudgets
		{subscriptions}
		budgets={data.categoryBudgets}
		{categories}
		{money}
		onSaved={(kind) =>
			toast.show(kind === 'saved' ? 'Category budget saved.' : 'Category budget removed.')}
	/>

	<RenewalReminders {subscriptions} now={data.now} />

	<TrialGuard
		{subscriptions}
		now={data.now}
		{money}
		onCancel={(sub) => setStatusWithUndo([sub], 'cancelled')}
	/>

	<OverlapAlerts {subscriptions} {money} />

	<SubscriptionList
		{subscriptions}
		priceChanges={data.priceChanges}
		now={data.now}
		{money}
		onEdit={startEdit}
		onDelete={(sub) => deleteWithUndo([sub])}
		onDeleteMany={deleteWithUndo}
		onSetStatus={setStatusWithUndo}
		onAdd={startAdd}
	/>

	{#if subscriptions.length > 0}
		<section aria-label="Insights" class="flex flex-col gap-4">
			<div class="flex items-baseline justify-between gap-2">
				<h2 class="text-lg font-semibold tracking-tight">Insights</h2>
				<a href={resolve('/insights')} class="text-sm text-muted-foreground hover:text-foreground"
					>Full insights →</a
				>
			</div>
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

	<ImportCsv bind:open={importOpen} />

	<ImportBank bind:open={bankOpen} {categories} />

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
		action="?/bulkDelete"
		hidden
		use:enhance={({ formData }) => {
			const ids = formData.getAll('id').map(String);
			return async ({ update }) => {
				await update();
				pendingDeleteIds = pendingDeleteIds.filter((pending) => !ids.includes(pending));
			};
		}}
	>
		{#each deleteIds as id (id)}
			<input type="hidden" name="id" value={id} />
		{/each}
	</form>

	<form
		bind:this={statusForm}
		method="POST"
		action="?/bulkSetStatus"
		hidden
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'failure') {
					toast.show(String(result.data?.error ?? 'Could not change the status.'), {
						kind: 'error'
					});
				}
				statusFinished?.(result.type === 'success');
				statusFinished = null;
			}}
	>
		{#each statusIds as id (id)}
			<input type="hidden" name="id" value={id} />
		{/each}
		<input type="hidden" name="status" value={statusValue} />
	</form>
</div>
