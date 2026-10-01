<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { formatMoney, type MoneyContext } from '$lib/money';
	import { summarizeSpend } from '$lib/subscriptions';

	let { subscriptions, money }: { subscriptions: Subscription[]; money: MoneyContext } = $props();

	let summary = $derived(summarizeSpend(subscriptions, money));
</script>

{#if subscriptions.length > 0}
	<p class="text-sm text-muted-foreground">
		You spend
		<span class="font-semibold text-foreground tabular-nums"
			>{formatMoney(summary.monthly, money.display)}</span
		>/mo ·
		<span class="font-semibold text-foreground tabular-nums"
			>{formatMoney(summary.yearly, money.display)}</span
		>/yr across {summary.counted}
		{summary.counted === 1 ? 'subscription' : 'subscriptions'}.
	</p>
	{#if summary.excluded > 0}
		<p class="text-xs text-muted-foreground">
			{summary.excluded}
			{summary.excluded === 1 ? 'subscription is' : 'subscriptions are'} not included: no exchange rate
			is available to convert {summary.excluded === 1 ? 'it' : 'them'} to {money.display} right now.
		</p>
	{/if}
{/if}
