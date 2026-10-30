<script lang="ts">
	import { totpSetup, totpConfirm } from '$lib/auth';
	import { registerSecurityKey, webauthnSupported } from '$lib/webauthn';
	import { fail } from '$lib/toast.svelte';
	import Icon from './Icon.svelte';
	import QR from './QR.svelte';

	type Result = { recovery_codes: string[]; token: string };
	let { token, onDone, onCancel, webauthn = true }: { token: string; onDone: (r: Result) => void; onCancel?: () => void; webauthn?: boolean } = $props();

	let step = $state<'choose' | 'totp' | 'key'>('choose');
	let busy = $state(false);
	let name = $state('');
	let setup = $state<{ id: string; secret: string; otpauth_url: string } | null>(null);
	let code = $state('');
	let error = $state('');

	async function startTotp() {
		busy = true;
		try {
			setup = await totpSetup(token, name.trim() || 'Authenticator app');
			step = 'totp';
		} catch (e) {
			fail(e);
		} finally {
			busy = false;
		}
	}

	async function confirm() {
		if (!setup) return;
		busy = true;
		error = '';
		try {
			onDone(await totpConfirm(token, setup.id, code.replace(/\s/g, '')));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			code = '';
		} finally {
			busy = false;
		}
	}

	async function addKey() {
		busy = true;
		error = '';
		try {
			onDone(await registerSecurityKey(token, name.trim() || 'Security key'));
		} catch (e) {
			error = e instanceof Error && e.name === 'NotAllowedError' ? 'The request was cancelled or timed out.' : e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if step === 'choose'}
	<div class="stack">
		<div class="field">
			<label for="mfa-name">Name <span class="muted">(so you can tell them apart)</span></label>
			<input id="mfa-name" class="input" bind:value={name} placeholder="e.g. iPhone, YubiKey 5" maxlength="40" />
		</div>
		<button class="opt" onclick={startTotp} disabled={busy}>
			<span class="ico"><Icon name="clock" size={22} /></span>
			<span><b>Authenticator app</b><small>Google Authenticator, 1Password, Aegis, Authy …</small></span>
			<Icon name="chevron" />
		</button>
		<button class="opt" onclick={() => (step = 'key')} disabled={busy || !webauthn || !webauthnSupported()}>
			<span class="ico"><Icon name="fingerprint" size={22} /></span>
			<span><b>Security key</b><small>{webauthnSupported() ? 'YubiKey or any FIDO2 hardware key' : 'Not supported by this browser'}</small></span>
			<Icon name="chevron" />
		</button>
		{#if onCancel}<button class="btn ghost" onclick={onCancel}>Cancel</button>{/if}
	</div>
{:else if step === 'totp' && setup}
	<div class="stack center">
		<QR value={setup.otpauth_url} />
		<p class="hint">Scan this with your authenticator app, or enter the secret by hand:</p>
		<code class="secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</code>
		<form class="stack" onsubmit={(e) => (e.preventDefault(), confirm())}>
			<div class="field">
				<label for="totp-code">6-digit code</label>
				<input id="totp-code" class="input code" bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" class:invalid={!!error} />
				{#if error}<span class="error">{error}</span>{/if}
			</div>
			<button class="btn primary" disabled={busy || code.replace(/\s/g, '').length < 6}>{busy ? 'Checking…' : 'Verify and add'}</button>
			<button type="button" class="btn ghost" onclick={() => ((step = 'choose'), (error = ''))}>Back</button>
		</form>
	</div>
{:else}
	<div class="stack center">
		<div class="keyart"><Icon name="fingerprint" size={44} /></div>
		<p class="hint">Insert your security key, then press the button and touch the key when it blinks.</p>
		{#if error}<span class="error">{error}</span>{/if}
		<button class="btn primary" onclick={addKey} disabled={busy}>{busy ? 'Waiting for your key…' : 'Register security key'}</button>
		<button class="btn ghost" onclick={() => ((step = 'choose'), (error = ''))}>Back</button>
	</div>
{/if}

<style>
	.stack {
		display: grid;
		gap: 14px;
	}
	.center {
		justify-items: center;
		text-align: center;
	}
	.opt {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		text-align: left;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 16px;
		transition: border-color 0.15s, transform 0.12s var(--ease), box-shadow 0.15s;
	}
	.opt:hover:not(:disabled) {
		border-color: var(--accent);
		box-shadow: 0 0 0 4px var(--accent-soft);
	}
	.opt b {
		display: block;
	}
	.opt small {
		color: var(--muted);
	}
	.ico {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.secret {
		padding: 8px 12px;
		background: var(--surface-2);
		border-radius: 10px;
		letter-spacing: 0.08em;
		user-select: all;
	}
	.code {
		text-align: center;
		font-size: 22px;
		letter-spacing: 0.3em;
		font-variant-numeric: tabular-nums;
	}
	.keyart {
		width: 88px;
		height: 88px;
		display: grid;
		place-items: center;
		border-radius: 26px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	form {
		width: 100%;
	}
</style>
