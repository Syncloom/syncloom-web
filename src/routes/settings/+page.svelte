<script lang="ts">
	import { onMount } from 'svelte';
	import { api, type MfaMethod } from '$lib/api';
	import { core } from '$lib/core';
	import { session, refreshUser } from '$lib/session.svelte';
	import { formatDateTime } from '$lib/format';
	import { confirmDialog, promptDialog } from '$lib/dialogs.svelte';
	import { notify, fail } from '$lib/toast.svelte';
	import Enroll from '$lib/components/Enroll.svelte';
	import RecoveryCodes from '$lib/components/RecoveryCodes.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import Icon from '$lib/components/Icon.svelte';

	type Device = { id: string; name: string; created_at: number; last_seen_at: number; current: boolean };
	let methods = $state<MfaMethod[]>([]);
	let devices = $state<Device[]>([]);
	let adding = $state(false);
	let codes = $state<string[] | null>(null);
	let oldPw = $state('');
	let newPw = $state('');
	let newPw2 = $state('');
	let pwBusy = $state(false);
	let pwError = $state('');
	let theme = $state<'auto' | 'light' | 'dark'>('auto');

	const local = $derived(session.user?.auth_provider === 'local');

	async function load() {
		[methods, devices] = await Promise.all([api<MfaMethod[]>('GET', '/me/mfa'), api<Device[]>('GET', '/me/devices')]);
	}
	onMount(() => {
		void load().catch(fail);
		const t = document.documentElement.dataset.theme;
		theme = t === 'light' || t === 'dark' ? t : 'auto';
	});

	async function rename(m: MfaMethod) {
		const name = await promptDialog('Rename second factor', { value: m.name, confirm: 'Rename' });
		if (!name) return;
		await api('PATCH', `/me/mfa/${m.id}`, { name: name.trim() }).then(load, fail);
	}
	async function remove(m: MfaMethod) {
		if (methods.length <= 1) return notify('You need at least one second factor. Add another one first.', 'error');
		if (!(await confirmDialog(`Remove “${m.name}”?`, { body: 'You will no longer be able to sign in with it.', confirm: 'Remove', danger: true }))) return;
		await api('DELETE', `/me/mfa/${m.id}`).then(() => (notify('Removed', 'ok'), load()), fail);
	}
	async function regenerate() {
		if (!(await confirmDialog('Generate new recovery codes?', { body: 'Your old codes stop working immediately.', confirm: 'Generate' }))) return;
		try {
			codes = (await api<{ recovery_codes: string[] }>('POST', '/me/recovery-codes')).recovery_codes;
		} catch (e) {
			fail(e);
		}
	}
	function enrolled(r: { recovery_codes: string[] }) {
		adding = false;
		if (r.recovery_codes.length) codes = r.recovery_codes;
		notify('Second factor added', 'ok');
		void load();
		void refreshUser();
	}
	async function revoke(d: Device) {
		if (!(await confirmDialog(`Sign out “${d.name}”?`, { confirm: 'Sign out', danger: true }))) return;
		await api('DELETE', `/me/devices/${d.id}`).then(load, fail);
	}

	async function changePassword() {
		pwError = '';
		if (newPw.length < 10) return (pwError = 'Use at least 10 characters.');
		if (newPw !== newPw2) return (pwError = 'The new passwords do not match.');
		pwBusy = true;
		try {
			const me = await api<{ vault: any }>('GET', '/me');
			const oldAuth = core.auth_secret(oldPw, JSON.stringify(me.vault.kdf));
			try {
				core.vault_unlock(oldPw, JSON.stringify(me.vault));
			} catch {
				throw new Error('Your current password is not correct.');
			}
			const r = JSON.parse(core.vault_change_password(session.master!, session.secret!, JSON.stringify(me.vault), newPw));
			await api('POST', '/me/password', { old_auth_secret: oldAuth, new_auth_secret: r.auth_secret, vault: r.bundle });
			oldPw = newPw = newPw2 = '';
			notify('Password changed. Other devices were signed out.', 'ok');
			await load();
		} catch (e) {
			pwError = e instanceof Error ? e.message : String(e);
		} finally {
			pwBusy = false;
		}
	}
	function setTheme(t: typeof theme) {
		theme = t;
		if (t === 'auto') {
			delete document.documentElement.dataset.theme;
			localStorage.removeItem('syncloom.theme');
		} else {
			document.documentElement.dataset.theme = t;
			localStorage.setItem('syncloom.theme', t);
		}
	}
</script>

<svelte:head><title>Settings · Syncloom</title></svelte:head>
<header class="head"><h1>Settings</h1><p class="muted">Signed in as <b>{session.user?.username}</b>{session.user?.role === 'admin' ? ' · administrator' : ''}</p></header>

<div class="stack">
	<section class="card sec">
		<div class="hd">
			<div><h2>Two-step verification</h2><p class="muted">Add as many as you like, such as a spare security key. Any <b>one</b> of them signs you in.</p></div>
			{#if local}<button class="btn primary" onclick={() => (adding = true)}><Icon name="plus" size={16} /> Add</button>{/if}
		</div>
		{#if !local}
			<p class="muted">Your identity provider handles second factors for this account.</p>
		{:else}
			<ul>
				{#each methods as m (m.id)}
					<li>
						<span class="ico"><Icon name={m.kind === 'webauthn' ? 'fingerprint' : 'clock'} size={20} /></span>
						<span class="grow"><b>{m.name}</b><span class="hint">{m.kind === 'webauthn' ? 'Security key' : 'Authenticator app'} · added {formatDateTime(m.created_at)}</span></span>
						<button class="btn ghost sm" onclick={() => rename(m)}>Rename</button>
						<button class="btn ghost sm danger" onclick={() => remove(m)} disabled={methods.length <= 1} title={methods.length <= 1 ? 'You need at least one' : ''}>Remove</button>
					</li>
				{/each}
			</ul>
			<div class="foot"><button class="btn sm" onclick={regenerate}><Icon name="restore" size={14} /> New recovery codes</button><span class="hint">Single-use codes for when you lose every device.</span></div>
		{/if}
	</section>

	<section class="card sec">
		<div class="hd"><div><h2>Signed-in devices</h2><p class="muted">Apps and browsers that have access to your account.</p></div></div>
		<ul>
			{#each devices as d (d.id)}
				<li>
					<span class="ico"><Icon name="device" size={20} /></span>
					<span class="grow"><b>{d.name || 'Unnamed device'}</b> {#if d.current}<span class="badge ok">This device</span>{/if}<span class="hint">Last active {formatDateTime(d.last_seen_at)}</span></span>
					{#if !d.current}<button class="btn ghost sm danger" onclick={() => revoke(d)}>Sign out</button>{/if}
				</li>
			{/each}
		</ul>
	</section>

	{#if local}
		<section class="card sec">
			<div class="hd"><div><h2>Password</h2><p class="muted">Changing it re-wraps your encryption keys. Your files do not need to be re-encrypted.</p></div></div>
			<form class="pw" onsubmit={(e) => (e.preventDefault(), changePassword())}>
				<div class="field"><label for="op">Current password</label><input id="op" class="input" type="password" bind:value={oldPw} autocomplete="current-password" required /></div>
				<div class="field"><label for="np">New password</label><input id="np" class="input" type="password" bind:value={newPw} autocomplete="new-password" required /></div>
				<div class="field"><label for="np2">Repeat new password</label><input id="np2" class="input" type="password" bind:value={newPw2} autocomplete="new-password" required /></div>
				{#if pwError}<p class="error">{pwError}</p>{/if}
				<button class="btn primary" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Change password'}</button>
			</form>
		</section>
	{/if}

	<section class="card sec">
		<div class="hd"><div><h2>Appearance</h2></div></div>
		<div class="themes" role="radiogroup" aria-label="Theme">
			{#each [['auto', 'System', 'device'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']] as [v, label, icon]}
				<button role="radio" aria-checked={theme === v} class:on={theme === v} onclick={() => setTheme(v as typeof theme)}><Icon name={icon} size={18} /> {label}</button>
			{/each}
		</div>
	</section>
</div>

{#if adding}
	<Dialog title="Add a second factor" onclose={() => (adding = false)} width={440}>
		<Enroll token={session.token!} onDone={enrolled} onCancel={() => (adding = false)} />
	</Dialog>
{/if}
{#if codes}
	<Dialog title="Save your recovery codes" onclose={() => (codes = null)} width={440}>
		<RecoveryCodes {codes} />
		{#snippet footer()}<button class="btn primary" onclick={() => (codes = null)}>I saved them</button>{/snippet}
	</Dialog>
{/if}

<style>
	.head {
		display: grid;
		gap: 6px;
		margin-bottom: 22px;
	}
	.stack {
		display: grid;
		gap: 18px;
		max-width: 780px;
	}
	.sec {
		padding: 22px;
		display: grid;
		gap: 14px;
	}
	.hd {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 14px;
		flex-wrap: wrap;
	}
	.hd p {
		margin-top: 4px;
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
		gap: 12px;
		padding: 10px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.ico {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
		flex: none;
	}
	.grow {
		flex: 1;
		min-width: 0;
		display: grid;
		justify-items: start;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.pw {
		display: grid;
		gap: 12px;
		max-width: 380px;
	}
	.themes {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.themes button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 14px;
		font-weight: 600;
	}
	.themes button.on {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-soft);
		color: var(--accent);
	}
</style>
