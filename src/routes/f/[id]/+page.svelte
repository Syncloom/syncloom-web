<script lang="ts">
	import { page } from '$app/state';
	import FilesView from '$lib/components/FilesView.svelte';
</script>

<svelte:head><title>Files · Syncloom</title></svelte:head>
{#key page.params.id}
	<FilesView parentId={page.params.id ?? null} readonlyRoot={false} />
{/key}
