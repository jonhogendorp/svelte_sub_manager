<script lang="ts">
	import type { PageProps } from './$types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { formatMoney } from '$lib/money';

	let { data }: PageProps = $props();

	let report = $derived(data.report);

	function changeYear(year: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only the query changes
		goto(`?year=${encodeURIComponent(year)}`, { keepFocus: true });
	}
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-5 p-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold tracking-tight">Tax report {report.year}</h1>
		<div class="flex flex-wrap items-center gap-2 print:hidden">
			<NativeSelect
				aria-label="Year"
				value={String(report.year)}
				onchange={(event) => changeYear(event.currentTarget.value)}
			>
				{#each data.years as year (year)}
					<option value={String(year)}>{year}</option>
				{/each}
			</NativeSelect>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href="{resolve('/tax/export.csv')}?year={report.year}"
				class="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
				data-sveltekit-reload>Download CSV</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<Button onclick={() => window.print()}>Print / Save as PDF</Button>
		</div>
	</div>

	{#if report.rows.length === 0}
		<Card>
			<CardContent class="py-8 text-center text-sm text-muted-foreground">
				No business expenses for {report.year}. Set "Business use (%)" under "More details" when
				editing a subscription or bill and they will show up here.
			</CardContent>
		</Card>
	{:else}
		<dl class="grid grid-cols-2 gap-3">
			<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
				<dt class="text-xs text-muted-foreground">Spent on these items</dt>
				<dd class="text-xl font-semibold tabular-nums">
					{formatMoney(report.totalSpent, data.displayCurrency)}
				</dd>
			</div>
			<div class="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
				<dt class="text-xs text-muted-foreground">Business expenses</dt>
				<dd class="text-xl font-semibold tabular-nums">
					{formatMoney(report.totalDeductible, data.displayCurrency)}
				</dd>
			</div>
		</dl>

		{#each report.categories as category (category.category)}
			<Card>
				<CardHeader>
					<CardTitle class="flex flex-wrap items-baseline justify-between gap-2">
						<span>{category.category}</span>
						<span class="text-sm font-normal text-muted-foreground tabular-nums">
							{formatMoney(category.deductible, data.displayCurrency)} of
							{formatMoney(category.spent, data.displayCurrency)}
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<table class="w-full text-sm" aria-label="{category.category} expenses">
						<thead class="text-left text-xs text-muted-foreground">
							<tr>
								<th class="py-1 font-medium">Item</th>
								<th class="py-1 text-right font-medium">Business</th>
								<th class="py-1 text-right font-medium">Spent</th>
								<th class="py-1 text-right font-medium">Claimable</th>
							</tr>
						</thead>
						<tbody>
							{#each report.rows.filter((row) => row.category === category.category) as row (row.kind + row.name)}
								<tr class="border-t border-border">
									<td class="py-1.5">
										{row.name}
										<span class="text-xs text-muted-foreground">
											({row.kind === 'bill' ? 'bill' : 'subscription'}{row.estimated
												? ', estimated'
												: ''})
										</span>
									</td>
									<td class="py-1.5 text-right tabular-nums">{row.businessPercent}%</td>
									<td class="py-1.5 text-right tabular-nums">
										{formatMoney(row.spent, data.displayCurrency)}
									</td>
									<td class="py-1.5 text-right tabular-nums">
										{formatMoney(row.deductible, data.displayCurrency)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</CardContent>
			</Card>
		{/each}

		{#if report.hasEstimates}
			<p class="text-xs text-muted-foreground">
				Subscription amounts are estimates: your share of the current price over the days the
				subscription was running. Bill amounts are the payments you logged.
			</p>
		{/if}
		{#if report.excluded > 0}
			<p class="text-xs text-muted-foreground">
				{report.excluded}
				{report.excluded === 1 ? 'item is' : 'items are'} not included: no exchange rate is available
				to convert {report.excluded === 1 ? 'it' : 'them'} to {data.displayCurrency} right now.
			</p>
		{/if}
		<p class="text-xs text-muted-foreground">
			This is a summary of your own records, not tax advice. Check the figures with your accountant.
		</p>
	{/if}
</div>
