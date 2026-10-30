<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, type AuthConfig, type LoginResp } from '$lib/api';
	import { login, mfaVerify, register, unlockAndStart, unlockWithRecoveryKey, createVault, downloadTextFile } from '$lib/auth';
	import { loginWithSecurityKey, webauthnSupported } from '$lib/webauthn';
	import { loadCore } from '$lib/core';
	import { setToken } from '$lib/api';
	import { notify } from '$lib/toast.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Enroll from '$lib/components/Enroll.svelte';
	import RecoveryCodes from '$lib/components/RecoveryCodes.svelte';

	type Step = 'credentials' | 'register' | 'recovery-key' | 'enroll' | 'codes' | 'mfa' | 'oidc-create' | 'oidc-unlock' | 'forgot';
	let config = $state<AuthConfig | null>(null);
	let step = $state<Step>('credentials');
	let busy = $state(false);
	let error = $state('');

	let username = $state('');
	let password = $state('');
	let password2 = $state('');
	let invite = $state('');
	let code = $state('');
	let recoveryKey = $state('');
	let ack = $state(false);
	let mfaToken = $state('');
	let methods = $state<string[]>([]);
	let mfaMethod = $state<'totp' | 'key' | 'recovery'>('totp');
	let enrollToken = $state('');
	let codes = $state<string[]>([]);
	let deviceToken = $state('');
	let passphrase = $state('');

	onMount(async () => {
		await loadCore();
		try {
			config = await api<AuthConfig>('GET', '/auth/config');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return;
		}
		if (config.setup_required) step = 'register';
		const m = /oidc-token=([^&]+)/.exec(location.hash);
		if (m) {
			history.replaceState(null, '', location.pathname);
			deviceToken = decodeURIComponent(m[1]);
			setToken(deviceToken);
			const me = await api<{ vault: unknown | null }>('GET', '/me', undefined, { token: deviceToken });
			step = me.vault ? 'oidc-unlock' : 'oidc-create';
		}
	});

	async function run(f: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await f();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function afterLogin(resp: LoginResp) {
		if (resp.status === 'mfa_required') {
			mfaToken = resp.token;
			methods = resp.methods;
			mfaMethod = methods.includes('totp') ? 'totp' : methods.includes('webauthn') && webauthnSupported() ? 'key' : 'recovery';
			code = '';
			step = 'mfa';
		} else if (resp.status === 'enroll_required') {
			enrollToken = resp.token;
			step = 'enroll';
		} else {
			await finish(resp.token);
		}
	}

	async function finish(token: string) {
		await unlockAndStart(token, password);
		await goto('/');
	}

	const submitLogin = () => run(async () => afterLogin(await login(username.trim(), password)));

	const submitRegister = () =>
		run(async () => {
			if (password.length < 10) throw new Error('Use at least 10 characters for your password.');
			if (password !== password2) throw new Error('The passwords do not match.');
			const r = await register(username.trim(), password, invite.trim() || null);
			recoveryKey = r.recoveryKey;
			enrollToken = r.resp.token;
			ack = false;
			step = 'recovery-key';
		});

	const submitMfa = () =>
		run(async () => {
			if (mfaMethod === 'key') return void (await finish(await loginWithSecurityKey(mfaToken)));
			const method = mfaMethod === 'recovery' ? 'recovery' : 'totp';
			await finish(await mfaVerify(mfaToken, method, code.trim()));
		});

	$effect(() => {
		if (step === 'mfa' && mfaMethod === 'totp' && code.replace(/\s/g, '').length === 6 && !busy) submitMfa();
	});

	function enrolled(r: { recovery_codes: string[]; token: string }) {
		deviceToken = r.token;
		codes = r.recovery_codes;
		step = 'codes';
	}

	const submitOidc = () =>
		run(async () => {
			if (step === 'oidc-create') {
				if (passphrase.length < 10) throw new Error('Use at least 10 characters.');
				recoveryKey = await createVault(deviceToken, passphrase);
				step = 'recovery-key';
				ack = false;
				enrollToken = '';
				return;
			}
			try {
				await unlockAndStart(deviceToken, passphrase);
			} catch {
				throw new Error('That passphrase does not unlock your vault.');
			}
			await goto('/');
		});

	const submitRecoveryKey = () =>
		run(async () => {
			const t = deviceToken || mfaToken;
			await unlockWithRecoveryKey(t, recoveryKey.trim());
			notify('Vault unlocked with your recovery key. Set a new password in Settings.', 'ok');
			await goto('/settings');
		});

	async function continueAfterKey() {
		if (step === 'recovery-key' && !enrollToken && deviceToken) {
			await goto('/'); // OIDC: the vault is already unlocked
		} else {
			step = 'enroll';
		}
	}
</script>

<div class="page">
	<div class="glow" aria-hidden="true"></div>
	<div class="card">
		<div class="head"><Logo size={40} /></div>

		{#if !config && !error}
			<div class="center"><div class="spinner"></div></div>
		{:else if step === 'credentials'}
			<h1>Welcome back</h1>
			<p class="muted sub">Sign in to your encrypted storage.</p>
			<form onsubmit={(e) => (e.preventDefault(), submitLogin())}>
				{#if config?.local_auth}
					<div class="field"><label for="u">Username</label><input id="u" class="input" bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" required /></div>
					<div class="field"><label for="p">Password</label><input id="p" class="input" type="password" bind:value={password} autocomplete="current-password" required /></div>
					{#if error}<p class="error" role="alert">{error}</p>{/if}
					<button class="btn primary big" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
				{/if}
				{#if config?.oidc}
					{#if config.local_auth}<div class="or"><span>or</span></div>{/if}
					<a class="btn big" href="/api/v1/auth/oidc/login"><Icon name="key" /> Continue with single sign-on</a>
				{/if}
				{#if !config?.local_auth && error}<p class="error" role="alert">{error}</p>{/if}
			</form>
			{#if config?.local_auth}
				<p class="foot muted">New here? <button class="link" onclick={() => ((step = 'register'), (error = ''))}>Create an account</button> with an invite.</p>
			{/if}
		{:else if step === 'register'}
			<h1>{config?.setup_required ? 'Set up Syncloom' : 'Create your account'}</h1>
			<p class="muted sub">
				{config?.setup_required ? 'The first account becomes the administrator.' : 'Your files are encrypted on this device before they leave it.'}
			</p>
			<form onsubmit={(e) => (e.preventDefault(), submitRegister())}>
				<div class="field"><label for="ru">Username</label><input id="ru" class="input" bind:value={username} autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="64" required /><span class="hint">Lowercase letters, digits, “.”, “_” and “-”.</span></div>
				{#if !config?.setup_required}
					<div class="field"><label for="ri">Invite code</label><input id="ri" class="input" bind:value={invite} autocomplete="off" required /></div>
				{/if}
				<div class="field"><label for="rp">Password</label><input id="rp" class="input" type="password" bind:value={password} autocomplete="new-password" minlength="10" required /><span class="hint">It protects your encryption keys. We cannot reset it for you.</span></div>
				<div class="field"><label for="rp2">Repeat password</label><input id="rp2" class="input" type="password" bind:value={password2} autocomplete="new-password" required /></div>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<button class="btn primary big" disabled={busy}>{busy ? 'Creating your vault…' : 'Continue'}</button>
			</form>
			{#if !config?.setup_required}<p class="foot muted"><button class="link" onclick={() => ((step = 'credentials'), (error = ''))}>Back to sign in</button></p>{/if}
		{:else if step === 'recovery-key'}
			<h1>Save your recovery key</h1>
			<p class="muted sub">If you forget your password, this key is the <b>only</b> way to get your files back. Not even an administrator can help.</p>
			<div class="keybox mono">{recoveryKey.match(/.{1,17}/g)?.join('\n')}</div>
			<div class="row">
				<button class="btn" onclick={async () => (await navigator.clipboard.writeText(recoveryKey), notify('Recovery key copied', 'ok'))}><Icon name="copy" size={16} /> Copy</button>
				<button class="btn" onclick={() => downloadTextFile('syncloom-recovery-key.txt', `Syncloom recovery key for ${username || 'your account'}\n\n${recoveryKey}\n`)}><Icon name="download" size={16} /> Download</button>
			</div>
			<label class="check"><input type="checkbox" bind:checked={ack} /> I have stored it somewhere safe</label>
			<button class="btn primary big" disabled={!ack} onclick={continueAfterKey}>Continue</button>
		{:else if step === 'enroll'}
			<h1>Add a second factor</h1>
			<p class="muted sub">Every sign-in needs your password <i>and</i> one of your second factors. You can add more later, such as a spare security key.</p>
			<Enroll token={enrollToken} onDone={enrolled} webauthn={config?.webauthn ?? false} />
		{:else if step === 'codes'}
			<h1>You are protected</h1>
			<p class="muted sub">Second factor added. Keep these one-time recovery codes in case you lose it.</p>
			{#if codes.length}<RecoveryCodes {codes} />{/if}
			<button class="btn primary big" disabled={busy} onclick={() => run(() => finish(deviceToken))}>{busy ? 'Opening your files…' : 'Open my files'}</button>
			{#if error}<p class="error">{error}</p>{/if}
		{:else if step === 'mfa'}
			<h1>Verify it’s you</h1>
			<p class="muted sub">Use any one of your second factors.</p>
			<div class="seg" role="tablist">
				{#if methods.includes('totp')}<button role="tab" aria-selected={mfaMethod === 'totp'} class:on={mfaMethod === 'totp'} onclick={() => ((mfaMethod = 'totp'), (error = ''))}><Icon name="clock" size={15} /> App</button>{/if}
				{#if methods.includes('webauthn')}<button role="tab" aria-selected={mfaMethod === 'key'} class:on={mfaMethod === 'key'} onclick={() => ((mfaMethod = 'key'), (error = ''))}><Icon name="fingerprint" size={15} /> Key</button>{/if}
				<button role="tab" aria-selected={mfaMethod === 'recovery'} class:on={mfaMethod === 'recovery'} onclick={() => ((mfaMethod = 'recovery'), (error = ''))}><Icon name="restore" size={15} /> Recovery</button>
			</div>
			<form onsubmit={(e) => (e.preventDefault(), submitMfa())}>
				{#if mfaMethod === 'key'}
					<p class="hint center">Insert your security key and touch it when it blinks.</p>
				{:else}
					<div class="field">
						<label for="c">{mfaMethod === 'totp' ? '6-digit code' : 'Recovery code'}</label>
						<!-- svelte-ignore a11y_autofocus -->
						<input id="c" class="input {mfaMethod === 'totp' ? 'otp' : ''}" bind:value={code} autofocus inputmode={mfaMethod === 'totp' ? 'numeric' : 'text'} autocomplete="one-time-code" placeholder={mfaMethod === 'totp' ? '000 000' : 'xxxx-xxxx-xxxx'} class:invalid={!!error} />
					</div>
				{/if}
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<button class="btn primary big" disabled={busy || (mfaMethod !== 'key' && !code.trim())}>{busy ? 'Verifying…' : mfaMethod === 'key' ? 'Use security key' : 'Verify'}</button>
			</form>
			<p class="foot muted"><button class="link" onclick={() => ((step = 'credentials'), (error = ''))}>Use a different account</button></p>
		{:else if step === 'oidc-create' || step === 'oidc-unlock'}
			<h1>{step === 'oidc-create' ? 'Create your vault passphrase' : 'Unlock your vault'}</h1>
			<p class="muted sub">
				{step === 'oidc-create'
					? 'Your single sign-on proves who you are. A separate passphrase encrypts your files so only you can read them.'
					: 'Enter your vault passphrase to decrypt your files.'}
			</p>
			<form onsubmit={(e) => (e.preventDefault(), submitOidc())}>
				<div class="field"><label for="pp">Passphrase</label><input id="pp" class="input" type="password" bind:value={passphrase} autocomplete={step === 'oidc-create' ? 'new-password' : 'current-password'} required /></div>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<button class="btn primary big" disabled={busy}>{step === 'oidc-create' ? 'Create vault' : 'Unlock'}</button>
			</form>
		{/if}
		{#if error && step === 'credentials' && !config?.local_auth && !config}<p class="error">{error}</p>{/if}
	</div>
</div>

<style>
	.page {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		position: relative;
		overflow: hidden;
	}
	.glow {
		position: absolute;
		width: 780px;
		height: 780px;
		border-radius: 50%;
		background: var(--accent-grad);
		filter: blur(140px);
		opacity: 0.16;
		top: -280px;
		right: -200px;
		pointer-events: none;
	}
	.card {
		position: relative;
		width: 100%;
		max-width: 440px;
		display: grid;
		gap: 16px;
		padding: 32px 30px 26px;
		background: var(--surface-glass);
		backdrop-filter: blur(24px) saturate(150%);
		border: 1px solid var(--border);
		border-radius: 26px;
		box-shadow: var(--shadow-lg);
		animation: pop 0.35s var(--ease);
	}
	.head {
		margin-bottom: 4px;
	}
	.sub {
		margin-top: -8px;
	}
	form {
		display: grid;
		gap: 14px;
	}
	.big {
		padding: 12px 16px;
		font-size: 15px;
		width: 100%;
	}
	.center {
		display: grid;
		justify-items: center;
		text-align: center;
	}
	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--muted);
		font-size: 12.5px;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--border);
	}
	.foot {
		text-align: center;
		font-size: 13px;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--accent);
		font-weight: 600;
	}
	.keybox {
		padding: 16px;
		border-radius: 16px;
		background: var(--surface-2);
		border: 1px dashed var(--accent);
		white-space: pre;
		text-align: center;
		font-size: 15px;
		letter-spacing: 0.08em;
		line-height: 1.8;
		user-select: all;
		overflow-x: auto;
	}
	.row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 560;
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
	.otp {
		text-align: center;
		font-size: 24px;
		letter-spacing: 0.3em;
		font-variant-numeric: tabular-nums;
	}
	a.btn {
		text-decoration: none;
	}
</style>
