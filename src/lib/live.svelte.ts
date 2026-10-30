// Server push: a gRPC-Web stream of change events. Views watch `live.tick` and refresh themselves.
import { api } from './api';
import { subscribe, type ChangeEvent } from './grpcweb';
import { session } from './session.svelte';

export const live = $state({ tick: 0, connected: false, cursor: 0, last: null as ChangeEvent | null });

let ctl: AbortController | null = null;

export async function startLive() {
	stopLive();
	ctl = new AbortController();
	try {
		const head = await api<{ next_cursor: number }>('GET', '/changes/head');
		live.cursor = head.next_cursor;
	} catch {
		live.cursor = 0;
	}
	void subscribe({
		token: () => session.token,
		since: () => live.cursor,
		onChange: (c) => {
			live.cursor = c.cursor;
			live.last = c;
			live.tick++;
		},
		onConnectionChange: (v) => (live.connected = v),
		signal: ctl.signal
	});
}

export function stopLive() {
	ctl?.abort();
	ctl = null;
	live.connected = false;
}
