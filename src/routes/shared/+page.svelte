<script lang="ts">
	import { goto } from '$app/navigation';
	import { sharedWithMe, type FsNode } from '$lib/fs';
	import { live } from '$lib/live.svelte';
	import { formatDate } from '$lib/format';
	import { fail } from '$lib/toast.svelte';
	import FileIcon from '$lib/components/FileIcon.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let items = $state<FsNode[] | null>(null);
	async function load() {
		try {
			items = await sharedWithMe();
		} catch (e) {
			fail(e);
			items ??= [];
		}
	}
	$effect(() => {
		live.tick;
		void load();
	});
</script>

<svelte:head><title>Shared with me · Syncloom</title></svelte:head>
<header class="head"><h1>Shared with me</h1><p class="muted">Files and folders other people gave you access to. They stay encrypted end to end.</p></header>

{#if !items}
	<div class="state"><div class="spinner"></div></div>
{:else if !items.length}
	<div class="state"><div class="art"><Icon name="users" size={40} stroke={1.4} /></div><h2>Nothing shared with you yet</h2><p class="muted">When someone shares a folder with you it shows up here.</p></div>
{:else}
	<div class="grid">
		{#each items as n (n.id)}
			<button class="card item" onclick={() => (n.kind === 'folder' ? goto(`/f/${n.id}`) : n.kind === 'kv' ? goto(`/kv/${n.id}`) : goto(`/f/${n.id}`))}>
				<FileIcon name={n.name} kind={n.kind} size={52} />
				<div class="txt">
					<b>{n.name}</b>
					<span class="muted">{n.kind === 'folder' ? 'Folder' : n.kind === 'kv' ? 'Key/value' : 'File'} · updated {formatDate(n.updatedAt)}</span>
				</div>
				<span class="badge {n.access === 'rw' ? 'warn' : 'neutral'}">{n.access === 'rw' ? 'Can edit' : 'Can view'}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	.head {
		display: grid;
		gap: 6px;
		margin-bottom: 22px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
	.txt {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.txt span {
		font-size: 12.5px;
	}
	.state {
		display: grid;
		justify-items: center;
		gap: 12px;
		padding: 80px 20px;
		text-align: center;
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
