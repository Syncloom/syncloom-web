<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { session, signOut } from '$lib/session.svelte';
	import { live } from '$lib/live.svelte';
	import { formatBytes } from '$lib/format';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import Menu from './Menu.svelte';

	let { children }: { children: Snippet } = $props();
	let userMenu = $state<{ x: number; y: number } | null>(null);
	let navOpen = $state(false);

	const nav = [
		{ href: '/', label: 'Files', icon: 'folder' },
		{ href: '/shared', label: 'Shared with me', icon: 'users' },
		{ href: '/kv', label: 'Key/value', icon: 'db' },
		{ href: '/trash', label: 'Trash', icon: 'trash' }
	];
	const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/f/') : page.url.pathname.startsWith(href));

	let theme = $state<'auto' | 'light' | 'dark'>('auto');
	$effect(() => {
		const t = document.documentElement.dataset.theme;
		theme = t === 'light' || t === 'dark' ? t : 'auto';
	});
	function cycleTheme() {
		const next = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
		theme = next;
		if (next === 'auto') {
			delete document.documentElement.dataset.theme;
			localStorage.removeItem('syncloom.theme');
		} else {
			document.documentElement.dataset.theme = next;
			localStorage.setItem('syncloom.theme', next);
		}
	}

	const used = $derived(session.user?.used_bytes ?? 0);
	const quota = $derived(session.user?.quota_bytes ?? null);
	const pct = $derived(quota ? Math.min(100, (used / quota) * 100) : 0);

	async function logout() {
		await signOut();
		await goto('/login');
	}
	$effect(() => {
		page.url.pathname;
		navOpen = false;
	});
</script>

<div class="shell">
	<aside class:open={navOpen}>
		<a class="brand" href="/" aria-label="Syncloom home"><Logo /></a>
		<nav aria-label="Main">
			{#each nav as n}
				<a href={n.href} class="item" class:active={isActive(n.href)} aria-current={isActive(n.href) ? 'page' : undefined}>
					<Icon name={n.icon} /> <span>{n.label}</span>
				</a>
			{/each}
			<div class="spacer"></div>
			<a href="/settings" class="item" class:active={isActive('/settings')}><Icon name="settings" /> <span>Settings</span></a>
			{#if session.user?.role === 'admin'}
				<a href="/admin" class="item" class:active={isActive('/admin')}><Icon name="shield" /> <span>Admin</span></a>
			{/if}
		</nav>

		<div class="foot">
			<div class="meter" title="{formatBytes(used)}{quota ? ` of ${formatBytes(quota)}` : ''}">
				<div class="row">
					<span class="muted">Storage</span>
					<span class="mono">{formatBytes(used)}{quota ? ` / ${formatBytes(quota)}` : ''}</span>
				</div>
				{#if quota}<div class="bar"><i style="width:{pct}%" class:hot={pct > 90}></i></div>{/if}
			</div>
			<button class="who" onclick={(e) => (userMenu = { x: e.clientX, y: e.clientY - 150 })} aria-haspopup="menu">
				<span class="avatar">{(session.user?.username ?? '?').slice(0, 1).toUpperCase()}</span>
				<span class="name">{session.user?.username}</span>
				<span class="live" class:on={live.connected} title={live.connected ? 'Live updates connected' : 'Reconnecting…'}></span>
			</button>
		</div>
	</aside>

	<div class="main">
		<header class="topbar">
			<button class="btn ghost icon" onclick={() => (navOpen = !navOpen)} aria-label="Menu"><Icon name="list" /></button>
			<Logo size={26} />
		</header>
		<main>{@render children()}</main>
	</div>
	{#if navOpen}<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions --><div class="scrim" onclick={() => (navOpen = false)}></div>{/if}
</div>

{#if userMenu}
	<Menu
		x={userMenu.x}
		y={userMenu.y}
		onclose={() => (userMenu = null)}
		items={[
			{ label: `Theme: ${theme}`, icon: theme === 'dark' ? 'moon' : 'sun', action: cycleTheme },
			{ label: 'Security & devices', icon: 'shield', action: () => goto('/settings') },
			'sep',
			{ label: 'Sign out', icon: 'logout', danger: true, action: logout }
		]}
	/>
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar) 1fr;
		min-height: 100dvh;
	}
	aside {
		position: sticky;
		top: 0;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 18px 14px;
		background: var(--surface-glass);
		backdrop-filter: blur(22px) saturate(160%);
		border-right: 1px solid var(--border);
		z-index: 20;
	}
	.brand {
		padding: 4px 8px;
		color: inherit;
	}
	.brand:hover {
		text-decoration: none;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
	}
	.spacer {
		flex: 1;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 12px;
		border-radius: 12px;
		color: var(--muted);
		font-weight: 560;
		transition: background 0.15s, color 0.15s;
	}
	.item:hover {
		background: var(--surface-2);
		color: var(--text);
		text-decoration: none;
	}
	.item.active {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.foot {
		display: grid;
		gap: 12px;
	}
	.meter {
		padding: 12px;
		border-radius: 14px;
		background: var(--surface-2);
		display: grid;
		gap: 8px;
		font-size: 12.5px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.bar {
		height: 6px;
		background: var(--border);
		border-radius: 99px;
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent-grad);
		border-radius: inherit;
		transition: width 0.4s var(--ease);
	}
	.bar i.hot {
		background: var(--danger);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
		text-align: left;
		box-shadow: var(--shadow-sm);
	}
	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--accent-grad);
		color: #fff;
		font-weight: 700;
	}
	.name {
		flex: 1;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.live {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
	}
	.live.on {
		background: var(--ok);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 22%, transparent);
	}
	.main {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	main {
		padding: 28px clamp(16px, 3.5vw, 44px) 60px;
		max-width: 1400px;
		width: 100%;
	}
	.topbar {
		display: none;
	}
	.scrim {
		display: none;
	}
	@media (max-width: 860px) {
		.shell {
			grid-template-columns: 1fr;
		}
		aside {
			position: fixed;
			inset: 0 auto 0 0;
			width: 280px;
			transform: translateX(-102%);
			transition: transform 0.25s var(--ease);
			box-shadow: var(--shadow-lg);
		}
		aside.open {
			transform: none;
		}
		.topbar {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
			position: sticky;
			top: 0;
			z-index: 10;
			background: var(--surface-glass);
			backdrop-filter: blur(16px);
			border-bottom: 1px solid var(--border);
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 15;
			background: rgb(10 10 30 / 40%);
		}
		main {
			padding-top: 18px;
		}
	}
</style>
