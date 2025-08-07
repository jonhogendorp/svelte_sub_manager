<script lang="ts">
	import client from '$lib/apolloClient';
	import { gql } from '@apollo/client/core';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	// GraphQL queries & mutations
	const GET_SUBSCRIPTIONS = gql`
		query GetSubscriptions {
			subscriptions {
				id
				name
				price
				category
				renewalDate
			}
		}
	`;

	const ADD_SUBSCRIPTION = gql`
		mutation AddSubscription(
			$name: String!
			$price: Float!
			$category: String!
			$renewalDate: String!
		) {
			addSubscription(name: $name, price: $price, category: $category, renewalDate: $renewalDate) {
				id
				name
				price
				category
				renewalDate
			}
		}
	`;

	const EDIT_SUBSCRIPTION = gql`
		mutation EditSubscription(
			$id: ID!
			$name: String
			$price: Float
			$category: String
			$renewalDate: String
		) {
			editSubscription(
				id: $id
				name: $name
				price: $price
				category: $category
				renewalDate: $renewalDate
			) {
				id
				name
				price
				category
				renewalDate
			}
		}
	`;

	const DELETE_SUBSCRIPTION = gql`
		mutation DeleteSubscription($id: ID!) {
			deleteSubscription(id: $id)
		}
	`;

	// State
	const subscriptions = writable<Array<any>>([]);
	const loading = writable(false);
	const error = writable<string | null>(null);

	// Form state
	let form = {
		name: '',
		price: '',
		category: '',
		renewalDate: ''
	};
	let editId: string | null = null;

	// Fetch subscriptions
	async function fetchSubscriptions() {
		loading.set(true);
		try {
			const { data } = await client.query({
				query: GET_SUBSCRIPTIONS,
				fetchPolicy: 'network-only'
			});
			subscriptions.set(data.subscriptions);
			error.set(null);
		} catch (e) {
			error.set((e as Error).message);
		} finally {
			loading.set(false);
		}
	}

	onMount(fetchSubscriptions);

	// Add subscription
	async function addSubscription() {
		loading.set(true);
		try {
			await client.mutate({
				mutation: ADD_SUBSCRIPTION,
				variables: {
					name: form.name,
					price: parseFloat(form.price),
					category: form.category,
					renewalDate: form.renewalDate
				}
			});
			form = { name: '', price: '', category: '', renewalDate: '' };
			await fetchSubscriptions();
		} catch (e) {
			error.set((e as Error).message);
		} finally {
			loading.set(false);
		}
	}

	// Edit subscription
	async function editSubscription() {
		if (!editId) return;
		loading.set(true);
		try {
			await client.mutate({
				mutation: EDIT_SUBSCRIPTION,
				variables: {
					id: editId,
					name: form.name,
					price: parseFloat(form.price),
					category: form.category,
					renewalDate: form.renewalDate
				}
			});
			editId = null;
			form = { name: '', price: '', category: '', renewalDate: '' };
			await fetchSubscriptions();
		} catch (e) {
			error.set((e as Error).message);
		} finally {
			loading.set(false);
		}
	}

	// Delete subscription
	async function deleteSubscription(id: string) {
		loading.set(true);
		try {
			await client.mutate({
				mutation: DELETE_SUBSCRIPTION,
				variables: { id }
			});
			await fetchSubscriptions();
		} catch (e) {
			error.set((e as Error).message);
		} finally {
			loading.set(false);
		}
	}

	// Start editing
	function startEdit(sub: any) {
		editId = sub.id;
		form = {
			name: sub.name,
			price: String(sub.price),
			category: sub.category,
			renewalDate: sub.renewalDate
		};
	}
</script>

<div class="mx-auto max-w-xl p-4">
	<h2 class="mb-4 text-2xl font-bold">Subscriptions</h2>

	{#if $loading}
		<div>Loading...</div>
	{:else if $error}
		<div class="text-red-500">Error: {$error}</div>
	{:else}
		<ul class="flex flex-col space-y-2">
			{#if $subscriptions.length === 0}
				<li class="text-gray-500">No subscriptions found.</li>
			{/if}
			{#each $subscriptions as sub}
				<li
					class="flex items-center justify-between rounded-md border border-slate-300 px-4 py-3 shadow"
				>
					<div>
						<span class="font-semibold">{sub.name}</span> - ${sub.price} ({sub.category})<br />
						<span class="text-xs text-gray-500">Renewal: {sub.renewalDate}</span>
					</div>
					<div class="flex gap-2">
						<button class="rounded bg-blue-500 px-2 py-1 text-white" on:click={() => startEdit(sub)}
							>Edit</button
						>
						<button
							class="rounded bg-red-500 px-2 py-1 text-white"
							on:click={() => deleteSubscription(sub.id)}>Delete</button
						>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<form class="space-y-2" on:submit|preventDefault={editId ? editSubscription : addSubscription}>
		<input
			class="w-full border px-2 py-1"
			type="text"
			placeholder="Name"
			bind:value={form.name}
			required
		/>
		<input
			class="w-full border px-2 py-1"
			type="number"
			placeholder="Price"
			bind:value={form.price}
			required
		/>
		<input
			class="w-full border px-2 py-1"
			type="text"
			placeholder="Category"
			bind:value={form.category}
			required
		/>
		<input
			class="w-full border px-2 py-1"
			type="date"
			placeholder="Renewal Date"
			bind:value={form.renewalDate}
			required
		/>
		<button class="w-full rounded bg-green-500 py-2 text-white" type="submit"
			>{editId ? 'Update' : 'Add'} Subscription</button
		>
		{#if editId}
			<button
				class="w-full rounded bg-gray-400 py-2 text-white"
				type="button"
				on:click={() => {
					editId = null;
					form = { name: '', price: '', category: '', renewalDate: '' };
				}}>Cancel Edit</button
			>
		{/if}
	</form>
</div>

<style>
	:global(.sveltekit-loading) {
		display: none;
	}
</style>
