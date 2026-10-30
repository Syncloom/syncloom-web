<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, type AuthConfig } from '$lib/api';
	import { session } from '$lib/session.svelte';
	import { formatBytes } from '$lib/format';
	import { confirmDialog, promptDialog } from '$lib/dialogs.svelte';
	import { notify, fail } from '$lib/toast.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Dialog from '$lib/components/Dialog.svelte';

	type AdminUser = { id: string; username: string; role: 'admin' | 'user'; quota_bytes: number | null; used_bytes: number; disabled: boolean; mfa_methods: string[]; auth_provider: string };
	type Settings = { trash_days: number; version_days: number; keep_latest_versions: number; default_quota_bytes: number | null };

	let users = $state<AdminUser[]>([]);
	let settings = $state<Settings | null>(null);
	let config = $state<AuthConfig | null>(null);
	let invite = $state('');
	let saving = $state(false);
	let quotaGb = $state('');

	onMount(async () => {
		if (session.user?.role !== 'admin') return void goto('/');
		await load();
	});
	async function load() {
		try {
			[users, settings, config] = await Promise.all([api<AdminUser[]>('GET', '/admin/users'), api<Settings>('GET', '/admin/settings'), api<AuthConfig>('GET', '/auth/config')]);
			quotaGb = settings.default_quota_bytes ? String(settings.default_quota_bytes / 1024 ** 3) : '';
		} catch (e) {
			fail(e);
		}
	}

	const patch = (u: AdminUser, body: object) => api('PATCH', `/admin/users/${u.id}`, body).then(load, fail);

	async function setQuota(u: AdminUser) {
		const v = await promptDialog(`Storage quota for ${u.username}`, { body: 'In gigabytes. Leave empty to use the default.', value: u.quota_bytes ? String(u.quota_bytes / 1024 ** 3) : '', confirm: 'Save' }).catch(() => null);
		if (v === null) return;
		if (!v.trim()) return void patch(u, { clear_quota: true });
		const gb = Number(v);
		if (!(gb > 0)) return notify('Enter a positive number.', 'error');
		await patch(u, { quota_bytes: Math.round(gb * 1024 ** 3) });
	}
	async function reset2fa(u: AdminUser) {
		if (!(await confirmDialog(`Reset two-step verification for ${u.username}?`, { body: 'They are signed out everywhere and must set up a second factor at their next login. Their files stay encrypted and are not affected.', confirm: 'Reset', danger: true }))) return;
		await api('POST', `/admin/users/${u.id}/reset-2fa`).then(() => (notify('Reset', 'ok'), load()), fail);
	}
	async function del(u: AdminUser) {
		if (!(await confirmDialog(`Delete ${u.username}?`, { body: 'All their files are removed permanently.', confirm: 'Delete user', danger: true }))) return;
		await api('DELETE', `/admin/users/${u.id}`).then(load, fail);
	}
	async function mkInvite() {
		try {
			invite = (await api<{ code: string }>('POST', '/admin/invites')).code;
		} catch (e) {
			fail(e);
		}
	}
	async function saveSettings() {
		if (!settings) return;
		saving = true;
		try {
			settings.default_quota_bytes = quotaGb ? Math.round(Number(quotaGb) * 1024 ** 3) : null;
			await api('PUT', '/admin/settings', settings);
			notify('Settings saved', 'ok');
		} catch (e) {
			fail(e);
		} finally {
			saving = false;
		}
	}
	async function addOidc() {
		const name = await promptDialog('Pre-provision SSO user', { body: 'The username must match the “preferred_username” (or e-mail) the identity provider sends.', confirm: 'Create' });
		if (!name) return;
		await api('POST', '/admin/users', { username: name.trim() }).then(() => (notify('User created', 'ok'), load()), fail);
	}
</script>

<svelte:head><title>Admin · Syncloom</title></svelte:head>
<header class="head"><h1>Administration</h1><p class="muted">People, storage and retention for this server.</p></header>

<div class="stack">
	<section class="card sec">
		<div class="hd">
			<div><h2>People</h2><p class="muted">{users.length} account{users.length === 1 ? '' : 's'}</p></div>
			<div class="acts">
				{#if config?.oidc}<button class="btn" onclick={addOidc}><Icon name="key" size={16} /> Add SSO user</button>{/if}
				<button class="btn primary" onclick={mkInvite}><Icon name="plus" size={16} /> Invite someone</button>
			</div>
		</div>
		<div class="tbl">
			<div class="r h"><span>User</span><span>Storage</span><span>2FA</span><span></span></div>
			{#each users as u (u.id)}
				<div class="r" class:off={u.disabled}>
					<span class="who"><span class="avatar">{u.username.slice(0, 1).toUpperCase()}</span><span><b>{u.username}</b>
						<span class="hint">{u.role === 'admin' ? 'Administrator' : 'Member'}{u.auth_provider === 'oidc' ? ' · SSO' : ''}{u.disabled ? ' · disabled' : ''}</span></span></span>
					<span class="mono">{formatBytes(u.used_bytes)}{u.quota_bytes ? ` / ${formatBytes(u.quota_bytes)}` : ''}</span>
					<span>{#if u.auth_provider === 'oidc'}<span class="badge neutral">via SSO</span>{:else if u.mfa_methods.length}<span class="badge ok">{u.mfa_methods.filter((m) => m !== 'recovery').length} on</span>{:else}<span class="badge warn">not set up</span>{/if}</span>
					<span class="a">
						<button class="btn ghost sm" onclick={() => setQuota(u)}>Quota</button>
						<button class="btn ghost sm" onclick={() => patch(u, { role: u.role === 'admin' ? 'user' : 'admin' })} disabled={u.id === session.user?.id}>{u.role === 'admin' ? 'Demote' : 'Make admin'}</button>
						<button class="btn ghost sm" onclick={() => patch(u, { disabled: !u.disabled })} disabled={u.id === session.user?.id}>{u.disabled ? 'Enable' : 'Disable'}</button>
						{#if u.auth_provider === 'local'}<button class="btn ghost sm" onclick={() => reset2fa(u)}>Reset 2FA</button>{/if}
						<button class="btn ghost sm danger" onclick={() => del(u)} disabled={u.id === session.user?.id}>Delete</button>
					</span>
				</div>
			{/each}
		</div>
	</section>

	{#if settings}
		<section class="card sec">
			<div class="hd"><div><h2>Retention &amp; quota</h2><p class="muted">How long deleted files and old versions are kept.</p></div></div>
			<form class="set" onsubmit={(e) => (e.preventDefault(), saveSettings())}>
				<div class="field"><label for="td">Keep trash for (days)</label><input id="td" class="input" type="number" min="0" bind:value={settings.trash_days} /></div>
				<div class="field"><label for="vd">Keep old versions for (days)</label><input id="vd" class="input" type="number" min="0" bind:value={settings.version_days} /></div>
				<div class="field"><label for="kl">Always keep latest versions</label><input id="kl" class="input" type="number" min="1" bind:value={settings.keep_latest_versions} /></div>
				<div class="field"><label for="dq">Default quota (GB)</label><input id="dq" class="input" type="number" min="0" step="any" bind:value={quotaGb} placeholder="unlimited" /></div>
				<button class="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
			</form>
		</section>
	{/if}
</div>

{#if invite}
	<Dialog title="Invitation" onclose={() => (invite = '')} width={460}>
		<p class="muted">Send this code to the person. It works once and expires in 7 days. They enter it on the registration page.</p>
		<code class="code">{invite}</code>
		{#snippet footer()}
			<button class="btn" onclick={async () => (await navigator.clipboard.writeText(invite), notify('Copied', 'ok'))}><Icon name="copy" size={15} /> Copy code</button>
			<button class="btn primary" onclick={() => (invite = '')}>Done</button>
		{/snippet}
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
	}
	.sec {
		padding: 22px;
		display: grid;
		gap: 16px;
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
	.acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tbl {
		display: grid;
		overflow-x: auto;
	}
	.r {
		display: grid;
		grid-template-columns: minmax(180px, 1.2fr) minmax(130px, 0.8fr) 110px minmax(300px, 2fr);
		gap: 12px;
		align-items: center;
		padding: 10px 6px;
		border-bottom: 1px solid var(--border);
		min-width: 760px;
	}
	.r.h {
		color: var(--muted);
		font-size: 12px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.r.off {
		opacity: 0.55;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.who > span:last-child {
		display: grid;
	}
	.avatar {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--accent-grad);
		color: #fff;
		display: grid;
		place-items: center;
		font-weight: 700;
	}
	.a {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		justify-content: flex-end;
	}
	.set {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 14px;
		align-items: end;
	}
	.code {
		display: block;
		padding: 14px;
		background: var(--surface-2);
		border-radius: 14px;
		word-break: break-all;
		user-select: all;
		text-align: center;
	}
</style>
