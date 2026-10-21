<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import BrandIcon from '$lib/components/brand-icon.svelte';
	import UrgencyBadge from '$lib/components/urgency-badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatRenewalDay } from '$lib/format';
	import { formatMoney, type MoneyContext } from '$lib/money';
	import { trialExposure, trialsAtRisk } from '$lib/trials';

	let {
		subscriptions,
		now,
		money,
		onCancel
	}: {
		subscriptions: Subscription[];
		now: Date;
		money: MoneyContext;
		onCancel: (subscription: Subscription) => void;
	} = $props();

	let trials = $derived(trialsAtRisk(subscriptions, now, money));
	let exposure = $derived(trialExposure(trials));
</script>

{#if trials.length > 0}
	<section
		aria-label="Free trials"
		class="flex flex-col gap-3 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10"
	>
		<p aria-live="polite">
			<strong class="tabular-nums">{formatMoney(exposure.total, money.display)}</strong>
			will be charged if you keep {trials.length === 1
				? 'this trial'
				: `these ${trials.length} trials`}.
			{#if exposure.excluded > 0}
				<span class="text-xs text-muted-foreground">
					({exposure.excluded}
					{exposure.excluded === 1 ? 'trial is' : 'trials are'} not included: no exchange rate is available.)
				</span>
			{/if}
		</p>
		<ul aria-label="Running free trials" class="flex flex-col divide-y divide-border">
			{#each trials as { subscription, endsOn, days, urgency, charge } (subscription.id)}
				<li class="flex flex-wrap items-center gap-3 py-2 first:pt-0 last:pb-0">
					<BrandIcon name={subscription.name} size={28} />
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">{subscription.name}</p>
						<p class="text-xs text-muted-foreground">
							Cancel by {formatRenewalDay(endsOn)}{charge === null
								? ''
								: ` to avoid ${formatMoney(charge, money.display)}`}
						</p>
					</div>
					<UrgencyBadge {urgency} {days} />
					<Button
						variant="outline"
						size="sm"
						aria-label="Cancel {subscription.name}"
						onclick={() => onCancel(subscription)}>Cancel</Button
					>
				</li>
			{/each}
		</ul>
	</section>
{/if}
