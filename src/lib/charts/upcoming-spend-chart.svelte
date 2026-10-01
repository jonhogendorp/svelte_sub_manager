<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { CATEGORICAL_PALETTE } from './palette';
	import { niceMax, upcomingSpendBuckets } from './chart-data';
	import { theme } from '$lib/hooks/theme.svelte';
	import { formatEuro } from '$lib/format';

	let { subscriptions }: { subscriptions: Subscription[] } = $props();

	const MONTHS_AHEAD = 6;
	const CHART_HEIGHT = 160;
	const COLUMN_WIDTH = 24;
	const COLUMN_GAP = 28;

	let buckets = $derived(upcomingSpendBuckets(subscriptions, new Date(), MONTHS_AHEAD));

	let maxValue = $derived(Math.max(1, ...buckets.map((b) => b.total)));

	let axisMax = $derived(niceMax(maxValue));
	let seriesHex = $derived(
		theme.resolved === 'dark' ? CATEGORICAL_PALETTE[0].dark : CATEGORICAL_PALETTE[0].light
	);

	let hoveredIndex = $state<number | null>(null);

	let chartWidth = $derived(buckets.length * (COLUMN_WIDTH + COLUMN_GAP));
</script>

<div class="flex flex-col gap-2">
	<svg
		viewBox="0 0 {chartWidth} {CHART_HEIGHT + 24}"
		width="100%"
		height={CHART_HEIGHT + 24}
		role="img"
		aria-label="Projected monthly subscription cost for the next {MONTHS_AHEAD} months"
	>
		<line
			x1="0"
			x2={chartWidth}
			y1={CHART_HEIGHT}
			y2={CHART_HEIGHT}
			stroke="var(--border)"
			stroke-width="1"
		/>
		{#each buckets as bucket, i (bucket.label + i)}
			{@const barHeight = Math.max(2, (bucket.total / axisMax) * (CHART_HEIGHT - 24))}
			{@const x = i * (COLUMN_WIDTH + COLUMN_GAP) + COLUMN_GAP / 2}
			{@const y = CHART_HEIGHT - barHeight}
			<g
				role="presentation"
				onpointerenter={() => (hoveredIndex = i)}
				onpointerleave={() => (hoveredIndex = null)}
				onfocusin={() => (hoveredIndex = i)}
				onfocusout={() => (hoveredIndex = null)}
			>
				<rect
					{x}
					{y}
					width={COLUMN_WIDTH}
					height={barHeight}
					rx="4"
					fill={seriesHex}
					opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.55}
					tabindex="0"
					role="button"
					aria-label="{bucket.label}: {formatEuro(bucket.total)}"
				/>
				<text
					x={x + COLUMN_WIDTH / 2}
					y={y - 8}
					text-anchor="middle"
					class="fill-foreground text-xs tabular-nums"
					opacity={hoveredIndex === i ? 1 : 0}
				>
					{formatEuro(bucket.total)}
				</text>
				<text
					x={x + COLUMN_WIDTH / 2}
					y={CHART_HEIGHT + 18}
					text-anchor="middle"
					class="fill-muted-foreground text-xs"
				>
					{bucket.label}
				</text>
			</g>
		{/each}
	</svg>
	<p class="text-xs text-muted-foreground">
		Projected from each renewal date and billing cycle.
	</p>
</div>
