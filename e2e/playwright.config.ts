import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: '.',
	timeout: 120_000,
	workers: 1,
	reporter: [['list']],
	globalSetup: './proxy.ts',
	use: { baseURL: 'http://localhost:8088', headless: true, viewport: { width: 1360, height: 860 }, trace: 'off', screenshot: 'only-on-failure' }
});
