<script lang="ts">
	import { trashList, restore, purge, type FsNode } from '$lib/fs';
	import { live } from '$lib/live.svelte';
	import { formatBytes, formatDate } from '$lib/format';
	import { confirmDialog } from '$lib/dialogs.svelte';
	import { notify, fail } from '$lib/toast.svelte';
	import { refreshUser } from '$lib/session.svelte';
	import FileIcon from '$lib/components/FileIcon.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let items = $state<FsNode[] | null>(null);
	async function load() {
		try {
			items = await trashList();
		} catch (e) {
			fail(e);
			items ??= [];
		}
	}
	$effect(() => {
		live.tick;
		void load();
	});

	async function doRestore(n: FsNode) {
		try {
			await restore(n.id);
			notify(`Restored “${n.name}”`, 'ok');
			await load();
		} catch (e) {
			fail(e instanceof Error && /parent/.test(e.message) ? new Error('Restore the containing folder first.') : e);
		}
	}
	async function doPurge(n: FsNode) {
		if (!(await confirmDialog(`Delete “${n.name}” forever?`, { body: 'This cannot be undone.', confirm: 'Delete forever', danger: true }))) return;
		try {
			await purge(n.id);
			await load();
			void refreshUser();
		} catch (e) {
			fail(e);
		}
	}
	async function empty() {
		if (!items?.length || !(await confirmDialog('Empty the trash?', { body: `${items.length} item(s) will be deleted forever.`, confirm: 'Empty trash', danger: true }))) return;
		try {
			for (const n of items) await purge(n.id);
			await load();
			void refreshUser();
		} catch (e) {
			fail(e);
		}
	}
</script>

<svelte:head><title>Trash · Syncloom</title></svelte:head>
<header class="head">
	<div><h1>Trash</h1><p class="muted">Deleted items are kept for a while, then removed for good by the server’s retention policy.</p></div>
	<button class="btn danger" onclick={empty} disabled={!items?.length}><Icon name="trash" size={16} /> Empty trash</button>
</header>

{#if !items}
	<div class="state"><div class="spinner"></div></div>
{:else if !items.length}
	<div class="state"><div class="art"><Icon name="trash" size={40} stroke={1.4} /></div><h2>The trash is empty</h2></div>
{:else}
	<div class="card list">
		{#each items as n (n.id)}
			<div class="row">
				<FileIcon name={n.name} kind={n.kind} size={38} />
				<div class="grow"><b>{n.name}</b><span class="muted">{n.kind === 'file' ? formatBytes(n.size) + ' · ' : ''}deleted {formatDate(n.updatedAt)}</span></div>
				<button class="btn sm" onclick={() => doRestore(n)}><Icon name="restore" size={14} /> Restore</button>
				<button class="btn sm danger" onclick={() => doPurge(n)}>Delete forever</button>
			</div>
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
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}
	.row:last-child {
		border: 0;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.grow span {
		font-size: 12.5px;
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
