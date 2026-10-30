<script lang="ts">
	import { fileKind } from '$lib/format';
	import Icon from './Icon.svelte';
	let { name, kind, size = 40 }: { name: string; kind: 'file' | 'folder' | 'kv'; size?: number } = $props();
	const k = $derived(kind === 'folder' ? { color: '#6a5cff', glyph: 'folder' } : kind === 'kv' ? { color: '#12b5a6', glyph: 'db' } : fileKind(name));
</script>

<span class="tile" style="--c:{k.color};width:{size}px;height:{size}px;border-radius:{size * 0.3}px">
	<Icon name={k.glyph} size={Math.round(size * 0.5)} stroke={1.7} />
</span>

<style>
	.tile {
		display: grid;
		place-items: center;
		flex: none;
		color: var(--c);
		background: color-mix(in srgb, var(--c) 13%, transparent);
	}
</style>
