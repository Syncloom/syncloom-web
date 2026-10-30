<script lang="ts">
	import { dialogs } from '$lib/dialogs.svelte';
	import Dialog from './Dialog.svelte';

	let value = $state('');
	$effect(() => {
		if (dialogs.current?.kind === 'prompt') value = dialogs.current.value;
	});

	function done(result: boolean | string | null) {
		const d = dialogs.current;
		dialogs.current = null;
		if (d?.kind === 'confirm') d.resolve(result === true);
		else if (d?.kind === 'prompt') d.resolve(typeof result === 'string' ? result : null);
	}
</script>

{#if dialogs.current}
	{@const d = dialogs.current}
	<Dialog title={d.title} width={420} onclose={() => done(d.kind === 'confirm' ? false : null)}>
		{#if d.body}<p class="muted">{d.body}</p>{/if}
		{#if d.kind === 'prompt'}
			<form id="prompt-form" onsubmit={(e) => (e.preventDefault(), done(value))}>
				<input class="input" bind:value autocomplete="off" spellcheck="false" />
			</form>
		{/if}
		{#snippet footer()}
			<button class="btn" onclick={() => done(d.kind === 'confirm' ? false : null)}>Cancel</button>
			{#if d.kind === 'confirm'}
				<button class="btn {d.danger ? 'danger' : 'primary'}" onclick={() => done(true)}>{d.confirm}</button>
			{:else}
				<button class="btn primary" form="prompt-form" disabled={!value.trim()}>{d.confirm}</button>
			{/if}
		{/snippet}
	</Dialog>
{/if}
