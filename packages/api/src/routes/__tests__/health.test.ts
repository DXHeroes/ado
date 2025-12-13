/**
 * Health Routes Tests
 */

import type { StateStore } from '@dxheroes/ado-core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiContext } from '../../types.js';
import { createHealthRoutes } from '../health.js';

describe('Health Routes', () => {
	let app: Hono<ApiContext>;
	let mockStateStore: StateStore;

	beforeEach(() => {
		// Create mock state store
		mockStateStore = {
			createSession: vi.fn(),
			getSession: vi.fn(),
			getSessionsByProject: vi.fn(),
			updateSession: vi.fn(),
			createTask: vi.fn(),
			getTask: vi.fn(),
			updateTask: vi.fn(),
			getTasksBySession: vi.fn(),
			getTasksByStatus: vi.fn().mockReturnValue([]),
			recordUsage: vi.fn(),
			getUsageByProvider: vi.fn(),
			getTotalUsage: vi.fn(),
			createCheckpoint: vi.fn(),
			getCheckpoint: vi.fn(),
			getLatestCheckpoint: vi.fn(),
			close: vi.fn(),
		};

		// Create app with health routes
		app = new Hono<ApiContext>();
		app.use('*', (c, next) => {
			c.set('stateStore', mockStateStore);
			return next();
		});
		app.route('/health', createHealthRoutes());
	});

	describe('GET /health/', () => {
		it('should return status ok', async () => {
			const res = await app.request('/health');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty('status', 'ok');
			expect(json).toHaveProperty('timestamp');
		});

		it('should return valid timestamp', async () => {
			const res = await app.request('/health');
			const json = await res.json();

			const timestamp = new Date(json.timestamp);
			expect(timestamp).toBeInstanceOf(Date);
			expect(timestamp.getTime()).toBeGreaterThan(0);
		});

		it('should respond quickly', async () => {
			const start = Date.now();
			await app.request('/health');
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(100);
		});
	});

	describe('GET /health/ready', () => {
		it('should return ready when database is accessible', async () => {
			const res = await app.request('/health/ready');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty('status', 'ready');
			expect(json).toHaveProperty('timestamp');
			expect(json).toHaveProperty('checks');
			expect(json.checks).toHaveProperty('database', 'ok');
		});

		it('should check database connectivity', async () => {
			await app.request('/health/ready');

			expect(mockStateStore.getTasksByStatus).toHaveBeenCalledWith('pending');
		});

		it('should return not_ready when database is not accessible', async () => {
			// Mock database error
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Database connection failed');
			});

			const res = await app.request('/health/ready');

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json).toHaveProperty('status', 'not_ready');
			expect(json.checks).toHaveProperty('database', 'error');
		});

		it('should handle async state store', async () => {
			const asyncStateStore = {
				...mockStateStore,
				getTasksByStatus: vi.fn().mockResolvedValue([]),
			};

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', (c, next) => {
				c.set('stateStore', asyncStateStore as any);
				return next();
			});
			asyncApp.route('/health', createHealthRoutes());

			const res = await asyncApp.request('/health/ready');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.checks.database).toBe('ok');
		});

		it('should handle async state store errors', async () => {
			const asyncStateStore = {
				...mockStateStore,
				getTasksByStatus: vi.fn().mockRejectedValue(new Error('Async DB error')),
			};

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', (c, next) => {
				c.set('stateStore', asyncStateStore as any);
				return next();
			});
			asyncApp.route('/health', createHealthRoutes());

			const res = await asyncApp.request('/health/ready');

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.checks.database).toBe('error');
		});

		it('should return not_configured when state store is missing', async () => {
			const appWithoutStore = new Hono<ApiContext>();
			appWithoutStore.route('/health', createHealthRoutes());

			const res = await appWithoutStore.request('/health/ready');
			const json = await res.json();

			expect(json.checks).toHaveProperty('database', 'not_configured');
		});

		it('should include timestamp in response', async () => {
			const res = await app.request('/health/ready');
			const json = await res.json();

			expect(json).toHaveProperty('timestamp');
			const timestamp = new Date(json.timestamp);
			expect(timestamp).toBeInstanceOf(Date);
		});
	});

	describe('GET /health/info', () => {
		it('should return system information', async () => {
			const res = await app.request('/health/info');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty('status', 'ok');
			expect(json).toHaveProperty('timestamp');
			expect(json).toHaveProperty('version');
			expect(json).toHaveProperty('node');
			expect(json).toHaveProperty('uptime');
			expect(json).toHaveProperty('memory');
		});

		it('should return Node.js version', async () => {
			const res = await app.request('/health/info');
			const json = await res.json();

			expect(json.node).toBe(process.version);
		});

		it('should return uptime as number', async () => {
			const res = await app.request('/health/info');
			const json = await res.json();

			expect(typeof json.uptime).toBe('number');
			expect(json.uptime).toBeGreaterThanOrEqual(0);
		});

		it('should return memory usage', async () => {
			const res = await app.request('/health/info');
			const json = await res.json();

			expect(json.memory).toHaveProperty('rss');
			expect(json.memory).toHaveProperty('heapTotal');
			expect(json.memory).toHaveProperty('heapUsed');
			expect(json.memory).toHaveProperty('external');
			expect(typeof json.memory.rss).toBe('number');
		});

		it('should return version from environment or default', async () => {
			const res = await app.request('/health/info');
			const json = await res.json();

			expect(typeof json.version).toBe('string');
			expect(json.version.length).toBeGreaterThan(0);
		});

		it('should return valid timestamp', async () => {
			const res = await app.request('/health/info');
			const json = await res.json();

			const timestamp = new Date(json.timestamp);
			expect(timestamp).toBeInstanceOf(Date);
			expect(timestamp.getTime()).toBeGreaterThan(0);
		});
	});

	describe('error handling', () => {
		it('should handle state store check errors gracefully', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Critical database error');
			});

			const res = await app.request('/health/ready');

			expect(res.status).toBe(503);
			const json = await res.json();
			expect(json.status).toBe('not_ready');
		});

		it('should not expose internal error details', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Internal secret error message');
			});

			const res = await app.request('/health/ready');
			const json = await res.json();

			const responseString = JSON.stringify(json);
			expect(responseString).not.toContain('secret');
		});
	});

	describe('performance', () => {
		it('should respond to liveness check within 50ms', async () => {
			const start = Date.now();
			await app.request('/health');
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(50);
		});

		it('should respond to info check within 100ms', async () => {
			const start = Date.now();
			await app.request('/health/info');
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(100);
		});
	});

	describe('response format', () => {
		it('should return JSON content type', async () => {
			const res = await app.request('/health');

			expect(res.headers.get('content-type')).toContain('application/json');
		});

		it('should return valid JSON for all endpoints', async () => {
			const endpoints = ['', '/ready', '/info'];

			for (const endpoint of endpoints) {
				const res = await app.request(`/health${endpoint}`);
				const json = await res.json();

				expect(json).toBeDefined();
				expect(typeof json).toBe('object');
			}
		});
	});

	describe('Kubernetes compatibility', () => {
		it('should support liveness probe', async () => {
			// Kubernetes liveness probe expects 200 OK
			const res = await app.request('/health');

			expect(res.status).toBe(200);
		});

		it('should support readiness probe', async () => {
			// Kubernetes readiness probe expects 200 OK when ready
			const res = await app.request('/health/ready');

			expect(res.status).toBe(200);
		});

		it('should fail readiness when not ready', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('DB not ready');
			});

			// Kubernetes readiness probe expects 503 when not ready
			const res = await app.request('/health/ready');

			expect(res.status).toBe(503);
		});
	});
});
