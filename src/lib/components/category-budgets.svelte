<script lang="ts">
	import { enhance } from '$app/forms';
	import type { CategoryBudget, Subscription } from '../../../generated/prisma/client';
	import { categoryBudgetRows } from '$lib/category-budget';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { CURRENCIES, formatMoney, type MoneyContext } from '$lib/money';
	import { cn } from '$lib/utils';

	let {
		subscriptions,
		budgets,
		categories,
		money,
		onSaved
	}: {
		subscriptions: Subscription[];
		budgets: CategoryBudget[];
		/** Categories offered when adding a cap. */
		categories: string[];
		money: MoneyContext;
		onSaved?: (kind: 'saved' | 'removed') => void;
	} = $props();

	let error = $state<string | null>(null);
	let adding = $state(false);

	let rows = $derived(categoryBudgetRows(subscriptions, budgets, money));
</script>

{#if rows.length > 0 || categories.length > 0}
	<section
		aria-label="Category budgets"
		class="flex flex-col gap-3 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10"
	>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="font-semibold">Category budgets</h2>
			{#if !adding}
				<Button
					variant="outline"
					size="sm"
					disabled={categories.length === 0}
					onclick={() => (adding = true)}
				>
					{rows.length > 0 ? 'Add or change a cap' : 'Set a category budget'}
				</Button>
			{/if}
		</div>

		{#if rows.length === 0 && !adding}
			<p class="text-muted-foreground">
				Cap what you spend per month on a single category, like streaming.
			</p>
		{/if}

		{#if rows.length > 0}
			<ul aria-label="Category budget progress" class="flex flex-col gap-3">
				{#each rows as { budget, spend, status } (budget.id)}
					<li class="flex flex-col gap-1">
						<div class="flex flex-wrap items-baseline justify-between gap-x-3">
							<span class="font-medium">{budget.category}</span>
							<span class="tabular-nums">
								{formatMoney(spend, money.display)}
								{#if status.state !== 'none'}
									of {formatMoney(status.limit, money.display)}
								{/if}
							</span>
						</div>
						{#if status.state !== 'none'}
							<div
								class="h-2 overflow-hidden rounded-full bg-muted"
								role="progressbar"
								aria-label="{budget.category} budget used"
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={Math.round(Math.min(100, status.percent))}
							>
								<div
									class={cn(
										'h-full rounded-full transition-all motion-reduce:transition-none',
										status.state === 'over' && 'bg-destructive',
										status.state === 'near' && 'bg-amber-500',
										status.state === 'ok' && 'bg-primary'
									)}
									style:width="{Math.min(100, status.percent)}%"
								></div>
							</div>
						{/if}
						<div class="flex flex-wrap items-center justify-between gap-2 text-xs">
							{#if status.state === 'over'}
								<span class="font-medium text-destructive">
									{budget.category} is over budget by {formatMoney(
										-status.remaining,
										money.display
									)}.
								</span>
							{:else if status.state === 'near'}
								<span class="text-amber-700 dark:text-amber-400">
									{formatMoney(status.remaining, money.display)} left.
								</span>
							{:else if status.state === 'ok'}
								<span class="text-muted-foreground">
									{formatMoney(status.remaining, money.display)} left.
								</span>
							{:else}
								<span class="text-muted-foreground">
									No exchange rate is available to compare this {budget.currency} cap right now.
								</span>
							{/if}
							<form
								method="POST"
								action="?/clearCategoryBudget"
								use:enhance={() => {
									return async ({ result, update }) => {
										await update();
										if (result.type === 'success') onSaved?.('removed');
									};
								}}
							>
								<input type="hidden" name="id" value={budget.id} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									aria-label="Remove {budget.category} budget">Remove</Button
								>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if adding}
			<form
				method="POST"
				action="?/setCategoryBudget"
				class="flex flex-wrap items-center gap-2"
				use:enhance={() => {
					error = null;
					return async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'failure') {
							error =
								typeof result.data?.error === 'string'
									? result.data.error
									: 'Something went wrong.';
						} else if (result.type === 'success') {
							adding = false;
							onSaved?.('saved');
						}
					};
				}}
			>
				<NativeSelect name="category" aria-label="Category" class="min-w-32">
					{#each categories as category (category)}
						<option value={category}>{category}</option>
					{/each}
				</NativeSelect>
				<Input
					name="amount"
					type="text"
					inputmode="decimal"
					placeholder="Monthly cap"
					aria-label="Monthly cap amount"
					class="min-w-28 flex-1"
				/>
				<NativeSelect name="currency" aria-label="Cap currency" value={money.display}>
					{#each CURRENCIES as code (code)}
						<option value={code}>{code}</option>
					{/each}
				</NativeSelect>
				<Button type="submit" size="sm">Save</Button>
				<Button type="button" size="sm" variant="ghost" onclick={() => (adding = false)}>
					Cancel
				</Button>
			</form>
			{#if error}
				<p role="alert" class="text-destructive">{error}</p>
			{/if}
		{/if}
	</section>
{/if}
