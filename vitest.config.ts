import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: [
			'packages/**/src/**/*.test.ts',
			'packages/**/src/**/*.integration.test.ts',
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			include: ['packages/**/src/**/*.ts'],
			exclude: [
				'node_modules',
				'dist',
				'**/*.d.ts',
				'**/*.test.ts',
				'**/*.integration.test.ts',
				'**/*.e2e.test.ts',
				'**/test-utils/**',
				'**/remote/trpc-client.ts',
			],
			thresholds: {
				lines: 70,
				functions: 70,
				branches: 65,
				statements: 70,
			},
		},
		testTimeout: 10000, // 10s for unit tests
		hookTimeout: 30000, // 30s for setup/teardown
	},
});
