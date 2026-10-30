import { test, expect, type Page, type CDPSession } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';

const SHOTS = '/e2e/shots';
fs.mkdirSync(SHOTS, { recursive: true });

function base32(s: string): Buffer {
	const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0');
	const out: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
	return Buffer.from(out);
}
function totp(secret: string, stepOffset = 0): string {
	const counter = Math.floor(Date.now() / 30000) + stepOffset;
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(BigInt(counter));
	const h = crypto.createHmac('sha1', base32(secret)).update(buf).digest();
	const o = h[19] & 0xf;
	const n = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
	return String(n).padStart(6, '0');
}

const PASSWORD = 'correct horse battery staple';
let secrets: string[] = [];
let linkUrl = '';

async function shot(page: Page, name: string) {
	await page.waitForTimeout(350); // let animations settle
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function pickMenu(page: Page, label: string) {
	await page.getByRole('menuitem', { name: label }).click();
}

async function signOut(page: Page) {
	await page.locator('button.who').click();
	await page.getByRole('menuitem', { name: 'Sign out' }).click();
	await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

test.describe.serial('Syncloom in a real browser', () => {
	let page: Page;
	let cdp: CDPSession;
	let authenticatorId = '';

	test.beforeAll(async ({ browser }) => {
		const ctx = await browser.newContext({ acceptDownloads: true });
		page = await ctx.newPage();
		cdp = await ctx.newCDPSession(page);
		page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
		page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE ERROR:', m.text()));
	});

	test('first run: create the admin account, recovery key and a second factor', async () => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Set up Syncloom' })).toBeVisible();
		await shot(page, '01-setup');
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
		await page.getByLabel('Repeat password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByRole('heading', { name: 'Save your recovery key' })).toBeVisible({ timeout: 30_000 });
		const key = (await page.locator('.keybox').innerText()).replace(/\s/g, '');
		expect(key).toMatch(/^[0-9A-F-]{71}$/);
		await shot(page, '02-recovery-key');
		await page.getByLabel('I have stored it somewhere safe').check();
		await page.getByRole('button', { name: 'Continue' }).click();

		await expect(page.getByRole('heading', { name: 'Add a second factor' })).toBeVisible();
		await page.getByLabel(/^Name/).fill('Pixel');
		await page.getByRole('button', { name: /Authenticator app/ }).click();
		const secret = (await page.locator('.secret').innerText()).replace(/\s/g, '');
		secrets.push(secret);
		await shot(page, '03-enroll-totp');
		await page.locator('#totp-code').fill(totp(secret));
		await page.getByRole('button', { name: 'Verify and add' }).click();

		await expect(page.getByRole('heading', { name: 'You are protected' })).toBeVisible();
		await expect(page.locator('.grid.mono span')).toHaveCount(10);
		await shot(page, '04-recovery-codes');
		await page.getByRole('button', { name: 'Open my files' }).click();
		await expect(page.getByRole('heading', { name: 'This folder is empty' })).toBeVisible({ timeout: 30_000 });
		await shot(page, '05-empty');
	});

	test('upload, preview, folders, rename and trash', async () => {
		const input = page.locator('input[type=file]').first();
		await input.setInputFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('Hello from the browser, encrypted before upload.') });
		await expect(page.getByRole('row', { name: /hello\.txt/ })).toBeVisible({ timeout: 30_000 });
		await expect(page.getByText('Uploads complete')).toBeVisible();
		// the finished batch dismisses itself
		await expect(page.getByText('Uploads complete')).toBeHidden({ timeout: 10_000 });

		await page.getByRole('button', { name: 'Folder', exact: true }).click();
		await page.getByRole('dialog').locator('input').fill('Projects');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByRole('row', { name: /Projects/ })).toBeVisible();

		// preview decrypts in the browser
		await page.getByRole('row', { name: /hello\.txt/ }).dblclick();
		await expect(page.getByRole('dialog').getByText('Hello from the browser, encrypted before upload.')).toBeVisible({ timeout: 20_000 });
		await shot(page, '06-preview');
		await page.keyboard.press('Escape');

		// a real binary round trip, multi-chunk
		const big = crypto.randomBytes(3 * 1024 * 1024);
		await input.setInputFiles({ name: 'big.bin', mimeType: 'application/octet-stream', buffer: big });
		await expect(page.getByRole('row', { name: /big\.bin/ })).toBeVisible({ timeout: 60_000 });
		await expect(page.getByRole('row', { name: /big\.bin/ }).getByText('uploading…')).toHaveCount(0, { timeout: 60_000 });
		const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download big.bin' }).click({ force: true })]);
		const path = await dl.path();
		expect(crypto.createHash('sha256').update(fs.readFileSync(path!)).digest('hex')).toBe(crypto.createHash('sha256').update(big).digest('hex'));

		// into the folder, upload there, and use the breadcrumb
		await page.getByRole('row', { name: /Projects/ }).dblclick();
		await expect(page.getByRole('heading', { name: 'This folder is empty' })).toBeVisible();
		await input.setInputFiles({ name: 'plan.md', mimeType: 'text/markdown', buffer: Buffer.from('# plan') });
		await expect(page.getByRole('row', { name: /plan\.md/ })).toBeVisible({ timeout: 30_000 });
		await page.getByRole('button', { name: /My files/ }).click();

		// rename via context menu
		await page.getByRole('row', { name: /hello\.txt/ }).click({ button: 'right' });
		await pickMenu(page, 'Rename');
		await page.getByRole('dialog').locator('input').fill('greeting.txt');
		await page.getByRole('button', { name: 'Rename', exact: true }).click();
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toBeVisible();
		await expect(page.getByRole('row', { name: /hello\.txt/ })).toHaveCount(0);

		// grid view
		await page.getByRole('button', { name: 'Grid view' }).click();
		await shot(page, '07-grid');
		await page.getByRole('button', { name: 'List view' }).click();
		await shot(page, '08-list');

		// trash and restore
		await page.getByRole('row', { name: /big\.bin/ }).click();
		await page.keyboard.press('Delete');
		await page.getByRole('button', { name: 'Move to trash' }).click();
		await expect(page.getByRole('row', { name: /big\.bin/ })).toHaveCount(0);
		await page.getByRole('link', { name: 'Trash' }).click();
		await expect(page.locator('main').getByText('big.bin', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Restore' }).click();
		await expect(page.getByRole('heading', { name: 'The trash is empty' })).toBeVisible();
		await page.getByRole('link', { name: 'Files' }).click();
		await expect(page.getByRole('row', { name: /big\.bin/ })).toBeVisible();
	});

	test('drag and drop: move an item into a folder and back out through the breadcrumb', async () => {
		await page.getByRole('row', { name: /greeting\.txt/ }).dragTo(page.getByRole('row', { name: /Projects/ }));
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toHaveCount(0);
		await page.getByRole('row', { name: /Projects/ }).dblclick();
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toBeVisible();
		await page.getByRole('row', { name: /greeting\.txt/ }).dragTo(page.getByRole('button', { name: /My files/ }));
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toHaveCount(0);
		await page.getByRole('button', { name: /My files/ }).click();
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toBeVisible();
	});

	test('key/value namespace', async () => {
		await page.getByRole('link', { name: 'Key/value' }).click();
		await page.getByRole('button', { name: 'New namespace' }).click();
		await page.getByRole('dialog').locator('input').fill('settings');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect(page.getByRole('heading', { name: 'settings' })).toBeVisible();
		await page.getByRole('button', { name: 'Add key' }).click();
		await page.getByRole('dialog').getByLabel('Key', { exact: true }).fill('theme');
		await page.getByRole('dialog').getByLabel('Value').fill('dark');
		await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('code.k', { hasText: 'theme' })).toBeVisible();
		await expect(page.locator('.val', { hasText: 'dark' })).toBeVisible();
		await shot(page, '09-kv');
	});

	test('public link opens in a clean browser without an account', async ({ browser }) => {
		await page.getByRole('link', { name: 'Files' }).click();
		await page.getByRole('row', { name: /greeting\.txt/ }).click({ button: 'right' });
		await pickMenu(page, 'Share…');
		await page.getByRole('tab', { name: /Public link/ }).click();
		await page.getByLabel(/Password/).fill('s3cret-link');
		await page.getByRole('button', { name: 'Create link' }).click();
		linkUrl = (await page.locator('.fresh code').innerText()).trim();
		expect(linkUrl).toMatch(/\/s\/[^#]+#k=/);
		await shot(page, '10-share-dialog');
		await page.keyboard.press('Escape');

		const ctx = await browser.newContext({ acceptDownloads: true });
		const pub = await ctx.newPage();
		await pub.goto(linkUrl);
		await expect(pub.getByRole('heading', { name: 'This link is protected' })).toBeVisible();
		await pub.getByLabel('Password').fill('wrong');
		await pub.getByRole('button', { name: 'Open' }).click();
		await expect(pub.getByText('That password is not correct.')).toBeVisible();
		await pub.getByLabel('Password').fill('s3cret-link');
		await pub.getByRole('button', { name: 'Open' }).click();
		await expect(pub.getByRole('heading', { name: 'greeting.txt' })).toBeVisible();
		await shot(pub, '11-public-link');
		const [d] = await Promise.all([pub.waitForEvent('download'), pub.getByRole('button', { name: /Download/ }).click()]);
		expect(fs.readFileSync((await d.path())!, 'utf8')).toBe('Hello from the browser, encrypted before upload.');
		// the key is required: without the fragment nothing can be decrypted
		await pub.goto(linkUrl.split('#')[0]);
		await expect(pub.getByText(/link is incomplete/)).toBeVisible();
		await ctx.close();
	});

	test('settings: add a second authenticator and a hardware security key', async () => {
		await page.getByRole('link', { name: 'Settings' }).click();
		await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
		await expect(page.getByText('Pixel')).toBeVisible();

		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await page.getByRole('dialog').getByLabel(/^Name/).fill('Laptop');
		await page.getByRole('button', { name: /Authenticator app/ }).click();
		const secret2 = (await page.locator('.secret').innerText()).replace(/\s/g, '');
		secrets.push(secret2);
		await page.locator('#totp-code').fill(totp(secret2));
		await page.getByRole('button', { name: 'Verify and add' }).click();
		await expect(page.getByText('Laptop')).toBeVisible();

		// a virtual FIDO2 key stands in for a YubiKey
		await cdp.send('WebAuthn.enable');
		const added = await cdp.send('WebAuthn.addVirtualAuthenticator', {
			options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: false, hasUserVerification: false, isUserVerified: true, automaticPresenceSimulation: true }
		});
		authenticatorId = added.authenticatorId;
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await page.getByRole('dialog').getByLabel(/^Name/).fill('YubiKey');
		await page.getByRole('button', { name: /Security key/ }).click();
		await page.getByRole('button', { name: 'Register security key' }).click();
		await expect(page.getByText('YubiKey')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('li', { hasText: 'Security key' })).toHaveCount(1);
		await shot(page, '12-settings-2fa');

		// removal is possible while others remain
		await page.locator('li', { hasText: 'Laptop' }).getByRole('button', { name: 'Remove' }).click();
		await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
		await expect(page.locator('li', { hasText: 'Laptop' })).toHaveCount(0);
		// the Laptop authenticator is gone, re-add one so that two authenticator apps exist again
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await page.getByRole('button', { name: /Authenticator app/ }).click();
		const secret3 = (await page.locator('.secret').innerText()).replace(/\s/g, '');
		await page.locator('#totp-code').fill(totp(secret3));
		await page.getByRole('button', { name: 'Verify and add' }).click();
		secrets = [secrets[0], secret3];
	});

	test('sign in again with the security key, then with an authenticator app', async () => {
		await signOut(page);
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('heading', { name: 'Verify it’s you' })).toBeVisible();
		await shot(page, '13-mfa');
		await page.getByRole('tab', { name: /Key/ }).click();
		await page.getByRole('button', { name: 'Use security key' }).click();
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toBeVisible({ timeout: 30_000 });

		await signOut(page);
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.getByRole('tab', { name: /App/ }).click();
		// the first app was used 10+ s ago for enrollment; the next time step is accepted and not yet used
		await page.locator('#c').fill(totp(secrets[0], 1));
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toBeVisible({ timeout: 30_000 });
		// a wrong password never reaches the second factor
		await signOut(page);
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill('not the password');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByRole('alert')).toBeVisible();
	});

	test('native apps: the security-key bridge page signs in and enrolls keys', async () => {
		await page.getByLabel('Username').fill('admin');
		await page.getByLabel('Password').fill(PASSWORD);
		const loginResp = page.waitForResponse((r) => r.url().endsWith('/auth/login'));
		await page.getByRole('button', { name: 'Sign in' }).click();
		const mfaToken = ((await (await loginResp).json()) as { token: string }).token;

		// the app opens this page in its web-authentication session; parameters travel in the fragment
		await page.goto(`/native/security-key#mode=login&token=${mfaToken}&device=Test%20Mac`);
		await page.getByRole('button', { name: 'Use security key' }).click();
		await expect(page.locator('body')).toHaveAttribute('data-result', /^syncloom:\/\/security-key#token=/, { timeout: 20_000 });
		const deviceToken = new URLSearchParams((await page.locator('body').getAttribute('data-result'))!.split('#')[1]).get('token')!;
		const me = (t: string) => page.evaluate(async (t) => (await (await fetch('/api/v1/me/mfa', { headers: { authorization: `Bearer ${t}` } })).json()) as { kind: string }[], t);
		expect((await me(deviceToken)).filter((m) => m.kind === 'webauthn')).toHaveLength(1);

		// enrolling a second key (a fresh virtual authenticator, the first already holds a credential)
		await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
		await cdp.send('WebAuthn.addVirtualAuthenticator', {
			options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: false, hasUserVerification: false, isUserVerified: true, automaticPresenceSimulation: true }
		});
		await page.goto('about:blank');
		await page.goto(`/native/security-key#mode=register&token=${deviceToken}&name=Second%20key&device=Test%20Mac`);
		await page.getByRole('button', { name: 'Register security key' }).click();
		await expect(page.locator('body')).toHaveAttribute('data-result', /^syncloom:\/\/security-key#token=/, { timeout: 20_000 });
		expect((await me(deviceToken)).filter((m) => m.kind === 'webauthn')).toHaveLength(2);

		// cancelling hands an error back instead of a token
		await page.goto('about:blank');
		await page.goto(`/native/security-key#mode=login&token=x`);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.locator('body')).toHaveAttribute('data-result', 'syncloom://security-key#error=cancelled');

		// back to the sign-in form for the next test
		await page.goto('/login');
		await page.getByLabel('Username').fill('admin');
	});

	test('admin page and dark mode', async () => {
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign in' }).click();
		await page.getByRole('tab', { name: /App/ }).click();
		await page.locator('#c').fill(totp(secrets[1], 1));
		await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible({ timeout: 30_000 });
		await page.getByRole('link', { name: 'Admin' }).click();
		await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
		await page.getByRole('button', { name: 'Invite someone' }).click();
		await expect(page.getByRole('dialog').locator('code.code')).toHaveText(/\S{20,}/);
		await shot(page, '14-admin-invite');
		await page.keyboard.press('Escape');
		await page.emulateMedia({ colorScheme: 'dark' });
		await shot(page, '15-admin-dark');
		await page.getByRole('link', { name: 'Files' }).click();
		await expect(page.getByRole('row', { name: /greeting\.txt/ })).toBeVisible();
		await shot(page, '16-files-dark');
	});
});
