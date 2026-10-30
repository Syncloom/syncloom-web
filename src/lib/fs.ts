// Encrypted file system on top of the REST API. All names, metadata and contents are decrypted here
// in the browser with keys derived from the user's vault; the server only ever sees ciphertext.
import { api, apiGetBytes, apiPutBytes, ApiError, type NodeDto, type VersionDto } from './api';
import { core } from './core';
import { session } from './session.svelte';

export interface FsNode {
	id: string;
	parentId: string | null;
	ownerId: string;
	kind: 'file' | 'folder' | 'kv';
	name: string;
	mtime: number;
	executable: boolean;
	headVersion: string | null;
	size: number;
	deleted: boolean;
	updatedAt: number;
	access: 'owner' | 'rw' | 'ro';
}

export interface FileVersion {
	id: string;
	parentVersion: string | null;
	size: number;
	createdAt: number;
	device: string;
	contentHash: string;
}

const keys = new Map<string, string>();
let sharedRoots: Map<string, string> | null = null;

export function resetFsCache() {
	keys.clear();
	sharedRoots = null;
}

const master = () => session.master!;
const secret = () => session.secret!;

async function loadShared(force = false) {
	if (!force && sharedRoots) return;
	const list = await api<NodeDto[]>('GET', '/shared');
	sharedRoots = new Map(list.map((n) => [n.id, n.wrapped_key]));
}

/** Resolve the key of a node by walking up to the vault master key or a share root. */
export async function nodeKey(id: string): Promise<string> {
	const cached = keys.get(id);
	if (cached) return cached;
	await loadShared();
	let key: string | undefined;
	const sealed = sharedRoots!.get(id);
	if (sealed) {
		key = core.open_shared_key(master(), secret(), sealed, id);
	} else {
		const dto = await api<NodeDto>('GET', `/nodes/${id}`);
		if (dto.parent_id) {
			try {
				key = core.unwrap_node_key(await nodeKey(dto.parent_id), id, dto.wrapped_key);
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) throw e;
				await loadShared(true); // a share we had not seen yet
				const s = sharedRoots!.get(id);
				if (!s) throw e;
				key = core.open_shared_key(master(), secret(), s, id);
			}
		} else if (dto.owner_id === session.user?.id || !session.user) {
			key = core.unwrap_node_key(master(), id, dto.wrapped_key);
		} else {
			throw new ApiError(404, 'not found');
		}
	}
	keys.set(id, key);
	return key;
}

function decrypt(dto: NodeDto, key: string): FsNode {
	let meta = { mtime_ms: 0, executable: false };
	try {
		meta = JSON.parse(core.decrypt_meta(key, dto.id, dto.enc_meta));
	} catch {}
	return {
		id: dto.id,
		parentId: dto.parent_id,
		ownerId: dto.owner_id,
		kind: dto.kind,
		name: core.decrypt_name(key, dto.id, dto.enc_name),
		mtime: meta.mtime_ms,
		executable: meta.executable,
		headVersion: dto.head_version,
		size: dto.size,
		deleted: dto.deleted,
		updatedAt: dto.updated_at,
		access: dto.access
	};
}

function decryptList(list: NodeDto[], parentKey: string): FsNode[] {
	return list.map((dto) => {
		const key = core.unwrap_node_key(parentKey, dto.id, dto.wrapped_key);
		keys.set(dto.id, key);
		return decrypt(dto, key);
	});
}

const byName = (a: FsNode, b: FsNode) => (a.kind === 'folder' ? 0 : 1) - (b.kind === 'folder' ? 0 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export async function listFolder(parent: string | null): Promise<FsNode[]> {
	const q = parent ? `?parent=${parent}` : '';
	const list = await api<NodeDto[]>('GET', `/nodes${q}`);
	return decryptList(list, parent ? await nodeKey(parent) : master()).sort(byName);
}

export async function getNode(id: string): Promise<FsNode> {
	const dto = await api<NodeDto>('GET', `/nodes/${id}`);
	return decrypt(dto, await nodeKey(id));
}

export async function sharedWithMe(): Promise<FsNode[]> {
	const list = await api<NodeDto[]>('GET', '/shared');
	await loadShared(true);
	return list
		.map((dto) => {
			const key = core.open_shared_key(master(), secret(), dto.wrapped_key, dto.id);
			keys.set(dto.id, key);
			return decrypt(dto, key);
		})
		.sort(byName);
}

export async function trashList(): Promise<FsNode[]> {
	const list = await api<NodeDto[]>('GET', '/nodes?trash=true');
	const out: FsNode[] = [];
	for (const dto of list) out.push(decrypt(dto, await nodeKey(dto.id)));
	return out;
}

/** Ancestors from the root down to (and including) `id`, for breadcrumbs. */
export async function pathTo(id: string | null): Promise<FsNode[]> {
	const chain: FsNode[] = [];
	let cur = id;
	while (cur) {
		let n: FsNode;
		try {
			n = await getNode(cur);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) break; // above a share root
			throw e;
		}
		chain.unshift(n);
		cur = n.parentId;
	}
	return chain;
}

export function validateName(name: string) {
	core.validate_name(name);
}

async function createNode(parent: string | null, kind: 'file' | 'folder' | 'kv', name: string, meta = { mtime_ms: 0, executable: false }): Promise<{ node: FsNode; key: string }> {
	validateName(name);
	const id = core.new_uuid();
	const key = core.new_key();
	const parentKey = parent ? await nodeKey(parent) : master();
	const dto = await api<NodeDto>('POST', '/nodes', {
		id,
		parent_id: parent,
		kind,
		enc_name: core.encrypt_name(key, id, name),
		enc_meta: core.encrypt_meta(key, id, JSON.stringify(meta)),
		wrapped_key: core.wrap_node_key(parentKey, id, key)
	});
	keys.set(id, key);
	return { node: decrypt(dto, key), key };
}

export const createFolder = async (parent: string | null, name: string) => (await createNode(parent, 'folder', name)).node;

export async function rename(id: string, name: string) {
	validateName(name);
	const key = await nodeKey(id);
	await api('PATCH', `/nodes/${id}`, { enc_name: core.encrypt_name(key, id, name) });
}

export async function moveTo(id: string, newParent: string | null) {
	const key = await nodeKey(id);
	const parentKey = newParent ? await nodeKey(newParent) : master();
	await api('PATCH', `/nodes/${id}`, { parent_id: newParent, to_root: newParent === null, wrapped_key: core.wrap_node_key(parentKey, id, key) });
}

export const trash = (id: string) => api('DELETE', `/nodes/${id}`);
export const restore = (id: string) => api('POST', `/nodes/${id}/restore`);
export const purge = (id: string) => api('DELETE', `/trash/${id}`);

// ---------- content ----------

const BLOCK = 8 * 1024 * 1024;

export interface Progress {
	done: number;
	total: number;
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(size, items.length) }, async () => {
			while (i < items.length) await fn(items[i++]);
		})
	);
}

/** Encrypt `blob` into chunks, upload the ones the server lacks, and publish a new version. */
export async function uploadContent(id: string, base: string | null, blob: Blob, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<void> {
	const key = await nodeKey(id);
	const enc = new core.BlockEncryptor(key, id);
	try {
		for (let off = 0; off < blob.size || off === 0; off += BLOCK) {
			if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
			const block = new Uint8Array(await blob.slice(off, off + BLOCK).arrayBuffer());
			enc.push_block(block);
			const chunks: { hash: string; data: Uint8Array }[] = [];
			for (let h = enc.next_hash(); h; h = enc.next_hash()) chunks.push({ hash: h, data: enc.take_chunk() });
			if (chunks.length) {
				const { missing } = await api<{ missing: string[] }>('POST', '/chunks/missing', { hashes: chunks.map((c) => c.hash) });
				const need = new Set(missing);
				await pool(
					chunks.filter((c) => need.has(c.hash)),
					4,
					(c) => apiPutBytes(`/chunks/${c.hash}`, c.data)
				);
			}
			onProgress?.({ done: Math.min(off + BLOCK, blob.size), total: blob.size });
			if (blob.size === 0) break;
		}
		const fin = JSON.parse(enc.finish());
		await api('POST', `/nodes/${id}/versions`, { id: core.new_uuid(), base_version: base, size: fin.size, manifest: fin.manifest, chunks: fin.chunks });
	} finally {
		enc.free();
	}
}

export async function uploadFile(parent: string | null, file: File, onProgress?: (p: Progress) => void, signal?: AbortSignal): Promise<FsNode> {
	const { node } = await createNode(parent, 'file', file.name, { mtime_ms: file.lastModified, executable: false });
	try {
		await uploadContent(node.id, null, file, onProgress, signal);
	} catch (e) {
		await trash(node.id).catch(() => {}); // do not leave an empty placeholder behind
		throw e;
	}
	return getNode(node.id);
}

/** Replace the content of an existing file with a new version. */
export async function uploadNewVersion(node: FsNode, file: Blob, onProgress?: (p: Progress) => void) {
	const fresh = await api<NodeDto>('GET', `/nodes/${node.id}`);
	await uploadContent(node.id, fresh.head_version, file, onProgress);
}

type Fetcher = (path: string) => Promise<Uint8Array>;

async function* readChunks(key: string, nodeId: string, v: { manifest: string }, fetchChunk: Fetcher): AsyncGenerator<Uint8Array> {
	const manifest = JSON.parse(core.open_manifest(key, nodeId, v.manifest)) as { chunks: { hash: string }[]; content_hash: string };
	const hasher = new core.ContentHasher();
	try {
		for (const c of manifest.chunks) {
			const plain = core.decrypt_chunk(key, nodeId, await fetchChunk(`/chunks/${c.hash}`), c.hash);
			hasher.update(plain);
			yield plain;
		}
		if (hasher.finalize() !== manifest.content_hash) throw new Error('Downloaded data failed its integrity check.');
	} finally {
		hasher.free();
	}
}

export async function* downloadChunks(node: FsNode, version?: string): AsyncGenerator<Uint8Array> {
	const key = await nodeKey(node.id);
	const vid = version ?? node.headVersion;
	if (!vid) return;
	const v = await api<VersionDto>('GET', `/versions/${vid}`);
	yield* readChunks(key, node.id, v, (p) => apiGetBytes(p));
}

export async function downloadBlob(node: FsNode, version?: string, onProgress?: (p: Progress) => void, mime?: string): Promise<Blob> {
	const parts: BlobPart[] = [];
	let done = 0;
	for await (const c of downloadChunks(node, version)) {
		parts.push(c as unknown as BlobPart);
		done += c.length;
		onProgress?.({ done, total: node.size });
	}
	return new Blob(parts, mime ? { type: mime } : undefined);
}

/** Save to disk. Streams straight to a file where the browser supports it, otherwise via a Blob. */
export async function saveToDisk(node: FsNode, version?: string, onProgress?: (p: Progress) => void) {
	const picker = (window as any).showSaveFilePicker as undefined | ((o: any) => Promise<any>);
	if (picker && node.size > 64 * 1024 * 1024) {
		const handle = await picker({ suggestedName: node.name });
		const w = await handle.createWritable();
		let done = 0;
		try {
			for await (const c of downloadChunks(node, version)) {
				await w.write(c);
				done += c.length;
				onProgress?.({ done, total: node.size });
			}
			await w.close();
		} catch (e) {
			await w.abort?.();
			throw e;
		}
		return;
	}
	const blob = await downloadBlob(node, version, onProgress);
	const url = URL.createObjectURL(blob);
	Object.assign(document.createElement('a'), { href: url, download: node.name }).click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- versions ----------

export async function versionsOf(node: FsNode): Promise<FileVersion[]> {
	const key = await nodeKey(node.id);
	const list = await api<VersionDto[]>('GET', `/nodes/${node.id}/versions`);
	return list.map((v) => {
		const m = JSON.parse(core.open_manifest(key, node.id, v.manifest));
		return { id: v.id, parentVersion: v.parent_version, size: m.size, createdAt: v.created_at, device: v.device, contentHash: m.content_hash };
	});
}

export async function restoreVersion(node: FsNode, versionId: string) {
	const head = (await api<NodeDto>('GET', `/nodes/${node.id}`)).head_version;
	const old = await api<VersionDto>('GET', `/versions/${versionId}`);
	await api('POST', `/nodes/${node.id}/versions`, { id: core.new_uuid(), base_version: head, size: old.size, manifest: old.manifest, chunks: old.chunks });
}

// ---------- sharing ----------

export interface Share {
	id: string;
	node_id: string;
	grantee: string;
	permission: 'rw' | 'ro';
}
export interface LinkInfo {
	id: string;
	node_id: string;
	has_password: boolean;
	expires_at: number | null;
	max_downloads: number | null;
	downloads: number;
}

export const listShares = (nodeId: string) => api<Share[]>('GET', `/shares?node_id=${nodeId}`);
export const removeShare = (id: string) => api('DELETE', `/shares/${id}`);

export async function shareWith(nodeId: string, username: string, permission: 'rw' | 'ro') {
	const { public_key } = await api<{ public_key: string }>('GET', `/users/${encodeURIComponent(username.toLowerCase())}/pubkey`).catch((e) => {
		throw e instanceof ApiError && e.status === 404 ? new Error(`There is no user called “${username}”.`) : e;
	});
	const key = await nodeKey(nodeId);
	return api<Share>('POST', '/shares', { node_id: nodeId, grantee: username, permission, sealed_key: core.share_key_with(public_key, key, nodeId) });
}

export const listLinks = (nodeId: string) => api<LinkInfo[]>('GET', `/links?node_id=${nodeId}`);
export const removeLink = (id: string) => api('DELETE', `/links/${id}`);

export async function createLink(nodeId: string, opts: { password?: string; expiresAt?: number; maxDownloads?: number }): Promise<string> {
	const key = await nodeKey(nodeId);
	const env = JSON.parse(core.make_link_envelope(key, nodeId));
	const r = await api<{ id: string; token: string }>('POST', '/links', {
		node_id: nodeId,
		password: opts.password || null,
		expires_at: opts.expiresAt ?? null,
		max_downloads: opts.maxDownloads ?? null,
		key_envelope: env.envelope
	});
	return `${location.origin}/s/${r.token}#k=${env.link_key}`;
}

// ---------- key/value ----------

export interface KvEntry {
	key: string;
	value: Uint8Array;
	version: number;
}

export const createNamespace = async (parent: string | null, name: string) => (await createNode(parent, 'kv', name)).node;

export async function kvList(ns: string, prefix = ''): Promise<KvEntry[]> {
	const key = await nodeKey(ns);
	const list = await api<{ key: string; value: string; version: number }[]>('GET', `/kv/${ns}/list?prefix=${encodeURIComponent(prefix)}`);
	return list.map((e) => ({ key: e.key, version: e.version, value: core.decrypt_kv(key, ns, e.key, e.value) }));
}

export async function kvPut(ns: string, k: string, value: Uint8Array, ifVersion?: number): Promise<KvEntry> {
	const key = await nodeKey(ns);
	const e = await api<{ key: string; version: number }>('PUT', `/kv/${ns}/e/${encodeURIComponent(k)}`, { value: core.encrypt_kv(key, ns, k, value), if_version: ifVersion ?? null });
	return { key: e.key, version: e.version, value };
}

export const kvDelete = (ns: string, k: string, ifVersion?: number) => api('DELETE', `/kv/${ns}/e/${encodeURIComponent(k)}${ifVersion !== undefined ? `?if_version=${ifVersion}` : ''}`);

// ---------- public links (no account) ----------

export class PublicLink {
	private keysById = new Map<string, string>();
	root!: FsNode;
	constructor(
		public token: string,
		private linkKey: string,
		private password: string | null
	) {}

	private headers(): Record<string, string> {
		return this.password ? { 'x-link-password': this.password } : {};
	}
	private get<T>(path: string) {
		return api<T>('GET', `/public/${this.token}${path}`, undefined, { token: null, headers: this.headers() });
	}

	async open(): Promise<FsNode> {
		const r = await this.get<{ node: NodeDto; key_envelope: string }>('');
		const key = core.open_link_envelope(this.linkKey, r.node.id, r.key_envelope);
		this.keysById.set(r.node.id, key);
		this.root = decrypt({ ...r.node, access: 'ro' }, key);
		return this.root;
	}

	async list(parent: FsNode): Promise<FsNode[]> {
		const pk = this.keysById.get(parent.id)!;
		const list = await this.get<NodeDto[]>(`/nodes?parent=${parent.id}`);
		return list
			.map((dto) => {
				const k = core.unwrap_node_key(pk, dto.id, dto.wrapped_key);
				this.keysById.set(dto.id, k);
				return decrypt({ ...dto, access: 'ro' }, k);
			})
			.sort(byName);
	}

	async *chunks(node: FsNode): AsyncGenerator<Uint8Array> {
		const v = await this.get<VersionDto>(`/versions/${node.id}`);
		yield* readChunks(this.keysById.get(node.id)!, node.id, v, (p) => apiGetBytes(`/public/${this.token}${p}`, this.headers(), null));
	}

	async save(node: FsNode) {
		const parts: BlobPart[] = [];
		for await (const c of this.chunks(node)) parts.push(c as unknown as BlobPart);
		const url = URL.createObjectURL(new Blob(parts));
		Object.assign(document.createElement('a'), { href: url, download: node.name }).click();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}
}
