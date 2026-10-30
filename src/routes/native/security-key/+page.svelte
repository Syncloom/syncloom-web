<script lang="ts">
	import { onMount } from 'svelte';
	import { loginWithSecurityKey, registerSecurityKey, webauthnSupported } from '$lib/webauthn';
	import Logo from '$lib/components/Logo.svelte';

	// Opened by the native apps inside the system's web-authentication session. The parameters travel in
	// the URL fragment, so they never reach the server or its logs. The result goes back to the app
	// through the fixed `syncloom://` callback, again in a fragment.
	const CALLBACK = 'syncloom://security-key';

	let mode = $state<'login' | 'register'>('login');
	let token = '';
	let name = 'Security key';
	let device = '';
	let busy = $state(false);
	let error = $state('');
	let ready = $state(false);

	onMount(() => {
		const p = new URLSearchParams(location.hash.slice(1));
		mode = p.get('mode') === 'register' ? 'register' : 'login';
		token = p.get('token') ?? '';
		name = p.get('name') || name;
		device = p.get('device') ?? '';
		if (!token) error = 'This page is opened by the Syncloom app.';
		else if (!webauthnSupported()) error = 'This browser does not support security keys.';
		ready = true;
	});

	function back(params: Record<string, string>) {
		const url = `${CALLBACK}#${new URLSearchParams(params)}`;
		document.body.dataset.result = url; // lets tests observe the hand-off
		location.href = url;
	}

	async function go() {
		busy = true;
		error = '';
		try {
			if (mode === 'login') {
				back({ token: await loginWithSecurityKey(token, device || undefined) });
			} else {
				const r = await registerSecurityKey(token, name, device || undefined);
				back({ token: r.token, codes: r.recovery_codes.join(',') });
			}
		} catch (e) {
			error = e instanceof Error && e.name === 'NotAllowedError' ? 'The security key was not used. Try again.' : e instanceof Error ? e.message : String(e);
			busy = false;
		}
	}
</script>

<svelte:head><title>Security key · Syncloom</title></svelte:head>
<main>
	<div class="card">
		<Logo size={44} word={false} />
		<h1>{mode === 'login' ? 'Use your security key' : 'Add a security key'}</h1>
		<p class="muted">
			{mode === 'login' ? 'Insert or tap your key, then confirm below. You return to Syncloom automatically.' : 'Insert or tap the key you want to add, then confirm below.'}
		</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button class="btn primary big" onclick={go} disabled={busy || !ready || !token || !webauthnSupported()}>
			{busy ? 'Waiting for your key…' : mode === 'login' ? 'Use security key' : 'Register security key'}
		</button>
		<button class="btn ghost" onclick={() => back({ error: 'cancelled' })}>Cancel</button>
	</div>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
	}
	.card {
		display: grid;
		justify-items: center;
		gap: 14px;
		text-align: center;
		width: min(420px, 100%);
		padding: 32px 28px;
		border: 1px solid var(--border);
		border-radius: var(--r-lg, 16px);
		background: var(--surface);
	}
	h1 {
		margin: 0;
		font-size: 21px;
	}
	p {
		margin: 0;
	}
</style>
