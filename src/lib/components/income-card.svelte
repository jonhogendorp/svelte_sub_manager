<script lang="ts">
	import { enhance } from '$app/forms';
	import type { IncomeShare, Income } from '$lib/income';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { CURRENCIES, formatMoney, minorDigits, toMajor } from '$lib/money';
	import { cn } from '$lib/utils';

	let {
		income,
		share,
		display,
		onSaved
	}: {
		income: Income | null;
		share: IncomeShare | null;
		display: string;
		onSaved?: (kind: 'saved' | 'cleared') => void;
	} = $props();

	let error = $state<string | null>(null);
	let editing = $state(false);

	let barPercent = $derived(share ? Math.min(100, share.percent) : 0);
	let initialAmount = $derived(
		income ? toMajor(income.minor, income.currency).toFixed(minorDigits(income.currency)) : ''
	);
</script>

<section
	aria-label="Income"
	class={cn(
		'flex flex-col gap-2 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10',
		share && share.percent > 100 && 'bg-destructive/5 ring-destructive/60'
	)}
>
	{#if share}
		<p class="tabular-nums">
			<span class="font-semibold">{formatMoney(share.fixed, display)}</span>
			of your {formatMoney(share.income, display)} monthly income goes to subscriptions and bills (<span
				class="font-semibold">{Math.round(share.percent)}%</span
			>).
		</p>
		<div
			class="h-2 overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label="Income committed to fixed costs"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(barPercent)}
		>
			<div
				class={cn(
					'h-full rounded-full transition-all motion-reduce:transition-none',
					share.percent > 100
						? 'bg-destructive'
						: share.percent >= 50
							? 'bg-amber-500'
							: 'bg-primary'
				)}
				style:width="{barPercent}%"
			></div>
		</div>
		<p class="text-xs text-muted-foreground tabular-nums">
			{formatMoney(share.subscriptions, display)} subscriptions + {formatMoney(
				share.bills,
				display
			)}
			bills. {share.remaining >= 0
				? `${formatMoney(share.remaining, display)} left each month.`
				: `${formatMoney(-share.remaining, display)} more than you earn.`}
		</p>
	{:else if income}
		<p class="text-muted-foreground">
			No exchange rate is available to compare your {income.currency} income with {display} right now.
		</p>
	{:else}
		<p class="text-muted-foreground">
			Enter your monthly income to see how much of it is already committed to subscriptions and
			bills.
		</p>
	{/if}

	{#if !editing}
		<div>
			<Button variant="outline" size="sm" onclick={() => (editing = true)}>
				{income ? 'Edit income' : 'Set income'}
			</Button>
		</div>
	{:else}
		<form
			method="POST"
			action="?/setIncome"
			class="flex flex-wrap items-center gap-2"
			use:enhance={({ formData }) => {
				error = null;
				const clearing = String(formData.get('amount') ?? '').trim() === '';
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'failure') {
						error =
							typeof result.data?.error === 'string' ? result.data.error : 'Something went wrong.';
					} else if (result.type === 'success') {
						editing = false;
						onSaved?.(clearing ? 'cleared' : 'saved');
					}
				};
			}}
		>
			<Input
				name="amount"
				type="text"
				inputmode="decimal"
				placeholder="Monthly income"
				aria-label="Monthly income amount"
				class="min-w-32 flex-1"
				value={initialAmount}
			/>
			<NativeSelect
				name="currency"
				aria-label="Income currency"
				value={income?.currency ?? display}
			>
				{#each CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</NativeSelect>
			<Button type="submit" size="sm">Save</Button>
			{#if income}
				<Button
					type="submit"
					size="sm"
					variant="outline"
					onclick={(event) => {
						const amount = event.currentTarget.closest('form')?.elements.namedItem('amount');
						if (amount instanceof HTMLInputElement) amount.value = '';
					}}>Clear</Button
				>
			{/if}
			<Button type="button" size="sm" variant="ghost" onclick={() => (editing = false)}>
				Cancel
			</Button>
		</form>
		{#if error}
			<p role="alert" class="text-destructive">{error}</p>
		{/if}
	{/if}
</section>
