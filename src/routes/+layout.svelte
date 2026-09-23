<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-slate-50">
	<header class="border-b border-slate-200 bg-white">
		<div class="mx-auto flex max-w-xl items-center px-4 py-3">
			<a href="/" class="text-lg font-bold">Subscription Manager</a>
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>
