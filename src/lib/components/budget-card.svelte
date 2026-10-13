<script lang="ts">
	import { enhance } from '$app/forms';
	import { budgetStatus, type Budget } from '$lib/budget';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { CURRENCIES, formatMoney, minorDigits, toMajor, type MoneyContext } from '$lib/money';
	import { cn } from '$lib/utils';

	let {
		budget,
		monthlySpend,
		money,
		onSaved
	}: {
		budget: Budget | null;
		/** Major units of the display currency. */
		monthlySpend: number;
		money: MoneyContext;
		/** Called after the budget was saved or cleared. */
		onSaved?: (kind: 'saved' | 'cleared') => void;
	} = $props();

	let error = $state<string | null>(null);
	let editing = $state(false);

	let status = $derived(budgetStatus(monthlySpend, budget, money));
	let barPercent = $derived(Math.min(100, status.percent));
	let initialAmount = $derived(
		budget ? toMajor(budget.minor, budget.currency).toFixed(minorDigits(budget.currency)) : ''
	);
</script>

<section
	aria-label="Monthly budget"
	class={cn(
		'flex flex-col gap-2 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10',
		status.state === 'over' && 'bg-destructive/5 ring-destructive/60'
	)}
>
	{#if status.state !== 'none'}
		<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
			<p class="tabular-nums">
				<span class="font-semibold">{formatMoney(monthlySpend, money.display)}</span>
				of {formatMoney(status.limit, money.display)} per month
			</p>
			{#if status.state === 'over'}
				<p role="alert" class="font-medium text-destructive">
					Over budget by {formatMoney(-status.remaining, money.display)}.
				</p>
			{:else if status.state === 'near'}
				<p class="text-amber-700 dark:text-amber-400">
					Almost at your budget: {formatMoney(status.remaining, money.display)} left.
				</p>
			{:else}
				<p class="text-muted-foreground">
					{formatMoney(status.remaining, money.display)} left this month.
				</p>
			{/if}
		</div>
		<div
			class="h-2 overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label="Budget used"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(barPercent)}
		>
			<div
				class={cn(
					'h-full rounded-full transition-all motion-reduce:transition-none',
					status.state === 'over' && 'bg-destructive',
					status.state === 'near' && 'bg-amber-500',
					status.state === 'ok' && 'bg-primary'
				)}
				style:width="{barPercent}%"
			></div>
		</div>
	{:else if budget}
		<p class="text-muted-foreground">
			No exchange rate is available to compare your {budget.currency} budget with {money.display} right
			now.
		</p>
	{:else}
		<p class="text-muted-foreground">Set a monthly budget to get warned when you exceed it.</p>
	{/if}

	{#if !editing}
		<div>
			<Button variant="outline" size="sm" onclick={() => (editing = true)}>
				{budget ? 'Edit budget' : 'Set a budget'}
			</Button>
		</div>
	{:else}
		<form
			method="POST"
			action="?/setBudget"
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
				placeholder="Monthly budget"
				aria-label="Monthly budget amount"
				class="min-w-32 flex-1"
				value={initialAmount}
			/>
			<NativeSelect
				name="currency"
				aria-label="Budget currency"
				value={budget?.currency ?? money.display}
			>
				{#each CURRENCIES as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</NativeSelect>
			<Button type="submit" size="sm">Save</Button>
			{#if budget}
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
