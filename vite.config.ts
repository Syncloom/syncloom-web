import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// `npm run dev` talks to a server on :8080 (see syncloom-deploy/docker-compose.dev.yml)
		proxy: {
			'/api': 'http://localhost:8080',
			'/health': 'http://localhost:8080',
			'/syncloom.sync.v1.Sync': 'http://localhost:8080'
		}
	},
	build: { target: 'es2022' },
	test: { include: ['src/**/*.test.ts'] }
});
