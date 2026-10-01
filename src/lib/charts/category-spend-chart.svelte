<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { CATEGORICAL_PALETTE, assignCategoricalSlots } from './palette';
	import { categoryTotals, niceStep } from './chart-data';
	import { theme } from '$lib/hooks/theme.svelte';
	import { formatEuro } from '$lib/format';

	let { subscriptions }: { subscriptions: Subscription[] } = $props();

	const OTHER_HEX = { light: '#898781', dark: '#898781' };
	const BAR_HEIGHT = 24;
	const ROW_GAP = 12;
	const TRACK_WIDTH = 240;

	let totals = $derived(categoryTotals(subscriptions));

	let slots = $derived(assignCategoricalSlots(totals.map(([category]) => category)));
	let maxValue = $derived(Math.max(1, ...totals.map(([, value]) => value)));

	let gridStep = $derived(niceStep(maxValue));
	let axisMax = $derived(Math.ceil(maxValue / gridStep) * gridStep);
	let gridLines = $derived.by(() => {
		const lines: number[] = [];
		for (let v = 0; v <= axisMax + 1e-9; v += gridStep) lines.push(v);
		return lines;
	});

	function hexFor(slot: number | 'other'): string {
		const pair = slot === 'other' ? OTHER_HEX : CATEGORICAL_PALETTE[slot];
		return theme.resolved === 'dark' ? pair.dark : pair.light;
	}

	let hovered = $state<string | null>(null);
</script>

{#if totals.length === 0}
	<p class="text-sm text-muted-foreground">No subscriptions yet.</p>
{:else}
	<div class="flex flex-col" style="gap: {ROW_GAP}px">
		{#each totals as [category, value] (category)}
			{@const slot = slots.get(category) ?? 'other'}
			{@const hex = hexFor(slot)}
			{@const widthPct = (value / axisMax) * 100}
			<div
				class="flex items-center gap-3"
				role="group"
				onpointerenter={() => (hovered = category)}
				onpointerleave={() => (hovered = null)}
				onfocusin={() => (hovered = category)}
				onfocusout={() => (hovered = null)}
			>
				<span class="w-24 shrink-0 truncate text-sm text-muted-foreground" title={category}
					>{category}</span
				>
				<div class="relative flex-1" style="max-width: {TRACK_WIDTH}px; height: {BAR_HEIGHT}px">
					<!-- gridlines -->
					<svg
						class="absolute inset-0 h-full w-full overflow-visible"
						viewBox="0 0 {TRACK_WIDTH} {BAR_HEIGHT}"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						{#each gridLines as line (line)}
							<line
								x1={(line / axisMax) * TRACK_WIDTH}
								x2={(line / axisMax) * TRACK_WIDTH}
								y1="0"
								y2={BAR_HEIGHT}
								stroke="var(--border)"
								stroke-width="1"
							/>
						{/each}
						<rect
							x="0"
							y="0"
							width={Math.max(2, (widthPct / 100) * TRACK_WIDTH)}
							height={BAR_HEIGHT}
							rx="4"
							fill={hex}
							opacity={hovered === null || hovered === category ? 1 : 0.55}
							tabindex="0"
							role="button"
							aria-label="{category}: {formatEuro(value)} per month"
						/>
					</svg>
				</div>
				<span
					class="w-16 shrink-0 text-right text-sm tabular-nums"
					class:text-foreground={hovered === category}
					class:font-medium={hovered === category}
					class:text-muted-foreground={hovered !== category}
				>
					{formatEuro(value)}
				</span>
			</div>
		{/each}
	</div>
{/if}
