<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { formatEuro } from '$lib/format';
	import { monthlyCost, yearlyCost } from '$lib/subscriptions';

	let { subscriptions }: { subscriptions: Subscription[] } = $props();

	let monthlyTotal = $derived(subscriptions.reduce((sum, sub) => sum + monthlyCost(sub), 0));
	let yearlyTotal = $derived(subscriptions.reduce((sum, sub) => sum + yearlyCost(sub), 0));
</script>

{#if subscriptions.length > 0}
	<p class="text-sm text-muted-foreground">
		You spend
		<span class="font-semibold text-foreground tabular-nums">{formatEuro(monthlyTotal)}</span>/mo
		·
		<span class="font-semibold text-foreground tabular-nums">{formatEuro(yearlyTotal)}</span>/yr
		across {subscriptions.length}
		{subscriptions.length === 1 ? 'subscription' : 'subscriptions'}.
	</p>
{/if}
