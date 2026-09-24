type ThemePreference = 'light' | 'dark' | 'system';

function getSystemPrefersDark() {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference {
	const stored = localStorage.getItem('theme');
	return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

class ThemeStore {
	preference = $state<ThemePreference>('system');
	#systemPrefersDark = $state(false);

	resolved = $derived(this.preference === 'system' ? (this.#systemPrefersDark ? 'dark' : 'light') : this.preference);

	constructor() {
		if (typeof window === 'undefined') return;

		this.preference = readStoredPreference();
		this.#systemPrefersDark = getSystemPrefersDark();

		window
			.matchMedia('(prefers-color-scheme: dark)')
			.addEventListener('change', (e) => (this.#systemPrefersDark = e.matches));

		$effect.root(() => {
			$effect(() => {
				document.documentElement.classList.toggle('dark', this.resolved === 'dark');
				localStorage.setItem('theme', this.preference);
			});
		});
	}

	cycle() {
		const order: ThemePreference[] = ['light', 'dark', 'system'];
		this.preference = order[(order.indexOf(this.preference) + 1) % order.length];
	}
}

export const theme = new ThemeStore();
