<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { resolve } from '$app/paths';
	import BrandIcon from '$lib/components/brand-icon.svelte';
	import { Button } from '$lib/components/ui/button';
	import { monthGrid, type CalendarDay } from '$lib/calendar-grid';
	import { formatMoney, formatSubscriptionPrice, type MoneyContext } from '$lib/money';
	import { cn } from '$lib/utils';

	let {
		subscriptions,
		money,
		now
	}: { subscriptions: Subscription[]; money: MoneyContext; now: Date } = $props();

	const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const MAX_ICONS = 3;

	// Today's calendar date as UTC midnight, like the renewal dates.
	let today = $derived(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

	// Month navigation is local view state; the page already holds every subscription.
	let offset = $state(0);
	let selectedKey = $state<number | null>(null);

	let shown = $derived(new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1)));
	let weeks = $derived(
		monthGrid(subscriptions, shown.getUTCFullYear(), shown.getUTCMonth(), money)
	);
	let monthLabel = $derived(
		shown.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
	);
	let monthTotal = $derived(
		weeks.flat().reduce((sum, day) => sum + (day.inMonth ? day.total : 0), 0)
	);

	let selected = $derived(
		weeks.flat().find((day) => day.date.getTime() === (selectedKey ?? today) && day.inMonth) ?? null
	);

	function move(delta: number) {
		offset += delta;
		selectedKey = null;
	}

	function dayLabel(day: CalendarDay): string {
		const date = day.date.toLocaleDateString('en-GB', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			timeZone: 'UTC'
		});
		if (day.charges.length === 0) return date;
		const count = `${day.charges.length} ${day.charges.length === 1 ? 'charge' : 'charges'}`;
		return `${date}: ${count}, ${formatMoney(day.total, money.display)}`;
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-1">
			<Button variant="outline" size="sm" aria-label="Previous month" onclick={() => move(-1)}
				>←</Button
			>
			<Button variant="outline" size="sm" aria-label="Next month" onclick={() => move(1)}>→</Button>
			<Button variant="ghost" size="sm" disabled={offset === 0} onclick={() => move(-offset)}
				>Today</Button
			>
		</div>
		<h3 class="text-sm font-semibold" aria-live="polite">
			{monthLabel}
			<span class="font-normal text-muted-foreground tabular-nums">
				· {formatMoney(monthTotal, money.display)}
			</span>
		</h3>
		<a
			href={resolve('/calendar.ics')}
			class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			>Subscribe in your calendar app (.ics)</a
		>
	</div>

	<div role="group" aria-label="Renewals in {monthLabel}" class="grid grid-cols-7 gap-px">
		{#each WEEKDAYS as weekday (weekday)}
			<div class="pb-1 text-center text-xs text-muted-foreground">{weekday}</div>
		{/each}
		{#each weeks.flat() as day (day.date.getTime())}
			{@const isToday = day.date.getTime() === today}
			{@const isSelected = selected?.date.getTime() === day.date.getTime()}
			<button
				type="button"
				aria-label={dayLabel(day)}
				aria-pressed={isSelected}
				disabled={!day.inMonth}
				class={cn(
					'flex min-h-14 flex-col items-center gap-0.5 rounded-md border border-transparent p-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:min-h-20',
					!day.inMonth && 'opacity-30',
					day.charges.length > 0 && 'bg-muted/50',
					isToday && 'border-primary',
					isSelected && 'bg-muted ring-2 ring-ring'
				)}
				onclick={() => (selectedKey = day.date.getTime())}
			>
				<span class={cn('tabular-nums', isToday && 'font-bold text-primary')}
					>{day.date.getUTCDate()}</span
				>
				{#if day.inMonth && day.charges.length > 0}
					<span class="flex flex-wrap justify-center gap-0.5" aria-hidden="true">
						{#each day.charges.slice(0, MAX_ICONS) as charge (`${charge.subscription.id}:${charge.kind}`)}
							<BrandIcon name={charge.subscription.name} size={16} />
						{/each}
						{#if day.charges.length > MAX_ICONS}
							<span class="text-muted-foreground">+{day.charges.length - MAX_ICONS}</span>
						{/if}
					</span>
					<span class="hidden tabular-nums sm:block" aria-hidden="true"
						>{formatMoney(day.total, money.display)}</span
					>
				{/if}
			</button>
		{/each}
	</div>

	<div aria-label="Charges on the selected day" class="text-sm">
		{#if !selected}
			<p class="text-muted-foreground">Select a day to see what is charged.</p>
		{:else if selected.charges.length === 0}
			<p class="text-muted-foreground">Nothing is charged on this day.</p>
		{:else}
			<ul class="flex flex-col divide-y divide-border">
				{#each selected.charges as charge (`${charge.subscription.id}:${charge.kind}`)}
					<li class="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
						<BrandIcon name={charge.subscription.name} size={24} />
						<span class="min-w-0 flex-1 truncate font-medium">{charge.subscription.name}</span>
						{#if charge.kind === 'trial'}
							<span class="text-xs text-muted-foreground">Trial ends</span>
						{/if}
						<span class="tabular-nums">{formatSubscriptionPrice(charge.subscription)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
