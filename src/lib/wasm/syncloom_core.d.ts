/* tslint:disable */
/* eslint-disable */

/**
 * Chunk and encrypt one block of a file. JSON result: `[{ "hash": "...", "len": n }, ...]`; the
 * ciphertexts are returned through `take_chunk`. Process big files block by block (e.g. 16 MiB).
 */
export class BlockEncryptor {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Finish: returns JSON `{ manifest (sealed, base64url), size, chunks: [hashes] }`.
     */
    finish(): string;
    constructor(node_key: string, node_id: string);
    /**
     * Hash of the next ready chunk, or an empty string when none is left.
     */
    next_hash(): string;
    /**
     * Returns the number of chunks produced for this block.
     */
    push_block(data: Uint8Array): number;
    /**
     * Ciphertext of the next ready chunk (removes it from the queue).
     */
    take_chunk(): Uint8Array;
}

/**
 * Incremental BLAKE3 over decrypted content, to verify `content_hash` after a download.
 */
export class ContentHasher {
    free(): void;
    [Symbol.dispose](): void;
    finalize(): string;
    constructor();
    update(data: Uint8Array): void;
}

/**
 * The value sent to the server instead of the password. `kdf_json` comes from `/auth/prelogin`.
 */
export function auth_secret(password: string, kdf_json: string): string;

export function collision_key(name: string): string;

export function decrypt_chunk(node_key: string, node_id: string, ciphertext: Uint8Array, hash: string): Uint8Array;

export function decrypt_kv(ns_key: string, ns_id: string, kv_key: string, enc: string): Uint8Array;

export function decrypt_meta(node_key: string, node_id: string, enc: string): string;

export function decrypt_name(node_key: string, node_id: string, enc: string): string;

export function encrypt_kv(ns_key: string, ns_id: string, kv_key: string, value: Uint8Array): string;

export function encrypt_meta(node_key: string, node_id: string, meta_json: string): string;

export function encrypt_name(node_key: string, node_id: string, name: string): string;

export function init(): void;

/**
 * Link envelope: the node key encrypted with a fresh link key. Returns JSON `{ link_key, envelope }`.
 */
export function make_link_envelope(node_key: string, node_id: string): string;

export function new_key(): string;

export function new_uuid(): string;

export function normalize_name(name: string): string;

export function open_link_envelope(link_key: string, node_id: string, envelope: string): string;

/**
 * Returns JSON of the manifest: `{ size, content_hash, chunks: [{hash, len}] }`.
 */
export function open_manifest(node_key: string, node_id: string, sealed: string): string;

export function open_shared_key(master: string, secret: string, sealed: string, node_id: string): string;

export function share_key_with(recipient_public: string, node_key: string, node_id: string): string;

export function unwrap_node_key(parent_key: string, node_id: string, wrapped: string): string;

export function validate_name(name: string): void;

/**
 * Returns JSON `{ bundle, auth_secret }` with the master key re-wrapped under the new password.
 */
export function vault_change_password(master: string, secret: string, bundle_json: string, new_password: string): string;

/**
 * Returns JSON: `{ bundle, recovery_key, auth_secret, master, secret }`.
 */
export function vault_create(password: string): string;

/**
 * Returns JSON `{ master, secret }`.
 */
export function vault_unlock(password: string, bundle_json: string): string;

export function vault_unlock_recovery(recovery_key: string, bundle_json: string): string;

export function wrap_node_key(parent_key: string, node_id: string, node_key: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_blockencryptor_free: (a: number, b: number) => void;
    readonly __wbg_contenthasher_free: (a: number, b: number) => void;
    readonly auth_secret: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly blockencryptor_finish: (a: number) => [number, number, number, number];
    readonly blockencryptor_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly blockencryptor_next_hash: (a: number) => [number, number];
    readonly blockencryptor_push_block: (a: number, b: number, c: number) => [number, number, number];
    readonly blockencryptor_take_chunk: (a: number) => [number, number];
    readonly collision_key: (a: number, b: number) => [number, number];
    readonly contenthasher_finalize: (a: number) => [number, number];
    readonly contenthasher_new: () => number;
    readonly contenthasher_update: (a: number, b: number, c: number) => void;
    readonly decrypt_chunk: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly decrypt_kv: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly decrypt_meta: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly decrypt_name: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly encrypt_kv: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly encrypt_meta: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly encrypt_name: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly init: () => void;
    readonly make_link_envelope: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly new_key: () => [number, number];
    readonly new_uuid: () => [number, number];
    readonly normalize_name: (a: number, b: number) => [number, number];
    readonly open_link_envelope: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly open_manifest: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly open_shared_key: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly share_key_with: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly unwrap_node_key: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly validate_name: (a: number, b: number) => [number, number];
    readonly vault_change_password: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly vault_create: (a: number, b: number) => [number, number, number, number];
    readonly vault_unlock: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly vault_unlock_recovery: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wrap_node_key: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
