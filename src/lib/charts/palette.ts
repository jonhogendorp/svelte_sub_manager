// Validated categorical palette (8 hues, fixed order). Passes CVD-safety checks
// (adjacent ΔE ≥ 8 CVD-simulated, ≥ 15 normal-vision) against this app's card
// surfaces (#ffffff light / #0f172b dark) — see the data-viz skill for the method.
export const CATEGORICAL_PALETTE: { light: string; dark: string }[] = [
	{ light: '#2a78d6', dark: '#3987e5' }, // blue
	{ light: '#eb6834', dark: '#d95926' }, // orange
	{ light: '#1baf7a', dark: '#199e70' }, // aqua
	{ light: '#eda100', dark: '#c98500' }, // yellow
	{ light: '#e87ba4', dark: '#d55181' }, // magenta
	{ light: '#008300', dark: '#008300' }, // green
	{ light: '#4a3aa7', dark: '#9085e9' }, // violet
	{ light: '#e34948', dark: '#e66767' } // red
];

/** Deterministic hash so the same label always lands on the same palette slot. */
export function hashToSlot(label: string, slotCount = CATEGORICAL_PALETTE.length): number {
	let hash = 0;
	for (let i = 0; i < label.length; i++) {
		hash = (hash << 5) - hash + label.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash) % slotCount;
}

/**
 * Assigns each label a stable palette slot in first-seen order, folding anything
 * past the 8-hue budget into a shared "Other" bucket (see dataviz skill: >7
 * meaningful classes belongs in a table, not more generated hues).
 */
export function assignCategoricalSlots(labels: string[]): Map<string, number | 'other'> {
	const seen: string[] = [];
	const result = new Map<string, number | 'other'>();
	for (const label of labels) {
		if (result.has(label)) continue;
		if (!seen.includes(label)) seen.push(label);
		const index = seen.indexOf(label);
		result.set(label, index < CATEGORICAL_PALETTE.length ? index : 'other');
	}
	return result;
}
