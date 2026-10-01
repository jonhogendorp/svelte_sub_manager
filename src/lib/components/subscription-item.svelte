<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import BrandIcon from '$lib/components/brand-icon.svelte';
	import { findBrandIcon } from '$lib/brand-icons';
	import { CATEGORICAL_PALETTE, hashToSlot } from '$lib/charts/palette';
	import { theme } from '$lib/hooks/theme.svelte';
	import { formatRenewalDay, toDateInputValue } from '$lib/format';
	import { formatSubscriptionPrice } from '$lib/money';
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
		onEdit
	}: { sub: Subscription; now: Date; onEdit: (sub: Subscription) => void } = $props();

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
				</div>
				<p class="text-xs text-muted-foreground">
					{isOneOff ? 'Charge date' : 'Renewal'}: {toDateInputValue(sub.renewalDate)}
				</p>
			</div>
		</div>
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
			<AlertDialog.Root>
				<AlertDialog.Trigger class={buttonVariants({ variant: 'destructive', size: 'sm' })}>
					Delete
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Delete "{sub.name}"?</AlertDialog.Title>
						<AlertDialog.Description>
							This will permanently remove this subscription. This action cannot be undone.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={sub.id} />
							<AlertDialog.Action type="submit" variant="destructive">Delete</AlertDialog.Action>
						</form>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</CardContent>
</Card>
