<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Bill, BillPayment } from '../../../generated/prisma/client';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import UrgencyBadge from '$lib/components/urgency-badge.svelte';
	import { estimatedAmountMinor, paymentsFor } from '$lib/bills';
	import { cn } from '$lib/utils';
	import { toDateInputValue } from '$lib/format';
	import { formatMoney, toMajor } from '$lib/money';
	import {
		STATUS_LABELS,
		SUBSCRIPTION_STATUSES,
		cycleSuffix,
		daysUntil,
		nextOccurrenceFor,
		toSubscriptionStatus,
		urgencyFor
	} from '$lib/subscriptions';

	let {
		bill,
		payments,
		now,
		onLogPayment,
		onEdit
	}: {
		bill: Bill;
		/** Every payment on record; this card picks out its own. */
		payments: BillPayment[];
		now: Date;
		onLogPayment: (bill: Bill) => void;
		onEdit: (bill: Bill) => void;
	} = $props();

	let status = $derived(toSubscriptionStatus(bill.status));
	let estimate = $derived(estimatedAmountMinor(bill, payments));
	let history = $derived(paymentsFor(bill, payments));
	let lastPayment = $derived(history[0] ?? null);
	let usesPayments = $derived(history.some((payment) => payment.currency === bill.currency));

	let nextDue = $derived.by(() => {
		const startOfToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
		return nextOccurrenceFor(bill, startOfToday);
	});
	let days = $derived(nextDue ? daysUntil(nextDue, now) : null);

	function money(minor: number, currency: string): string {
		return formatMoney(toMajor(minor, currency), currency);
	}
</script>

<Card class={cn(status === 'active' ? '' : 'opacity-60')}>
	<CardContent class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-semibold">{bill.name}</span>
				<span class="text-muted-foreground tabular-nums"
					>~{money(estimate, bill.currency)}<span class="text-xs">{cycleSuffix(bill)}</span></span
				>
				<Badge variant="secondary">{bill.kind}</Badge>
				{#if status !== 'active'}
					<Badge variant="outline">{STATUS_LABELS[status]}</Badge>
				{/if}
				{#if status === 'active' && nextDue && days !== null}
					<UrgencyBadge urgency={urgencyFor(days)} {days} />
				{/if}
			</div>
			<p class="text-xs text-muted-foreground">
				Next due: {nextDue ? toDateInputValue(nextDue) : '—'}
				{#if lastPayment}
					· Last paid {money(lastPayment.amountMinor, lastPayment.currency)} on {toDateInputValue(
						lastPayment.paidOn
					)}
				{/if}
				{#if !usesPayments}
					· Estimate only
				{/if}
			</p>
		</div>
		{#if bill.notes}
			<details class="order-last w-full text-sm">
				<summary class="cursor-pointer text-xs text-muted-foreground">Notes</summary>
				<p class="mt-2 whitespace-pre-wrap">{bill.notes}</p>
			</details>
		{/if}
		<div class="flex items-center gap-2">
			<form method="POST" action="?/setStatus" use:enhance>
				<input type="hidden" name="id" value={bill.id} />
				<NativeSelect
					name="status"
					aria-label="Status of {bill.name}"
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
			<Button size="sm" onclick={() => onLogPayment(bill)}>Log payment</Button>
			<Button variant="outline" size="sm" onclick={() => onEdit(bill)}>Edit</Button>
			<form
				method="POST"
				action="?/delete"
				use:enhance={({ cancel }) => {
					if (!confirm(`Delete "${bill.name}" and its payment history?`)) cancel();
				}}
			>
				<input type="hidden" name="id" value={bill.id} />
				<Button type="submit" variant="destructive" size="sm">Delete</Button>
			</form>
		</div>
	</CardContent>
</Card>
