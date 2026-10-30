<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	type Props = { title: string; onclose: () => void; children: Snippet; footer?: Snippet; width?: number; closable?: boolean };
	let { title, onclose, children, footer, width = 480, closable = true }: Props = $props();
	let panel: HTMLDivElement;

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape' && closable) onclose();
		if (e.key === 'Tab') {
			const f = panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
			const list = [...f].filter((x) => !x.hasAttribute('disabled'));
			if (!list.length) return;
			const first = list[0];
			const last = list[list.length - 1];
			if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
			else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
		}
	}

	$effect(() => {
		const prev = document.activeElement as HTMLElement | null;
		(panel.querySelector<HTMLElement>('[autofocus], input, textarea, select') ?? panel).focus();
		return () => prev?.focus?.();
	});
</script>

<svelte:window onkeydown={key} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && closable && onclose()}>
	<div class="panel" bind:this={panel} role="dialog" aria-modal="true" aria-label={title} tabindex="-1" style="max-width:{width}px">
		<header>
			<h2>{title}</h2>
			{#if closable}<button class="btn ghost icon sm" onclick={onclose} aria-label="Close"><Icon name="x" /></button>{/if}
		</header>
		<div class="body">{@render children()}</div>
		{#if footer}<footer>{@render footer()}</footer>{/if}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgb(10 10 30 / 42%);
		backdrop-filter: blur(6px) saturate(120%);
		animation: fade 0.15s var(--ease);
	}
	.panel {
		width: 100%;
		max-height: min(86vh, 900px);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 20px;
		box-shadow: var(--shadow-lg);
		animation: pop 0.22s var(--ease);
		outline: none;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px 6px;
	}
	.body {
		padding: 10px 20px 18px;
		overflow: auto;
		display: grid;
		gap: 14px;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		padding: 14px 20px;
		border-top: 1px solid var(--border);
	}
</style>
