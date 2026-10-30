import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Files and key/value data written by the native command-line client must be readable in the browser
// (WebAssembly build of the same core), and the reverse. Needs XCLIENT_* from syncloom-deploy/scripts/cross-client-test.sh.
const user = process.env.XCLIENT_USER!;
const password = process.env.XCLIENT_PASSWORD!;
const secret = process.env.XCLIENT_SECRET!;

function base32(s: string): Buffer {
	const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) bits += A.indexOf(ch).toString(2).padStart(5, '0');
	const out: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
	return Buffer.from(out);
}
function totp(stepOffset = 0): string {
	const counter = Math.floor(Date.now() / 30000) + stepOffset;
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(BigInt(counter));
	const h = crypto.createHmac('sha1', base32(secret)).update(buf).digest();
	const o = h[19] & 0xf;
	return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0');
}

test('the browser decrypts what the native client wrote, and vice versa', async ({ page }) => {
	test.skip(!user, 'run through scripts/cross-client-test.sh');
	await page.goto('/login');
	await page.getByLabel('Username').fill(user);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await page.getByRole('tab', { name: /App/ }).click();
	await page.locator('#c').fill(totp(1)); // the CLI used the current step during enrolment

	// names and structure, decrypted in the browser
	await expect(page.getByRole('row', { name: /from-cli\.txt/ })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('row', { name: /Reports/ })).toBeVisible();
	await expect(page.getByRole('row', { name: /ünïcödé 日本語\.txt/ })).toBeVisible();

	// contents written by the CLI, decrypted by WebAssembly (small text and a multi-chunk binary)
	await page.getByRole('row', { name: /from-cli\.txt/ }).dblclick();
	await expect(page.getByRole('dialog').getByText('written by the command-line client')).toBeVisible({ timeout: 20_000 });
	await page.keyboard.press('Escape');
	const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download blob.bin' }).click({ force: true })]);
	const expected = fs.readFileSync(process.env.XCLIENT_BLOB!);
	expect(crypto.createHash('sha256').update(fs.readFileSync((await dl.path())!)).digest('hex')).toBe(crypto.createHash('sha256').update(expected).digest('hex'));

	// key/value written by the CLI
	await page.getByRole('link', { name: 'Key/value' }).click();
	await page.getByRole('button', { name: /prefs/ }).click();
	await expect(page.locator('.val', { hasText: 'from the cli' })).toBeVisible();

	// the other direction: upload in the browser, which the CLI then downloads and compares
	await page.getByRole('link', { name: 'Files' }).click();
	await page.locator('input[type=file]').first().setInputFiles({ name: 'from-browser.txt', mimeType: 'text/plain', buffer: Buffer.from('written by the browser, read by the CLI') });
	await expect(page.getByRole('row', { name: /from-browser\.txt/ })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('row', { name: /from-browser\.txt/ }).getByText('uploading…')).toHaveCount(0, { timeout: 30_000 });
});
