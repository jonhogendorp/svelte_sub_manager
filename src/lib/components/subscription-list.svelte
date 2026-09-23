<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import SubscriptionItem from './subscription-item.svelte';

	let {
		subscriptions,
		onEdit
	}: { subscriptions: Subscription[]; onEdit: (sub: Subscription) => void } = $props();
</script>

<div class="flex flex-col gap-2">
	{#if subscriptions.length === 0}
		<p class="text-sm text-muted-foreground">No subscriptions found.</p>
	{/if}
	{#each subscriptions as sub (sub.id)}
		<SubscriptionItem {sub} {onEdit} />
	{/each}
</div>
