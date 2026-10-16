<script lang="ts">
	import type { Subscription } from '../../../generated/prisma/client';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { formatMoney, type MoneyContext } from '$lib/money';
	import { findOverlaps, type OverlapKind } from '$lib/overlap';

	let { subscriptions, money }: { subscriptions: Subscription[]; money: MoneyContext } = $props();

	const STORAGE_KEY = 'overlap-dismissed';

	const HEADINGS: Record<OverlapKind, (label: string) => string> = {
		duplicate: (label) => `${label} appears more than once`,
		group: (label) => `Several ${label.toLowerCase()} services`,
		category: (label) => `Several subscriptions in ${label}`
	};

	// Dismissals are a per-browser convenience; the page works without storage.
	let dismissed = $state<string[]>([]);
	$effect(() => {
		try {
			const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
			if (Array.isArray(stored)) dismissed = stored.filter((id) => typeof id === 'string');
		} catch {
			// Storage unavailable or corrupt: nothing is dismissed.
		}
	});

	function dismiss(id: string) {
		dismissed = [...dismissed, id];
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
		} catch {
			// Dismissal then only lasts for this visit.
		}
	}

	let findings = $derived(
		findOverlaps(subscriptions, money).filter((finding) => !dismissed.includes(finding.id))
	);
</script>

{#if findings.length > 0}
	<Card>
		<CardHeader>
			<CardTitle>Possible overlap</CardTitle>
		</CardHeader>
		<CardContent>
			<ul aria-label="Possible overlap" class="flex flex-col divide-y divide-border">
				{#each findings as finding (finding.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
						<div class="min-w-0 text-sm">
							<p class="font-medium">{HEADINGS[finding.kind](finding.label)}</p>
							<p class="text-xs text-muted-foreground">
								{finding.subscriptions.map((sub) => sub.name).join(' + ')} ·
								{formatMoney(finding.monthly, money.display)}/mo together
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							aria-label="Dismiss: {HEADINGS[finding.kind](finding.label)}"
							onclick={() => dismiss(finding.id)}>Dismiss</Button
						>
					</li>
				{/each}
			</ul>
		</CardContent>
	</Card>
{/if}
