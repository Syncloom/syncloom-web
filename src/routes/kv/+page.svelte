<script lang="ts">
	import { goto } from '$app/navigation';
	import { listFolder, createNamespace, type FsNode } from '$lib/fs';
	import { live } from '$lib/live.svelte';
	import { promptDialog } from '$lib/dialogs.svelte';
	import { fail } from '$lib/toast.svelte';
	import FileIcon from '$lib/components/FileIcon.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let items = $state<FsNode[] | null>(null);
	async function load() {
		try {
			items = (await listFolder(null)).filter((n) => n.kind === 'kv');
		} catch (e) {
			fail(e);
			items ??= [];
		}
	}
	$effect(() => {
		live.tick;
		void load();
	});
	async function create() {
		const name = await promptDialog('New namespace', { confirm: 'Create', body: 'A namespace groups related keys. You can share it like a folder.' });
		if (!name) return;
		try {
			const n = await createNamespace(null, name.trim());
			await goto(`/kv/${n.id}`);
		} catch (e) {
			fail(e);
		}
	}
</script>

<svelte:head><title>Key/value · Syncloom</title></svelte:head>
<header class="head">
	<div><h1>Key/value</h1><p class="muted">Small encrypted values with version checks, for settings, state and app data.</p></div>
	<button class="btn primary" onclick={create}><Icon name="plus" size={16} /> New namespace</button>
</header>

{#if !items}
	<div class="state"><div class="spinner"></div></div>
{:else if !items.length}
	<div class="state"><div class="art"><Icon name="db" size={40} stroke={1.4} /></div><h2>No namespaces yet</h2><p class="muted">Create one to start storing keys.</p></div>
{:else}
	<div class="grid">
		{#each items as n (n.id)}
			<button class="card item" onclick={() => goto(`/kv/${n.id}`)}><FileIcon name={n.name} kind="kv" size={46} /><b>{n.name}</b></button>
		{/each}
	</div>
{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 22px;
	}
	.head p {
		margin-top: 6px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 14px;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		text-align: left;
		transition: transform 0.15s var(--ease), box-shadow 0.15s;
	}
	.item:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}
	.state {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 80px 20px;
	}
	.art {
		width: 92px;
		height: 92px;
		display: grid;
		place-items: center;
		border-radius: 28px;
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>
