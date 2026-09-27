<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { CATEGORICAL_PALETTE } from '$lib/charts/palette';
	import { theme } from '$lib/hooks/theme.svelte';
	import type { Urgency } from '$lib/subscriptions';

	let { urgency, days }: { urgency: Urgency; days: number } = $props();

	// Yellow is carried by a dot rather than by text: #eda100 fails AA against
	// the card surface at body size.
	let soonHex = $derived(
		theme.resolved === 'dark' ? CATEGORICAL_PALETTE[3].dark : CATEGORICAL_PALETTE[3].light
	);

	let label = $derived(days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `In ${days} days`);
</script>

{#if urgency === 'urgent'}
	<Badge variant="destructive">{label}</Badge>
{:else if urgency === 'soon'}
	<Badge variant="outline">
		<span
			class="mr-1 inline-block size-1.5 shrink-0 rounded-full"
			style="background-color: {soonHex}"
			aria-hidden="true"
		></span>
		{label}
	</Badge>
{:else}
	<span class="text-xs text-muted-foreground">{label}</span>
{/if}
