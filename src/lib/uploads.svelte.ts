import { uploadFile, createFolder, type FsNode } from './fs';

export type UploadItem = { id: number; name: string; done: number; total: number; state: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'; error?: string; ctl: AbortController };
export const uploads = $state<{ items: UploadItem[]; open: boolean }>({ items: [], open: true });

let seq = 1;
let running = 0;
const queue: (() => Promise<void>)[] = [];
const MAX = 2;

function pump() {
	while (running < MAX && queue.length) {
		const job = queue.shift()!;
		running++;
		job().finally(() => {
			running--;
			pump();
		});
	}
}

/** Upload files below `parent`; `rel` paths ("a/b/c.txt") create the folders on the way. */
export function enqueueUploads(parent: string | null, files: { file: File; rel?: string }[], onFinished?: () => void) {
	const folderCache = new Map<string, Promise<string | null>>();
	const ensureFolder = (path: string[]): Promise<string | null> => {
		if (!path.length) return Promise.resolve(parent);
		const key = path.join('/');
		let p = folderCache.get(key);
		if (!p) {
			p = ensureFolder(path.slice(0, -1)).then((up) => createFolder(up, path[path.length - 1]).then((n) => n.id));
			folderCache.set(key, p);
		}
		return p;
	};
	let pending = files.length;
	for (const { file, rel } of files) {
		const item: UploadItem = $state({ id: seq++, name: rel ?? file.name, done: 0, total: file.size, state: 'queued', ctl: new AbortController() });
		uploads.items.push(item);
		uploads.open = true;
		queue.push(async () => {
			if (item.ctl.signal.aborted) {
				item.state = 'cancelled';
			} else {
				item.state = 'uploading';
				try {
					const dir = await ensureFolder((rel ?? '').split('/').slice(0, -1).filter(Boolean));
					await uploadFile(dir, file, (p) => ((item.done = p.done), (item.total = p.total)), item.ctl.signal);
					item.state = 'done';
					item.done = item.total;
				} catch (e) {
					item.state = item.ctl.signal.aborted ? 'cancelled' : 'error';
					item.error = e instanceof Error ? e.message : String(e);
				}
			}
			if (--pending === 0) onFinished?.();
		});
	}
	pump();
}

export function clearFinished() {
	for (let i = uploads.items.length - 1; i >= 0; i--) if (['done', 'error', 'cancelled'].includes(uploads.items[i].state)) uploads.items.splice(i, 1);
}

/** Flatten a drag-and-drop DataTransfer (including dropped folders) into files with relative paths. */
export async function filesFromDrop(dt: DataTransfer): Promise<{ file: File; rel?: string }[]> {
	const out: { file: File; rel?: string }[] = [];
	const walk = async (entry: any, base: string) => {
		if (entry.isFile) {
			const file: File = await new Promise((res, rej) => entry.file(res, rej));
			out.push({ file, rel: base ? `${base}/${file.name}` : undefined });
		} else if (entry.isDirectory) {
			const reader = entry.createReader();
			const dir = base ? `${base}/${entry.name}` : entry.name;
			for (;;) {
				const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
				if (!batch.length) break;
				for (const e of batch) await walk(e, dir);
			}
		}
	};
	const entries = [...dt.items].map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
	if (entries.length) for (const e of entries) await walk(e, '');
	else for (const f of dt.files) out.push({ file: f });
	return out;
}

export type { FsNode };
