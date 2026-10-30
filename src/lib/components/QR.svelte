<script lang="ts">
	import qrcode from 'qrcode-generator';
	let { value, size = 188 }: { value: string; size?: number } = $props();
	const svg = $derived.by(() => {
		const q = qrcode(0, 'M');
		q.addData(value);
		q.make();
		return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
	});
</script>

<div class="qr" style="width:{size}px;height:{size}px" role="img" aria-label="QR code">{@html svg}</div>

<style>
	.qr {
		padding: 12px;
		background: #fff;
		border-radius: 16px;
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--border);
	}
	.qr :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
