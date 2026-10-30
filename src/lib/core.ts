// The shared Rust core (crypto, chunking, names) compiled to WebAssembly.
import init, * as wasm from './wasm/syncloom_core.js';

let ready: Promise<void> | null = null;

export function loadCore(): Promise<void> {
	return (ready ??= init().then(() => undefined));
}

export const core = wasm;
