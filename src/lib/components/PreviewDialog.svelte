<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { downloadBlob, saveToDisk, type FsNode } from '$lib/fs';
	import { formatBytes, formatDateTime, isImage, isTextLike, mimeFor } from '$lib/format';
	import { fail } from '$lib/toast.svelte';
	import Dialog from './Dialog.svelte';
	import FileIcon from './FileIcon.svelte';
	import Icon from './Icon.svelte';

	let { node, onclose, onversions }: { node: FsNode; onclose: () => void; onversions: () => void } = $props();
	let url = $state('');
	let text = $state('');
	let progress = $state(0);
	let error = $state('');
	const canPreview = $derived((isImage(node.name) || isTextLike(node.name) || /\.pdf$/i.test(node.name)) && node.size <= 25 * 1024 * 1024);

	onMount(async () => {
		if (!canPreview || !node.headVersion) return;
		try {
			const blob = await downloadBlob(node, undefined, (p) => (progress = p.total ? p.done / p.total : 1), mimeFor(node.name));
			if (isTextLike(node.name)) text = (await blob.text()).slice(0, 200_000);
			else url = URL.createObjectURL(blob);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	});
	onDestroy(() => url && URL.revokeObjectURL(url));
</script>

<Dialog title={node.name} {onclose} width={820}>
	<div class="stage">
		{#if url && isImage(node.name)}
			<img src={url} alt={node.name} />
		{:else if url}
			<iframe src={url} title={node.name}></iframe>
		{:else if text}
			<pre>{text}</pre>
		{:else if error}
			<div class="info"><Icon name="warning" size={30} /><p class="error">{error}</p></div>
		{:else if canPreview && node.headVersion}
			<div class="info"><div class="spinner"></div><p class="muted">Decrypting… {Math.round(progress * 100)}%</p></div>
		{:else}
			<div class="info"><FileIcon name={node.name} kind="file" size={72} /><p class="muted">No preview for this file type.</p></div>
		{/if}
	</div>
	<div class="meta">
		<span><b>{formatBytes(node.size)}</b> · modified {formatDateTime(node.mtime || node.updatedAt)}</span>
		<span class="badge neutral"><Icon name="lock" size={12} /> End-to-end encrypted</span>
	</div>
	{#snippet footer()}
		<button class="btn" onclick={onversions}><Icon name="history" size={16} /> Versions</button>
		<button class="btn primary" onclick={() => saveToDisk(node).catch(fail)}><Icon name="download" size={16} /> Download</button>
	{/snippet}
</Dialog>

<style>
	.stage {
		min-height: 260px;
		max-height: 58vh;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		border-radius: 16px;
		overflow: auto;
	}
	img {
		max-width: 100%;
		max-height: 58vh;
		object-fit: contain;
	}
	iframe {
		width: 100%;
		height: 58vh;
		border: 0;
		background: #fff;
	}
	pre {
		margin: 0;
		padding: 16px;
		align-self: start;
		width: 100%;
		white-space: pre-wrap;
		word-break: break-word;
		font: 12.5px/1.6 ui-monospace, 'SF Mono', Menlo, monospace;
	}
	.info {
		display: grid;
		place-items: center;
		gap: 12px;
		padding: 40px;
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		color: var(--muted);
	}
</style>
