<script lang="ts">
	import { toasts } from '$lib/toast.svelte';
	import Icon from './Icon.svelte';
</script>

<div class="stack" aria-live="polite">
	{#each toasts as t (t.id)}
		<div class="toast {t.kind}" role="status">
			<Icon name={t.kind === 'error' ? 'warning' : t.kind === 'ok' ? 'check' : 'info'} size={16} />
			<span>{t.text}</span>
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		bottom: 18px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 80;
		display: grid;
		gap: 8px;
		justify-items: center;
		pointer-events: none;
		width: min(92vw, 520px);
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-radius: 14px;
		background: var(--text);
		color: var(--bg);
		box-shadow: var(--shadow-md);
		font-weight: 520;
		animation: pop 0.25s var(--ease);
		max-width: 100%;
	}
	.toast.error {
		background: var(--danger);
		color: #fff;
	}
	.toast.ok :global(svg) {
		color: #5ee6a8;
	}
</style>
