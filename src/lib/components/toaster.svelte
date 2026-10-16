<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/hooks/toast.svelte';
	import { DURATION, EASE, dur } from '$lib/motion';
	import { cn } from '$lib/utils';
	import { flip } from 'svelte/animate';
	import { fade, fly } from 'svelte/transition';
</script>

<!-- A polite live region: screen readers announce each message without stealing focus. -->
<div
	role="status"
	aria-live="polite"
	class="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4"
>
	{#each toast.items as item (item.id)}
		<div
			class={cn(
				'pointer-events-auto flex max-w-md items-center gap-3 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg',
				item.kind === 'error' && 'bg-destructive text-white'
			)}
			animate:flip={{ duration: dur(DURATION.base), easing: EASE }}
			in:fly={{ y: 12, duration: dur(DURATION.base), easing: EASE }}
			out:fade={{ duration: dur(DURATION.fast) }}
		>
			<span>{item.message}</span>
			{#if item.action}
				{@const action = item.action}
				<Button
					size="sm"
					variant="secondary"
					onclick={() => {
						action.onclick();
						toast.dismiss(item.id);
					}}>{action.label}</Button
				>
			{/if}
		</div>
	{/each}
</div>
