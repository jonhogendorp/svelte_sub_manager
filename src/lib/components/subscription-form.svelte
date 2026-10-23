<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		MAX_EMAIL_LENGTH,
		MAX_NOTES_LENGTH,
		MAX_SHARED_WITH_LENGTH,
		MAX_PAYMENT_METHOD_LENGTH
	} from '$lib/subscription-form';
	import BillingCycleField from '$lib/components/billing-cycle-field.svelte';
	import { toDateInputValue } from '$lib/format';
	import { BASE_CURRENCY, CURRENCIES, minorDigits, toMajor } from '$lib/money';
	import { MAX_NOTICE_DAYS, MAX_URL_LENGTH } from '$lib/cancellation';
	import { MAX_SHARE_COUNT } from '$lib/subscriptions';
	import { USAGE_RATING_LABELS, USAGE_RATINGS } from '$lib/value';
	import {
		STATUS_LABELS,
		SUBSCRIPTION_STATUSES,
		toBillingCycle,
		toSubscriptionStatus
	} from '$lib/subscriptions';

	let {
		editing,
		categories = [],
		defaultCurrency = BASE_CURRENCY,
		onCancel,
		onSaved = onCancel
	}: {
		editing: Subscription | null;
		categories?: string[];
		/** Preselected currency for a new subscription. */
		defaultCurrency?: string;
		onCancel: () => void;
		/** Called after a successful save; closes the form unless told otherwise. */
		onSaved?: (kind: 'created' | 'updated') => void;
	} = $props();

	let error = $state<string | null>(null);
	let currency = $state<string>(BASE_CURRENCY);

	// Switching between add and edit (or between two items) shouldn't carry a stale error
	// or the previous item's currency over.
	$effect(() => {
		error = null;
		currency = editing?.currency ?? defaultCurrency;
	});

	// Open the extra fields when editing something that already has details in them.
	let hasDetails = $derived(
		Boolean(
			editing &&
			(editing.accountEmail ||
				editing.paymentMethod ||
				editing.notes ||
				editing.usageRating ||
				editing.yearlyPriceMinor ||
				editing.cancelUrl ||
				editing.cancelNoticeDays ||
				editing.startedOn ||
				editing.shareCount > 1 ||
				editing.businessPercent > 0)
		)
	);

	// JPY has no minor unit, EUR has two decimals: the input follows the chosen currency.
	let priceStep = $derived(10 ** -minorDigits(currency));
	let editingYearlyPrice = $derived(
		editing?.yearlyPriceMinor
			? toMajor(editing.yearlyPriceMinor, editing.currency).toFixed(minorDigits(editing.currency))
			: ''
	);
	let editingPrice = $derived(
		editing
			? toMajor(editing.priceMinor, editing.currency).toFixed(minorDigits(editing.currency))
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
		<Label for="name">Name</Label>
		<Input
			id="name"
			type="text"
			name="name"
			placeholder="Netflix"
			value={editing?.name ?? ''}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="price">Price</Label>
		<div class="flex gap-2">
			<Input
				id="price"
				type="number"
				step={priceStep}
				min={priceStep}
				name="price"
				placeholder="15.99"
				value={editingPrice}
				class="flex-1"
				required
			/>
			<NativeSelect id="currency" name="currency" aria-label="Currency" bind:value={currency}>
				{#each CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</NativeSelect>
		</div>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="category">Category</Label>
		<Input
			id="category"
			type="text"
			name="category"
			list="category-suggestions"
			autocomplete="off"
			placeholder="Streaming"
			value={editing?.category ?? ''}
			required
		/>
		<datalist id="category-suggestions">
			{#each categories as category (category)}
				<option value={category}></option>
			{/each}
		</datalist>
	</div>
	<BillingCycleField
		value={toBillingCycle(editing?.billingCycle)}
		intervalCount={editing?.intervalCount ?? 1}
	/>
	<div class="flex flex-col gap-1.5">
		<Label for="renewalDate">Renewal date</Label>
		<Input
			id="renewalDate"
			type="date"
			name="renewalDate"
			value={editing ? toDateInputValue(editing.renewalDate) : ''}
			required
		/>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="trialEndsAt"
			>Free trial ends <span class="text-muted-foreground">(optional)</span></Label
		>
		<Input
			id="trialEndsAt"
			type="date"
			name="trialEndsAt"
			value={editing?.trialEndsAt ? toDateInputValue(editing.trialEndsAt) : ''}
		/>
		<p class="text-xs text-muted-foreground">
			You'll get a reminder before the trial turns into a charge.
		</p>
	</div>
	<div class="flex flex-col gap-1.5">
		<Label for="status">Status</Label>
		<NativeSelect
			id="status"
			name="status"
			class="w-fit"
			value={toSubscriptionStatus(editing?.status)}
		>
			{#each SUBSCRIPTION_STATUSES as option (option)}
				<option value={option}>{STATUS_LABELS[option]}</option>
			{/each}
		</NativeSelect>
	</div>
	<details class="rounded-lg border border-input px-3 py-2" open={hasDetails}>
		<summary class="cursor-pointer text-sm font-medium">More details (optional)</summary>
		<div class="mt-3 flex flex-col gap-3">
			<div class="flex flex-col gap-1.5">
				<Label for="businessPercent"
					>Business use (%) <span class="text-muted-foreground">(optional)</span></Label
				>
				<Input
					id="businessPercent"
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
				<Label for="shareCount">Split between (people, you included)</Label>
				<Input
					id="shareCount"
					type="number"
					name="shareCount"
					min="1"
					max={MAX_SHARE_COUNT}
					step="1"
					placeholder="1"
					value={editing && editing.shareCount > 1 ? editing.shareCount : ''}
				/>
				<p class="text-xs text-muted-foreground">
					You pay the full price; totals, budgets and charts count only your share.
				</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="sharedWith">Shared with</Label>
				<Input
					id="sharedWith"
					type="text"
					name="sharedWith"
					maxlength={MAX_SHARED_WITH_LENGTH}
					placeholder="Sam, Alex"
					value={editing?.sharedWith ?? ''}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="startedOn">Subscribed since</Label>
				<Input
					id="startedOn"
					type="date"
					name="startedOn"
					value={editing?.startedOn ? toDateInputValue(editing.startedOn) : ''}
				/>
				<p class="text-xs text-muted-foreground">Used to estimate what you have paid in total.</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="cancelUrl">Cancellation link</Label>
				<Input
					id="cancelUrl"
					type="url"
					name="cancelUrl"
					maxlength={MAX_URL_LENGTH}
					autocomplete="off"
					placeholder="https://example.com/account/cancel"
					value={editing?.cancelUrl ?? ''}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="cancelNoticeDays">Notice needed (days before renewal)</Label>
				<Input
					id="cancelNoticeDays"
					type="number"
					name="cancelNoticeDays"
					min="1"
					max={MAX_NOTICE_DAYS}
					step="1"
					placeholder="30"
					value={editing?.cancelNoticeDays ?? ''}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="yearlyPrice">Yearly price, if you paid up front</Label>
				<Input
					id="yearlyPrice"
					type="number"
					step={priceStep}
					min={priceStep}
					name="yearlyPrice"
					placeholder="159.00"
					value={editingYearlyPrice}
				/>
				<p class="text-xs text-muted-foreground">
					Monthly plans only. If it's cheaper than twelve months, Insights shows what you'd save.
				</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="usageRating">How much value do you get from it?</Label>
				<NativeSelect
					id="usageRating"
					name="usageRating"
					class="w-fit"
					value={editing?.usageRating ? String(editing.usageRating) : ''}
				>
					<option value="">Not rated</option>
					{#each USAGE_RATINGS as rating (rating)}
						<option value={String(rating)}>{rating} – {USAGE_RATING_LABELS[rating]}</option>
					{/each}
				</NativeSelect>
				<p class="text-xs text-muted-foreground">
					Low-rated, expensive subscriptions are suggested as cancellation candidates.
				</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="accountEmail">Account email</Label>
				<Input
					id="accountEmail"
					type="email"
					name="accountEmail"
					maxlength={MAX_EMAIL_LENGTH}
					autocomplete="off"
					placeholder="me@example.com"
					value={editing?.accountEmail ?? ''}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="paymentMethod">Payment method</Label>
				<Input
					id="paymentMethod"
					type="text"
					name="paymentMethod"
					maxlength={MAX_PAYMENT_METHOD_LENGTH}
					placeholder="Visa ending 4242"
					value={editing?.paymentMethod ?? ''}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="notes">Notes</Label>
				<Textarea
					id="notes"
					name="notes"
					maxlength={MAX_NOTES_LENGTH}
					rows={3}
					placeholder="Shared with family, cancel before the trial ends…"
					value={editing?.notes ?? ''}
				/>
			</div>
		</div>
	</details>
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
	<Button type="submit">{editing ? 'Update' : 'Add'} Subscription</Button>
	<Button type="button" variant="secondary" onclick={onCancel}>Cancel</Button>
</form>
