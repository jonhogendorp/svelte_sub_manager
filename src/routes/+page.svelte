<script lang="ts">
	import type { Subscription } from '../../generated/prisma/client';
	import type { PageProps } from './$types';
	import SubscriptionList from '$lib/components/subscription-list.svelte';
	import SubscriptionForm from '$lib/components/subscription-form.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import CategorySpendChart from '$lib/charts/category-spend-chart.svelte';
	import UpcomingSpendChart from '$lib/charts/upcoming-spend-chart.svelte';

	let { data }: PageProps = $props();

	let editing = $state<Subscription | null>(null);

	function startEdit(sub: Subscription) {
		editing = sub;
	}

	function cancelEdit() {
		editing = null;
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-4">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Your Subscriptions</h1>
		<p class="text-sm text-muted-foreground">Keep track of what you're paying for.</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle>Spend by category</CardTitle>
			</CardHeader>
			<CardContent>
				<CategorySpendChart subscriptions={data.subscriptions} />
			</CardContent>
		</Card>
		<Card>
			<CardHeader>
				<CardTitle>Upcoming spend</CardTitle>
			</CardHeader>
			<CardContent>
				<UpcomingSpendChart subscriptions={data.subscriptions} />
			</CardContent>
		</Card>
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
