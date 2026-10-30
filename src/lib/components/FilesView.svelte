<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { listFolder, pathTo, createFolder, rename, trash, moveTo, saveToDisk, uploadNewVersion, type FsNode } from '$lib/fs';
	import { enqueueUploads, filesFromDrop } from '$lib/uploads.svelte';
	import { live } from '$lib/live.svelte';
	import { formatBytes, formatDate } from '$lib/format';
	import { confirmDialog, promptDialog } from '$lib/dialogs.svelte';
	import { notify, fail } from '$lib/toast.svelte';
	import { refreshUser } from '$lib/session.svelte';
	import Icon from './Icon.svelte';
	import FileIcon from './FileIcon.svelte';
	import Menu from './Menu.svelte';
	import ShareDialog from './ShareDialog.svelte';
	import VersionsDialog from './VersionsDialog.svelte';
	import MoveDialog from './MoveDialog.svelte';
	import PreviewDialog from './PreviewDialog.svelte';
	import UploadTray from './UploadTray.svelte';

	let { parentId = null, readonlyRoot = false }: { parentId?: string | null; readonlyRoot?: boolean } = $props();

	let items = $state<FsNode[]>([]);
	let crumbs = $state<FsNode[]>([]);
	let loading = $state(true);
	let failed = $state('');
	let view = $state<'list' | 'grid'>('list');
	let selected = $state(new Set<string>());
	let filter = $state('');
	let sort = $state<{ by: 'name' | 'size' | 'date'; dir: 1 | -1 }>({ by: 'name', dir: 1 });
	let menu = $state<{ x: number; y: number; node: FsNode | null } | null>(null);
	let dragging = $state(0);
	let dragIds = $state<string[]>([]); // nodes being dragged inside the app, to move them
	let dropTarget = $state<string | null>(null); // folder or breadcrumb under the pointer
	let share = $state<FsNode | null>(null);
	let versions = $state<FsNode | null>(null);
	let preview = $state<FsNode | null>(null);
	let moving = $state<FsNode[] | null>(null);
	let fileInput: HTMLInputElement;
	let folderInput: HTMLInputElement;
	let versionInput: HTMLInputElement;
	let versionTarget: FsNode | null = null;

	const here = $derived(crumbs[crumbs.length - 1] ?? null);
	const canWrite = $derived(!readonlyRoot || (here ? here.access !== 'ro' : false));
	const shown = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : [...items];
		const k = sort.dir;
		return list.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
			if (sort.by === 'size') return (a.size - b.size) * k;
			if (sort.by === 'date') return ((a.mtime || a.updatedAt) - (b.mtime || b.updatedAt)) * k;
			return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * k;
		});
	});

	onMount(() => {
		view = (localStorage.getItem('syncloom.view') as 'list' | 'grid') ?? 'list';
	});
	$effect(() => localStorage.setItem('syncloom.view', view));

	async function load(quiet = false) {
		if (!quiet) loading = true;
		failed = '';
		try {
			const [list, path] = await Promise.all([listFolder(parentId), pathTo(parentId)]);
			items = list;
			crumbs = path;
			selected = new Set([...selected].filter((id) => list.some((n) => n.id === id)));
		} catch (e) {
			failed = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		parentId;
		void load();
	});
	let lastTick = live.tick;
	$effect(() => {
		if (live.tick !== lastTick) {
			lastTick = live.tick;
			void load(true);
		}
	});

	const open = (n: FsNode) => (n.kind === 'folder' ? goto(`/f/${n.id}`) : n.kind === 'kv' ? goto(`/kv/${n.id}`) : (preview = n));

	async function newFolder() {
		const name = await promptDialog('New folder', { confirm: 'Create', value: 'Untitled folder' });
		if (!name) return;
		try {
			await createFolder(parentId, name.trim());
			await load(true);
		} catch (e) {
			fail(e);
		}
	}
	async function doRename(n: FsNode) {
		const name = await promptDialog(`Rename “${n.name}”`, { confirm: 'Rename', value: n.name });
		if (!name || name === n.name) return;
		try {
			await rename(n.id, name.trim());
			await load(true);
		} catch (e) {
			fail(e);
		}
	}
	async function remove(nodes: FsNode[]) {
		const label = nodes.length === 1 ? `“${nodes[0].name}”` : `${nodes.length} items`;
		if (!(await confirmDialog(`Move ${label} to the trash?`, { body: 'You can restore it from the trash for a limited time.', confirm: 'Move to trash', danger: true }))) return;
		try {
			for (const n of nodes) await trash(n.id);
			selected = new Set();
			notify(`${label} moved to the trash`, 'ok');
			await load(true);
			void refreshUser();
		} catch (e) {
			fail(e);
		}
	}
	async function moveInto(list: FsNode[], target: string | null) {
		try {
			for (const n of list) await moveTo(n.id, target);
			notify(`Moved ${list.length === 1 ? `“${list[0].name}”` : `${list.length} items`}`, 'ok');
			selected = new Set();
			await load(true);
		} catch (e) {
			fail(e);
			await load(true);
		}
	}
	async function doMove(target: string | null) {
		const list = moving!;
		moving = null;
		await moveInto(list, target);
	}

	// drag and drop: items can be dragged onto folders and breadcrumbs to move them; files from the desktop can be dropped onto a folder
	const MIME = 'application/x-syncloom-nodes';
	const isInternal = (e: DragEvent) => dragIds.length > 0 || !!e.dataTransfer?.types.includes(MIME);
	const isDest = (n: FsNode) => n.kind === 'folder' && n.access !== 'ro' && !dragIds.includes(n.id);
	function dragStart(n: FsNode, e: DragEvent) {
		if (!e.dataTransfer) return;
		if (!selected.has(n.id)) selected = new Set([n.id]);
		dragIds = [...selected];
		e.dataTransfer.setData(MIME, JSON.stringify(dragIds));
		e.dataTransfer.effectAllowed = 'move';
	}
	function dragEnd() {
		dragIds = [];
		dropTarget = null;
	}
	function targetOver(e: DragEvent, key: string, ok: boolean, external = false) {
		if (!ok || (!isInternal(e) && !external)) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = isInternal(e) ? 'move' : 'copy';
		dropTarget = key;
	}
	const targetLeave = (key: string) => {
		if (dropTarget === key) dropTarget = null;
	};
	async function targetDrop(e: DragEvent, key: string, dest: string | null, ok: boolean, external = false) {
		if (!ok || (!isInternal(e) && !external)) return;
		e.preventDefault();
		e.stopPropagation();
		dropTarget = null;
		dragging = 0;
		if (isInternal(e)) {
			const list = items.filter((i) => dragIds.includes(i.id));
			dragIds = [];
			await moveInto(list, dest);
		} else if (e.dataTransfer) {
			upload(await filesFromDrop(e.dataTransfer), dest);
		}
	}

	function upload(files: { file: File; rel?: string }[], dest: string | null = parentId) {
		if (!files.length) return;
		enqueueUploads(dest, files, () => {
			void load(true);
			void refreshUser();
		});
	}
	function picked(e: Event, withPaths = false) {
		const input = e.target as HTMLInputElement;
		const fs = [...(input.files ?? [])].map((file) => ({ file, rel: withPaths ? ((file as any).webkitRelativePath as string) : undefined }));
		input.value = '';
		upload(fs);
	}
	async function replaceContent(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !versionTarget) return;
		try {
			await uploadNewVersion(versionTarget, file);
			notify(`Uploaded a new version of “${versionTarget.name}”`, 'ok');
			await load(true);
		} catch (err) {
			fail(err);
		}
	}

	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragging = 0;
		if (isInternal(e)) return dragEnd();
		if (!canWrite || !e.dataTransfer) return;
		void filesFromDrop(e.dataTransfer).then(upload);
	}

	function pick(n: FsNode, e: MouseEvent | KeyboardEvent) {
		const s = new Set(e.metaKey || e.ctrlKey ? selected : []);
		if (s.has(n.id) && (e.metaKey || e.ctrlKey)) s.delete(n.id);
		else s.add(n.id);
		selected = s;
	}

	function nodeMenu(n: FsNode) {
		const many = selected.has(n.id) && selected.size > 1;
		const targets = many ? items.filter((i) => selected.has(i.id)) : [n];
		const w = n.access !== 'ro';
		return [
			{ label: n.kind === 'folder' ? 'Open' : 'Preview', icon: 'eye', action: () => open(n) },
			...(n.kind === 'file' ? [{ label: 'Download', icon: 'download', action: () => saveToDisk(n).catch(fail) }] : []),
			{ label: 'Share…', icon: 'share', disabled: n.access !== 'owner', action: () => (share = n) },
			'sep' as const,
			{ label: 'Rename', icon: 'edit', disabled: !w || many, action: () => doRename(n) },
			{ label: many ? `Move ${targets.length} items…` : 'Move…', icon: 'move', disabled: !w, action: () => (moving = targets) },
			...(n.kind === 'file'
				? [
						{ label: 'Version history', icon: 'history', action: () => (versions = n) },
						{
							label: 'Upload new version…',
							icon: 'upload',
							disabled: !w,
							action: () => ((versionTarget = n), versionInput.click())
						}
					]
				: []),
			'sep' as const,
			{ label: many ? `Move ${targets.length} items to trash` : 'Move to trash', icon: 'trash', danger: true, disabled: !w, action: () => remove(targets) }
		];
	}

	function key(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || menu || share || versions || preview || moving) return;
		if ((e.metaKey || e.ctrlKey) && e.key === 'a') (e.preventDefault(), (selected = new Set(shown.map((n) => n.id))));
		else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) remove(items.filter((i) => selected.has(i.id)));
		else if (e.key === 'Escape') selected = new Set();
		else if (e.key === 'F2' && selected.size === 1) doRename(items.find((i) => selected.has(i.id))!);
	}
	const sortBy = (by: typeof sort.by) => (sort = { by, dir: sort.by === by ? (-sort.dir as 1 | -1) : 1 });
</script>

<svelte:window onkeydown={key} />
<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
	class="files"
	ondragenter={(e) => (e.preventDefault(), canWrite && !isInternal(e) && dragging++)}
	ondragover={(e) => e.preventDefault()}
	ondragleave={() => (dragging = Math.max(0, dragging - 1))}
	ondrop={ondrop}
>
	<header class="bar">
		<nav class="crumbs" aria-label="Location">
			<button class="c" class:dropt={dropTarget === 'root'} ondragover={(e) => targetOver(e, 'root', !readonlyRoot && parentId !== null)} ondragleave={() => targetLeave('root')} ondrop={(e) => targetDrop(e, 'root', null, !readonlyRoot && parentId !== null)} onclick={() => goto(readonlyRoot ? '/shared' : '/')}><Icon name={readonlyRoot ? 'users' : 'cloud'} size={16} /> {readonlyRoot ? 'Shared with me' : 'My files'}</button>
			{#each crumbs as c, i}
				<Icon name="chevron" size={14} />
				<button class="c" class:cur={i === crumbs.length - 1} class:dropt={dropTarget === c.id} ondragover={(e) => targetOver(e, c.id, c.access !== 'ro' && c.id !== parentId)} ondragleave={() => targetLeave(c.id)} ondrop={(e) => targetDrop(e, c.id, c.id, c.access !== 'ro' && c.id !== parentId)} onclick={() => goto(`/f/${c.id}`)} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.name}</button>
			{/each}
		</nav>
		<div class="actions">
			<div class="search"><Icon name="search" size={15} /><input placeholder="Filter" bind:value={filter} aria-label="Filter files" /></div>
			<div class="seg" role="group" aria-label="View">
				<button class:on={view === 'list'} onclick={() => (view = 'list')} aria-label="List view" aria-pressed={view === 'list'}><Icon name="list" size={16} /></button>
				<button class:on={view === 'grid'} onclick={() => (view = 'grid')} aria-label="Grid view" aria-pressed={view === 'grid'}><Icon name="grid" size={16} /></button>
			</div>
			{#if canWrite}
				<button class="btn" onclick={newFolder}><Icon name="plus" size={16} /> Folder</button>
				<button class="btn primary" onclick={() => fileInput.click()}><Icon name="upload" size={16} /> Upload</button>
				<button class="btn icon" aria-label="Upload a folder" title="Upload a folder" onclick={() => folderInput.click()}><Icon name="folder" size={16} /></button>
			{/if}
		</div>
	</header>

	{#if selected.size > 0}
		<div class="sel card">
			<b>{selected.size} selected</b>
			<span class="grow"></span>
			<button class="btn sm" onclick={() => (moving = items.filter((i) => selected.has(i.id)))}><Icon name="move" size={14} /> Move</button>
			<button class="btn sm danger" onclick={() => remove(items.filter((i) => selected.has(i.id)))}><Icon name="trash" size={14} /> Trash</button>
			<button class="btn ghost icon sm" aria-label="Clear selection" onclick={() => (selected = new Set())}><Icon name="x" size={14} /></button>
		</div>
	{/if}

	{#if loading}
		<div class="state"><div class="spinner"></div></div>
	{:else if failed}
		<div class="state"><Icon name="warning" size={32} /><p>{failed}</p><button class="btn" onclick={() => load()}>Try again</button></div>
	{:else if !shown.length}
		<div class="state empty">
			<div class="art"><Icon name={filter ? 'search' : 'cloud'} size={40} stroke={1.4} /></div>
			<h2>{filter ? 'Nothing matches' : 'This folder is empty'}</h2>
			<p class="muted">{filter ? 'Try a different filter.' : canWrite ? 'Drop files anywhere on this page to upload them, encrypted on your device.' : 'Nothing has been shared in here yet.'}</p>
			{#if canWrite && !filter}<button class="btn primary" onclick={() => fileInput.click()}><Icon name="upload" size={16} /> Upload files</button>{/if}
		</div>
	{:else if view === 'list'}
		<div class="table card" role="table" aria-label="Files">
			<div class="row head" role="row">
				<button role="columnheader" class="name" onclick={() => sortBy('name')}>Name {#if sort.by === 'name'}<span>{sort.dir > 0 ? '↑' : '↓'}</span>{/if}</button>
				<button role="columnheader" class="col" onclick={() => sortBy('date')}>Modified {#if sort.by === 'date'}<span>{sort.dir > 0 ? '↑' : '↓'}</span>{/if}</button>
				<button role="columnheader" class="col num" onclick={() => sortBy('size')}>Size {#if sort.by === 'size'}<span>{sort.dir > 0 ? '↑' : '↓'}</span>{/if}</button>
				<span class="act"></span>
			</div>
			{#each shown as n (n.id)}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="row"
					class:sel={selected.has(n.id)}
					role="row"
					draggable={canWrite && n.access !== 'ro'}
					class:dropt={dropTarget === n.id}
					ondragstart={(e) => dragStart(n, e)}
					ondragend={dragEnd}
					ondragover={(e) => targetOver(e, n.id, isDest(n), true)}
					ondragleave={() => targetLeave(n.id)}
					ondrop={(e) => targetDrop(e, n.id, n.id, isDest(n), true)}
					tabindex="0"
					onclick={(e) => (e.detail === 2 ? open(n) : pick(n, e))}
					onkeydown={(e) => e.key === 'Enter' && open(n)}
					oncontextmenu={(e) => (e.preventDefault(), !selected.has(n.id) && (selected = new Set([n.id])), (menu = { x: e.clientX, y: e.clientY, node: n }))}
				>
					<span class="name" role="cell"><FileIcon name={n.name} kind={n.kind} size={36} /><span class="t">{n.name}</span>{#if n.kind === 'file' && !n.headVersion}<span class="badge neutral">uploading…</span>{/if}{#if n.access !== 'owner'}<span class="badge neutral">{n.access === 'rw' ? 'shared · edit' : 'shared · view'}</span>{/if}</span>
					<span class="col muted" role="cell">{formatDate(n.mtime || n.updatedAt)}</span>
					<span class="col num muted" role="cell">{n.kind === 'file' ? formatBytes(n.size) : '—'}</span>
					<span class="act" role="cell">
						{#if n.kind === 'file'}<button class="btn ghost icon sm" aria-label="Download {n.name}" disabled={!n.headVersion} onclick={(e) => (e.stopPropagation(), saveToDisk(n).catch(fail))}><Icon name="download" size={16} /></button>{/if}
						<button class="btn ghost icon sm" aria-label="More actions for {n.name}" onclick={(e) => (e.stopPropagation(), (selected = new Set([n.id])), (menu = { x: e.clientX - 150, y: e.clientY + 8, node: n }))}><Icon name="more" size={16} /></button>
					</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid">
			{#each shown as n (n.id)}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="tile card"
					class:sel={selected.has(n.id)}
					role="button"
					draggable={canWrite && n.access !== 'ro'}
					class:dropt={dropTarget === n.id}
					ondragstart={(e) => dragStart(n, e)}
					ondragend={dragEnd}
					ondragover={(e) => targetOver(e, n.id, isDest(n), true)}
					ondragleave={() => targetLeave(n.id)}
					ondrop={(e) => targetDrop(e, n.id, n.id, isDest(n), true)}
					tabindex="0"
					onclick={(e) => (e.detail === 2 ? open(n) : pick(n, e))}
					onkeydown={(e) => e.key === 'Enter' && open(n)}
					oncontextmenu={(e) => (e.preventDefault(), (selected = new Set([n.id])), (menu = { x: e.clientX, y: e.clientY, node: n }))}
				>
					<FileIcon name={n.name} kind={n.kind} size={64} />
					<b class="t" title={n.name}>{n.name}</b>
					<span class="muted small">{n.kind === 'file' ? formatBytes(n.size) : 'Folder'} · {formatDate(n.mtime || n.updatedAt)}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if dragging && !dropTarget}
		<div class="drop" aria-hidden="true"><div><Icon name="upload" size={34} /><b>Drop to upload</b><span>Files are encrypted before they leave your device</span></div></div>
	{/if}
</section>

<input bind:this={fileInput} type="file" multiple hidden onchange={(e) => picked(e)} />
<input bind:this={folderInput} type="file" multiple hidden onchange={(e) => picked(e, true)} {...{ webkitdirectory: true } as any} />
<input bind:this={versionInput} type="file" hidden onchange={replaceContent} />

{#if menu?.node}<Menu x={menu.x} y={menu.y} items={nodeMenu(menu.node)} onclose={() => (menu = null)} />{/if}
{#if share}<ShareDialog node={share} onclose={() => (share = null)} />{/if}
{#if versions}<VersionsDialog node={versions} onclose={() => (versions = null)} onchanged={() => load(true)} />{/if}
{#if preview}<PreviewDialog node={preview} onclose={() => (preview = null)} onversions={() => ((versions = preview), (preview = null))} />{/if}
{#if moving}<MoveDialog {moving} start={parentId} onpick={doMove} onclose={() => (moving = null)} />{/if}
<UploadTray />

<style>
	.files {
		display: grid;
		align-content: start;
		gap: 16px;
		position: relative;
		min-height: 60vh;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
	}
	.crumbs {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px;
		color: var(--muted);
		min-width: 0;
	}
	.c {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		background: none;
		border: 0;
		padding: 6px 9px;
		border-radius: 10px;
		font-weight: 650;
		font-size: 15px;
		color: inherit;
	}
	.c:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.c.cur {
		color: var(--text);
		font-size: 17px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--r-md);
		background: var(--surface);
		color: var(--muted);
	}
	.search input {
		border: 0;
		background: none;
		outline: none;
		padding: 9px 0;
		width: 110px;
		color: var(--text);
	}
	.seg {
		display: flex;
		padding: 3px;
		gap: 2px;
		background: var(--surface-2);
		border-radius: 12px;
	}
	.seg button {
		border: 0;
		background: transparent;
		padding: 6px 9px;
		border-radius: 9px;
		color: var(--muted);
		display: grid;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	/* floats above the content, so selecting never shifts the rows underneath the pointer */
	.sel.card {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: 22px;
		z-index: 35;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		min-width: min(420px, calc(100vw - 32px));
		box-shadow: var(--shadow-lg);
		background: var(--surface-glass);
		backdrop-filter: blur(16px);
		animation: pop 0.18s var(--ease);
	}
	.grow {
		flex: 1;
	}
	.table {
		overflow: hidden;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 150px 110px 84px;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
		transition: background 0.12s;
		outline-offset: -2px;
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row:not(.head) {
		cursor: default;
		user-select: none;
	}
	.row:not(.head):hover {
		background: color-mix(in srgb, var(--accent) 5%, transparent);
	}
	.row.sel {
		background: var(--accent-soft) !important;
	}
	.row.head {
		padding-block: 8px;
		color: var(--muted);
		font-size: 12px;
		font-weight: 650;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--surface-2);
	}
	.row.head button {
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 560;
	}
	.num {
		text-align: right;
	}
	.act {
		display: flex;
		justify-content: flex-end;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.row:hover .act,
	.row:focus-within .act,
	.row.sel .act {
		opacity: 1;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 14px;
	}
	.tile {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 20px 12px 16px;
		text-align: center;
		transition: transform 0.15s var(--ease), box-shadow 0.15s, border-color 0.15s;
		user-select: none;
	}
	.tile:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}
	.tile.sel {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.tile .t {
		max-width: 100%;
	}
	.small {
		font-size: 12px;
	}
	.state {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 12px;
		padding: 70px 20px;
		text-align: center;
	}
	.state.empty .art {
		width: 92px;
		height: 92px;
		display: grid;
		place-items: center;
		border-radius: 28px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.row.dropt,
	.tile.dropt {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		background: var(--accent-soft);
	}
	.c.dropt {
		background: var(--accent-soft);
		outline: 2px solid var(--accent);
		border-radius: var(--r-sm);
	}
	.drop {
		position: fixed;
		inset: 12px;
		z-index: 30;
		display: grid;
		place-items: center;
		text-align: center;
		border: 2px dashed var(--accent);
		border-radius: 24px;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		backdrop-filter: blur(6px);
		color: var(--accent);
		pointer-events: none;
		animation: fade 0.12s;
	}
	.drop div {
		display: grid;
		gap: 6px;
		justify-items: center;
	}
	.drop span {
		color: var(--muted);
	}
	@media (max-width: 720px) {
		.row {
			grid-template-columns: minmax(0, 1fr) 70px;
		}
		.col {
			display: none;
		}
		.act {
			opacity: 1;
		}
		.search input {
			width: 70px;
		}
	}
</style>
