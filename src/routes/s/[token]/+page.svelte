<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PublicLink, type FsNode } from '$lib/fs';
	import { ApiError } from '$lib/api';
	import { loadCore } from '$lib/core';
	import { formatBytes, formatDate } from '$lib/format';
	import { fail } from '$lib/toast.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FileIcon from '$lib/components/FileIcon.svelte';

	let link: PublicLink | null = null;
	let phase = $state<'loading' | 'password' | 'ready' | 'error'>('loading');
	let error = $state('');
	let password = $state('');
	let stack = $state<FsNode[]>([]);
	let items = $state<FsNode[]>([]);
	let busy = $state('');
	const here = $derived(stack[stack.length - 1]);

	async function open(pw: string | null) {
		const key = /[#&]k=([^&]+)/.exec(location.hash)?.[1];
		if (!key) {
			phase = 'error';
			error = 'This link is incomplete: the decryption key after “#k=” is missing.';
			return;
		}
		link = new PublicLink(page.params.token!, decodeURIComponent(key), pw);
		try {
			const root = await link.open();
			stack = [root];
			items = root.kind === 'folder' ? await link.list(root) : [];
			phase = 'ready';
		} catch (e) {
			if (e instanceof ApiError && e.status === 401) {
				phase = 'password';
				if (pw) error = 'That password is not correct.';
			} else if (e instanceof ApiError && e.status === 404) {
				phase = 'error';
				error = 'This link does not exist or has expired.';
			} else {
				phase = 'error';
				error = e instanceof Error ? e.message : String(e);
			}
		}
	}
	onMount(async () => {
		await loadCore();
		await open(null);
	});

	async function enter(n: FsNode) {
		if (n.kind !== 'folder') return;
		stack = [...stack, n];
		items = await link!.list(n).catch((e) => (fail(e), []));
	}
	async function up(i: number) {
		stack = stack.slice(0, i + 1);
		items = await link!.list(stack[i]).catch((e) => (fail(e), []));
	}
	async function download(n: FsNode) {
		busy = n.id;
		try {
			await link!.save(n);
		} catch (e) {
			fail(e instanceof ApiError && e.status === 403 ? new Error('The download limit for this link has been reached.') : e);
		} finally {
			busy = '';
		}
	}
</script>

<svelte:head><title>{phase === 'ready' ? here.name : 'Shared'} · Syncloom</title></svelte:head>
<div class="page">
	<div class="glow" aria-hidden="true"></div>
	<div class="wrap">
		<a class="brand" href="/"><Logo size={30} /></a>
		{#if phase === 'loading'}
			<div class="center"><div class="spinner"></div></div>
		{:else if phase === 'error'}
			<div class="card box center"><div class="art"><Icon name="warning" size={34} /></div><h2>Link unavailable</h2><p class="muted">{error}</p></div>
		{:else if phase === 'password'}
			<form class="card box" onsubmit={(e) => (e.preventDefault(), open(password))}>
				<div class="art"><Icon name="lock" size={30} /></div>
				<h2>This link is protected</h2>
				<div class="field"><label for="pw">Password</label><input id="pw" class="input" type="password" bind:value={password} class:invalid={!!error} required /></div>
				{#if error}<p class="error">{error}</p>{/if}
				<button class="btn primary">Open</button>
			</form>
		{:else}
			<div class="card box wide">
				<header>
					<nav class="crumbs">
						{#each stack as c, i}
							{#if i}<Icon name="chevron" size={14} />{/if}
							<button class="c" class:cur={i === stack.length - 1} onclick={() => up(i)}>{c.name}</button>
						{/each}
					</nav>
					<span class="badge neutral"><Icon name="lock" size={12} /> End-to-end encrypted</span>
				</header>
				{#if here.kind === 'file'}
					<div class="single">
						<FileIcon name={here.name} kind="file" size={72} />
						<h2>{here.name}</h2>
						<p class="muted">{formatBytes(here.size)} · {formatDate(here.updatedAt)}</p>
						<button class="btn primary" disabled={busy === here.id} onclick={() => download(here)}><Icon name="download" size={16} /> {busy ? 'Decrypting…' : 'Download'}</button>
					</div>
				{:else}
					<ul>
						{#each items as n (n.id)}
							<li>
								<button class="r" onclick={() => (n.kind === 'folder' ? enter(n) : download(n))}>
									<FileIcon name={n.name} kind={n.kind} size={36} />
									<span class="g"><b>{n.name}</b><span class="muted">{n.kind === 'file' ? formatBytes(n.size) : 'Folder'}</span></span>
									{#if n.kind === 'file'}<span class="btn sm"><Icon name="download" size={14} /> {busy === n.id ? '…' : 'Download'}</span>{:else}<Icon name="chevron" size={16} />{/if}
								</button>
							</li>
						{:else}
							<li class="empty muted">This folder is empty.</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		<p class="foot muted"><Icon name="shield" size={13} /> Shared with Syncloom. The decryption key lives only in this link’s address and never reaches the server.</p>
	</div>
</div>

<style>
	.page {
		min-height: 100dvh;
		padding: 28px 16px;
		display: grid;
		justify-items: center;
		align-content: start;
		position: relative;
		overflow: hidden;
	}
	.glow {
		position: absolute;
		width: 700px;
		height: 700px;
		border-radius: 50%;
		background: var(--accent-grad);
		filter: blur(140px);
		opacity: 0.15;
		top: -260px;
		left: -160px;
		pointer-events: none;
	}
	.wrap {
		position: relative;
		width: 100%;
		max-width: 680px;
		display: grid;
		gap: 22px;
	}
	.brand {
		color: inherit;
		justify-self: center;
	}
	.box {
		display: grid;
		gap: 14px;
		padding: 26px;
		box-shadow: var(--shadow-md);
		animation: pop 0.3s var(--ease);
	}
	.box.center {
		justify-items: center;
		text-align: center;
	}
	.center {
		display: grid;
		justify-items: center;
		padding: 50px;
	}
	.art {
		width: 72px;
		height: 72px;
		display: grid;
		place-items: center;
		border-radius: 22px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	form.box {
		justify-items: stretch;
		max-width: 400px;
		justify-self: center;
		width: 100%;
	}
	form.box .art {
		justify-self: center;
	}
	form.box h2 {
		text-align: center;
	}
	.box.wide {
		padding: 18px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.crumbs {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px;
		color: var(--muted);
	}
	.c {
		background: none;
		border: 0;
		padding: 5px 8px;
		border-radius: 9px;
		font-weight: 650;
		color: inherit;
	}
	.c:hover {
		background: var(--surface-2);
	}
	.c.cur {
		color: var(--text);
		font-size: 16px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.r {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px;
		border: 0;
		background: none;
		border-radius: 14px;
		text-align: left;
	}
	.r:hover {
		background: var(--surface-2);
	}
	.g {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.g span {
		font-size: 12.5px;
	}
	.single {
		display: grid;
		justify-items: center;
		gap: 10px;
		padding: 34px 10px;
		text-align: center;
	}
	.empty {
		padding: 30px;
		text-align: center;
	}
	.foot {
		text-align: center;
		font-size: 12.5px;
	}
</style>
