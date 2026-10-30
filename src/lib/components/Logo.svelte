<script lang="ts">
	let { size = 32, word = true }: { size?: number; word?: boolean } = $props();
	const id = `lg${Math.random().toString(36).slice(2, 8)}`;
</script>

<span class="logo">
	<svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
		<defs>
			<linearGradient id="{id}-bg" x1="140" y1="0" x2="884" y2="1024" gradientUnits="userSpaceOnUse">
				<stop offset="0" stop-color="#6a5cff" />
				<stop offset="1" stop-color="#12b5a6" />
			</linearGradient>
			<linearGradient id="{id}-b" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#c9f6ff" />
				<stop offset="1" stop-color="#8be9f2" />
			</linearGradient>
		</defs>
		<rect width="1024" height="1024" rx="232" fill="url(#{id}-bg)" />
		<g fill="none" stroke-width="76" stroke-linecap="round">
			<circle cx="396" cy="512" r="176" stroke="#fff" />
			<circle cx="628" cy="512" r="176" stroke="url(#{id}-b)" />
			<path d="M456.2 346.6 A176 176 0 0 1 559.2 446.1" stroke="#fff" stroke-linecap="butt" />
		</g>
	</svg>
	{#if word}<span class="word">Syncloom</span>{/if}
</span>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	.word {
		font-weight: 750;
		font-size: 18px;
		letter-spacing: -0.03em;
	}
</style>
