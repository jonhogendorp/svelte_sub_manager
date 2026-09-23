<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-background">
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex max-w-xl items-center px-4 py-3">
			<a href="/" class="text-lg font-bold text-primary">Subscription Manager</a>
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>
