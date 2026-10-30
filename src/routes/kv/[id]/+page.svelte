<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getNode, kvList, kvPut, kvDelete, type FsNode, type KvEntry } from '$lib/fs';
	import { ApiError } from '$lib/api';
	import { live } from '$lib/live.svelte';
	import { confirmDialog } from '$lib/dialogs.svelte';
	import { notify, fail } from '$lib/toast.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import Icon from '$lib/components/Icon.svelte';

	const id = $derived(page.params.id!);
	let ns = $state<FsNode | null>(null);
	let entries = $state<KvEntry[] | null>(null);
	let prefix = $state('');
	let edit = $state<{ key: string; value: string; version: number | null; isNew: boolean } | null>(null);
	let conflict = $state('');
	let sharing = $state(false);
	const td = new TextDecoder('utf-8', { fatal: true });
	const te = new TextEncoder();
	const show = (v: Uint8Array) => {
		try {
			return td.decode(v);
		} catch {
			return `0x${[...v].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
		}
	};

	async function load() {
		try {
			ns = await getNode(id);
			entries = await kvList(id, prefix);
		} catch (e) {
			fail(e);
			entries ??= [];
		}
	}
	$effect(() => {
		id;
		prefix;
		live.tick;
		void load();
	});

	async function save() {
		if (!edit) return;
		conflict = '';
		const cur = edit;
		try {
			await kvPut(id, edit.key, te.encode(edit.value), edit.isNew ? 0 : (edit.version ?? undefined));
			edit = null;
			await load();
		} catch (e) {
			if (e instanceof ApiError && e.status === 409) conflict = cur.isNew ? 'A key with this name already exists.' : 'This value was changed somewhere else in the meantime. Close the editor and reopen it to see the latest value.';
			else fail(e);
		}
	}
	async function del(e: KvEntry) {
		if (!(await confirmDialog(`Delete “${e.key}”?`, { confirm: 'Delete', danger: true }))) return;
		try {
			await kvDelete(id, e.key, e.version);
			await load();
		} catch (err) {
			if (err instanceof ApiError && err.status === 409) notify('The value changed elsewhere; refreshed.', 'error');
			else fail(err);
			await load();
		}
	}
</script>

<svelte:head><title>{ns?.name ?? 'Key/value'} · Syncloom</title></svelte:head>
<header class="head">
	<div>
		<button class="back" onclick={() => goto('/kv')}><Icon name="chevron" size={14} /> Key/value</button>
		<h1>{ns?.name ?? '…'}</h1>
	</div>
	<div class="acts">
		<div class="search"><Icon name="search" size={15} /><input placeholder="Key prefix" bind:value={prefix} aria-label="Key prefix" /></div>
		{#if ns?.access === 'owner'}<button class="btn" onclick={() => (sharing = true)}><Icon name="share" size={16} /> Share</button>{/if}
		{#if ns?.access !== 'ro'}<button class="btn primary" onclick={() => ((conflict = ''), (edit = { key: '', value: '', version: null, isNew: true }))}><Icon name="plus" size={16} /> Add key</button>{/if}
	</div>
</header>

{#if !entries}
	<div class="state"><div class="spinner"></div></div>
{:else if !entries.length}
	<div class="state"><h2>No keys{prefix ? ' with this prefix' : ' yet'}</h2><p class="muted">Values are encrypted in your browser before they are stored.</p></div>
{:else}
	<div class="card table">
		<div class="row head"><span>Key</span><span>Value</span><span class="v">Version</span><span></span></div>
		{#each entries as e (e.key)}
			<div class="row">
				<code class="k">{e.key}</code>
				<span class="val mono">{show(e.value)}</span>
				<span class="v muted">v{e.version}</span>
				<span class="a">
					{#if ns?.access !== 'ro'}
						<button class="btn ghost icon sm" aria-label="Edit {e.key}" onclick={() => ((conflict = ''), (edit = { key: e.key, value: show(e.value), version: e.version, isNew: false }))}><Icon name="edit" size={15} /></button>
						<button class="btn ghost icon sm" aria-label="Delete {e.key}" onclick={() => del(e)}><Icon name="trash" size={15} /></button>
					{/if}
				</span>
			</div>
		{/each}
	</div>
{/if}

{#if edit}
	<Dialog title={edit.isNew ? 'Add key' : 'Edit value'} onclose={() => (edit = null)} width={520}>
		<form id="kv" onsubmit={(e) => (e.preventDefault(), save())} class="form">
			<div class="field"><label for="kk">Key</label><input id="kk" class="input" bind:value={edit.key} disabled={!edit.isNew} spellcheck="false" required /></div>
			<div class="field"><label for="kvv">Value</label><textarea id="kvv" class="input mono" rows="6" bind:value={edit.value}></textarea><span class="hint">Up to 256 KB. {edit.isNew ? '' : `Saving only succeeds if nobody changed it since version ${edit.version}.`}</span></div>
			{#if conflict}<p class="error" role="alert">{conflict}</p>{/if}
		</form>
		{#snippet footer()}<button class="btn" onclick={() => (edit = null)}>Cancel</button><button class="btn primary" form="kv" disabled={!edit?.key}>Save</button>{/snippet}
	</Dialog>
{/if}
{#if sharing && ns}<ShareDialog node={ns} onclose={() => (sharing = false)} />{/if}

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 22px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 0;
		padding: 0;
		color: var(--muted);
		font-weight: 600;
		margin-bottom: 4px;
	}
	.back :global(svg) {
		transform: rotate(180deg);
	}
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface);
		color: var(--muted);
	}
	.search input {
		border: 0;
		background: none;
		outline: none;
		padding: 9px 0;
		width: 120px;
		color: var(--text);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(120px, 0.6fr) 1.4fr 70px 80px;
		gap: 14px;
		align-items: center;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
	}
	.row:last-child {
		border: 0;
	}
	.row.head {
		background: var(--surface-2);
		color: var(--muted);
		font-size: 12px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.k {
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: 600;
	}
	.val {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
	}
	.a {
		display: flex;
		justify-content: flex-end;
	}
	.state {
		display: grid;
		justify-items: center;
		gap: 10px;
		padding: 70px 20px;
	}
	.form {
		display: grid;
		gap: 14px;
	}
	@media (max-width: 640px) {
		.row {
			grid-template-columns: 1fr auto;
		}
		.val,
		.v {
			display: none;
		}
	}
</style>
