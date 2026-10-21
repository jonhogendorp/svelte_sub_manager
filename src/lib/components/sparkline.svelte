<script lang="ts">
	let {
		values,
		label,
		width = 72,
		height = 20
	}: {
		values: number[];
		/** Spoken description, since the line itself carries no text. */
		label: string;
		width?: number;
		height?: number;
	} = $props();

	const PADDING = 2;

	let points = $derived.by(() => {
		const min = Math.min(...values);
		const range = Math.max(...values) - min;
		const step = values.length > 1 ? (width - PADDING * 2) / (values.length - 1) : 0;
		return values.map((value, i) => {
			const x = PADDING + i * step;
			// A flat series sits in the middle rather than on the floor.
			const y =
				range === 0
					? height / 2
					: height - PADDING - ((value - min) / range) * (height - PADDING * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		});
	});
</script>

{#if values.length >= 2}
	<svg
		{width}
		{height}
		viewBox="0 0 {width} {height}"
		role="img"
		aria-label={label}
		class="text-primary"
	>
		<polyline
			points={points.join(' ')}
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<circle
			cx={points[points.length - 1].split(',')[0]}
			cy={points[points.length - 1].split(',')[1]}
			r="2"
			fill="currentColor"
		/>
	</svg>
{/if}
