#!/bin/sh
# Rebuilds the WebAssembly bindings from ../syncloom-core into src/lib/wasm (needs rust + wasm-bindgen-cli 0.2.129).
set -e
cd "$(dirname "$0")/../syncloom-core"
cargo build --no-default-features --features wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir ../syncloom-web/src/lib/wasm --out-name syncloom_core target/wasm32-unknown-unknown/release/syncloom_core.wasm
