<script lang="ts">
	import { uploads, clearFinished } from '$lib/uploads.svelte';
	import { formatBytes } from '$lib/format';
	import Icon from './Icon.svelte';

	const active = $derived(uploads.items.filter((i) => i.state === 'queued' || i.state === 'uploading').length);
	const total = $derived(uploads.items.reduce((a, i) => a + i.total, 0));
	const done = $derived(uploads.items.reduce((a, i) => a + (i.state === 'done' ? i.total : i.done), 0));
	const failed = $derived(uploads.items.filter((i) => i.state === 'error').length);

	// a finished batch disappears by itself after a few seconds; failures stay until dismissed
	$effect(() => {
		if (!uploads.items.length || active || failed) return;
		const t = setTimeout(clearFinished, 4000);
		return () => clearTimeout(t);
	});
</script>

{#if uploads.items.length}
	<section class="tray card" aria-label="Uploads">
		<header>
			<button class="title" onclick={() => (uploads.open = !uploads.open)} aria-expanded={uploads.open}>
				<span class="ring" style="--p:{total ? (done / total) * 100 : 100}"><i></i></span>
				<span>
					<b>{active ? `Uploading ${active} item${active > 1 ? 's' : ''}` : failed ? `${failed} failed` : 'Uploads complete'}</b>
					<small class="muted">{formatBytes(done)} of {formatBytes(total)}</small>
				</span>
			</button>
			<button class="btn ghost icon sm" onclick={clearFinished} aria-label="Clear finished" title="Clear finished"><Icon name="check" size={16} /></button>
			<button class="btn ghost icon sm" onclick={() => (uploads.open = !uploads.open)} aria-label="Toggle"><Icon name={uploads.open ? 'chevdown' : 'upload'} size={16} /></button>
		</header>
		{#if uploads.open}
			<ul>
				{#each uploads.items as it (it.id)}
					<li class={it.state}>
						<span class="name" title={it.name}>{it.name}</span>
						{#if it.state === 'uploading' || it.state === 'queued'}
							<div class="bar"><i style="width:{it.total ? (it.done / it.total) * 100 : 5}%"></i></div>
							<button class="btn ghost icon sm" onclick={() => it.ctl.abort()} aria-label="Cancel upload"><Icon name="x" size={14} /></button>
						{:else if it.state === 'done'}
							<span class="state ok"><Icon name="check" size={15} /></span>
						{:else}
							<span class="state bad" title={it.error}>{it.state === 'cancelled' ? 'Cancelled' : 'Failed'}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.tray {
		position: fixed;
		right: 20px;
		bottom: 20px;
		width: min(380px, calc(100vw - 32px));
		z-index: 40;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		animation: pop 0.25s var(--ease);
	}
	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 10px 10px 10px 14px;
	}
	.title {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		background: none;
		border: 0;
		text-align: left;
		padding: 0;
	}
	.title small {
		display: block;
	}
	.ring {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--border) 0);
		display: grid;
		place-items: center;
	}
	.ring i {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--surface);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0 8px 8px;
		max-height: 260px;
		overflow: auto;
		border-top: 1px solid var(--border);
	}
	li {
		display: grid;
		grid-template-columns: 1fr 90px auto;
		align-items: center;
		gap: 10px;
		padding: 8px 6px;
		font-size: 13px;
	}
	li.done,
	li.error,
	li.cancelled {
		grid-template-columns: 1fr auto;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar {
		height: 5px;
		border-radius: 9px;
		background: var(--border);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent-grad);
		transition: width 0.2s;
	}
	.state.ok {
		color: var(--ok);
	}
	.state.bad {
		color: var(--danger);
		font-weight: 600;
		font-size: 12px;
	}
</style>
