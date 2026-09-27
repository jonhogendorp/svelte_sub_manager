<script lang="ts">
	import { findBrandIcon } from '$lib/brand-icons';
	import { CATEGORICAL_PALETTE, hashToSlot } from '$lib/charts/palette';
	import { theme } from '$lib/hooks/theme.svelte';

	let { name, size = 40 }: { name: string; size?: number } = $props();

	let brand = $derived(findBrandIcon(name));

	let fallbackHex = $derived.by(() => {
		const slot = CATEGORICAL_PALETTE[hashToSlot(name)];
		return theme.resolved === 'dark' ? slot.dark : slot.light;
	});

	let initial = $derived(name.trim().charAt(0).toUpperCase() || '?');

	let backgroundHex = $derived(brand ? `#${brand.hex}` : fallbackHex);

	// Relative luminance (WCAG) picks legible glyph ink against the brand fill,
	// since several brand colors (e.g. Hulu's bright green) are too light for white.
	function glyphColorFor(hex: string): string {
		const clean = hex.replace('#', '');
		const r = parseInt(clean.slice(0, 2), 16) / 255;
		const g = parseInt(clean.slice(2, 4), 16) / 255;
		const b = parseInt(clean.slice(4, 6), 16) / 255;
		const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
		const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
		return luminance > 0.55 ? '#0b0b0b' : '#ffffff';
	}

	let glyphColor = $derived(glyphColorFor(backgroundHex));
</script>

<div
	class="flex shrink-0 items-center justify-center rounded-lg"
	style="width: {size}px; height: {size}px; background-color: {backgroundHex};"
	role="img"
	aria-label="{name} logo"
>
	{#if brand?.path}
		<svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill={glyphColor} aria-hidden="true">
			<path d={brand.path} />
		</svg>
	{:else}
		<span class="font-semibold" style="font-size: {size * 0.42}px; color: {glyphColor}">{initial}</span>
	{/if}
</div>
