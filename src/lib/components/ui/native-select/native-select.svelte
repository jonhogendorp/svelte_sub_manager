<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	type Props = WithElementRef<HTMLSelectAttributes, HTMLSelectElement>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<select
	bind:this={ref}
	bind:value
	data-slot="native-select"
	class={cn(
		'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</select>
