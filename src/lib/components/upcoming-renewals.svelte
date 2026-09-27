<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import BrandIcon from '$lib/components/brand-icon.svelte';
	import UrgencyBadge from '$lib/components/urgency-badge.svelte';
	import { formatEuro, formatRenewalDay } from '$lib/format';
	import { upcomingWithin } from '$lib/subscriptions';

	let { subscriptions, now }: { subscriptions: Subscription[]; now: Date } = $props();

	let renewals = $derived(upcomingWithin(subscriptions, now, 30));
</script>

{#if renewals.length === 0}
	<p class="text-sm text-muted-foreground">No renewals in the next 30 days.</p>
{:else}
	<ul class="flex flex-col divide-y divide-border">
		{#each renewals as { subscription, occurrence, days, urgency } (subscription.id)}
			<li class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
				<BrandIcon name={subscription.name} size={28} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{subscription.name}</p>
					<p class="text-xs text-muted-foreground">{formatRenewalDay(occurrence)}</p>
				</div>
				<span class="text-sm tabular-nums">{formatEuro(subscription.price)}</span>
				<UrgencyBadge {urgency} {days} />
			</li>
		{/each}
	</ul>
{/if}
