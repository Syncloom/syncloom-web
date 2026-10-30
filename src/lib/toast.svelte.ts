export type Toast = { id: number; text: string; kind: 'info' | 'ok' | 'error' };
export const toasts = $state<Toast[]>([]);
let next = 1;

export function notify(text: string, kind: Toast['kind'] = 'info', ms = 4200) {
	const id = next++;
	toasts.push({ id, text, kind });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i >= 0) toasts.splice(i, 1);
	}, ms);
}
export const fail = (e: unknown) => notify(e instanceof Error ? e.message : String(e), 'error', 6000);
