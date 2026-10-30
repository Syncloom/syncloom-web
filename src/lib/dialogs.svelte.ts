// Promise-based confirm/prompt dialogs rendered by <DialogHost/>.
export type Ask =
	| { kind: 'confirm'; title: string; body?: string; confirm: string; danger?: boolean; resolve: (v: boolean) => void }
	| { kind: 'prompt'; title: string; body?: string; value: string; confirm: string; resolve: (v: string | null) => void };

export const dialogs = $state<{ current: Ask | null }>({ current: null });

export function confirmDialog(title: string, opts: { body?: string; confirm?: string; danger?: boolean } = {}): Promise<boolean> {
	return new Promise((resolve) => {
		dialogs.current = { kind: 'confirm', title, body: opts.body, confirm: opts.confirm ?? 'Confirm', danger: opts.danger, resolve };
	});
}

export function promptDialog(title: string, opts: { body?: string; value?: string; confirm?: string } = {}): Promise<string | null> {
	return new Promise((resolve) => {
		dialogs.current = { kind: 'prompt', title, body: opts.body, value: opts.value ?? '', confirm: opts.confirm ?? 'OK', resolve };
	});
}
