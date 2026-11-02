<script lang="ts">
	import { onMount } from 'svelte';
	import { listShares, shareWith, removeShare, listLinks, createLink, removeLink, type FsNode, type Share, type LinkInfo } from '$lib/fs';
	import { notify, fail } from '$lib/toast.svelte';
	import { formatDate } from '$lib/format';
	import Dialog from './Dialog.svelte';
	import FileIcon from './FileIcon.svelte';
	import Icon from './Icon.svelte';

	let { node, onclose }: { node: FsNode; onclose: () => void } = $props();
	let tab = $state<'people' | 'link'>('people');
	let shares = $state<Share[]>([]);
	let links = $state<LinkInfo[]>([]);
	let who = $state('');
	let perm = $state<'rw' | 'ro'>('ro');
	let busy = $state(false);
	let lPassword = $state('');
	let lDays = $state('');
	let lMax = $state('');
	let fresh = $state('');

	async function load() {
		[shares, links] = await Promise.all([listShares(node.id), listLinks(node.id)]);
	}
	onMount(() => void load().catch(fail));

	async function add() {
		busy = true;
		try {
			await shareWith(node.id, who.trim(), perm);
			notify(`Shared with ${who.trim()}`, 'ok');
			who = '';
			await load();
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function mkLink() {
		busy = true;
		try {
			fresh = await createLink(node.id, {
				password: lPassword || undefined,
				expiresAt: lDays ? Date.now() + Number(lDays) * 86_400_000 : undefined,
				maxDownloads: lMax ? Number(lMax) : undefined
			});
			lPassword = lDays = lMax = '';
			await load();
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}
	async function copy(t: string) {
		await navigator.clipboard.writeText(t);
		notify('Link copied', 'ok');
	}
</script>

<Dialog title="Share" {onclose} width={540}>
	<div class="who">
		<FileIcon name={node.name} kind={node.kind} size={36} />
		<div><b>{node.name}</b><div class="hint">{node.kind === 'folder' ? 'Everything inside is shared too' : 'File'}</div></div>
	</div>
	<div class="seg" role="tablist">
		<button role="tab" aria-selected={tab === 'people'} class:on={tab === 'people'} onclick={() => (tab = 'people')}><Icon name="users" size={15} /> People</button>
		<button role="tab" aria-selected={tab === 'link'} class:on={tab === 'link'} onclick={() => (tab = 'link')}><Icon name="link" size={15} /> Public link</button>
	</div>

	{#if tab === 'people'}
		<form class="add" onsubmit={(e) => (e.preventDefault(), add())}>
			<input class="input" placeholder="Username" bind:value={who} autocapitalize="none" spellcheck="false" required />
			<select class="select" bind:value={perm} aria-label="Permission"><option value="ro">Can view</option><option value="rw">Can edit</option></select>
			<button class="btn primary" disabled={busy || !who.trim()}>Share</button>
		</form>
		<p class="hint"><Icon name="lock" size={13} /> The folder key is encrypted for the recipient on your device; the server never sees it.</p>
		<ul>
			{#each shares as s (s.id)}
				<li>
					<span class="avatar">{s.grantee.slice(0, 1).toUpperCase()}</span>
					<span class="grow"><b>{s.grantee}</b></span>
					<span class="badge {s.permission === 'rw' ? 'warn' : 'neutral'}">{s.permission === 'rw' ? 'Can edit' : 'Can view'}</span>
					<button class="btn ghost icon sm" aria-label="Remove access for {s.grantee}" onclick={async () => (await removeShare(s.id).catch(fail), load())}><Icon name="x" size={15} /></button>
				</li>
			{:else}
				<li class="empty muted">Not shared with anyone yet.</li>
			{/each}
		</ul>
	{:else}
		<form class="grid" onsubmit={(e) => (e.preventDefault(), mkLink())}>
			<div class="field"><label for="lp">Password <span class="muted">(optional)</span></label><input id="lp" class="input" type="password" bind:value={lPassword} autocomplete="new-password" /></div>
			<div class="field"><label for="ld">Expires after (days)</label><input id="ld" class="input" type="number" min="1" bind:value={lDays} placeholder="never" /></div>
			<div class="field"><label for="lm">Download limit</label><input id="lm" class="input" type="number" min="1" bind:value={lMax} placeholder="unlimited" /></div>
			<button class="btn primary" disabled={busy}><Icon name="link" size={16} /> Create link</button>
		</form>
		{#if fresh}
			<div class="fresh">
				<code>{fresh}</code>
				<button class="btn sm" onclick={() => copy(fresh)}><Icon name="copy" size={14} /> Copy</button>
			</div>
			<p class="hint"><Icon name="lock" size={13} /> The part after <code>#k=</code> is the decryption key. It stays in the link and is never sent to the server, so keep the whole link together.</p>
		{/if}
		<ul>
			{#each links as l (l.id)}
				<li>
					<Icon name="link" />
					<span class="grow">
						<b>Link</b>
						<span class="hint">
							{l.has_password ? 'password · ' : ''}{l.expires_at ? `expires ${formatDate(l.expires_at)} · ` : ''}{l.max_downloads ? `${l.downloads}/${l.max_downloads} downloads` : `${l.downloads} downloads`}
						</span>
					</span>
					<button class="btn ghost icon sm" aria-label="Delete link" onclick={async () => (await removeLink(l.id).catch(fail), load())}><Icon name="trash" size={15} /></button>
				</li>
			{:else}
				<li class="empty muted">No public links.</li>
			{/each}
		</ul>
	{/if}
	{#snippet footer()}<button class="btn" onclick={onclose}>Done</button>{/snippet}
</Dialog>

<style>
	.who {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.seg {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--surface-2);
		border-radius: 14px;
	}
	.seg button {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		border: 0;
		background: transparent;
		border-radius: 10px;
		font-weight: 600;
		color: var(--muted);
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	.add {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 8px;
	}
	.select {
		width: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
		align-items: end;
	}
	.grid .btn {
		grid-column: 1 / -1;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 6px;
		border-radius: 12px;
	}
	li:hover {
		background: var(--surface-2);
	}
	li.empty {
		justify-content: center;
		padding: 18px;
	}
	.grow {
		flex: 1;
		display: grid;
	}
	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--accent-grad);
		color: #fff;
		display: grid;
		place-items: center;
		font-weight: 700;
	}
	.fresh {
		min-width: 0;
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 10px 12px;
		background: var(--accent-soft);
		border-radius: 12px;
	}
	.fresh code {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 520px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
