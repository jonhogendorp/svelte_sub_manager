<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { CATEGORICAL_PALETTE } from './palette';
	import { theme } from '$lib/hooks/theme.svelte';

	let { subscriptions }: { subscriptions: Subscription[] } = $props();

	const MONTHS_AHEAD = 6;
	const CHART_HEIGHT = 160;
	const COLUMN_WIDTH = 24;
	const COLUMN_GAP = 28;

	// Projects each subscription forward monthly from its renewalDate, since the
	// schema stores a single next/previous renewal date rather than a recurrence
	// history. Assumes monthly billing.
	function nextOccurrenceOnOrAfter(renewalDate: Date, monthStart: Date): Date {
		const occurrence = new Date(renewalDate);
		while (occurrence < monthStart) {
			occurrence.setMonth(occurrence.getMonth() + 1);
		}
		return occurrence;
	}

	let buckets = $derived.by(() => {
		const today = new Date();
		const months: { label: string; monthStart: Date; monthEnd: Date; total: number }[] = [];
		for (let i = 0; i < MONTHS_AHEAD; i++) {
			const monthStart = new Date(today.getFullYear(), today.getMonth() + i, 1);
			const monthEnd = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
			months.push({
				label: monthStart.toLocaleDateString(undefined, { month: 'short' }),
				monthStart,
				monthEnd,
				total: 0
			});
		}

		for (const sub of subscriptions) {
			const renewalDate = new Date(sub.renewalDate);
			for (const bucket of months) {
				const occurrence = nextOccurrenceOnOrAfter(renewalDate, bucket.monthStart);
				if (occurrence >= bucket.monthStart && occurrence < bucket.monthEnd) {
					bucket.total += sub.price;
				}
			}
		}
		return months;
	});

	let maxValue = $derived(Math.max(1, ...buckets.map((b) => b.total)));

	function niceMax(max: number): number {
		const magnitude = 10 ** Math.floor(Math.log10(max || 1));
		const normalized = max / magnitude;
		const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
		return step * magnitude;
	}

	let axisMax = $derived(niceMax(maxValue));
	let seriesHex = $derived(
		theme.resolved === 'dark' ? CATEGORICAL_PALETTE[0].dark : CATEGORICAL_PALETTE[0].light
	);

	let hoveredIndex = $state<number | null>(null);

	function formatEuro(value: number): string {
		return `€${value.toFixed(2)}`;
	}

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
	<p class="text-xs text-muted-foreground">Assumes monthly billing, projected from each renewal date.</p>
</div>
