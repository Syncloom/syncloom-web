// A minimal gRPC-Web client for the one streaming call we need: Sync.Subscribe(since) -> stream Change.
// Hand-rolled protobuf keeps the bundle free of a protobuf runtime.

export interface ChangeEvent {
	cursor: number;
	nodeId: string;
	kind: string;
	versionId: string;
	kvKey: string;
}

function varint(n: number): number[] {
	const out: number[] = [];
	while (n > 127) {
		out.push((n % 128) | 128);
		n = Math.floor(n / 128);
	}
	out.push(n);
	return out;
}

export function encodeSubscribe(since: number): Uint8Array {
	const msg = since > 0 ? [0x08, ...varint(since)] : []; // field 1, varint
	const frame = new Uint8Array(5 + msg.length);
	new DataView(frame.buffer).setUint32(1, msg.length); // flag byte 0 = data
	frame.set(msg, 5);
	return frame;
}

export function decodeChange(buf: Uint8Array): ChangeEvent {
	const ev: ChangeEvent = { cursor: 0, nodeId: '', kind: '', versionId: '', kvKey: '' };
	const td = new TextDecoder();
	let i = 0;
	const readVarint = () => {
		let result = 0;
		let mul = 1;
		for (;;) {
			const b = buf[i++];
			result += (b & 127) * mul;
			if (b < 128) return result;
			mul *= 128;
		}
	};
	while (i < buf.length) {
		const tag = readVarint();
		const field = tag >> 3;
		const wire = tag & 7;
		if (wire === 0) {
			const v = readVarint();
			if (field === 1) ev.cursor = v;
		} else if (wire === 2) {
			const len = readVarint();
			const s = td.decode(buf.subarray(i, i + len));
			i += len;
			if (field === 2) ev.nodeId = s;
			else if (field === 3) ev.kind = s;
			else if (field === 4) ev.versionId = s;
			else if (field === 5) ev.kvKey = s;
		} else {
			throw new Error('unsupported wire type');
		}
	}
	return ev;
}

/** Splits a byte stream into gRPC-Web frames. Returns data payloads; throws on a non-OK trailer. */
export class FrameParser {
	private buf = new Uint8Array(0);

	push(chunk: Uint8Array): Uint8Array[] {
		const joined = new Uint8Array(this.buf.length + chunk.length);
		joined.set(this.buf);
		joined.set(chunk, this.buf.length);
		this.buf = joined;
		const out: Uint8Array[] = [];
		while (this.buf.length >= 5) {
			const flag = this.buf[0];
			const len = new DataView(this.buf.buffer, this.buf.byteOffset).getUint32(1);
			if (this.buf.length < 5 + len) break;
			const payload = this.buf.slice(5, 5 + len);
			this.buf = this.buf.slice(5 + len);
			if (flag & 0x80) {
				const trailer = new TextDecoder().decode(payload);
				const status = /grpc-status:\s*(\d+)/i.exec(trailer)?.[1];
				if (status && status !== '0') throw new Error(`grpc status ${status}: ${/grpc-message:\s*(.*)/i.exec(trailer)?.[1] ?? ''}`);
			} else {
				out.push(payload);
			}
		}
		return out;
	}
}

/**
 * Keeps a subscription alive (with backoff) until `signal` aborts. Heartbeats (cursor 0) are skipped.
 * `onConnectionChange` reports whether the live stream is currently up.
 */
export async function subscribe(opts: {
	token: () => string | null;
	since: () => number;
	onChange: (c: ChangeEvent) => void;
	onConnectionChange?: (live: boolean) => void;
	signal: AbortSignal;
	base?: string;
}) {
	let backoff = 1000;
	while (!opts.signal.aborted) {
		try {
			const res = await fetch(`${opts.base ?? ''}/syncloom.sync.v1.Sync/Subscribe`, {
				method: 'POST',
				headers: {
					'content-type': 'application/grpc-web+proto',
					'x-grpc-web': '1',
					accept: 'application/grpc-web+proto',
					authorization: `Bearer ${opts.token()}`
				},
				body: encodeSubscribe(opts.since()) as unknown as BodyInit,
				signal: opts.signal
			});
			if (!res.ok || !res.body) throw new Error(`http ${res.status}`);
			opts.onConnectionChange?.(true);
			backoff = 1000;
			const reader = res.body.getReader();
			const parser = new FrameParser();
			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;
				for (const payload of parser.push(value)) {
					const c = decodeChange(payload);
					if (c.cursor !== 0) opts.onChange(c);
				}
			}
		} catch (e) {
			if (opts.signal.aborted) return;
		}
		opts.onConnectionChange?.(false);
		await new Promise((r) => setTimeout(r, backoff));
		backoff = Math.min(backoff * 2, 30000);
	}
}
