<script lang="ts">
	import type { Subscription } from '../../generated/prisma/client';
	import type { PageProps } from './$types';
	import SubscriptionList from '$lib/components/subscription-list.svelte';
	import SubscriptionForm from '$lib/components/subscription-form.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

	let { data }: PageProps = $props();

	let editing = $state<Subscription | null>(null);

	function startEdit(sub: Subscription) {
		editing = sub;
	}

	function cancelEdit() {
		editing = null;
	}
</script>

<div class="mx-auto flex max-w-xl flex-col gap-6 p-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Your Subscriptions</h1>
		<p class="text-sm text-muted-foreground">Keep track of what you're paying for.</p>
	</div>

	<SubscriptionList subscriptions={data.subscriptions} onEdit={startEdit} />

	<Card>
		<CardHeader>
			<CardTitle>{editing ? 'Edit Subscription' : 'Add Subscription'}</CardTitle>
		</CardHeader>
		<CardContent>
			<SubscriptionForm {editing} onCancel={cancelEdit} />
		</CardContent>
	</Card>
</div>
