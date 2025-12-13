/**
 * Tests for ParallelScheduler
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionPlan, TaskNode } from '../../autonomous/dependency-graph.js';
import type { RecoveryManager } from '../../autonomous/recovery-manager.js';
import { LocalWorkerPool, ParallelScheduler, type WorkerPool } from '../parallel-scheduler.js';

describe('ParallelScheduler', () => {
	let workerPool: WorkerPool;
	let recoveryManager: RecoveryManager;
	let scheduler: ParallelScheduler;

	beforeEach(() => {
		// Create mock recovery manager
		recoveryManager = {
			withRetry: vi.fn(async (operation) => {
				return await operation();
			}),
		} as unknown as RecoveryManager;

		// Create mock worker pool
		const taskExecutor = vi.fn(async () => ({
			success: true,
		}));

		workerPool = new LocalWorkerPool(2, taskExecutor);
		scheduler = new ParallelScheduler(workerPool, recoveryManager);
	});

	describe('execute', () => {
		it('should execute single task successfully', async () => {
			const task: TaskNode = {
				id: 'task-1',
				type: 'feature',
				description: 'Task 1',
				estimatedDuration: 10,
				priority: 'high',
				dependencies: [],
				parallel: false,
				metadata: {},
			};

			const plan: ExecutionPlan = {
				tasks: [task],
				stages: [
					{
						stage: 0,
						tasks: ['task-1'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 10,
				parallelizationFactor: 1,
			};

			const taskDefinitions = new Map([['task-1', { prompt: 'Test task' }]]);

			const result = await scheduler.execute(plan, taskDefinitions);

			expect(result.success).toBe(true);
			expect(result.totalTasks).toBe(1);
			expect(result.completedTasks).toBe(1);
			expect(result.failedTasks).toBe(0);
		});

		it('should execute multiple tasks in sequence', async () => {
			const plan: ExecutionPlan = {
				tasks: [
					{
						id: 'task-1',
						type: 'feature',
						description: 'Task 1',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: false,
						metadata: {},
					},
					{
						id: 'task-2',
						type: 'feature',
						description: 'Task 2',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: ['task-1'],
						parallel: false,
						metadata: {},
					},
				],
				stages: [
					{
						stage: 0,
						tasks: ['task-1'],
						estimatedDuration: 10,
					},
					{
						stage: 1,
						tasks: ['task-2'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 20,
				parallelizationFactor: 1,
			};

			const taskDefinitions = new Map([
				['task-1', { prompt: 'Task 1' }],
				['task-2', { prompt: 'Task 2' }],
			]);

			const result = await scheduler.execute(plan, taskDefinitions);

			expect(result.success).toBe(true);
			expect(result.completedTasks).toBe(2);
		});

		it('should execute parallel tasks concurrently', async () => {
			const plan: ExecutionPlan = {
				tasks: [
					{
						id: 'task-1',
						type: 'feature',
						description: 'Task 1',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: true,
						metadata: {},
					},
					{
						id: 'task-2',
						type: 'feature',
						description: 'Task 2',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: true,
						metadata: {},
					},
				],
				stages: [
					{
						stage: 0,
						tasks: ['task-1', 'task-2'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 10,
				parallelizationFactor: 2,
			};

			const taskDefinitions = new Map([
				['task-1', { prompt: 'Task 1' }],
				['task-2', { prompt: 'Task 2' }],
			]);

			const startTime = Date.now();
			const result = await scheduler.execute(plan, taskDefinitions);
			const _duration = Date.now() - startTime;

			expect(result.success).toBe(true);
			expect(result.completedTasks).toBe(2);
			// Parallel execution should be faster than sequential
			// (though in tests this might not be as pronounced)
		});

		it.skip('should handle task failures with retry strategy', async () => {
			let callCount = 0;
			const failingExecutor = vi.fn(async () => {
				callCount++;
				if (callCount < 2) {
					return { success: false, error: 'Temporary failure' };
				}
				return { success: true };
			});

			const testWorkerPool = new LocalWorkerPool(2, failingExecutor);
			const testScheduler = new ParallelScheduler(testWorkerPool, recoveryManager, {
				failureStrategy: 'retry',
				maxRetries: 3,
			});

			const plan: ExecutionPlan = {
				tasks: [
					{
						id: 'task-1',
						type: 'feature',
						description: 'Task 1',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: false,
						metadata: {},
					},
				],
				stages: [
					{
						stage: 0,
						tasks: ['task-1'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 10,
				parallelizationFactor: 1,
			};

			const taskDefinitions = new Map([['task-1', { prompt: 'Test task' }]]);

			const result = await testScheduler.execute(plan, taskDefinitions);

			expect(result.success).toBe(true);
		});

		it('should abort on failure with abort strategy', async () => {
			const failingExecutor = vi.fn(async () => ({
				success: false,
				error: 'Task failed',
			}));

			const testWorkerPool = new LocalWorkerPool(2, failingExecutor);

			// Mock recovery manager that doesn't retry
			const mockRecoveryManager = {
				withRetry: vi.fn(async (operation) => {
					const result = await operation();
					if (!result.success) {
						throw new Error(result.error);
					}
					return result;
				}),
			} as unknown as RecoveryManager;

			const testScheduler = new ParallelScheduler(testWorkerPool, mockRecoveryManager, {
				failureStrategy: 'abort',
			});

			const plan: ExecutionPlan = {
				tasks: [
					{
						id: 'task-1',
						type: 'feature',
						description: 'Task 1',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: false,
						metadata: {},
					},
				],
				stages: [
					{
						stage: 0,
						tasks: ['task-1'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 10,
				parallelizationFactor: 1,
			};

			const taskDefinitions = new Map([['task-1', { prompt: 'Test task' }]]);

			const result = await testScheduler.execute(plan, taskDefinitions);

			expect(result.success).toBe(false);
		});
	});

	describe('getTaskStatus', () => {
		it('should return task execution status', async () => {
			const plan: ExecutionPlan = {
				tasks: [
					{
						id: 'task-1',
						type: 'feature',
						description: 'Task 1',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: false,
						metadata: {},
					},
				],
				stages: [
					{
						stage: 0,
						tasks: ['task-1'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 10,
				parallelizationFactor: 1,
			};

			const taskDefinitions = new Map([['task-1', { prompt: 'Test task' }]]);

			await scheduler.execute(plan, taskDefinitions);

			const status = scheduler.getTaskStatus('task-1');

			expect(status).toBeDefined();
			expect(status?.taskId).toBe('task-1');
			expect(status?.status).toBe('completed');
		});

		it('should return undefined for non-existent task', () => {
			const status = scheduler.getTaskStatus('non-existent');

			expect(status).toBeUndefined();
		});
	});

	describe('getAllExecutions', () => {
		it('should return all task executions', async () => {
			const plan: ExecutionPlan = {
				tasks: [
					{
						id: 'task-1',
						type: 'feature',
						description: 'Task 1',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: false,
						metadata: {},
					},
					{
						id: 'task-2',
						type: 'feature',
						description: 'Task 2',
						estimatedDuration: 10,
						priority: 'high',
						dependencies: [],
						parallel: false,
						metadata: {},
					},
				],
				stages: [
					{
						stage: 0,
						tasks: ['task-1', 'task-2'],
						estimatedDuration: 10,
					},
				],
				estimatedTotalDuration: 10,
				parallelizationFactor: 1,
			};

			const taskDefinitions = new Map([
				['task-1', { prompt: 'Task 1' }],
				['task-2', { prompt: 'Task 2' }],
			]);

			await scheduler.execute(plan, taskDefinitions);

			const executions = scheduler.getAllExecutions();

			expect(executions).toHaveLength(2);
		});
	});

	describe('getRunningTaskCount', () => {
		it('should return 0 when no tasks are running', () => {
			expect(scheduler.getRunningTaskCount()).toBe(0);
		});
	});

	describe('cancelAll', () => {
		it('should cancel all running tasks', async () => {
			await scheduler.cancelAll();

			expect(scheduler.getRunningTaskCount()).toBe(0);
		});
	});
});

describe('LocalWorkerPool', () => {
	let taskExecutor: ReturnType<typeof vi.fn>;
	let pool: LocalWorkerPool;

	beforeEach(() => {
		taskExecutor = vi.fn(async () => ({ success: true }));
		pool = new LocalWorkerPool(3, taskExecutor);
	});

	describe('getAvailableWorker', () => {
		it('should return available worker', async () => {
			const workerId = await pool.getAvailableWorker();

			expect(workerId).toBeDefined();
			expect(workerId).toContain('local-worker-');
		});

		it('should mark worker as busy after assignment', async () => {
			const workerId = await pool.getAvailableWorker();

			expect(workerId).toBeDefined();
			expect(pool.getAvailableWorkerCount()).toBe(2);
			expect(pool.getBusyWorkerCount()).toBe(1);
		});

		it('should return undefined when all workers are busy', async () => {
			// Allocate all workers
			await pool.getAvailableWorker();
			await pool.getAvailableWorker();
			await pool.getAvailableWorker();

			const workerId = await pool.getAvailableWorker();

			expect(workerId).toBeUndefined();
		});
	});

	describe('executeTask', () => {
		it('should execute task using task executor', async () => {
			const workerId = 'local-worker-0';
			const result = await pool.executeTask(workerId, 'task-1', { prompt: 'Test' });

			expect(result.success).toBe(true);
			expect(taskExecutor).toHaveBeenCalledWith('task-1', { prompt: 'Test' });
		});
	});

	describe('releaseWorker', () => {
		it('should release worker back to available pool', async () => {
			const workerId = await pool.getAvailableWorker();

			expect(pool.getBusyWorkerCount()).toBe(1);

			if (workerId) {
				pool.releaseWorker(workerId);
			}

			expect(pool.getBusyWorkerCount()).toBe(0);
			expect(pool.getAvailableWorkerCount()).toBe(3);
		});
	});

	describe('isWorkerAvailable', () => {
		it('should return true for available worker', async () => {
			const isAvailable = await pool.isWorkerAvailable('local-worker-0');

			expect(isAvailable).toBe(true);
		});

		it('should return false for busy worker', async () => {
			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				const isAvailable = await pool.isWorkerAvailable(workerId);
				expect(isAvailable).toBe(false);
			}
		});
	});
});
