<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { listFolder, pathTo, type FsNode } from '$lib/fs';
	import { fail } from '$lib/toast.svelte';
	import Dialog from './Dialog.svelte';
	import FileIcon from './FileIcon.svelte';
	import Icon from './Icon.svelte';

	let { moving, start, onpick, onclose }: { moving: FsNode[]; start: string | null; onpick: (target: string | null) => void; onclose: () => void } = $props();
	let at = $state<string | null>(untrack(() => start));
	let folders = $state<FsNode[]>([]);
	let crumbs = $state<FsNode[]>([]);
	const blocked = $derived(new Set(moving.map((m) => m.id)));
	const disabled = $derived(crumbs.some((c) => blocked.has(c.id)) || (moving.length === 1 && moving[0].parentId === at));

	async function load() {
		try {
			[folders, crumbs] = await Promise.all([listFolder(at).then((l) => l.filter((n) => n.kind === 'folder')), pathTo(at)]);
		} catch (e) {
			fail(e);
		}
	}
	onMount(load);
	$effect(() => {
		at;
		void load();
	});
</script>

<Dialog title={moving.length === 1 ? `Move “${moving[0].name}”` : `Move ${moving.length} items`} {onclose} width={460}>
	<div class="crumbs">
		<button class="c" onclick={() => (at = null)}><Icon name="cloud" size={15} /> My files</button>
		{#each crumbs as c}<Icon name="chevron" size={14} /><button class="c" onclick={() => (at = c.id)}>{c.name}</button>{/each}
	</div>
	<ul>
		{#each folders as f (f.id)}
			<li>
				<button disabled={blocked.has(f.id)} onclick={() => (at = f.id)}><FileIcon name={f.name} kind="folder" size={30} /><span>{f.name}</span><Icon name="chevron" size={15} /></button>
			</li>
		{:else}
			<li class="empty muted">No folders here.</li>
		{/each}
	</ul>
	{#snippet footer()}
		<button class="btn" onclick={onclose}>Cancel</button>
		<button class="btn primary" {disabled} onclick={() => onpick(at)}>Move here</button>
	{/snippet}
</Dialog>

<style>
	.crumbs {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px;
		color: var(--muted);
	}
	.c {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: 0;
		padding: 4px 6px;
		border-radius: 8px;
		font-weight: 600;
		color: inherit;
	}
	.c:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		min-height: 160px;
		max-height: 300px;
		overflow: auto;
		display: grid;
		align-content: start;
		gap: 2px;
	}
	li button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px;
		border: 0;
		background: none;
		border-radius: 12px;
		text-align: left;
	}
	li button span {
		flex: 1;
		font-weight: 560;
	}
	li button:hover:not(:disabled) {
		background: var(--surface-2);
	}
	li button:disabled {
		opacity: 0.4;
	}
	.empty {
		padding: 30px;
		text-align: center;
	}
</style>
