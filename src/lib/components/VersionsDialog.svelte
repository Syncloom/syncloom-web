<script lang="ts">
	import { onMount } from 'svelte';
	import { versionsOf, restoreVersion, saveToDisk, type FsNode, type FileVersion } from '$lib/fs';
	import { formatBytes, formatDateTime } from '$lib/format';
	import { confirmDialog } from '$lib/dialogs.svelte';
	import { notify, fail } from '$lib/toast.svelte';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';

	let { node, onclose, onchanged }: { node: FsNode; onclose: () => void; onchanged: () => void } = $props();
	let versions = $state<FileVersion[] | null>(null);

	const load = () => versionsOf(node).then((v) => (versions = v), fail);
	onMount(() => void load());

	async function restore(v: FileVersion) {
		if (!(await confirmDialog('Restore this version?', { body: `“${node.name}” will go back to the version from ${formatDateTime(v.createdAt)}. The current content stays in the history.`, confirm: 'Restore' }))) return;
		try {
			await restoreVersion(node, v.id);
			notify('Version restored', 'ok');
			onchanged();
			await load();
		} catch (e) {
			fail(e);
		}
	}
</script>

<Dialog title="Version history" {onclose} width={540}>
	<p class="muted">Older versions of <b>{node.name}</b> are kept for the retention period your administrator configured.</p>
	{#if !versions}
		<div class="center"><div class="spinner"></div></div>
	{:else}
		<ol>
			{#each versions as v, i (v.id)}
				<li>
					<span class="dot" class:head={i === 0}></span>
					<div class="grow">
						<b>{formatDateTime(v.createdAt)}</b>
						<span class="hint">{formatBytes(v.size)}{v.device ? ` · ${v.device}` : ''}</span>
					</div>
					{#if i === 0}<span class="badge ok">Current</span>{/if}
					<button class="btn ghost icon sm" title="Download" aria-label="Download this version" onclick={() => saveToDisk(node, v.id).catch(fail)}><Icon name="download" size={16} /></button>
					{#if i > 0}<button class="btn sm" onclick={() => restore(v)}><Icon name="restore" size={14} /> Restore</button>{/if}
				</li>
			{/each}
		</ol>
	{/if}
	{#snippet footer()}<button class="btn" onclick={onclose}>Close</button>{/snippet}
</Dialog>

<style>
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
		position: relative;
	}
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 6px;
		border-radius: 12px;
	}
	li:hover {
		background: var(--surface-2);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--border);
		border: 2px solid var(--surface);
		box-shadow: 0 0 0 1.5px var(--border);
	}
	.dot.head {
		background: var(--accent);
		box-shadow: 0 0 0 1.5px var(--accent);
	}
	.grow {
		flex: 1;
		display: grid;
	}
	.center {
		display: grid;
		place-items: center;
		padding: 30px;
	}
</style>
