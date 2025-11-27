import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Determine output directory based on BUILD_MODE environment variable
// 'api' mode outputs to ../api/dist/dashboard for production serving
// Default mode outputs to ./dist for local development
const buildMode = process.env.BUILD_MODE;
const outDir = buildMode === 'api' ? path.resolve(__dirname, '../api/dist/dashboard') : 'dist';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: 'http://localhost:8080',
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir,
		sourcemap: true,
		// Ensure clean build when outputting to API package
		emptyOutDir: true,
	},
});
