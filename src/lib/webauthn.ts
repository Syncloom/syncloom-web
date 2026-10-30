// Bridges the server's WebAuthn JSON (webauthn-rs, base64url) and the browser's WebAuthn API.
import { api } from './api';
import { deviceName } from './auth';

const b64u = {
	dec(s: string): ArrayBuffer {
		s = s.replace(/-/g, '+').replace(/_/g, '/');
		while (s.length % 4) s += '=';
		const bin = atob(s);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out.buffer;
	},
	enc(buf: ArrayBuffer | null | undefined): string | undefined {
		if (!buf) return undefined;
		let s = '';
		for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
		return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}
};

export const webauthnSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

function prepare(options: any) {
	const pk = options.publicKey;
	pk.challenge = b64u.dec(pk.challenge);
	if (pk.user?.id) pk.user.id = b64u.dec(pk.user.id);
	for (const k of ['excludeCredentials', 'allowCredentials']) {
		if (pk[k]) pk[k] = pk[k].map((c: any) => ({ ...c, id: b64u.dec(c.id) }));
	}
	return pk;
}

/** Enroll a hardware security key. `token` is an enrollment or device token. */
export async function registerSecurityKey(token: string, name: string, device = deviceName()): Promise<{ recovery_codes: string[]; token: string }> {
	const options = await api<any>('POST', '/auth/webauthn/register/start', undefined, { token });
	const cred = (await navigator.credentials.create({ publicKey: prepare(options) })) as PublicKeyCredential | null;
	if (!cred) throw new Error('No security key was registered.');
	const r = cred.response as AuthenticatorAttestationResponse;
	const body = {
		id: cred.id,
		rawId: b64u.enc(cred.rawId),
		type: cred.type,
		extensions: cred.getClientExtensionResults(),
		response: { attestationObject: b64u.enc(r.attestationObject), clientDataJSON: b64u.enc(r.clientDataJSON) }
	};
	return api('POST', `/auth/webauthn/register/finish?name=${encodeURIComponent(name)}&device_name=${encodeURIComponent(device)}`, body, { token });
}

/** Second step of a login with a security key. Returns the device token. */
export async function loginWithSecurityKey(mfaToken: string, device = deviceName()): Promise<string> {
	const options = await api<any>('POST', '/auth/webauthn/login/start', undefined, { token: mfaToken });
	const cred = (await navigator.credentials.get({ publicKey: prepare(options) })) as PublicKeyCredential | null;
	if (!cred) throw new Error('No security key was used.');
	const r = cred.response as AuthenticatorAssertionResponse;
	const body = {
		id: cred.id,
		rawId: b64u.enc(cred.rawId),
		type: cred.type,
		extensions: cred.getClientExtensionResults(),
		response: {
			authenticatorData: b64u.enc(r.authenticatorData),
			clientDataJSON: b64u.enc(r.clientDataJSON),
			signature: b64u.enc(r.signature),
			userHandle: b64u.enc(r.userHandle)
		}
	};
	const res = await api<{ token: string }>('POST', `/auth/webauthn/login/finish?device_name=${encodeURIComponent(device)}`, body, { token: mfaToken });
	return res.token;
}
