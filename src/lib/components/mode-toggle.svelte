<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { theme } from '$lib/hooks/theme.svelte';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Laptop from '@lucide/svelte/icons/laptop';

	const icons = { light: Sun, dark: Moon, system: Laptop };
</script>

<Button
	variant="outline"
	size="icon"
	onclick={() => theme.cycle()}
	title={`Theme: ${theme.preference}`}
	aria-label={`Switch theme (current: ${theme.preference})`}
>
	{@const Icon = icons[theme.preference]}
	<Icon class="size-4" />
</Button>
