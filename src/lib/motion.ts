import { cubicOut } from 'svelte/easing';

/** Shared durations (ms) so motion feels consistent across the app. */
export const DURATION = { fast: 150, base: 200, slow: 300 } as const;

/** Default easing for enter/exit/flip animations. */
export const EASE = cubicOut;

/** True when the user (or the test environment) asked for reduced motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** Returns `ms`, or 0 under reduced motion. Use for every Svelte transition/animate duration. */
export function dur(ms: number): number {
	return prefersReducedMotion() ? 0 : ms;
}
