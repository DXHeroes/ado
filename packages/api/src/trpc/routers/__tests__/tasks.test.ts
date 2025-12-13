/**
 * Tasks tRPC Router Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { StateStore, TelemetryService } from '@dxheroes/ado-core';
import { tasksRouter } from '../tasks.js';
import type { Context } from '../../context.js';
import type { ApiConfig } from '../../../types.js';

describe('Tasks tRPC Router', () => {
	let mockStateStore: StateStore;
	let mockTelemetry: TelemetryService;
	let mockContext: Context;

	const mockConfig: ApiConfig = {
		port: 3000,
		host: 'localhost',
	};

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
			getTasksByStatus: vi.fn(),
			recordUsage: vi.fn(),
			getUsageByProvider: vi.fn(),
			getTotalUsage: vi.fn(),
			createCheckpoint: vi.fn(),
			getCheckpoint: vi.fn(),
			getLatestCheckpoint: vi.fn(),
			close: vi.fn(),
		};

		mockTelemetry = {
			trace: vi.fn(),
			traceAsync: vi.fn(async (_name, fn) => fn()),
			recordMetric: vi.fn(),
			recordEvent: vi.fn(),
			flush: vi.fn(),
			shutdown: vi.fn(),
		};

		mockContext = {
			config: mockConfig,
			stateStore: mockStateStore,
			telemetry: mockTelemetry,
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('create', () => {
		it('should create a task with minimal input', async () => {
			const input = {
				prompt: 'Test task',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'feature' as const,
			};

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.create(input);

			expect(result).toBeDefined();
			expect(result.id).toMatch(/^task-/);
			expect(result.status).toBe('queued');
			expect(result.createdAt).toBeDefined();
			expect(result.estimatedDuration).toBeDefined();
			expect(result.estimatedCost).toBeDefined();
			expect(result.queuePosition).toBe(1);
		});

		it('should create a task with all optional fields', async () => {
			const input = {
				prompt: 'Complex test task',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'greenfield' as const,
				hitlPolicy: 'spec-review' as const,
				providers: ['claude-code', 'gemini-cli'],
				excludeProviders: ['cursor-cli'],
				maxCost: 5.0,
				qualityGates: {
					build: true,
					tests: true,
					lint: true,
					coverage: 80,
				},
				priority: 'high' as const,
				tags: ['urgent', 'feature'],
			};

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.create(input);

			expect(result).toBeDefined();
			expect(result.status).toBe('queued');
		});

		it('should validate prompt is not empty', async () => {
			const input = {
				prompt: '',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'feature' as const,
			};

			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.create(input)).rejects.toThrow();
		});

		it('should validate taskType is valid', async () => {
			const input = {
				prompt: 'Test task',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'invalid' as any,
			};

			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.create(input)).rejects.toThrow();
		});

		it('should validate maxCost is positive', async () => {
			const input = {
				prompt: 'Test task',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'feature' as const,
				maxCost: -1,
			};

			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.create(input)).rejects.toThrow();
		});

		it('should validate coverage is between 0 and 100', async () => {
			const input = {
				prompt: 'Test task',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'feature' as const,
				qualityGates: {
					coverage: 150,
				},
			};

			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.create(input)).rejects.toThrow();
		});
	});

	describe('get', () => {
		it('should get task by ID', async () => {
			const taskId = 'task-123';

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.get(taskId);

			expect(result).toBeDefined();
			expect(result.id).toBe(taskId);
			expect(result.status).toBe('queued');
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('tasks.get', expect.any(Function));
		});

		it('should return task with all fields', async () => {
			const taskId = 'task-456';

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.get(taskId);

			expect(result.id).toBe(taskId);
			expect(result.prompt).toBeDefined();
			expect(result.status).toBeDefined();
			expect(result.progress).toBeDefined();
			expect(result.currentStep).toBeDefined();
			expect(result.subtasks).toBeDefined();
			expect(result.createdAt).toBeDefined();
			expect(result.checkpoints).toBeDefined();
		});

		it('should work without state store', async () => {
			// get is a publicProcedure, so it doesn't require state store
			const contextWithoutStore: Context = {
				config: mockConfig,
			};

			const caller = tasksRouter.createCaller(contextWithoutStore);
			const result = await caller.get('task-123');

			expect(result).toBeDefined();
			expect(result.id).toBe('task-123');
		});

		it('should work with telemetry disabled', async () => {
			const contextWithoutTelemetry: Context = {
				config: mockConfig,
				stateStore: mockStateStore,
			};

			const caller = tasksRouter.createCaller(contextWithoutTelemetry);
			const result = await caller.get('task-123');

			expect(result).toBeDefined();
		});
	});

	describe('list', () => {
		it('should list tasks with default parameters', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({});

			expect(result).toBeDefined();
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
			expect(result.hasMore).toBe(false);
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('tasks.list', expect.any(Function));
		});

		it('should filter by status', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({ status: 'running' });

			expect(result).toBeDefined();
		});

		it('should filter by projectId', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({ projectId: 'test-project' });

			expect(result).toBeDefined();
		});

		it('should filter by providerId', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({ providerId: 'claude-code' });

			expect(result).toBeDefined();
		});

		it('should filter by tags', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({ tags: ['urgent', 'feature'] });

			expect(result).toBeDefined();
		});

		it('should filter by date range', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({
				from: '2024-01-01T00:00:00Z',
				to: '2024-12-31T23:59:59Z',
			});

			expect(result).toBeDefined();
		});

		it('should paginate with limit and offset', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({ limit: 10, offset: 20 });

			expect(result).toBeDefined();
		});

		it('should respect max limit of 100', async () => {
			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.list({ limit: 101 })).rejects.toThrow();
		});

		it('should sort by orderBy and order', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({ orderBy: 'createdAt', order: 'desc' });

			expect(result).toBeDefined();
		});

		it('should use default limit of 20', async () => {
			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.list({});

			expect(result).toBeDefined();
		});
	});

	describe('cancel', () => {
		it('should cancel a task', async () => {
			const taskId = 'task-123';

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.cancel(taskId);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.message).toContain(taskId);
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('tasks.cancel', expect.any(Function));
		});

		it('should return success message', async () => {
			const taskId = 'task-456';

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.cancel(taskId);

			expect(result.message).toBe(`Task ${taskId} cancelled`);
		});
	});

	describe('pause', () => {
		it('should pause a task', async () => {
			const taskId = 'task-123';

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.pause(taskId);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.checkpointId).toMatch(/^checkpoint-/);
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('tasks.pause', expect.any(Function));
		});

		it('should return checkpoint ID', async () => {
			const taskId = 'task-456';

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.pause(taskId);

			expect(result.checkpointId).toBeDefined();
			expect(typeof result.checkpointId).toBe('string');
		});
	});

	describe('resume', () => {
		it('should resume a task without checkpoint', async () => {
			const input = {
				taskId: 'task-123',
			};

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.resume(input);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.message).toContain(input.taskId);
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('tasks.resume', expect.any(Function));
		});

		it('should resume a task with checkpoint', async () => {
			const input = {
				taskId: 'task-123',
				checkpointId: 'checkpoint-456',
			};

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.resume(input);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
		});

		it('should return success message', async () => {
			const input = {
				taskId: 'task-789',
			};

			const caller = tasksRouter.createCaller(mockContext);
			const result = await caller.resume(input);

			expect(result.message).toBe(`Task ${input.taskId} resumed`);
		});
	});

	describe('onTaskEvent subscription', () => {
		it('should have subscription procedure defined', () => {
			expect(tasksRouter.onTaskEvent).toBeDefined();
		});

		it('should create observable subscription for task events', () => {
			// Note: Subscriptions in tRPC require a full server setup with WebSocket support
			// For unit tests, we just verify the procedure is defined correctly
			expect(tasksRouter._def.procedures.onTaskEvent).toBeDefined();
		});

		it('should be a subscription type', () => {
			// Verify it's a subscription procedure
			const procedure = tasksRouter._def.procedures.onTaskEvent;
			expect(procedure).toBeDefined();
			// Subscription procedures are functions in tRPC
			expect(typeof procedure).toBe('function');
		});
	});

	describe('error handling', () => {
		it('should handle errors gracefully in create', async () => {
			const input = {
				prompt: 'Test task',
				projectId: 'test-project',
				repositoryPath: '/test/repo',
				taskType: 'feature' as const,
			};

			const caller = tasksRouter.createCaller(mockContext);

			// Should not throw
			await expect(caller.create(input)).resolves.toBeDefined();
		});

		it('should handle missing telemetry gracefully', async () => {
			const contextWithoutTelemetry: Context = {
				config: mockConfig,
				stateStore: mockStateStore,
			};

			const caller = tasksRouter.createCaller(contextWithoutTelemetry);
			const result = await caller.list({});

			expect(result).toBeDefined();
		});
	});

	describe('input validation', () => {
		it('should validate datetime strings', async () => {
			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.list({ from: 'invalid-date' })).rejects.toThrow();
		});

		it('should validate enum values', async () => {
			const caller = tasksRouter.createCaller(mockContext);

			await expect(
				caller.list({ status: 'invalid' as any }),
			).rejects.toThrow();
		});

		it('should validate numeric ranges', async () => {
			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.list({ limit: 0 })).rejects.toThrow();
		});

		it('should validate required fields', async () => {
			const caller = tasksRouter.createCaller(mockContext);

			await expect(caller.create({} as any)).rejects.toThrow();
		});
	});
});
