<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from '$lib/hooks/toast.svelte';
	import type { ImportRowError } from '$lib/csv-import';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let submitting = $state(false);
	let error = $state('');
	let rowErrors = $state<ImportRowError[]>([]);

	function reset() {
		error = '';
		rowErrors = [];
	}

	function isImportResult(
		data: unknown
	): data is { imported: number; skipped: number; errors: ImportRowError[]; error?: undefined } {
		return typeof data === 'object' && data !== null && 'imported' in data;
	}
</script>

<Dialog.Root bind:open onOpenChange={(next) => next && reset()}>
	<Dialog.Content>
		<Dialog.Title>Import from CSV</Dialog.Title>
		<Dialog.Description>
			Use a file from "Download CSV", or any CSV with the columns name, price, category and
			renewalDate (optional: currency, billingCycle, status and the other exported columns).
			Subscriptions you already have are skipped.
		</Dialog.Description>
		<form
			method="POST"
			action="/?/importCsv"
			enctype="multipart/form-data"
			class="flex flex-col gap-3"
			use:enhance={() => {
				submitting = true;
				reset();
				return async ({ result }) => {
					submitting = false;
					if (result.type === 'success' && isImportResult(result.data)) {
						const { imported, skipped, errors } = result.data;
						rowErrors = errors;
						await invalidateAll();
						toast.show(
							`Imported ${imported}, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}${errors.length > 0 ? `, ${errors.length} invalid` : ''}.`
						);
						if (errors.length === 0) open = false;
					} else if (result.type === 'failure') {
						error = String(result.data?.error ?? 'The import failed.');
					} else {
						error = 'The import failed.';
					}
				};
			}}
		>
			<Input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" required />
			{#if error}
				<p role="alert" class="text-sm text-destructive">{error}</p>
			{/if}
			{#if rowErrors.length > 0}
				<div class="text-sm">
					<p class="font-medium">These rows were not imported:</p>
					<ul class="mt-1 max-h-40 list-disc overflow-auto pl-5 text-muted-foreground">
						{#each rowErrors as rowError (rowError.line)}
							<li>Line {rowError.line}: {rowError.message}</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div class="flex justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Close</Button>
				<Button type="submit" disabled={submitting}>{submitting ? 'Importing…' : 'Import'}</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
