<script lang="ts">
	import '../app.css';
	import ModeToggle from '$lib/components/mode-toggle.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-background">
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
			<a href="/" class="text-lg font-bold text-primary">Subscription Manager</a>
			<ModeToggle />
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>
