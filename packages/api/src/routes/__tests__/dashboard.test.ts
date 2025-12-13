/**
 * Dashboard Routes Tests
 */

import type { AsyncStateStore, StateStore } from '@dxheroes/ado-core';
import type { TaskState } from '@dxheroes/ado-shared';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiContext } from '../../types.js';
import { createDashboardRoutes } from '../dashboard.js';

describe('Dashboard Routes', () => {
	let app: Hono<ApiContext>;
	let mockStateStore: StateStore;

	beforeEach(() => {
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
			getTotalUsage: vi.fn().mockReturnValue({ requests: 0, tokens: 0, cost: 0 }),
			createCheckpoint: vi.fn(),
			getCheckpoint: vi.fn(),
			getLatestCheckpoint: vi.fn(),
			close: vi.fn(),
		};

		app = new Hono<ApiContext>();
		app.use('*', (c, next) => {
			c.set('stateStore', mockStateStore);
			return next();
		});
		app.route('/dashboard', createDashboardRoutes());
	});

	describe('GET /dashboard/stats', () => {
		it('should return dashboard stats with defaults', async () => {
			const res = await app.request('/dashboard/stats');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty('activeTasks', 0);
			expect(json).toHaveProperty('completedToday', 0);
			expect(json).toHaveProperty('apiCost24h', 0);
			expect(json).toHaveProperty('avgDuration', 0);
			expect(json).toHaveProperty('recentAlerts');
			expect(Array.isArray(json.recentAlerts)).toBe(true);
		});

		it('should calculate active tasks from state store', async () => {
			const runningTasks: TaskState[] = [
				{
					id: 'task-1',
					definition: {
						prompt: 'Test 1',
						projectKey: 'test',
						repositoryPath: '/test',
					},
					status: 'running',
				},
				{
					id: 'task-2',
					definition: {
						prompt: 'Test 2',
						projectKey: 'test',
						repositoryPath: '/test',
					},
					status: 'running',
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				if (status === 'running') return runningTasks;
				return [];
			});

			const res = await app.request('/dashboard/stats');
			const json = await res.json();

			expect(json.activeTasks).toBe(2);
		});

		it('should calculate completed tasks today', async () => {
			const now = new Date();
			const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

			const completedTasks: TaskState[] = [
				{
					id: 'task-1',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					completedAt: new Date(startOfDay.getTime() + 1000),
				},
				{
					id: 'task-2',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					completedAt: new Date(startOfDay.getTime() - 1000),
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				if (status === 'completed') return completedTasks;
				return [];
			});

			const res = await app.request('/dashboard/stats');
			const json = await res.json();

			expect(json.completedToday).toBe(1);
		});

		it('should calculate API cost for last 24 hours', async () => {
			vi.mocked(mockStateStore.getTotalUsage).mockReturnValue({
				requests: 100,
				tokens: 50000,
				cost: 5.75,
			});

			const res = await app.request('/dashboard/stats');
			const json = await res.json();

			expect(json.apiCost24h).toBe(5.75);
		});

		it('should calculate average duration', async () => {
			const completedTasks: TaskState[] = [
				{
					id: 'task-1',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					result: {
						success: true,
						output: '',
						duration: 100,
						tokensUsed: { input: 0, output: 0 },
						costUsd: 0,
						filesModified: [],
					},
				},
				{
					id: 'task-2',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					result: {
						success: true,
						output: '',
						duration: 200,
						tokensUsed: { input: 0, output: 0 },
						costUsd: 0,
						filesModified: [],
					},
				},
				{
					id: 'task-3',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					result: {
						success: true,
						output: '',
						duration: 300,
						tokensUsed: { input: 0, output: 0 },
						costUsd: 0,
						filesModified: [],
					},
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				if (status === 'completed') return completedTasks;
				return [];
			});

			const res = await app.request('/dashboard/stats');
			const json = await res.json();

			expect(json.avgDuration).toBe(200);
		});

		it('should handle async state store', async () => {
			const asyncStateStore: AsyncStateStore = {
				...mockStateStore,
				getTasksByStatus: vi.fn().mockResolvedValue([]),
				getTotalUsage: vi.fn().mockResolvedValue({ requests: 0, tokens: 0, cost: 0 }),
			} as any;

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', (c, next) => {
				c.set('stateStore', asyncStateStore);
				return next();
			});
			asyncApp.route('/dashboard', createDashboardRoutes());

			const res = await asyncApp.request('/dashboard/stats');
			const json = await res.json();

			expect(json).toBeDefined();
		});

		it('should handle missing state store gracefully', async () => {
			const appWithoutStore = new Hono<ApiContext>();
			appWithoutStore.route('/dashboard', createDashboardRoutes());

			const res = await appWithoutStore.request('/dashboard/stats');
			const json = await res.json();

			expect(json.activeTasks).toBe(0);
			expect(json.completedToday).toBe(0);
		});

		it('should handle state store errors gracefully', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Database error');
			});

			const res = await app.request('/dashboard/stats');
			const json = await res.json();

			expect(json).toBeDefined();
			expect(json.activeTasks).toBe(0);
		});
	});

	describe('GET /dashboard/usage-history', () => {
		it('should return usage history with empty data', async () => {
			const res = await app.request('/dashboard/usage-history');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty('taskVolume');
			expect(json).toHaveProperty('providerUsage');
			expect(json).toHaveProperty('costTrend');
			expect(Array.isArray(json.taskVolume)).toBe(true);
			expect(Array.isArray(json.providerUsage)).toBe(true);
			expect(Array.isArray(json.costTrend)).toBe(true);
		});

		it('should return 7 days of task volume data', async () => {
			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			expect(json.taskVolume).toHaveLength(7);
			expect(json.taskVolume[0]).toHaveProperty('date');
			expect(json.taskVolume[0]).toHaveProperty('count');
		});

		it('should calculate task volume by day', async () => {
			const now = new Date();
			const _sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

			const completedTasks: TaskState[] = [
				{
					id: 'task-1',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					completedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
				},
				{
					id: 'task-2',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					completedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				if (status === 'completed') return completedTasks;
				return [];
			});

			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			const todayData = json.taskVolume.find((v: any) => {
				const date = new Date(v.date);
				const yesterday = new Date(now);
				yesterday.setDate(yesterday.getDate() - 1);
				return date.toDateString() === yesterday.toDateString();
			});

			expect(todayData).toBeDefined();
		});

		it('should calculate provider usage', async () => {
			const now = new Date();
			const _sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

			const completedTasks: TaskState[] = [
				{
					id: 'task-1',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					providerId: 'claude-code',
					completedAt: now,
				},
				{
					id: 'task-2',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					providerId: 'claude-code',
					completedAt: now,
				},
				{
					id: 'task-3',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					providerId: 'gemini-cli',
					completedAt: now,
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				if (status === 'completed') return completedTasks;
				return [];
			});

			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			const claudeUsage = json.providerUsage.find((u: any) => u.provider === 'claude-code');
			const geminiUsage = json.providerUsage.find((u: any) => u.provider === 'gemini-cli');

			expect(claudeUsage?.count).toBe(2);
			expect(geminiUsage?.count).toBe(1);
		});

		it('should return 7 days of cost trend data', async () => {
			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			expect(json.costTrend).toHaveLength(7);
			expect(json.costTrend[0]).toHaveProperty('date');
			expect(json.costTrend[0]).toHaveProperty('subscription');
			expect(json.costTrend[0]).toHaveProperty('api');
		});

		it('should handle async state store', async () => {
			const asyncStateStore: AsyncStateStore = {
				...mockStateStore,
				getTasksByStatus: vi.fn().mockResolvedValue([]),
				getTotalUsage: vi.fn().mockResolvedValue({ requests: 0, tokens: 0, cost: 0 }),
			} as any;

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', (c, next) => {
				c.set('stateStore', asyncStateStore);
				return next();
			});
			asyncApp.route('/dashboard', createDashboardRoutes());

			const res = await asyncApp.request('/dashboard/usage-history');
			const json = await res.json();

			expect(json).toBeDefined();
			expect(json.taskVolume).toHaveLength(7);
		});

		it('should return sample data when no state store', async () => {
			const appWithoutStore = new Hono<ApiContext>();
			appWithoutStore.route('/dashboard', createDashboardRoutes());

			const res = await appWithoutStore.request('/dashboard/usage-history');
			const json = await res.json();

			expect(json.providerUsage.length).toBeGreaterThan(0);
			expect(json.taskVolume).toHaveLength(7);
			expect(json.costTrend).toHaveLength(7);
		});

		it('should handle state store errors gracefully', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Database error');
			});

			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			expect(json).toBeDefined();
		});

		it('should filter tasks outside 7-day window', async () => {
			const now = new Date();
			const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

			const completedTasks: TaskState[] = [
				{
					id: 'task-old',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					providerId: 'claude-code',
					completedAt: tenDaysAgo,
				},
				{
					id: 'task-recent',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					providerId: 'claude-code',
					completedAt: now,
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				if (status === 'completed') return completedTasks;
				return [];
			});

			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			const totalTasks = json.taskVolume.reduce((sum: number, day: any) => sum + day.count, 0);
			expect(totalTasks).toBe(1);
		});
	});

	describe('error handling', () => {
		it('should handle database errors in stats', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Critical database error');
			});

			const res = await app.request('/dashboard/stats');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toBeDefined();
		});

		it('should handle database errors in usage-history', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Critical database error');
			});

			const res = await app.request('/dashboard/usage-history');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toBeDefined();
		});
	});

	describe('response format', () => {
		it('should return JSON content type', async () => {
			const res = await app.request('/dashboard/stats');

			expect(res.headers.get('content-type')).toContain('application/json');
		});

		it('should return valid JSON for all endpoints', async () => {
			const endpoints = ['/stats', '/usage-history'];

			for (const endpoint of endpoints) {
				const res = await app.request(`/dashboard${endpoint}`);
				const json = await res.json();

				expect(json).toBeDefined();
				expect(typeof json).toBe('object');
			}
		});

		it('should include dates in ISO format', async () => {
			const res = await app.request('/dashboard/usage-history');
			const json = await res.json();

			for (const item of json.taskVolume) {
				expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}
		});
	});
});
