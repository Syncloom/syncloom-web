import { api, setToken, setUnauthorizedHandler, type UserInfo } from './api';

const KEY = 'syncloom.session';

/** Reactive session. The vault keys only ever live in memory and this tab's sessionStorage. */
export const session = $state({
	token: null as string | null,
	user: null as UserInfo | null,
	master: null as string | null,
	secret: null as string | null,
	live: false
});

export const signedIn = () => !!(session.token && session.master && session.secret);

function persist() {
	try {
		sessionStorage.setItem(KEY, JSON.stringify({ token: session.token, master: session.master, secret: session.secret }));
	} catch {}
}

export function restoreSession(): boolean {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (!raw) return false;
		const s = JSON.parse(raw);
		if (!s.token || !s.master || !s.secret) return false;
		session.token = s.token;
		session.master = s.master;
		session.secret = s.secret;
		setToken(s.token);
		return true;
	} catch {
		return false;
	}
}

export function startSession(token: string, master: string, secret: string) {
	session.token = token;
	session.master = master;
	session.secret = secret;
	setToken(token);
	persist();
}

export function clearSession() {
	session.token = null;
	session.user = null;
	session.master = null;
	session.secret = null;
	session.live = false;
	setToken(null);
	try {
		sessionStorage.removeItem(KEY);
	} catch {}
}

export async function refreshUser() {
	const me = await api<{ user: UserInfo }>('GET', '/me');
	session.user = me.user;
	return me.user;
}

export async function signOut() {
	try {
		await api('POST', '/auth/logout');
	} catch {}
	clearSession();
}

setUnauthorizedHandler(() => {
	clearSession();
	if (typeof location !== 'undefined' && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/s/')) location.assign('/login');
});
