<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Subscription } from '../../../generated/prisma/client';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	let { sub, onEdit }: { sub: Subscription; onEdit: (sub: Subscription) => void } = $props();

	function toDateInputValue(date: Date | string) {
		return new Date(date).toISOString().slice(0, 10);
	}
</script>

<Card>
	<CardContent class="flex items-center justify-between">
		<div>
			<div class="flex items-center gap-2">
				<span class="font-semibold">{sub.name}</span>
				<span class="text-muted-foreground">€{sub.price}</span>
				<Badge variant="secondary">{sub.category}</Badge>
			</div>
			<p class="text-xs text-muted-foreground">Renewal: {toDateInputValue(sub.renewalDate)}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => onEdit(sub)}>Edit</Button>
			<AlertDialog.Root>
				<AlertDialog.Trigger class={buttonVariants({ variant: 'destructive', size: 'sm' })}>
					Delete
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Delete "{sub.name}"?</AlertDialog.Title>
						<AlertDialog.Description>
							This will permanently remove this subscription. This action cannot be undone.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={sub.id} />
							<AlertDialog.Action type="submit" variant="destructive">Delete</AlertDialog.Action>
						</form>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		</div>
	</CardContent>
</Card>
