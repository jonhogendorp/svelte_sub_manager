<script lang="ts">
	import { CATEGORICAL_PALETTE } from './palette';
	import { niceMax } from './chart-data';
	import { forecastTotal, type ForecastMonth } from '$lib/forecast';
	import { theme } from '$lib/hooks/theme.svelte';
	import { formatMoney } from '$lib/money';

	let { months, display }: { months: ForecastMonth[]; display: string } = $props();

	const CHART_HEIGHT = 180;
	const COLUMN_WIDTH = 24;
	const COLUMN_GAP = 20;

	let axisMax = $derived(niceMax(Math.max(1, ...months.map((m) => m.total))));
	let scheme = $derived<'light' | 'dark'>(theme.resolved === 'dark' ? 'dark' : 'light');
	let subscriptionHex = $derived(CATEGORICAL_PALETTE[0][scheme]);
	let billHex = $derived(CATEGORICAL_PALETTE[1][scheme]);
	let chartWidth = $derived(months.length * (COLUMN_WIDTH + COLUMN_GAP));
	let total = $derived(forecastTotal(months));

	let hoveredIndex = $state<number | null>(null);

	function heightOf(value: number): number {
		return (value / axisMax) * (CHART_HEIGHT - 24);
	}
</script>

<div class="flex flex-col gap-2">
	<p class="text-sm">
		Expected over the next {months.length} months:
		<strong class="tabular-nums">{formatMoney(total, display)}</strong>
	</p>
	<svg
		viewBox="0 0 {chartWidth} {CHART_HEIGHT + 24}"
		width="100%"
		height={CHART_HEIGHT + 24}
		role="img"
		aria-label="Forecast of subscription and bill spend for the next {months.length} months"
	>
		<line
			x1="0"
			x2={chartWidth}
			y1={CHART_HEIGHT}
			y2={CHART_HEIGHT}
			stroke="var(--border)"
			stroke-width="1"
		/>
		{#each months as month, i (month.label + i)}
			{@const x = i * (COLUMN_WIDTH + COLUMN_GAP) + COLUMN_GAP / 2}
			{@const billHeight = month.bills > 0 ? Math.max(2, heightOf(month.bills)) : 0}
			{@const subHeight = month.subscriptions > 0 ? Math.max(2, heightOf(month.subscriptions)) : 0}
			{@const top = CHART_HEIGHT - billHeight - subHeight}
			<g
				role="presentation"
				opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.55}
				onpointerenter={() => (hoveredIndex = i)}
				onpointerleave={() => (hoveredIndex = null)}
				onfocusin={() => (hoveredIndex = i)}
				onfocusout={() => (hoveredIndex = null)}
			>
				<rect
					{x}
					y={CHART_HEIGHT - subHeight}
					width={COLUMN_WIDTH}
					height={subHeight}
					rx="3"
					fill={subscriptionHex}
				/>
				<rect
					{x}
					y={top}
					width={COLUMN_WIDTH}
					height={billHeight}
					rx="3"
					fill={billHex}
					stroke="var(--card)"
					stroke-width={subHeight > 0 && billHeight > 0 ? 1 : 0}
				/>
				<rect
					{x}
					y={top}
					width={COLUMN_WIDTH}
					height={subHeight + billHeight}
					fill="transparent"
					tabindex="0"
					role="button"
					aria-label="{month.label}: {formatMoney(month.total, display)} ({formatMoney(
						month.subscriptions,
						display
					)} subscriptions, {formatMoney(month.bills, display)} bills)"
				/>
				<text
					x={x + COLUMN_WIDTH / 2}
					y={top - 8}
					text-anchor="middle"
					class="fill-foreground text-xs tabular-nums"
					opacity={hoveredIndex === i ? 1 : 0}
				>
					{formatMoney(month.total, display)}
				</text>
				<text
					x={x + COLUMN_WIDTH / 2}
					y={CHART_HEIGHT + 18}
					text-anchor="middle"
					class="fill-muted-foreground text-xs"
				>
					{month.label}
				</text>
			</g>
		{/each}
	</svg>
	<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
		<li class="flex items-center gap-1.5">
			<span class="size-2.5 rounded-sm" style="background: {subscriptionHex}"></span>Subscriptions
		</li>
		<li class="flex items-center gap-1.5">
			<span class="size-2.5 rounded-sm" style="background: {billHex}"></span>Bills (at their recent
			average)
		</li>
	</ul>
</div>
