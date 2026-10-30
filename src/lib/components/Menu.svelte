<script lang="ts">
	import type { Snippet } from 'svelte';
	// A small popup menu anchored to a point (context menu) or opened from a trigger button.
	type Item = { label: string; icon?: string; danger?: boolean; disabled?: boolean; action: () => void } | 'sep';
	type Props = { items: Item[]; x: number; y: number; onclose: () => void; header?: Snippet };
	let { items, x, y, onclose }: Props = $props();
	let el: HTMLDivElement;
	let pos = $state({ left: 0, top: 0 });

	$effect(() => {
		const r = el.getBoundingClientRect();
		pos = { left: Math.max(8, Math.min(x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, innerHeight - r.height - 8)) };
		el.querySelector<HTMLElement>('button')?.focus();
	});

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
		const btns = [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
		const i = btns.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'ArrowDown') (e.preventDefault(), btns[(i + 1) % btns.length]?.focus());
		if (e.key === 'ArrowUp') (e.preventDefault(), btns[(i - 1 + btns.length) % btns.length]?.focus());
	}
	import Icon from './Icon.svelte';
</script>

<svelte:window onkeydown={key} onresize={onclose} />
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose} oncontextmenu={(e) => (e.preventDefault(), onclose())}></div>
<div class="menu" role="menu" bind:this={el} style="left:{pos.left}px;top:{pos.top}px">
	{#each items as it}
		{#if it === 'sep'}
			<hr />
		{:else}
			<button role="menuitem" class:danger={it.danger} disabled={it.disabled} onclick={() => (onclose(), it.action())}>
				{#if it.icon}<Icon name={it.icon} size={16} />{/if}{it.label}
			</button>
		{/if}
	{/each}
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
	}
	.menu {
		position: fixed;
		z-index: 61;
		min-width: 190px;
		padding: 6px;
		background: var(--surface-glass);
		backdrop-filter: blur(18px) saturate(160%);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-lg);
		animation: pop 0.14s var(--ease);
	}
	button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		background: transparent;
		border-radius: 9px;
		text-align: left;
		font-weight: 520;
	}
	button:hover:not(:disabled),
	button:focus-visible {
		background: var(--accent-soft);
		outline: none;
	}
	button.danger {
		color: var(--danger);
	}
	hr {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 5px 4px;
	}
</style>
