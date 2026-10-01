<script lang="ts">
	import {
		BILLING_CYCLES,
		BILLING_CYCLE_LABELS,
		MAX_INTERVAL_MONTHS,
		type BillingCycle
	} from '$lib/subscriptions';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';

	let { value = 'monthly', intervalCount = 1 }: { value?: BillingCycle; intervalCount?: number } =
		$props();

	// Follows the item being edited, but the user can still change it freely in between.
	let cycle = $derived<BillingCycle>(value);
</script>

<div class="flex flex-col gap-1.5">
	<Label for="billingCycle">Billing cycle</Label>
	<div class="flex items-center gap-2">
		<NativeSelect id="billingCycle" name="billingCycle" bind:value={cycle}>
			{#each BILLING_CYCLES as option (option)}
				<option value={option}>{BILLING_CYCLE_LABELS[option]}</option>
			{/each}
		</NativeSelect>
		{#if cycle === 'custom'}
			<span class="text-sm text-muted-foreground">every</span>
			<Input
				id="intervalCount"
				type="number"
				name="intervalCount"
				min="1"
				max={MAX_INTERVAL_MONTHS}
				step="1"
				aria-label="Months between charges"
				value={intervalCount}
				class="w-20"
				required
			/>
			<span class="text-sm text-muted-foreground">months</span>
		{/if}
	</div>
	{#if cycle === 'once'}
		<p class="text-xs text-muted-foreground">
			A single charge on the date below. It isn't counted as recurring spend.
		</p>
	{/if}
</div>
