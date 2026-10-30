export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
	let v = n / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(ms: number): string {
	const d = new Date(ms);
	const diff = Date.now() - ms;
	if (diff < 60_000) return 'just now';
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
	const sameYear = d.getFullYear() === new Date().getFullYear();
	return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function formatDateTime(ms: number): string {
	return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export type FileKind = { label: string; color: string; glyph: 'doc' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'sheet' | 'pdf' | 'file' };

const KINDS: [RegExp, FileKind][] = [
	[/\.(png|jpe?g|gif|webp|avif|svg|heic|bmp)$/i, { label: 'Image', color: '#e0599b', glyph: 'image' }],
	[/\.(mp4|mov|mkv|webm|avi|m4v)$/i, { label: 'Video', color: '#e5484d', glyph: 'video' }],
	[/\.(mp3|wav|flac|ogg|m4a|aac)$/i, { label: 'Audio', color: '#d9822b', glyph: 'audio' }],
	[/\.(zip|tar|gz|tgz|7z|rar|bz2|xz)$/i, { label: 'Archive', color: '#8b6f47', glyph: 'archive' }],
	[/\.pdf$/i, { label: 'PDF', color: '#e5484d', glyph: 'pdf' }],
	[/\.(xlsx?|csv|ods|numbers)$/i, { label: 'Spreadsheet', color: '#1aa46a', glyph: 'sheet' }],
	[/\.(docx?|odt|pages|rtf|md|txt)$/i, { label: 'Document', color: '#3e82f7', glyph: 'doc' }],
	[/\.(js|ts|tsx|jsx|rs|py|go|java|c|cpp|h|css|html|json|ya?ml|toml|sh|swift|kt|rb|php)$/i, { label: 'Code', color: '#6a5cff', glyph: 'code' }]
];

export function fileKind(name: string): FileKind {
	for (const [re, k] of KINDS) if (re.test(name)) return k;
	return { label: 'File', color: '#7a7a95', glyph: 'file' };
}

export const isImage = (name: string) => /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(name);
export const isTextLike = (name: string) => /\.(txt|md|json|ya?ml|toml|csv|log|rs|ts|js|py|go|sh|css|html|xml|ini|conf)$/i.test(name);

export function mimeFor(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	const m: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain' };
	return m[ext] ?? 'application/octet-stream';
}
