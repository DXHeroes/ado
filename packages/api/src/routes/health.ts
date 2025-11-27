/**
 * Health check routes
 */

import { Hono } from 'hono';
import type { ApiContext } from '../types.js';

export function createHealthRoutes(): Hono<ApiContext> {
	const router = new Hono<ApiContext>();

	// Liveness probe
	router.get('/', (c) => {
		return c.json({
			status: 'ok',
			timestamp: new Date().toISOString(),
		});
	});

	// Readiness probe
	router.get('/ready', async (c) => {
		const checks: Record<string, string> = {};
		let isReady = true;

		// Check database connectivity
		const stateStore = c.get('stateStore');
		if (stateStore) {
			try {
				// Try to read tasks to verify database connectivity
				// This will throw if the database is not accessible
				if ('getTasksByStatus' in stateStore) {
					// Check if it's async or sync
					const result = stateStore.getTasksByStatus('pending');
					if (result instanceof Promise) {
						await result;
					}
				}
				checks.database = 'ok';
			} catch (_error) {
				checks.database = 'error';
				isReady = false;
			}
		} else {
			checks.database = 'not_configured';
		}

		return c.json(
			{
				status: isReady ? 'ready' : 'not_ready',
				timestamp: new Date().toISOString(),
				checks,
			},
			isReady ? 200 : 503,
		);
	});

	// Detailed health info
	router.get('/info', (c) => {
		return c.json({
			status: 'ok',
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version ?? '0.1.0',
			node: process.version,
			uptime: process.uptime(),
			memory: process.memoryUsage(),
		});
	});

	return router;
}
