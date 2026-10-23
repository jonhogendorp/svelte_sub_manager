<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Bill } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Textarea } from '$lib/components/ui/textarea';
	import BillingCycleField from '$lib/components/billing-cycle-field.svelte';
	import { BILL_CYCLES } from '$lib/bills';
	import { MAX_BILL_NOTES_LENGTH } from '$lib/bill-form';
	import { toDateInputValue } from '$lib/format';
	import { BASE_CURRENCY, CURRENCIES, minorDigits, toMajor } from '$lib/money';
	import {
		STATUS_LABELS,
		SUBSCRIPTION_STATUSES,
		toBillingCycle,
		toSubscriptionStatus
	} from '$lib/subscriptions';

	let {
		editing,
		kinds = [],
		defaultCurrency = BASE_CURRENCY,
		onCancel,
		onSaved = onCancel
	}: {
		editing: Bill | null;
		kinds?: string[];
		/** Preselected currency for a new bill. */
		defaultCurrency?: string;
		onCancel: () => void;
		/** Called after a successful save; closes the form unless told otherwise. */
		onSaved?: (kind: 'created' | 'updated') => void;
	} = $props();

	let error = $state<string | null>(null);
	let currency = $state<string>(BASE_CURRENCY);

	$effect(() => {
		error = null;
		currency = editing?.currency ?? defaultCurrency;
	});

	let amountStep = $derived(10 ** -minorDigits(currency));
	let editingEstimate = $derived(
		editing
			? toMajor(editing.estimateMinor, editing.currency).toFixed(minorDigits(editing.currency))
			: ''
	);
</script>

<form
	class="flex flex-col gap-3"
	method="POST"
	action={editing ? '?/update' : '?/create'}
	use:enhance={() => {
		error = null;
		return async ({ result, update }) => {
			await update();
			if (result.type === 'failure') {
				error =
					typeof result.data?.error === 'string' ? result.data.error : 'Something went wrong.';
				return;
			}
			if (result.type === 'success') onSaved(editing ? 'updated' : 'created');
		};
	}}
>
	{#if editing}
		<input type="hidden" name="id" value={editing.id} />
	{/if}
	<div class="flex flex-col gap-1.5">
		<Label for="bill-name">Name</Label>
		<Input
			id="bill-name"
			type="text"
			name="name"
			placeholder="Electricity"
			value={editing?.name ?? ''}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="bill-estimate">Estimated amount</Label>
		<div class="flex gap-2">
			<Input
				id="bill-estimate"
				type="number"
				step={amountStep}
				min={amountStep}
				name="estimate"
				placeholder="85.00"
				value={editingEstimate}
				class="flex-1"
				required
			/>
			<NativeSelect id="bill-currency" name="currency" aria-label="Currency" bind:value={currency}>
				{#each CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</NativeSelect>
		</div>
		<p class="text-xs text-muted-foreground">
			Used until you log payments; then the average of the last few payments takes over.
		</p>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="bill-kind">Kind</Label>
		<Input
			id="bill-kind"
			type="text"
			name="kind"
			list="bill-kind-suggestions"
			autocomplete="off"
			placeholder="Utilities"
			value={editing?.kind ?? ''}
			required
		/>
		<datalist id="bill-kind-suggestions">
			{#each kinds as kind (kind)}
				<option value={kind}></option>
			{/each}
		</datalist>
	</div>
	<BillingCycleField
		value={toBillingCycle(editing?.billingCycle)}
		intervalCount={editing?.intervalCount ?? 1}
		cycles={BILL_CYCLES}
	/>
	<div class="flex flex-col gap-1.5">
		<Label for="bill-renewalDate">Next due date</Label>
		<Input
			id="bill-renewalDate"
			type="date"
			name="renewalDate"
			value={editing ? toDateInputValue(editing.renewalDate) : ''}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="bill-status">Status</Label>
		<NativeSelect
			id="bill-status"
			name="status"
			class="w-fit"
			value={toSubscriptionStatus(editing?.status)}
		>
			{#each SUBSCRIPTION_STATUSES as option (option)}
				<option value={option}>{STATUS_LABELS[option]}</option>
			{/each}
		</NativeSelect>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="bill-business"
			>Business use (%) <span class="text-muted-foreground">(optional)</span></Label
		>
		<Input
			id="bill-business"
			type="number"
			name="businessPercent"
			min="0"
			max="100"
			step="1"
			placeholder="0"
			value={editing && editing.businessPercent > 0 ? editing.businessPercent : ''}
		/>
		<p class="text-xs text-muted-foreground">
			The part you can claim as a business expense. Used by the tax report.
		</p>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="bill-notes">Notes <span class="text-muted-foreground">(optional)</span></Label>
		<Textarea
			id="bill-notes"
			name="notes"
			maxlength={MAX_BILL_NOTES_LENGTH}
			rows={3}
			placeholder="Customer number, meter reading day…"
			value={editing?.notes ?? ''}
		/>
	</div>
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
	<Button type="submit">{editing ? 'Update' : 'Add'} Bill</Button>
	<Button type="button" variant="secondary" onclick={onCancel}>Cancel</Button>
</form>
