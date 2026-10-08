<script lang="ts">
	import { enhance } from '$app/forms';
	import { budgetStatus, type Budget } from '$lib/budget';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { CURRENCIES, formatMoney, minorDigits, toMajor, type MoneyContext } from '$lib/money';
	import { cn } from '$lib/utils';

	let {
		budget,
		monthlySpend,
		money
	}: {
		budget: Budget | null;
		/** Major units of the display currency. */
		monthlySpend: number;
		money: MoneyContext;
	} = $props();

	let error = $state<string | null>(null);

	let status = $derived(budgetStatus(monthlySpend, budget, money));
	let barPercent = $derived(Math.min(100, status.percent));
	let initialAmount = $derived(
		budget ? toMajor(budget.minor, budget.currency).toFixed(minorDigits(budget.currency)) : ''
	);
</script>

<Card>
	<CardHeader>
		<CardTitle>Monthly budget</CardTitle>
	</CardHeader>
	<CardContent class="flex flex-col gap-3">
		{#if status.state !== 'none'}
			<div class="flex flex-col gap-1">
				<p class="text-sm tabular-nums">
					<span class="font-semibold">{formatMoney(monthlySpend, money.display)}</span>
					of {formatMoney(status.limit, money.display)} per month
				</p>
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
							'h-full rounded-full transition-all',
							status.state === 'over' && 'bg-destructive',
							status.state === 'near' && 'bg-amber-500',
							status.state === 'ok' && 'bg-primary'
						)}
						style:width="{barPercent}%"
					></div>
				</div>
			</div>
			{#if status.state === 'over'}
				<p role="alert" class="text-sm font-medium text-destructive">
					Over budget by {formatMoney(-status.remaining, money.display)}.
				</p>
			{:else if status.state === 'near'}
				<p class="text-sm text-amber-600 dark:text-amber-400">
					Almost at your budget: {formatMoney(status.remaining, money.display)} left.
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					{formatMoney(status.remaining, money.display)} left this month.
				</p>
			{/if}
		{:else if budget}
			<p class="text-sm text-muted-foreground">
				No exchange rate is available to compare your {budget.currency} budget with {money.display}
				right now.
			</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				Set a monthly cap to get warned when you exceed it.
			</p>
		{/if}

		<form
			method="POST"
			action="?/setBudget"
			class="flex flex-wrap items-center gap-2"
			use:enhance={() => {
				error = null;
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'failure') {
						error =
							typeof result.data?.error === 'string' ? result.data.error : 'Something went wrong.';
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
						const form = event.currentTarget.closest('form');
						const amount = form?.elements.namedItem('amount');
						if (amount instanceof HTMLInputElement) amount.value = '';
					}}>Clear</Button
				>
			{/if}
		</form>
		{#if error}
			<p role="alert" class="text-sm text-destructive">{error}</p>
		{/if}
	</CardContent>
</Card>
