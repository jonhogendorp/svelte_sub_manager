<script lang="ts">
	import type { Subscription } from '../../generated/prisma/client';
	import type { PageProps } from './$types';
	import SubscriptionList from '$lib/components/subscription-list.svelte';
	import SubscriptionForm from '$lib/components/subscription-form.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import CategorySpendChart from '$lib/charts/category-spend-chart.svelte';
	import UpcomingSpendChart from '$lib/charts/upcoming-spend-chart.svelte';
	import SpendSummary from '$lib/components/spend-summary.svelte';
	import UpcomingRenewals from '$lib/components/upcoming-renewals.svelte';
	import RenewalReminders from '$lib/components/renewal-reminders.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { CURRENCIES, type MoneyContext } from '$lib/money';
	import { distinctCategories, summarizeSpend } from '$lib/subscriptions';
	import BudgetCard from '$lib/components/budget-card.svelte';

	let { data }: PageProps = $props();

	let editing = $state<Subscription | null>(null);
	let categories = $derived(distinctCategories(data.subscriptions));
	let money = $derived<MoneyContext>({ display: data.displayCurrency, rates: data.rates });
	let spend = $derived(summarizeSpend(data.subscriptions, money));

	function startEdit(sub: Subscription) {
		editing = sub;
	}

	function cancelEdit() {
		editing = null;
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-4">
	<div class="flex items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-bold tracking-tight">Your Subscriptions</h1>
			<SpendSummary subscriptions={data.subscriptions} {money} />
		</div>
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
	</div>

	<p class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
		<a
			href={resolve('/export.csv')}
			download
			class="underline underline-offset-2 hover:text-foreground">Export CSV</a
		>
		<a href={resolve('/calendar.ics')} class="underline underline-offset-2 hover:text-foreground"
			>Calendar feed (.ics)</a
		>
	</p>

	<BudgetCard budget={data.budget} monthlySpend={spend.monthly} {money} />

	<RenewalReminders subscriptions={data.subscriptions} now={data.now} />

	<div class="grid gap-4 sm:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle>Spend by category</CardTitle>
			</CardHeader>
			<CardContent>
				<CategorySpendChart subscriptions={data.subscriptions} {money} />
			</CardContent>
		</Card>
		<Card>
			<CardHeader>
				<CardTitle>Upcoming spend</CardTitle>
			</CardHeader>
			<CardContent>
				<UpcomingSpendChart subscriptions={data.subscriptions} {money} />
			</CardContent>
		</Card>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Next 30 days</CardTitle>
		</CardHeader>
		<CardContent>
			<UpcomingRenewals subscriptions={data.subscriptions} now={data.now} />
		</CardContent>
	</Card>

	<SubscriptionList
		subscriptions={data.subscriptions}
		priceChanges={data.priceChanges}
		now={data.now}
		{money}
		onEdit={startEdit}
	/>

	<Card>
		<CardHeader>
			<CardTitle>{editing ? 'Edit Subscription' : 'Add Subscription'}</CardTitle>
		</CardHeader>
		<CardContent>
			<SubscriptionForm {editing} {categories} onCancel={cancelEdit} />
		</CardContent>
	</Card>
</div>
