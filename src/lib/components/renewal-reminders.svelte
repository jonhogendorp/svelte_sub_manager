<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import BrandIcon from '$lib/components/brand-icon.svelte';
	import UrgencyBadge from '$lib/components/urgency-badge.svelte';
	import { formatSubscriptionPrice } from '$lib/money';
	import { eventReminderIsActive, upcomingWithin } from '$lib/subscriptions';
	import { notifications } from '$lib/hooks/notifications.svelte';

	const REMINDER_WINDOW_DAYS = 7;
	const SNOOZE_DAYS = 3;

	let { subscriptions, now }: { subscriptions: Subscription[]; now: Date } = $props();

	let due = $derived(
		upcomingWithin(subscriptions, now, REMINDER_WINDOW_DAYS).filter((event) =>
			eventReminderIsActive(event, now)
		)
	);

	$effect(() => {
		for (const { subscription, kind, occurrence, days } of due) {
			const key = `${subscription.id}:${kind}:${occurrence.toISOString().slice(0, 10)}`;
			const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
			notifications.notify(
				key,
				kind === 'trial'
					? `${subscription.name} trial ends ${when}`
					: `${subscription.name} renews ${when}`,
				kind === 'trial'
					? `Cancel before then or ${formatSubscriptionPrice(subscription)} will be charged.`
					: `${formatSubscriptionPrice(subscription)} will be charged.`
			);
		}
	});

	// A tab left open for days would otherwise keep rendering stale urgency.
	$effect(() => {
		function refreshWhenVisible() {
			if (document.visibilityState === 'visible') invalidateAll();
		}
		document.addEventListener('visibilitychange', refreshWhenVisible);
		return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
	});
</script>

{#if due.length > 0}
	<Card>
		<CardHeader>
			<CardTitle>Needs attention</CardTitle>
		</CardHeader>
		<CardContent class="flex flex-col gap-3">
			{#each due as { subscription, kind, days, urgency } (`${subscription.id}:${kind}`)}
				<div class="flex flex-wrap items-center gap-3">
					<BrandIcon name={subscription.name} size={28} />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{subscription.name}</p>
						<p class="text-xs text-muted-foreground tabular-nums">
							{#if kind === 'trial'}Trial ends · then {/if}{formatSubscriptionPrice(subscription)}
						</p>
					</div>
					<UrgencyBadge {urgency} {days} />
					<div class="flex gap-2">
						<form method="POST" action="?/snoozeReminder" use:enhance>
							<input type="hidden" name="id" value={subscription.id} />
							<input type="hidden" name="kind" value={kind} />
							<input type="hidden" name="days" value={SNOOZE_DAYS} />
							<Button type="submit" variant="outline" size="sm">Snooze {SNOOZE_DAYS}d</Button>
						</form>
						<form method="POST" action="?/dismissReminder" use:enhance>
							<input type="hidden" name="id" value={subscription.id} />
							<input type="hidden" name="kind" value={kind} />
							<Button type="submit" variant="ghost" size="sm">Dismiss</Button>
						</form>
					</div>
				</div>
			{/each}

			{#if notifications.supported && notifications.permission === 'default'}
				<div class="flex items-center justify-between gap-3 border-t border-border pt-3">
					<p class="text-xs text-muted-foreground">
						Get a browser notification for these. Only fires while this tab is open.
					</p>
					<Button variant="outline" size="sm" onclick={() => notifications.request()}>
						Enable notifications
					</Button>
				</div>
			{/if}
		</CardContent>
	</Card>
{/if}
