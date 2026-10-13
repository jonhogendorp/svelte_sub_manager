<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PriceChange, Subscription } from '../../../generated/prisma/client';
	import { recentIncrease } from '$lib/price-history';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import BrandIcon from '$lib/components/brand-icon.svelte';
	import { findBrandIcon } from '$lib/brand-icons';
	import { CATEGORICAL_PALETTE, hashToSlot } from '$lib/charts/palette';
	import { theme } from '$lib/hooks/theme.svelte';
	import { formatRenewalDay, toDateInputValue } from '$lib/format';
	import { formatMoney, formatSubscriptionPrice, toMajor } from '$lib/money';
	import {
		STATUS_LABELS,
		SUBSCRIPTION_STATUSES,
		cycleSuffix,
		toBillingCycle,
		toSubscriptionStatus,
		trialEndOn
	} from '$lib/subscriptions';

	let {
		sub,
		now,
		changes = [],
		onEdit,
		onDelete
	}: {
		sub: Subscription;
		now: Date;
		/** This subscription's price changes, newest first. */
		changes?: PriceChange[];
		onEdit: (sub: Subscription) => void;
		/** Deleting is undoable, so there is no confirmation step. */
		onDelete: (sub: Subscription) => void;
	} = $props();

	let increase = $derived(recentIncrease(changes, now));
	let hasDetails = $derived(
		Boolean(sub.accountEmail || sub.paymentMethod || sub.notes || changes.length > 0)
	);

	function formatChange(minor: number, currency: string): string {
		return formatMoney(toMajor(minor, currency), currency);
	}

	/** "2026-10-02: €10.00 → €12.00" */
	function historyLine(change: PriceChange): string {
		const from = formatChange(change.oldMinor, change.currency);
		const to = formatChange(change.newMinor, change.currency);
		return `${toDateInputValue(change.changedAt)}: ${from} → ${to}`;
	}

	let status = $derived(toSubscriptionStatus(sub.status));
	let isOneOff = $derived(toBillingCycle(sub.billingCycle) === 'once');
	let trialEnd = $derived(status === 'active' ? trialEndOn(sub, now) : null);

	let accentHex = $derived.by(() => {
		const brand = findBrandIcon(sub.name);
		if (brand) return `#${brand.hex}`;
		const slot = CATEGORICAL_PALETTE[hashToSlot(sub.name)];
		return theme.resolved === 'dark' ? slot.dark : slot.light;
	});
</script>

<Card style="border-left: 4px solid {accentHex}" class={status === 'active' ? '' : 'opacity-60'}>
	<CardContent class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<BrandIcon name={sub.name} size={36} />
			<div>
				<div class="flex flex-wrap items-center gap-2">
					<span class="font-semibold">{sub.name}</span>
					<span class="text-muted-foreground tabular-nums"
						>{formatSubscriptionPrice(sub)}<span class="text-xs">{cycleSuffix(sub)}</span></span
					>
					<Badge variant="secondary">{sub.category}</Badge>
					{#if isOneOff}
						<Badge variant="outline">One-off</Badge>
					{/if}
					{#if status !== 'active'}
						<Badge variant="outline">{STATUS_LABELS[status]}</Badge>
					{/if}
					{#if trialEnd}
						<Badge variant="outline">Trial ends {formatRenewalDay(trialEnd)}</Badge>
					{/if}
					{#if increase}
						<Badge
							variant="outline"
							class="border-destructive/50 text-destructive"
							title="Price went up on {toDateInputValue(increase.changedAt)}"
						>
							↑ from {formatChange(increase.fromMinor, increase.currency)}
						</Badge>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">
					{isOneOff ? 'Charge date' : 'Renewal'}: {toDateInputValue(sub.renewalDate)}
				</p>
			</div>
		</div>
		{#if hasDetails}
			<details class="order-last w-full text-sm">
				<summary class="cursor-pointer text-xs text-muted-foreground">Details</summary>
				<dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
					{#if sub.accountEmail}
						<dt class="text-muted-foreground">Account</dt>
						<dd class="break-all">{sub.accountEmail}</dd>
					{/if}
					{#if sub.paymentMethod}
						<dt class="text-muted-foreground">Payment</dt>
						<dd>{sub.paymentMethod}</dd>
					{/if}
					{#if sub.notes}
						<dt class="text-muted-foreground">Notes</dt>
						<dd class="whitespace-pre-wrap">{sub.notes}</dd>
					{/if}
					{#if changes.length > 0}
						<dt class="text-muted-foreground">Price history</dt>
						<dd>
							<ul class="flex flex-col gap-0.5 tabular-nums">
								{#each changes as change (change.id)}
									<li>{historyLine(change)}</li>
								{/each}
							</ul>
						</dd>
					{/if}
				</dl>
			</details>
		{/if}
		<div class="flex items-center gap-2">
			<form method="POST" action="?/setStatus" use:enhance>
				<input type="hidden" name="id" value={sub.id} />
				<NativeSelect
					name="status"
					aria-label="Status of {sub.name}"
					class="h-8"
					value={status}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				>
					{#each SUBSCRIPTION_STATUSES as option (option)}
						<option value={option}>{STATUS_LABELS[option]}</option>
					{/each}
				</NativeSelect>
				<noscript><Button type="submit" size="sm" variant="outline">Set</Button></noscript>
			</form>
			<Button variant="outline" size="sm" onclick={() => onEdit(sub)}>Edit</Button>
			<Button variant="destructive" size="sm" onclick={() => onDelete(sub)}>Delete</Button>
		</div>
	</CardContent>
</Card>
