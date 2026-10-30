<script lang="ts">
	import { downloadTextFile } from '$lib/auth';
	import { notify } from '$lib/toast.svelte';
	import Icon from './Icon.svelte';

	let { codes, title = 'Recovery codes' }: { codes: string[]; title?: string } = $props();
	const text = $derived(`Syncloom recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`);
	async function copy() {
		await navigator.clipboard.writeText(codes.join('\n'));
		notify('Codes copied', 'ok');
	}
</script>

<div class="box">
	<h3>{title}</h3>
	<p class="hint">If you lose your devices, each of these signs you in once. Store them like a password.</p>
	<div class="grid mono">
		{#each codes as c}<span>{c}</span>{/each}
	</div>
	<div class="row">
		<button class="btn sm" onclick={copy}><Icon name="copy" size={15} /> Copy</button>
		<button class="btn sm" onclick={() => downloadTextFile('syncloom-recovery-codes.txt', text)}><Icon name="download" size={15} /> Download</button>
	</div>
</div>

<style>
	.box {
		display: grid;
		gap: 10px;
		padding: 16px;
		border-radius: 16px;
		background: var(--surface-2);
		border: 1px dashed var(--border);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px 14px;
		padding: 10px 12px;
		background: var(--surface);
		border-radius: 12px;
		letter-spacing: 0.04em;
	}
	.row {
		display: flex;
		gap: 8px;
	}
</style>
