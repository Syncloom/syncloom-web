import { api, type LoginResp } from './api';
import { core, loadCore } from './core';
import { startSession } from './session.svelte';

export const deviceName = () => {
	const ua = navigator.userAgent;
	const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
	return `${browser}${os ? ` on ${os}` : ''}`;
};

export async function login(username: string, password: string): Promise<LoginResp> {
	await loadCore();
	const { kdf } = await api<{ kdf: unknown }>('GET', `/auth/prelogin?username=${encodeURIComponent(username)}`);
	const secret = core.auth_secret(password, JSON.stringify(kdf));
	return api<LoginResp>('POST', '/auth/login', { username, auth_secret: secret, device_name: deviceName() });
}

export async function mfaVerify(mfaToken: string, method: 'totp' | 'recovery', code: string): Promise<string> {
	const r = await api<LoginResp>('POST', '/auth/mfa/verify', { method, code, device_name: deviceName() }, { token: mfaToken });
	return r.token;
}

export interface RegisterResult {
	resp: LoginResp;
	recoveryKey: string;
	password: string;
}

export async function register(username: string, password: string, invite: string | null): Promise<RegisterResult> {
	await loadCore();
	const created = JSON.parse(core.vault_create(password));
	const resp = await api<LoginResp>('POST', '/auth/register', {
		username,
		auth_secret: created.auth_secret,
		vault: created.bundle,
		invite,
		device_name: deviceName()
	});
	return { resp, recoveryKey: created.recovery_key, password };
}

export async function totpSetup(token: string, name: string) {
	return api<{ id: string; secret: string; otpauth_url: string }>('POST', '/auth/totp/setup', { name }, { token });
}

export async function totpConfirm(token: string, id: string, code: string) {
	return api<{ recovery_codes: string[]; token: string }>('POST', '/auth/totp/confirm', { id, code, device_name: deviceName() }, { token });
}

/** Unlock the vault with the account password and start the session. */
export async function unlockAndStart(deviceToken: string, password: string) {
	await loadCore();
	const me = await api<{ vault: unknown | null }>('GET', '/me', undefined, { token: deviceToken });
	if (!me.vault) throw new Error('no-vault');
	const keys = JSON.parse(core.vault_unlock(password, JSON.stringify(me.vault)));
	startSession(deviceToken, keys.master, keys.secret);
}

export async function unlockWithRecoveryKey(deviceToken: string, recoveryKey: string) {
	await loadCore();
	const me = await api<{ vault: unknown | null }>('GET', '/me', undefined, { token: deviceToken });
	const keys = JSON.parse(core.vault_unlock_recovery(recoveryKey, JSON.stringify(me.vault)));
	startSession(deviceToken, keys.master, keys.secret);
}

/** First OIDC login: the identity provider has no password for us, so the user picks a vault passphrase. */
export async function createVault(deviceToken: string, passphrase: string): Promise<string> {
	await loadCore();
	const created = JSON.parse(core.vault_create(passphrase));
	await api('PUT', '/me/vault', created.bundle, { token: deviceToken });
	startSession(deviceToken, created.master, created.secret);
	return created.recovery_key;
}

export function downloadTextFile(name: string, text: string) {
	const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
	const a = Object.assign(document.createElement('a'), { href: url, download: name });
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
