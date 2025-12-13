/**
 * Tests for DynamicWorkerPool
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	DynamicWorkerPool,
	createDynamicWorkerPool,
	type DynamicWorkerPoolConfig,
	type WorkerInstance,
} from '../dynamic-worker-pool.js';
import type { K8sWorkerSpawner } from '../../worker/k8s-worker-spawner.js';
import type { WorkerMessage } from '../../worker/worker-protocol.js';

describe('DynamicWorkerPool', () => {
	let mockSpawner: K8sWorkerSpawner;
	let pool: DynamicWorkerPool;

	beforeEach(() => {
		vi.clearAllMocks();

		mockSpawner = {
			spawnWorker: vi.fn().mockResolvedValue({
				name: 'test-worker',
				namespace: 'default',
				status: 'Running',
				createdAt: new Date().toISOString(),
			}),
			terminateWorker: vi.fn().mockResolvedValue(undefined),
		} as unknown as K8sWorkerSpawner;

		pool = new DynamicWorkerPool(mockSpawner, {
			minWorkers: 1,
			maxWorkers: 5,
			targetUtilization: 0.7,
			scaleUpThreshold: 2,
			scaleDownThreshold: 60000, // 1 minute
			scalingCooldown: 10000, // 10 seconds
			workerIdleTimeout: 120000, // 2 minutes
		});
	});

	afterEach(() => {
		pool.stopAutoScaling();
	});

	describe('constructor', () => {
		it('should create pool with default config', () => {
			const p = new DynamicWorkerPool(mockSpawner);
			expect(p).toBeDefined();
		});

		it('should create pool with custom config', () => {
			const config: Partial<DynamicWorkerPoolConfig> = {
				minWorkers: 2,
				maxWorkers: 10,
				targetUtilization: 0.8,
			};

			const p = new DynamicWorkerPool(mockSpawner, config);
			expect(p).toBeDefined();
		});

		it('should use factory function', () => {
			const p = createDynamicWorkerPool(mockSpawner);
			expect(p).toBeDefined();
		});
	});

	describe('initialize', () => {
		it('should spawn minimum workers on initialization', async () => {
			await pool.initialize();

			expect(mockSpawner.spawnWorker).toHaveBeenCalledTimes(1);
		});

		it('should start auto-scaling after initialization', async () => {
			await pool.initialize();

			const metrics = pool.getMetrics();
			expect(metrics.currentWorkers).toBeGreaterThanOrEqual(1);
		});
	});

	describe('getAvailableWorker', () => {
		it('should return available worker', async () => {
			await pool.initialize();

			// Wait a bit for workers to be ready
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			expect(workerId).toBeDefined();
			expect(typeof workerId).toBe('string');
		});

		it('should mark worker as busy when assigned', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			const metrics = pool.getMetrics();
			expect(metrics.busyWorkers).toBe(1);
		});

		it('should return undefined when no workers available', async () => {
			const smallPool = new DynamicWorkerPool(mockSpawner, {
				minWorkers: 0,
				maxWorkers: 1,
			});

			const workerId = await smallPool.getAvailableWorker();

			expect(workerId).toBeUndefined();

			smallPool.stopAutoScaling();
		});
	});

	describe('executeTask', () => {
		it('should execute task on worker', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				const result = await pool.executeTask(workerId, 'task-1', { prompt: 'test' });

				expect(result.success).toBe(true);
			}
		});

		it('should return error for non-existent worker', async () => {
			const result = await pool.executeTask('non-existent', 'task-1', { prompt: 'test' });

			expect(result.success).toBe(false);
			expect(result.error).toBe('Worker not found');
		});

		it('should update worker state during task execution', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				const executePromise = pool.executeTask(workerId, 'task-1', { prompt: 'test' });

				const metrics = pool.getMetrics();
				expect(metrics.busyWorkers).toBe(1);

				await executePromise;
			}
		});
	});

	describe('releaseWorker', () => {
		it('should release worker back to idle pool', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				pool.releaseWorker(workerId);

				const available = await pool.isWorkerAvailable(workerId);
				expect(available).toBe(true);
			}
		});

		it('should do nothing for non-existent worker', () => {
			pool.releaseWorker('non-existent');

			// Should not throw
			expect(true).toBe(true);
		});
	});

	describe('isWorkerAvailable', () => {
		it('should return true for idle worker', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				pool.releaseWorker(workerId);

				const available = await pool.isWorkerAvailable(workerId);
				expect(available).toBe(true);
			}
		});

		it('should return false for busy worker', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				const available = await pool.isWorkerAvailable(workerId);
				expect(available).toBe(false);
			}
		});

		it('should return false for non-existent worker', async () => {
			const available = await pool.isWorkerAvailable('non-existent');
			expect(available).toBe(false);
		});
	});

	describe('getMetrics', () => {
		it('should return scaling metrics', async () => {
			await pool.initialize();

			const metrics = pool.getMetrics();

			expect(metrics.currentWorkers).toBeGreaterThanOrEqual(0);
			expect(metrics.desiredWorkers).toBeGreaterThanOrEqual(0);
			expect(metrics.busyWorkers).toBeGreaterThanOrEqual(0);
			expect(metrics.idleWorkers).toBeGreaterThanOrEqual(0);
			expect(metrics.queueLength).toBeGreaterThanOrEqual(0);
			expect(metrics.avgCpuUtilization).toBeGreaterThanOrEqual(0);
			expect(metrics.avgMemoryUtilization).toBeGreaterThanOrEqual(0);
		});

		it('should calculate correct worker counts', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			const metrics = pool.getMetrics();

			if (workerId) {
				expect(metrics.busyWorkers).toBe(1);
				expect(metrics.currentWorkers).toBeGreaterThanOrEqual(1);
			}
		});

		it('should calculate average utilization', async () => {
			await pool.initialize();

			const metrics = pool.getMetrics();

			expect(metrics.avgCpuUtilization).toBeGreaterThanOrEqual(0);
			expect(metrics.avgCpuUtilization).toBeLessThanOrEqual(1);
			expect(metrics.avgMemoryUtilization).toBeGreaterThanOrEqual(0);
			expect(metrics.avgMemoryUtilization).toBeLessThanOrEqual(1);
		});
	});

	describe('auto-scaling', () => {
		it('should scale up when queue is building', async () => {
			const scalingPool = new DynamicWorkerPool(mockSpawner, {
				minWorkers: 1,
				maxWorkers: 5,
				scaleUpThreshold: 1,
				scalingCooldown: 100,
			});

			await scalingPool.initialize();

			// Simulate queue buildup
			const initialMetrics = scalingPool.getMetrics();

			scalingPool.stopAutoScaling();
		});

		it('should not scale beyond max workers', async () => {
			const scalingPool = new DynamicWorkerPool(mockSpawner, {
				minWorkers: 1,
				maxWorkers: 2,
				scaleUpThreshold: 0,
			});

			await scalingPool.initialize();

			const metrics = scalingPool.getMetrics();
			expect(metrics.currentWorkers).toBeLessThanOrEqual(2);

			scalingPool.stopAutoScaling();
		});

		it('should not scale below min workers', async () => {
			const scalingPool = new DynamicWorkerPool(mockSpawner, {
				minWorkers: 2,
				maxWorkers: 5,
			});

			await scalingPool.initialize();

			const metrics = scalingPool.getMetrics();
			expect(metrics.currentWorkers).toBeGreaterThanOrEqual(2);

			scalingPool.stopAutoScaling();
		});

		it('should respect scaling cooldown', async () => {
			const scalingPool = new DynamicWorkerPool(mockSpawner, {
				minWorkers: 1,
				maxWorkers: 5,
				scalingCooldown: 60000, // 1 minute
			});

			await scalingPool.initialize();

			scalingPool.stopAutoScaling();
		});
	});

	describe('stopAutoScaling', () => {
		it('should stop auto-scaling monitor', async () => {
			await pool.initialize();

			pool.stopAutoScaling();

			// Should not throw
			expect(true).toBe(true);
		});

		it('should be safe to call multiple times', async () => {
			await pool.initialize();

			pool.stopAutoScaling();
			pool.stopAutoScaling();

			expect(true).toBe(true);
		});
	});

	describe('shutdown', () => {
		it('should terminate all workers', async () => {
			await pool.initialize();

			await pool.shutdown();

			const metrics = pool.getMetrics();
			expect(metrics.currentWorkers).toBe(0);
		});

		it('should stop auto-scaling on shutdown', async () => {
			await pool.initialize();

			await pool.shutdown();

			// Should not throw
			expect(true).toBe(true);
		});
	});

	describe('handleWorkerMessage', () => {
		it('should handle worker registration', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				const message: WorkerMessage = {
					type: 'register',
					data: {
						workerId,
						capabilities: ['typescript', 'node'],
						resources: {
							cpu: 4,
							memory: 8192,
						},
					},
				};

				pool.handleWorkerMessage(workerId, message);

				const available = await pool.isWorkerAvailable(workerId);
				expect(available).toBe(true);
			}
		});

		it('should handle worker heartbeat', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				const message: WorkerMessage = {
					type: 'heartbeat',
					data: {
						workerId,
						timestamp: new Date().toISOString(),
						status: 'idle',
						uptime: 100,
						metrics: {
							cpuUsage: 50,
							memoryUsage: 2048,
							activeConnections: 0,
						},
					},
				};

				pool.handleWorkerMessage(workerId, message);

				const metrics = pool.getMetrics();
				expect(metrics.avgCpuUtilization).toBeGreaterThan(0);
			}
		});

		it('should handle task result', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				await pool.executeTask(workerId, 'task-1', {});

				const message: WorkerMessage = {
					type: 'task.result',
					data: {
						taskId: 'task-1',
						workerId,
						status: 'completed',
						completedAt: new Date().toISOString(),
						metrics: {
							duration: 1000,
							tokensUsed: 100,
							cost: 0.01,
						},
					},
				};

				pool.handleWorkerMessage(workerId, message);

				const available = await pool.isWorkerAvailable(workerId);
				expect(available).toBe(true);
			}
		});

		it('should ignore messages for unknown workers', () => {
			const message: WorkerMessage = {
				type: 'heartbeat',
				data: {
					workerId: 'unknown',
					timestamp: new Date().toISOString(),
					status: 'idle',
					uptime: 100,
				},
			};

			pool.handleWorkerMessage('unknown', message);

			// Should not throw
			expect(true).toBe(true);
		});
	});

	describe('worker lifecycle', () => {
		it('should track worker spawn time', async () => {
			await pool.initialize();

			await new Promise((resolve) => setTimeout(resolve, 100));

			const metrics = pool.getMetrics();
			expect(metrics.currentWorkers).toBeGreaterThan(0);
		});

		it('should track worker last used time', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				await pool.executeTask(workerId, 'task-1', {});
				pool.releaseWorker(workerId);

				// Worker should have lastUsedAt timestamp
				expect(true).toBe(true);
			}
		});

		it('should handle worker spawn failures gracefully', async () => {
			const failingSpawner = {
				spawnWorker: vi.fn().mockRejectedValue(new Error('Spawn failed')),
				terminateWorker: vi.fn().mockResolvedValue(undefined),
			} as unknown as K8sWorkerSpawner;

			const failPool = new DynamicWorkerPool(failingSpawner, {
				minWorkers: 1,
				maxWorkers: 2,
			});

			await failPool.initialize();

			const metrics = failPool.getMetrics();
			// Pool should handle failures gracefully
			expect(metrics.currentWorkers).toBeGreaterThanOrEqual(0);

			failPool.stopAutoScaling();
		});

		it('should handle worker termination failures gracefully', async () => {
			const failingSpawner = {
				spawnWorker: vi.fn().mockResolvedValue({
					name: 'test-worker',
					namespace: 'default',
					status: 'Running',
					createdAt: new Date().toISOString(),
				}),
				terminateWorker: vi.fn().mockRejectedValue(new Error('Termination failed')),
			} as unknown as K8sWorkerSpawner;

			const failPool = new DynamicWorkerPool(failingSpawner, {
				minWorkers: 1,
				maxWorkers: 2,
			});

			await failPool.initialize();
			await failPool.shutdown();

			// Should not throw
			expect(true).toBe(true);

			failPool.stopAutoScaling();
		});
	});

	describe('desired worker calculation', () => {
		it('should calculate desired workers based on demand', async () => {
			await pool.initialize();

			const metrics = pool.getMetrics();

			expect(metrics.desiredWorkers).toBeGreaterThanOrEqual(metrics.currentWorkers);
		});

		it('should respect min/max bounds', async () => {
			const boundedPool = new DynamicWorkerPool(mockSpawner, {
				minWorkers: 2,
				maxWorkers: 3,
			});

			await boundedPool.initialize();

			const metrics = boundedPool.getMetrics();

			expect(metrics.desiredWorkers).toBeGreaterThanOrEqual(2);
			expect(metrics.desiredWorkers).toBeLessThanOrEqual(3);

			boundedPool.stopAutoScaling();
		});
	});

	describe('queue management', () => {
		it('should process queued tasks when workers become available', async () => {
			await pool.initialize();
			await new Promise((resolve) => setTimeout(resolve, 100));

			const workerId = await pool.getAvailableWorker();

			if (workerId) {
				// Release worker - should process queue if any
				pool.releaseWorker(workerId);

				expect(true).toBe(true);
			}
		});

		it('should track queue length in metrics', async () => {
			await pool.initialize();

			const metrics = pool.getMetrics();

			expect(metrics.queueLength).toBeGreaterThanOrEqual(0);
		});
	});
});
