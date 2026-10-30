# syncloom-web

The Syncloom web app (SvelteKit 5, TypeScript). Encryption runs in the browser through the WebAssembly build of the core; live updates use gRPC-Web. Features: files with drag and drop, previews, versions, trash, key/value browser, sharing and public links, security keys, admin.

Part of [Syncloom](https://github.com/Syncloom), a self-hosted, end-to-end encrypted file sync and key/value store. Status: **public preview (0.1)**.

```bash
./build-wasm.sh                  # rebuild src/lib/wasm from ../syncloom-core (needs Rust and wasm-bindgen-cli 0.2.129)
npm ci && npm run build          # static build
```
The browser test suite lives in `e2e/` (Playwright) and runs against the stack from syncloom-deploy.

## Working with the other repositories

The Syncloom repositories reference each other by relative path. Clone the ones you need **side by side in one folder**, for example `syncloom-core`, `syncloom-server` and `syncloom-web` next to each other.

## License

Apache License 2.0, see [LICENSE](LICENSE).
