<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { loadCore } from '$lib/core';
	import { restoreSession, refreshUser, session, signedIn } from '$lib/session.svelte';
	import { startLive, stopLive } from '$lib/live.svelte';
	import { resetFsCache } from '$lib/fs';
	import Shell from '$lib/components/Shell.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import DialogHost from '$lib/components/DialogHost.svelte';

	let { children }: { children: Snippet } = $props();
	let ready = $state(false);

	const bare = $derived(page.url.pathname.startsWith('/login') || page.url.pathname.startsWith('/s/') || page.url.pathname.startsWith('/native/'));

	onMount(async () => {
		await loadCore();
		if (restoreSession()) {
			try {
				await refreshUser();
			} catch {
				/* handled by the 401 hook */
			}
		}
		ready = true;
	});

	$effect(() => {
		if (!ready) return;
		if (!bare && !signedIn()) {
			goto('/login');
		}
	});

	$effect(() => {
		if (ready && signedIn() && !session.user) refreshUser().catch(() => {});
	});

	$effect(() => {
		if (ready && signedIn()) {
			void startLive();
			return () => stopLive();
		}
		resetFsCache();
	});
</script>

<svelte:head><title>Syncloom</title></svelte:head>

{#if !ready}
	<div class="boot"><div class="spinner"></div></div>
{:else if bare}
	{@render children()}
{:else if signedIn() && session.user}
	<Shell>{@render children()}</Shell>
{:else}
	<div class="boot"><div class="spinner"></div></div>
{/if}
<Toasts />
<DialogHost />

<style>
	.boot {
		min-height: 100dvh;
		display: grid;
		place-items: center;
	}
</style>
