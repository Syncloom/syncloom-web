// Thin REST client for the Syncloom server.
export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public body: any = null
	) {
		super(message);
	}
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
	token = t;
}
export function setUnauthorizedHandler(f: () => void) {
	onUnauthorized = f;
}
export const apiBase = () => BASE;

async function request(method: string, path: string, init: { body?: BodyInit; json?: unknown; token?: string | null; headers?: Record<string, string> } = {}) {
	const headers: Record<string, string> = { ...(init.headers ?? {}) };
	const t = init.token === undefined ? token : init.token;
	if (t) headers.authorization = `Bearer ${t}`;
	let body = init.body;
	if (init.json !== undefined) {
		headers['content-type'] = 'application/json';
		body = JSON.stringify(init.json);
	}
	let res: Response;
	try {
		res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body });
	} catch (e) {
		throw new ApiError(0, 'Cannot reach the server. Check your connection.');
	}
	if (!res.ok) {
		let parsed: any = null;
		try {
			parsed = await res.json();
		} catch {}
		if (res.status === 401 && t && t === token) onUnauthorized?.();
		throw new ApiError(res.status, parsed?.error ?? res.statusText, parsed);
	}
	return res;
}

export async function api<T = any>(method: string, path: string, json?: unknown, opts: { token?: string | null; headers?: Record<string, string> } = {}): Promise<T> {
	const res = await request(method, path, { json, token: opts.token, headers: opts.headers });
	if (res.status === 204) return undefined as T;
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

export async function apiGetBytes(path: string, headers: Record<string, string> = {}, tok?: string | null): Promise<Uint8Array> {
	const res = await request('GET', path, { headers, token: tok });
	return new Uint8Array(await res.arrayBuffer());
}

export async function apiPutBytes(path: string, data: Uint8Array): Promise<void> {
	await request('PUT', path, { body: data as unknown as BodyInit, headers: { 'content-type': 'application/octet-stream' } });
}

// ---------- shapes shared with the server ----------

export interface NodeDto {
	id: string;
	parent_id: string | null;
	owner_id: string;
	kind: 'file' | 'folder' | 'kv';
	enc_name: string;
	enc_meta: string;
	wrapped_key: string;
	head_version: string | null;
	size: number;
	deleted: boolean;
	updated_at: number;
	access: 'owner' | 'rw' | 'ro';
}

export interface VersionDto {
	id: string;
	node_id: string;
	parent_version: string | null;
	size: number;
	manifest: string;
	chunks: string[];
	created_at: number;
	device: string;
}

export interface UserInfo {
	id: string;
	username: string;
	role: 'admin' | 'user';
	quota_bytes: number | null;
	used_bytes: number;
	mfa_methods: string[];
	auth_provider: 'local' | 'oidc';
}

export interface MfaMethod {
	id: string;
	kind: 'totp' | 'webauthn';
	name: string;
	created_at: number;
}

export interface AuthConfig {
	local_auth: boolean;
	oidc: boolean;
	setup_required: boolean;
	webauthn: boolean;
}

export interface LoginResp {
	status: 'ok' | 'mfa_required' | 'enroll_required';
	token: string;
	methods: string[];
}
