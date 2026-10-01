<script lang="ts">
	import { BILLING_CYCLES, type BillingCycle } from '$lib/subscriptions';
	import { Label } from '$lib/components/ui/label';

	let { value = 'monthly' }: { value?: BillingCycle } = $props();

	const labels: Record<BillingCycle, string> = {
		monthly: 'Monthly',
		yearly: 'Yearly'
	};
</script>

<fieldset class="flex flex-col gap-1.5">
	<Label>Billing cycle</Label>
	<div class="inline-flex w-fit gap-0.5 rounded-lg border border-input p-0.5">
		{#each BILLING_CYCLES as cycle (cycle)}
			<label class="cursor-pointer">
				<input
					type="radio"
					name="billingCycle"
					value={cycle}
					checked={value === cycle}
					class="peer sr-only"
				/>
				<span
					class="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
				>
					{labels[cycle]}
				</span>
			</label>
		{/each}
	</div>
</fieldset>
