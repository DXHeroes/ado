/**
 * Tasks Routes Tests
 */

import type { AsyncStateStore, StateStore } from '@dxheroes/ado-core';
import type { TaskState } from '@dxheroes/ado-shared';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiContext } from '../../types.js';
import { createTasksRoutes } from '../tasks.js';

describe('Tasks Routes', () => {
	let app: Hono<ApiContext>;
	let mockStateStore: StateStore;

	beforeEach(() => {
		mockStateStore = {
			createSession: vi.fn(),
			getSession: vi.fn(),
			getSessionsByProject: vi.fn(),
			updateSession: vi.fn(),
			createTask: vi.fn((task) => task),
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

		app = new Hono<ApiContext>();
		app.use('*', async (c, next) => {
			c.set('stateStore', mockStateStore);
			await next();
		});

		const tasksRouter = createTasksRoutes();
		app.route('/tasks', tasksRouter);
	});

	describe('GET /tasks/', () => {
		it('should list all tasks', async () => {
			const res = await app.request('/tasks');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(Array.isArray(json)).toBe(true);
		});

		it('should return tasks from state store', async () => {
			const mockTasks: TaskState[] = [
				{
					id: 'task-1',
					definition: { prompt: 'Test 1', projectKey: 'test', repositoryPath: '/test' },
					status: 'running',
					providerId: 'claude-code',
					startedAt: new Date(),
				},
				{
					id: 'task-2',
					definition: { prompt: 'Test 2', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					providerId: 'gemini-cli',
					startedAt: new Date(),
					completedAt: new Date(),
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				return mockTasks.filter((t) => t.status === status);
			});

			const res = await app.request('/tasks');
			const json = await res.json();

			expect(json).toHaveLength(2);
		});

		it('should sort tasks by startedAt descending', async () => {
			const now = new Date();
			const mockTasks: TaskState[] = [
				{
					id: 'task-old',
					definition: { prompt: 'Old', projectKey: 'test', repositoryPath: '/test' },
					status: 'completed',
					startedAt: new Date(now.getTime() - 1000000),
				},
				{
					id: 'task-new',
					definition: { prompt: 'New', projectKey: 'test', repositoryPath: '/test' },
					status: 'running',
					startedAt: now,
				},
			];

			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation((status) => {
				return mockTasks.filter((t) => t.status === status);
			});

			const res = await app.request('/tasks');
			const json = await res.json();

			expect(json[0].id).toBe('task-new');
			expect(json[1].id).toBe('task-old');
		});

		it('should handle async state store', async () => {
			const asyncStateStore: AsyncStateStore = {
				...mockStateStore,
				getTask: vi.fn().mockResolvedValue(null),
				getTasksByStatus: vi.fn().mockResolvedValue([]),
			} as any;

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', async (c, next) => {
				c.set('stateStore', asyncStateStore);
				await next();
			});
			asyncApp.route('/tasks', createTasksRoutes());

			const res = await asyncApp.request('/tasks');

			expect(res.status).toBe(200);
		});

		it('should handle state store errors', async () => {
			vi.mocked(mockStateStore.getTasksByStatus).mockImplementation(() => {
				throw new Error('Database error');
			});

			const res = await app.request('/tasks');

			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json).toHaveProperty('error');
		});

		it('should fallback to memory store when no state store', async () => {
			const appWithoutStore = new Hono<ApiContext>();
			appWithoutStore.route('/tasks', createTasksRoutes());

			const res = await appWithoutStore.request('/tasks');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(Array.isArray(json)).toBe(true);
		});
	});

	describe('GET /tasks/:id', () => {
		it('should get task by ID', async () => {
			const mockTask: TaskState = {
				id: 'task-123',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'running',
				startedAt: new Date(),
			};

			vi.mocked(mockStateStore.getTask).mockReturnValue(mockTask);

			const res = await app.request('/tasks/task-123');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.id).toBe('task-123');
		});

		it('should return 404 when task not found', async () => {
			vi.mocked(mockStateStore.getTask).mockReturnValue(null);

			const res = await app.request('/tasks/nonexistent');

			expect(res.status).toBe(404);
			const json = await res.json();
			expect(json).toHaveProperty('error', 'Task not found');
		});

		it('should include events in response', async () => {
			const mockTask: TaskState = {
				id: 'task-456',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'running',
				startedAt: new Date(),
			};

			vi.mocked(mockStateStore.getTask).mockReturnValue(mockTask);

			const res = await app.request('/tasks/task-456');
			const json = await res.json();

			expect(json).toHaveProperty('events');
			expect(Array.isArray(json.events)).toBe(true);
		});

		it('should handle async state store', async () => {
			const mockTask: TaskState = {
				id: 'task-async',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'running',
				startedAt: new Date(),
			};

			const asyncStateStore: AsyncStateStore = {
				...mockStateStore,
				getTask: vi.fn().mockResolvedValue(mockTask),
			} as any;

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', (c, next) => {
				c.set('stateStore', asyncStateStore);
				return next();
			});
			asyncApp.route('/tasks', createTasksRoutes());

			const res = await asyncApp.request('/tasks/task-async');

			expect(res.status).toBe(200);
		});

		it('should handle state store errors', async () => {
			vi.mocked(mockStateStore.getTask).mockImplementation(() => {
				throw new Error('Database error');
			});

			const res = await app.request('/tasks/task-error');

			expect(res.status).toBe(500);
		});
	});

	describe('POST /tasks/', () => {
		it('should create a new task', async () => {
			const taskData = {
				id: 'task-new',
				prompt: 'New task',
				provider: 'claude-code',
			};

			const res = await app.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(taskData),
			});

			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.id).toBe('task-new');
			expect(json.status).toBe('pending');
		});

		it('should call state store createTask', async () => {
			const taskData = {
				id: 'task-123',
				prompt: 'Test task',
				provider: 'claude-code',
			};

			await app.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(taskData),
			});

			expect(mockStateStore.createTask).toHaveBeenCalled();
		});

		it('should handle async state store', async () => {
			const asyncStateStore: AsyncStateStore = {
				...mockStateStore,
				getTask: vi.fn().mockResolvedValue(null),
				createTask: vi.fn().mockResolvedValue({
					id: 'task-async',
					definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
					status: 'pending',
					startedAt: new Date(),
				}),
			} as any;

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', async (c, next) => {
				c.set('stateStore', asyncStateStore);
				await next();
			});
			asyncApp.route('/tasks', createTasksRoutes());

			const res = await asyncApp.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'task-async', prompt: 'Test', provider: 'test' }),
			});

			expect(res.status).toBe(201);
		});

		it('should fallback to memory store when no state store', async () => {
			const appWithoutStore = new Hono<ApiContext>();
			appWithoutStore.route('/tasks', createTasksRoutes());

			const res = await appWithoutStore.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'task-mem', prompt: 'Test', provider: 'test' }),
			});

			expect(res.status).toBe(201);
		});

		it('should handle state store errors', async () => {
			vi.mocked(mockStateStore.createTask).mockImplementation(() => {
				throw new Error('Database error');
			});

			const res = await app.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'task-error', prompt: 'Test', provider: 'test' }),
			});

			expect(res.status).toBe(500);
		});
	});

	describe('PATCH /tasks/:id', () => {
		it('should update task status', async () => {
			const mockTask: TaskState = {
				id: 'task-123',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'pending',
				startedAt: new Date(),
			};

			vi.mocked(mockStateStore.getTask).mockReturnValue(mockTask);

			const res = await app.request('/tasks/task-123', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'running' }),
			});

			expect(res.status).toBe(200);
			expect(mockStateStore.updateTask).toHaveBeenCalledWith(
				'task-123',
				expect.objectContaining({
					status: 'running',
				}),
			);
		});

		it('should set completedAt when status is completed', async () => {
			const mockTask: TaskState = {
				id: 'task-456',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'running',
				startedAt: new Date(),
			};

			vi.mocked(mockStateStore.getTask).mockReturnValue(mockTask);

			await app.request('/tasks/task-456', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'completed' }),
			});

			expect(mockStateStore.updateTask).toHaveBeenCalledWith(
				'task-456',
				expect.objectContaining({
					status: 'completed',
					completedAt: expect.any(Date),
				}),
			);
		});

		it('should return 404 when task not found', async () => {
			vi.mocked(mockStateStore.getTask).mockReturnValue(null);

			const res = await app.request('/tasks/nonexistent', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'running' }),
			});

			expect(res.status).toBe(404);
		});

		it('should handle async state store', async () => {
			const mockTask: TaskState = {
				id: 'task-async',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'pending',
				startedAt: new Date(),
			};

			const asyncStateStore: AsyncStateStore = {
				...mockStateStore,
				getTask: vi.fn().mockResolvedValue(mockTask),
				updateTask: vi.fn().mockResolvedValue(undefined),
			} as any;

			const asyncApp = new Hono<ApiContext>();
			asyncApp.use('*', (c, next) => {
				c.set('stateStore', asyncStateStore);
				return next();
			});
			asyncApp.route('/tasks', createTasksRoutes());

			const res = await asyncApp.request('/tasks/task-async', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'running' }),
			});

			expect(res.status).toBe(200);
		});
	});

	describe('DELETE /tasks/:id', () => {
		it('should return 404 for non-existent task', async () => {
			const res = await app.request('/tasks/nonexistent', { method: 'DELETE' });

			expect(res.status).toBe(404);
		});

		it('should delete task from memory store', async () => {
			const appWithMemory = new Hono<ApiContext>();
			appWithMemory.route('/tasks', createTasksRoutes());

			// Create task first
			await appWithMemory.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'task-delete', prompt: 'Test', provider: 'test' }),
			});

			// Delete task
			const res = await appWithMemory.request('/tasks/task-delete', { method: 'DELETE' });

			expect(res.status).toBe(204);
		});

		it('should return 204 on successful deletion', async () => {
			const appWithMemory = new Hono<ApiContext>();
			appWithMemory.route('/tasks', createTasksRoutes());

			// Create and delete
			await appWithMemory.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'task-del', prompt: 'Test', provider: 'test' }),
			});

			const res = await appWithMemory.request('/tasks/task-del', { method: 'DELETE' });

			expect(res.status).toBe(204);
			expect(res.body).toBeNull();
		});
	});

	describe('POST /tasks/:id/events', () => {
		it('should add event to task', async () => {
			const appWithMemory = new Hono<ApiContext>();
			appWithMemory.route('/tasks', createTasksRoutes());

			// Create task
			await appWithMemory.request('/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'task-event', prompt: 'Test', provider: 'test' }),
			});

			// Add event
			const res = await appWithMemory.request('/tasks/task-event/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'progress', data: { percent: 50 } }),
			});

			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.type).toBe('progress');
			expect(json.timestamp).toBeDefined();
		});

		it('should return 404 for non-existent task', async () => {
			const res = await app.request('/tasks/nonexistent/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type: 'test' }),
			});

			expect(res.status).toBe(404);
		});
	});

	describe('response format', () => {
		it('should return JSON content type', async () => {
			const res = await app.request('/tasks');

			expect(res.headers.get('content-type')).toContain('application/json');
		});

		it('should include ISO datetime strings', async () => {
			const mockTask: TaskState = {
				id: 'task-date',
				definition: { prompt: 'Test', projectKey: 'test', repositoryPath: '/test' },
				status: 'running',
				startedAt: new Date(),
			};

			vi.mocked(mockStateStore.getTask).mockReturnValue(mockTask);

			const res = await app.request('/tasks/task-date');
			const json = await res.json();

			expect(json.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});
	});
});
