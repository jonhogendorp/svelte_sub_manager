<script lang="ts">
	import type { Bill } from '../../../generated/prisma/client';
	import type { PageProps } from './$types';
	import BillItem from '$lib/components/bill-item.svelte';
	import BillForm from '$lib/components/bill-form.svelte';
	import BillPaymentForm from '$lib/components/bill-payment-form.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { estimatedAmountMinor, summarizeBills } from '$lib/bills';
	import { toast } from '$lib/hooks/toast.svelte';
	import { formatMoney, type MoneyContext } from '$lib/money';

	let { data }: PageProps = $props();

	let editing = $state<Bill | null>(null);
	let formOpen = $state(false);
	let paying = $state<Bill | null>(null);
	let payOpen = $state(false);

	let money = $derived<MoneyContext>({ display: data.displayCurrency, rates: data.rates });
	let summary = $derived(summarizeBills(data.bills, data.payments, money));
	let kinds = $derived(
		[...new Set(data.bills.map((bill) => bill.kind.trim()).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b)
		)
	);

	function startAdd() {
		editing = null;
		formOpen = true;
	}

	function startEdit(bill: Bill) {
		editing = bill;
		formOpen = true;
	}

	function startPayment(bill: Bill) {
		paying = bill;
		payOpen = true;
	}

	function onSaved(kind: 'created' | 'updated') {
		formOpen = false;
		toast.show(kind === 'created' ? 'Bill added.' : 'Bill updated.');
	}

	function onPaymentSaved() {
		payOpen = false;
		toast.show('Payment logged.');
	}
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-5 p-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Your Bills</h1>
		<Button onclick={startAdd}>+ New bill</Button>
	</div>

	{#if data.bills.length > 0}
		<section aria-label="Bill summary" class="flex flex-col gap-2">
			<dl class="grid grid-cols-2 gap-3">
				<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
					<dt class="text-xs text-muted-foreground">Per month (estimated)</dt>
					<dd class="text-xl font-semibold tabular-nums">
						{formatMoney(summary.monthly, money.display)}
					</dd>
				</div>
				<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
					<dt class="text-xs text-muted-foreground">Per year (estimated)</dt>
					<dd class="text-xl font-semibold tabular-nums">
						{formatMoney(summary.yearly, money.display)}
					</dd>
				</div>
			</dl>
			<p class="text-xs text-muted-foreground">
				Across {summary.counted}
				{summary.counted === 1 ? 'active bill' : 'active bills'}. Not included in the subscription
				totals or budget.
			</p>
			{#if summary.excluded > 0}
				<p class="text-xs text-muted-foreground">
					{summary.excluded}
					{summary.excluded === 1 ? 'bill is' : 'bills are'} not included: no exchange rate is available
					to convert {summary.excluded === 1 ? 'it' : 'them'} to {money.display} right now.
				</p>
			{/if}
		</section>

		<ul class="flex flex-col gap-3">
			{#each data.bills as bill (bill.id)}
				<li>
					<BillItem
						{bill}
						payments={data.payments}
						now={data.now}
						onLogPayment={startPayment}
						onEdit={startEdit}
					/>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-muted-foreground">
			No bills yet. Add recurring costs like water, electricity or insurance.
		</p>
	{/if}

	<Dialog.Root bind:open={formOpen}>
		<Dialog.Content>
			<Dialog.Title>{editing ? 'Edit bill' : 'Add bill'}</Dialog.Title>
			<Dialog.Description class="sr-only">
				{editing ? 'Change the details of this bill.' : 'Enter the details of a new bill.'}
			</Dialog.Description>
			{#key editing?.id ?? 'new'}
				<BillForm
					{editing}
					{kinds}
					defaultCurrency={data.displayCurrency}
					onCancel={() => (formOpen = false)}
					{onSaved}
				/>
			{/key}
		</Dialog.Content>
	</Dialog.Root>

	<Dialog.Root bind:open={payOpen}>
		<Dialog.Content>
			<Dialog.Title>Log payment{paying ? ` for ${paying.name}` : ''}</Dialog.Title>
			<Dialog.Description class="sr-only">
				Record the amount you actually paid for this bill.
			</Dialog.Description>
			{#if paying}
				{#key paying.id}
					<BillPaymentForm
						bill={paying}
						suggestedMinor={estimatedAmountMinor(paying, data.payments)}
						today={data.now}
						onCancel={() => (payOpen = false)}
						onSaved={onPaymentSaved}
					/>
				{/key}
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</div>
