import { describe, expect, it } from 'vitest';
import { FrameParser, decodeChange, encodeSubscribe } from './grpcweb';

const enc = new TextEncoder();
function str(field: number, s: string) {
	const b = enc.encode(s);
	return [(field << 3) | 2, b.length, ...b];
}
function frame(flag: number, payload: number[]) {
	const f = new Uint8Array(5 + payload.length);
	new DataView(f.buffer).setUint32(1, payload.length);
	f[0] = flag;
	f.set(payload, 5);
	return f;
}

describe('grpc-web', () => {
	it('encodes the subscribe request', () => {
		expect([...encodeSubscribe(0)]).toEqual([0, 0, 0, 0, 0]);
		expect([...encodeSubscribe(300)]).toEqual([0, 0, 0, 0, 3, 0x08, 0xac, 0x02]);
	});

	it('decodes a change', () => {
		const payload = [0x08, 0xac, 0x02, ...str(2, 'node-1'), ...str(3, 'version'), ...str(4, 'v-9')];
		expect(decodeChange(new Uint8Array(payload))).toEqual({ cursor: 300, nodeId: 'node-1', kind: 'version', versionId: 'v-9', kvKey: '' });
	});

	it('reassembles frames split across reads and reports error trailers', () => {
		const p = new FrameParser();
		const a = frame(0, [0x08, 0x05]);
		expect(p.push(a.slice(0, 3))).toEqual([]);
		const out = p.push(a.slice(3));
		expect(out).toHaveLength(1);
		expect(decodeChange(out[0]).cursor).toBe(5);
		const trailer = [...enc.encode('grpc-status: 16\r\ngrpc-message: bad token\r\n')];
		expect(() => p.push(frame(0x80, trailer))).toThrow(/grpc status 16/);
		expect(new FrameParser().push(frame(0x80, [...enc.encode('grpc-status: 0\r\n')]))).toEqual([]);
	});
});
