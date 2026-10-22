<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { budgetStatus, type Budget } from '$lib/budget';
	import { formatMoney, type MoneyContext } from '$lib/money';
	import { summarizeSpend } from '$lib/subscriptions';
	import { cn } from '$lib/utils';

	let {
		subscriptions,
		budget,
		money
	}: { subscriptions: Subscription[]; budget: Budget | null; money: MoneyContext } = $props();

	let summary = $derived(summarizeSpend(subscriptions, money));
	let status = $derived(budgetStatus(summary.monthly, budget, money));
</script>

{#if subscriptions.length > 0}
	<section aria-label="Spend summary" class="flex flex-col gap-2">
		<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
				<dt class="text-xs text-muted-foreground">Per month</dt>
				<dd class="text-xl font-semibold tabular-nums">
					{formatMoney(summary.monthly, money.display)}
				</dd>
			</div>
			<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
				<dt class="text-xs text-muted-foreground">Per year</dt>
				<dd class="text-xl font-semibold tabular-nums">
					{formatMoney(summary.yearly, money.display)}
				</dd>
			</div>
			<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
				<dt class="text-xs text-muted-foreground">Per week</dt>
				<dd class="text-xl font-semibold tabular-nums">
					{formatMoney(summary.weekly, money.display)}
				</dd>
			</div>
			<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
				<dt class="text-xs text-muted-foreground">Per day</dt>
				<dd class="text-xl font-semibold tabular-nums">
					{formatMoney(summary.daily, money.display)}
				</dd>
			</div>
			<div
				class={cn(
					'rounded-xl bg-card p-3 ring-1 ring-foreground/10',
					status.state === 'over' && 'ring-destructive/60'
				)}
			>
				<dt class="text-xs text-muted-foreground">Budget used</dt>
				<dd
					class={cn(
						'text-xl font-semibold tabular-nums',
						status.state === 'over' && 'text-destructive'
					)}
				>
					{status.state === 'none' ? '—' : `${Math.round(status.percent)}%`}
				</dd>
			</div>
		</dl>
		<p class="text-xs text-muted-foreground">
			Across {summary.counted}
			{summary.counted === 1 ? 'active subscription' : 'active subscriptions'}.
		</p>
		{#if summary.excluded > 0}
			<p class="text-xs text-muted-foreground">
				{summary.excluded}
				{summary.excluded === 1 ? 'subscription is' : 'subscriptions are'} not included: no exchange rate
				is available to convert {summary.excluded === 1 ? 'it' : 'them'} to {money.display} right now.
			</p>
		{/if}
	</section>
{/if}
