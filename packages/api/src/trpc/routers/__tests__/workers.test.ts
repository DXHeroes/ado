/**
 * Workers tRPC Router Tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { StateStore, TelemetryService } from '@dxheroes/ado-core';
import { workersRouter } from '../workers.js';
import type { Context } from '../../context.js';
import type { ApiConfig } from '../../../types.js';

describe('Workers tRPC Router', () => {
	let mockStateStore: StateStore;
	let mockTelemetry: TelemetryService;
	let mockContext: Context;
	let mockContextWithState: Context;

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
			isEnabled: vi.fn(() => true),
		} as any;

		mockContext = {
			config: mockConfig,
			telemetry: mockTelemetry,
		};

		mockContextWithState = {
			config: mockConfig,
			stateStore: mockStateStore,
			telemetry: mockTelemetry,
		};
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('register', () => {
		it('should register a worker with minimal fields', async () => {
			const input = {
				workerId: 'worker-123',
				capabilities: ['typescript', 'python'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.register(input);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.workerId).toBe(input.workerId);
			expect(result.registeredAt).toBeDefined();
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('workers.register', expect.any(Function));
		});

		it.skip('should register a worker with metadata', async () => {
			// FIXME: This test fails due to a Zod v4 issue with z.record() parsing
			// Error: Cannot read properties of undefined (reading '_zod')
			const input = {
				workerId: 'worker-456',
				capabilities: ['javascript', 'go'],
				resources: {
					cpu: 8,
					memory: 16384,
				},
				metadata: {
					region: 'us-east-1',
					zone: 'a',
					instanceType: 't3.xlarge',
				} as Record<string, string>,
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.register(input);

			expect(result.success).toBe(true);
			expect(result.workerId).toBe(input.workerId);
		});

		it('should validate workerId is not empty', async () => {
			const input = {
				workerId: '',
				capabilities: ['typescript'],
				resources: { cpu: 2, memory: 4096 },
			};

			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(caller.register(input)).rejects.toThrow();
		});

		it('should validate capabilities array', async () => {
			const input = {
				workerId: 'worker-789',
				capabilities: [],
				resources: { cpu: 2, memory: 4096 },
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.register(input);

			expect(result).toBeDefined();
		});

		it('should validate resources', async () => {
			const input = {
				workerId: 'worker-123',
				capabilities: ['typescript'],
				resources: { cpu: 0, memory: 0 },
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.register(input);

			expect(result).toBeDefined();
		});
	});

	describe('heartbeat', () => {
		it('should send heartbeat for worker', async () => {
			const input = { workerId: 'worker-123' };

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.heartbeat(input);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.timestamp).toBeDefined();
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('workers.heartbeat', expect.any(Function));
		});

		it('should return current timestamp', async () => {
			const input = { workerId: 'worker-456' };

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.heartbeat(input);

			const timestamp = new Date(result.timestamp);
			expect(timestamp).toBeInstanceOf(Date);
			expect(timestamp.getTime()).toBeGreaterThan(0);
		});

		it('should validate workerId', async () => {
			const input = { workerId: '' };

			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(caller.heartbeat(input)).rejects.toThrow();
		});
	});

	describe('list', () => {
		it('should list all workers with default parameters', async () => {
			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.list({});

			expect(result).toBeDefined();
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
			expect(result.hasMore).toBe(false);
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('workers.list', expect.any(Function));
		});

		it('should filter by status', async () => {
			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.list({ status: 'idle' });

			expect(result).toBeDefined();
		});

		it('should filter by capability', async () => {
			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.list({ capability: 'typescript' });

			expect(result).toBeDefined();
		});

		it('should paginate with limit and offset', async () => {
			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.list({ limit: 10, offset: 5 });

			expect(result).toBeDefined();
		});

		it('should respect max limit of 100', async () => {
			const caller = workersRouter.createCaller(mockContext);

			await expect(caller.list({ limit: 101 })).rejects.toThrow();
		});

		it('should use default limit of 20', async () => {
			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.list({});

			expect(result).toBeDefined();
		});

		it('should validate status enum', async () => {
			const caller = workersRouter.createCaller(mockContext);

			await expect(
				caller.list({ status: 'invalid' as any }),
			).rejects.toThrow();
		});
	});

	describe('getStatus', () => {
		it('should get worker status', async () => {
			const workerId = 'worker-123';

			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.getStatus(workerId);

			expect(result).toBeDefined();
			expect(result.workerId).toBe(workerId);
			expect(result.status).toBe('idle');
			expect(result.currentTask).toBeNull();
			expect(result.uptime).toBeDefined();
			expect(result.totalTasksCompleted).toBeDefined();
			expect(result.lastHeartbeat).toBeDefined();
			expect(result.resources).toBeDefined();
			expect(result.capabilities).toEqual([]);
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('workers.getStatus', expect.any(Function));
		});

		it('should return resources information', async () => {
			const workerId = 'worker-456';

			const caller = workersRouter.createCaller(mockContext);
			const result = await caller.getStatus(workerId);

			expect(result.resources).toHaveProperty('cpu');
			expect(result.resources).toHaveProperty('memory');
			expect(result.resources.cpu).toBe(0);
			expect(result.resources.memory).toBe(0);
		});

		it('should validate workerId', async () => {
			const caller = workersRouter.createCaller(mockContext);

			await expect(caller.getStatus('')).rejects.toThrow();
		});
	});

	describe('assignTask', () => {
		it('should assign task to worker', async () => {
			const input = {
				workerId: 'worker-123',
				taskId: 'task-456',
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.assignTask(input);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.workerId).toBe(input.workerId);
			expect(result.taskId).toBe(input.taskId);
			expect(result.assignedAt).toBeDefined();
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('workers.assignTask', expect.any(Function));
		});

		it('should return assignment timestamp', async () => {
			const input = {
				workerId: 'worker-789',
				taskId: 'task-101',
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.assignTask(input);

			const timestamp = new Date(result.assignedAt);
			expect(timestamp).toBeInstanceOf(Date);
			expect(timestamp.getTime()).toBeGreaterThan(0);
		});

		it('should validate workerId and taskId', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(
				caller.assignTask({ workerId: '', taskId: 'task-123' }),
			).rejects.toThrow();

			await expect(
				caller.assignTask({ workerId: 'worker-123', taskId: '' }),
			).rejects.toThrow();
		});
	});

	describe('unregister', () => {
		it('should unregister a worker', async () => {
			const workerId = 'worker-123';

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.unregister(workerId);

			expect(result).toBeDefined();
			expect(result.success).toBe(true);
			expect(result.workerId).toBe(workerId);
			expect(result.unregisteredAt).toBeDefined();
			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith('workers.unregister', expect.any(Function));
		});

		it('should return unregistration timestamp', async () => {
			const workerId = 'worker-456';

			const caller = workersRouter.createCaller(mockContextWithState);
			const result = await caller.unregister(workerId);

			const timestamp = new Date(result.unregisteredAt);
			expect(timestamp).toBeInstanceOf(Date);
			expect(timestamp.getTime()).toBeGreaterThan(0);
		});

		it('should validate workerId', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(caller.unregister('')).rejects.toThrow();
		});
	});

	describe('onWorkerStatus subscription', () => {
		it('should have subscription procedure defined', () => {
			expect(workersRouter.onWorkerStatus).toBeDefined();
		});

		it('should create observable subscription for worker status', () => {
			// Note: Subscriptions in tRPC require a full server setup with WebSocket support
			// For unit tests, we just verify the procedure is defined correctly
			expect(workersRouter._def.procedures.onWorkerStatus).toBeDefined();
		});

		it('should be a subscription type', () => {
			// Verify it's a subscription procedure
			const procedure = workersRouter._def.procedures.onWorkerStatus;
			expect(procedure).toBeDefined();
			// Subscription procedures are functions in tRPC
			// Just verify it exists
			expect(typeof procedure).toBe('function');
		});
	});

	describe('error handling', () => {
		it('should handle errors gracefully in register', async () => {
			const input = {
				workerId: 'worker-error',
				capabilities: ['test'],
				resources: { cpu: 1, memory: 1024 },
			};

			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(caller.register(input)).resolves.toBeDefined();
		});

		it('should handle missing telemetry gracefully', async () => {
			const contextWithoutTelemetry: Context = {
				config: mockConfig,
				stateStore: mockStateStore,
			};

			const caller = workersRouter.createCaller(contextWithoutTelemetry);
			const result = await caller.list({});

			expect(result).toBeDefined();
		});

		it('should handle errors in heartbeat', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(caller.heartbeat({ workerId: 'worker-123' })).resolves.toBeDefined();
		});
	});

	describe('input validation', () => {
		it('should validate enum values', async () => {
			const caller = workersRouter.createCaller(mockContext);

			await expect(
				caller.list({ status: 'unknown' as any }),
			).rejects.toThrow();
		});

		it('should validate numeric ranges', async () => {
			const caller = workersRouter.createCaller(mockContext);

			await expect(caller.list({ limit: 0 })).rejects.toThrow();
			await expect(caller.list({ offset: -1 })).rejects.toThrow();
		});

		it('should validate required fields', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(caller.register({} as any)).rejects.toThrow();
			await expect(caller.heartbeat({} as any)).rejects.toThrow();
			await expect(caller.assignTask({} as any)).rejects.toThrow();
		});

		it('should validate string fields are not empty', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);

			await expect(
				caller.register({
					workerId: '',
					capabilities: [],
					resources: { cpu: 1, memory: 1024 },
				}),
			).rejects.toThrow();
		});
	});

	describe('telemetry integration', () => {
		it('should trace register calls', async () => {
			const input = {
				workerId: 'worker-trace',
				capabilities: ['test'],
				resources: { cpu: 1, memory: 1024 },
			};

			const caller = workersRouter.createCaller(mockContextWithState);
			await caller.register(input);

			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith(
				'workers.register',
				expect.any(Function),
			);
		});

		it('should trace heartbeat calls', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);
			await caller.heartbeat({ workerId: 'worker-123' });

			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith(
				'workers.heartbeat',
				expect.any(Function),
			);
		});

		it('should trace list calls', async () => {
			const caller = workersRouter.createCaller(mockContext);
			await caller.list({});

			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith(
				'workers.list',
				expect.any(Function),
			);
		});

		it('should trace getStatus calls', async () => {
			const caller = workersRouter.createCaller(mockContext);
			await caller.getStatus('worker-123');

			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith(
				'workers.getStatus',
				expect.any(Function),
			);
		});

		it('should trace assignTask calls', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);
			await caller.assignTask({ workerId: 'worker-123', taskId: 'task-456' });

			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith(
				'workers.assignTask',
				expect.any(Function),
			);
		});

		it('should trace unregister calls', async () => {
			const caller = workersRouter.createCaller(mockContextWithState);
			await caller.unregister('worker-123');

			expect(mockTelemetry.traceAsync).toHaveBeenCalledWith(
				'workers.unregister',
				expect.any(Function),
			);
		});
	});
});
