<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ColumnMapping, RecurringCandidate, RowError } from '$lib/bank-import';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { toDateInputValue } from '$lib/format';
	import { toast } from '$lib/hooks/toast.svelte';
	import { CURRENCIES, formatMoney, toMajor, minorDigits } from '$lib/money';
	import { BILLING_CYCLE_LABELS } from '$lib/subscriptions';

	let {
		open = $bindable(false),
		categories = []
	}: {
		open?: boolean;
		/** Existing categories, offered as suggestions. */
		categories?: string[];
	} = $props();

	interface Analysis {
		headers: string[];
		preview: string[][];
		mapping: ColumnMapping | null;
		options: { dayFirst: boolean; invertSign: boolean; currency: string };
		candidates: RecurringCandidate[];
		errors: RowError[];
		skippedIncoming: number;
		chargeCount: number;
		needsMapping: boolean;
	}

	/** A detected subscription the user can tick and rename before adding. */
	interface Row {
		candidate: RecurringCandidate;
		selected: boolean;
		name: string;
		category: string;
	}

	const DEFAULT_CATEGORY = 'Other';

	let submitting = $state(false);
	let adding = $state(false);
	let error = $state('');
	let analysis = $state<Analysis | null>(null);
	let rows = $state<Row[]>([]);

	let selectedRows = $derived(rows.filter((row) => row.selected));

	function reset() {
		error = '';
		analysis = null;
		rows = [];
	}

	function isAnalysis(data: unknown): data is Analysis {
		return typeof data === 'object' && data !== null && 'candidates' in data && 'headers' in data;
	}

	function toRows(candidates: RecurringCandidate[]): Row[] {
		return candidates.map((candidate) => ({
			candidate,
			selected: !candidate.alreadyTracked && !candidate.mayHaveEnded,
			name: candidate.name,
			category: DEFAULT_CATEGORY
		}));
	}

	function itemJson(row: Row): string {
		const { candidate } = row;
		return JSON.stringify({
			name: row.name,
			category: row.category,
			price: toMajor(candidate.priceMinor, candidate.currency).toFixed(
				minorDigits(candidate.currency)
			),
			currency: candidate.currency,
			billingCycle: candidate.billingCycle,
			renewalDate: toDateInputValue(candidate.nextRenewal),
			startedOn: toDateInputValue(candidate.firstChargedOn)
		});
	}

	function describe(candidate: RecurringCandidate): string {
		const parts = [
			`${formatMoney(toMajor(candidate.priceMinor, candidate.currency), candidate.currency)} ${BILLING_CYCLE_LABELS[candidate.billingCycle].toLowerCase()}`,
			`${candidate.occurrences} charges`,
			`last ${toDateInputValue(candidate.lastChargedOn)}`
		];
		if (candidate.alreadyTracked) parts.push('already in your list');
		if (candidate.mayHaveEnded) parts.push('may have ended');
		if (candidate.confidence === 'medium') parts.push('less certain');
		return parts.join(' · ');
	}

	const MAPPING_FIELDS = [
		{ name: 'mapDate', label: 'Date', key: 'date' },
		{ name: 'mapDescription', label: 'Description', key: 'description' },
		{ name: 'mapAmount', label: 'Amount', key: 'amount' },
		{ name: 'mapDebit', label: 'Debit (money out)', key: 'debit' },
		{ name: 'mapCredit', label: 'Credit (money in)', key: 'credit' },
		{ name: 'mapCurrency', label: 'Currency', key: 'currency' }
	] as const;
</script>

<Dialog.Root bind:open onOpenChange={(next) => next && reset()}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto">
		<Dialog.Title>Import from a bank statement</Dialog.Title>
		<Dialog.Description>
			Choose a CSV export from your bank. Charges that repeat on a regular schedule are suggested as
			subscriptions. The file is read in memory and is not saved.
		</Dialog.Description>

		<form
			method="POST"
			action="/?/analyzeBank"
			enctype="multipart/form-data"
			class="flex flex-col gap-3"
			use:enhance={() => {
				submitting = true;
				error = '';
				return async ({ result }) => {
					submitting = false;
					if (result.type === 'success' && isAnalysis(result.data)) {
						analysis = result.data;
						rows = toRows(result.data.candidates);
					} else if (result.type === 'failure') {
						error = String(result.data?.error ?? 'The file could not be read.');
					} else {
						error = 'The file could not be read.';
					}
				};
			}}
		>
			<Input
				type="file"
				name="file"
				accept=".csv,text/csv,text/plain"
				aria-label="Bank CSV file"
				required
			/>

			{#if analysis}
				<input type="hidden" name="configured" value="1" />
				<details class="rounded-lg border border-input px-3 py-2" open={analysis.needsMapping}>
					<summary class="cursor-pointer text-sm font-medium">Columns and options</summary>
					<div class="mt-3 grid gap-3 sm:grid-cols-2">
						{#each MAPPING_FIELDS as field (field.name)}
							<label class="flex flex-col gap-1 text-sm">
								{field.label}
								<NativeSelect
									name={field.name}
									value={analysis.mapping?.[field.key] != null
										? String(analysis.mapping[field.key])
										: ''}
								>
									<option value="">Not in file</option>
									{#each analysis.headers as header, index (index)}
										<option value={String(index)}>{header || `Column ${index + 1}`}</option>
									{/each}
								</NativeSelect>
							</label>
						{/each}
						<label class="flex flex-col gap-1 text-sm">
							Currency when the file has none
							<NativeSelect name="currency" value={analysis.options.currency}>
								{#each CURRENCIES as code (code)}
									<option value={code}>{code}</option>
								{/each}
							</NativeSelect>
						</label>
						<div class="flex flex-col gap-2 text-sm">
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									name="dayFirst"
									checked={analysis.options.dayFirst}
									class="size-4 accent-primary"
								/>
								Dates are day first (31/12/2026)
							</label>
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									name="invertSign"
									checked={analysis.options.invertSign}
									class="size-4 accent-primary"
								/>
								Spending is listed as positive numbers
							</label>
						</div>
					</div>
					{#if analysis.preview.length > 0}
						<div class="mt-3 overflow-x-auto">
							<table class="w-full text-xs" aria-label="First rows of the file">
								<thead class="text-left text-muted-foreground">
									<tr>
										{#each analysis.headers as header, index (index)}
											<th class="px-1 py-0.5 font-medium">{header}</th>
										{/each}
									</tr>
								</thead>
								<tbody>
									{#each analysis.preview as previewRow, line (line)}
										<tr class="border-t border-border">
											{#each previewRow as value, index (index)}
												<td class="max-w-40 truncate px-1 py-0.5">{value}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</details>
			{/if}

			{#if error}
				<p role="alert" class="text-sm text-destructive">{error}</p>
			{/if}
			<div class="flex justify-end">
				<Button type="submit" variant={analysis ? 'outline' : 'default'} disabled={submitting}>
					{submitting ? 'Reading…' : analysis ? 'Analyse again' : 'Analyse'}
				</Button>
			</div>
		</form>

		{#if analysis}
			{#if analysis.needsMapping}
				<p class="text-sm text-muted-foreground" role="status">
					Could not tell which columns hold the date, description and amount. Pick them above and
					analyse again.
				</p>
			{:else}
				<p class="text-sm text-muted-foreground" role="status">
					Read {analysis.chargeCount} payments{analysis.skippedIncoming > 0
						? ` (${analysis.skippedIncoming} incoming skipped)`
						: ''}{analysis.errors.length > 0 ? `, ${analysis.errors.length} rows unreadable` : ''}.
				</p>
				{#if analysis.errors.length > 0}
					<ul class="max-h-24 list-disc overflow-auto pl-5 text-xs text-muted-foreground">
						{#each analysis.errors as rowError (rowError.line)}
							<li>Line {rowError.line}: {rowError.message}</li>
						{/each}
					</ul>
				{/if}

				{#if rows.length === 0}
					<p class="text-sm">
						No recurring charges found. A subscription needs at least three payments of about the
						same amount on a regular schedule (two for a yearly one).
					</p>
				{:else}
					<form
						method="POST"
						action="/?/addDetected"
						class="flex flex-col gap-3"
						use:enhance={() => {
							adding = true;
							error = '';
							return async ({ result }) => {
								adding = false;
								if (result.type === 'success' && result.data) {
									const { added, skipped, errors } = result.data as {
										added: number;
										skipped: number;
										errors: { name: string; message: string }[];
									};
									await invalidateAll();
									toast.show(
										`Added ${added}${skipped > 0 ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}${errors.length > 0 ? `, ${errors.length} invalid` : ''}.`
									);
									if (errors.length === 0) open = false;
									else error = errors.map((item) => `${item.name}: ${item.message}`).join(' ');
								} else if (result.type === 'failure') {
									error = String(result.data?.error ?? 'Nothing was added.');
								} else {
									error = 'Nothing was added.';
								}
							};
						}}
					>
						<ul aria-label="Detected subscriptions" class="flex flex-col divide-y divide-border">
							{#each rows as row, index (index)}
								<li class="flex flex-col gap-1.5 py-2 first:pt-0">
									<label class="flex items-start gap-2 text-sm">
										<input
											type="checkbox"
											bind:checked={row.selected}
											class="mt-1 size-4 accent-primary"
											aria-label="Add {row.name}"
										/>
										<span class="flex-1">
											<span class="font-medium">{row.candidate.name}</span>
											<span class="block text-xs text-muted-foreground tabular-nums">
												{describe(row.candidate)}
											</span>
										</span>
									</label>
									{#if row.selected}
										<div class="ml-6 grid gap-2 sm:grid-cols-2">
											<Input bind:value={row.name} aria-label="Name of {row.candidate.name}" />
											<Input
												bind:value={row.category}
												list="bank-category-suggestions"
												aria-label="Category of {row.candidate.name}"
											/>
										</div>
										<input type="hidden" name="item" value={itemJson(row)} />
									{/if}
								</li>
							{/each}
						</ul>
						<datalist id="bank-category-suggestions">
							{#each categories as category (category)}
								<option value={category}></option>
							{/each}
						</datalist>
						<div class="flex justify-end gap-2">
							<Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
							<Button type="submit" disabled={adding || selectedRows.length === 0}>
								{adding
									? 'Adding…'
									: `Add ${selectedRows.length} subscription${selectedRows.length === 1 ? '' : 's'}`}
							</Button>
						</div>
					</form>
				{/if}
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
