<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import CategorySpendChart from '$lib/charts/category-spend-chart.svelte';
	import UpcomingSpendChart from '$lib/charts/upcoming-spend-chart.svelte';
	import RenewalCalendar from '$lib/components/renewal-calendar.svelte';
	import OverlapAlerts from '$lib/components/overlap-alerts.svelte';
	import StatTiles from '$lib/components/stat-tiles.svelte';
	import { toDateInputValue } from '$lib/format';
	import { cycleBreakdown, priceHikes, savings, topCosts, totalYearlyImpact } from '$lib/insights';
	import { formatMoney, toMajor, type MoneyContext } from '$lib/money';
	import { BILLING_CYCLE_LABELS, toBillingCycle } from '$lib/subscriptions';

	let { data }: PageProps = $props();

	let money = $derived<MoneyContext>({ display: data.displayCurrency, rates: data.rates });
	let costs = $derived(topCosts(data.subscriptions, money));
	let hikes = $derived(priceHikes(data.subscriptions, data.priceChanges, money));
	let hikeTotal = $derived(totalYearlyImpact(hikes));
	let cycles = $derived(cycleBreakdown(data.subscriptions, money));
	let saved = $derived(savings(data.subscriptions, money));

	function formatOwn(minor: number, currency: string): string {
		return formatMoney(toMajor(minor, currency), currency);
	}
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-5 p-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Insights</h1>
		<a href={resolve('/')} class="text-sm text-muted-foreground hover:text-foreground"
			>← Back to subscriptions</a
		>
	</div>

	{#if data.subscriptions.length === 0}
		<Card>
			<CardContent class="py-8 text-center text-sm text-muted-foreground">
				Add a few subscriptions to see where your money goes.
			</CardContent>
		</Card>
	{:else}
		<StatTiles subscriptions={data.subscriptions} budget={data.budget} {money} />

		<OverlapAlerts subscriptions={data.subscriptions} {money} />

		<Card id="calendar">
			<CardHeader><CardTitle>Renewal calendar</CardTitle></CardHeader>
			<CardContent>
				<RenewalCalendar subscriptions={data.subscriptions} {money} now={data.now} />
			</CardContent>
		</Card>

		<div class="grid gap-4 sm:grid-cols-2">
			<Card>
				<CardHeader><CardTitle>Spend by category</CardTitle></CardHeader>
				<CardContent>
					<CategorySpendChart subscriptions={data.subscriptions} {money} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader><CardTitle>Upcoming spend</CardTitle></CardHeader>
				<CardContent>
					<UpcomingSpendChart subscriptions={data.subscriptions} {money} />
				</CardContent>
			</Card>
		</div>

		<Card>
			<CardHeader><CardTitle>Biggest costs</CardTitle></CardHeader>
			<CardContent>
				{#if costs.length === 0}
					<p class="text-sm text-muted-foreground">No recurring subscriptions to rank yet.</p>
				{:else}
					<ol aria-label="Biggest costs" class="flex flex-col gap-3">
						{#each costs as { subscription, yearly, percent } (subscription.id)}
							<li class="flex flex-col gap-1">
								<div class="flex items-baseline justify-between gap-2 text-sm">
									<span class="font-medium">{subscription.name}</span>
									<span class="tabular-nums">
										{formatMoney(yearly, money.display)}/yr
										<span class="text-xs text-muted-foreground">({Math.round(percent)}%)</span>
									</span>
								</div>
								<div class="h-2 rounded-full bg-muted" aria-hidden="true">
									<div class="h-2 rounded-full bg-primary" style="width: {percent}%"></div>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader><CardTitle>Price increases</CardTitle></CardHeader>
			<CardContent class="flex flex-col gap-3">
				{#if hikes.length === 0}
					<p class="text-sm text-muted-foreground">
						No price increases recorded. When you edit a subscription's price it shows up here.
					</p>
				{:else}
					<p class="text-sm" aria-live="polite">
						Price increases cost you <strong class="tabular-nums"
							>{formatMoney(hikeTotal, money.display)}</strong
						> more per year than when you started tracking.
					</p>
					<ul aria-label="Price increases" class="flex flex-col gap-2 text-sm">
						{#each hikes as hike (hike.subscription.id)}
							<li class="flex flex-wrap items-baseline justify-between gap-x-3">
								<span class="font-medium">{hike.subscription.name}</span>
								<span class="text-muted-foreground tabular-nums">
									{formatOwn(hike.originalMinor, hike.currency)} → {formatOwn(
										hike.currentMinor,
										hike.currency
									)}
									<span class="text-destructive">+{Math.round(hike.percent)}%</span>
									{#if hike.yearlyImpact !== null}
										· +{formatMoney(hike.yearlyImpact, money.display)}/yr
									{/if}
									· {toDateInputValue(hike.lastChangedAt)}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>

		<div class="grid gap-4 sm:grid-cols-2">
			<Card>
				<CardHeader><CardTitle>By billing cycle</CardTitle></CardHeader>
				<CardContent>
					{#if cycles.length === 0}
						<p class="text-sm text-muted-foreground">Nothing recurring yet.</p>
					{:else}
						<ul aria-label="By billing cycle" class="flex flex-col gap-1 text-sm">
							{#each cycles as entry (entry.cycle)}
								<li class="flex justify-between gap-2">
									<span>
										{BILLING_CYCLE_LABELS[toBillingCycle(entry.cycle)]}
										<span class="text-xs text-muted-foreground">({entry.count})</span>
									</span>
									<span class="tabular-nums">{formatMoney(entry.monthly, money.display)}/mo</span>
								</li>
							{/each}
						</ul>
					{/if}
				</CardContent>
			</Card>
			<Card>
				<CardHeader><CardTitle>Saved by pausing or cancelling</CardTitle></CardHeader>
				<CardContent class="text-sm">
					{#if saved.cancelled + saved.paused === 0}
						<p class="text-muted-foreground">No paused or cancelled subscriptions.</p>
					{:else}
						<p class="text-xl font-semibold tabular-nums">
							{formatMoney(saved.yearly, money.display)}<span
								class="text-sm font-normal text-muted-foreground">/yr</span
							>
						</p>
						<p class="text-xs text-muted-foreground">
							{saved.cancelled} cancelled, {saved.paused} paused.
						</p>
					{/if}
				</CardContent>
			</Card>
		</div>
	{/if}
</div>
