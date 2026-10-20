<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import Toaster from '$lib/components/toaster.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-background">
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
			<a href={resolve('/')} class="text-lg font-bold text-primary">Subscription Manager</a>
			<div class="flex items-center gap-3">
				<a href={resolve('/bills')} class="text-sm text-muted-foreground hover:text-foreground"
					>Bills</a
				>
				<a href={resolve('/insights')} class="text-sm text-muted-foreground hover:text-foreground"
					>Insights</a
				>
				<ModeToggle />
			</div>
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>

<Toaster />
