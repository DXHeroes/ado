/**
 * Worker Registry Tests
 *
 * Tests for in-memory worker registry implementation.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkerHeartbeat, WorkerRegistration } from '../worker-protocol.js';
import { InMemoryWorkerRegistry, createWorkerRegistry } from '../worker-registry.js';

describe('InMemoryWorkerRegistry', () => {
	let registry: InMemoryWorkerRegistry;

	beforeEach(() => {
		registry = new InMemoryWorkerRegistry();
	});

	describe('worker registration', () => {
		it('should register a worker', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript', 'node'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			await registry.register(registration);

			const worker = await registry.getWorker('worker-1');
			expect(worker).not.toBeNull();
			expect(worker?.workerId).toBe('worker-1');
			expect(worker?.status).toBe('idle');
			expect(worker?.capabilities).toEqual(['typescript', 'node']);
			expect(worker?.resources).toEqual({ cpu: 4, memory: 8192 });
		});

		it('should register worker with metadata', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-meta',
				capabilities: ['python'],
				resources: {
					cpu: 2,
					memory: 4096,
				},
				metadata: {
					hostname: 'worker-node-1',
					platform: 'linux',
					nodeVersion: 'v22.0.0',
				},
			};

			await registry.register(registration);

			const worker = await registry.getWorker('worker-meta');
			expect(worker).not.toBeNull();
		});

		it('should initialize worker with default metrics', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-metrics',
				capabilities: ['rust'],
				resources: {
					cpu: 8,
					memory: 16384,
				},
			};

			await registry.register(registration);

			const worker = await registry.getWorker('worker-metrics');
			expect(worker?.metrics).toEqual({
				totalTasksCompleted: 0,
				totalTasksFailed: 0,
				totalUptime: 0,
				avgTaskDuration: 0,
			});
		});

		it('should set registration and heartbeat timestamps', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-time',
				capabilities: ['go'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			const beforeRegistration = new Date();
			await registry.register(registration);
			const afterRegistration = new Date();

			const worker = await registry.getWorker('worker-time');
			expect(worker).not.toBeNull();

			const registeredAt = new Date(worker?.registeredAt);
			const lastHeartbeat = new Date(worker?.lastHeartbeat);

			expect(registeredAt.getTime()).toBeGreaterThanOrEqual(beforeRegistration.getTime());
			expect(registeredAt.getTime()).toBeLessThanOrEqual(afterRegistration.getTime());
			expect(lastHeartbeat.toISOString()).toBe(registeredAt.toISOString());
		});

		it('should re-register existing worker', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-rereg',
				capabilities: ['java'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			await registry.register(registration);

			// Re-register with different capabilities
			const newRegistration: WorkerRegistration = {
				workerId: 'worker-rereg',
				capabilities: ['java', 'kotlin'],
				resources: {
					cpu: 8,
					memory: 16384,
				},
			};

			await registry.register(newRegistration);

			const worker = await registry.getWorker('worker-rereg');
			expect(worker?.capabilities).toEqual(['java', 'kotlin']);
			expect(worker?.resources.cpu).toBe(8);
		});
	});

	describe('worker unregistration', () => {
		it('should unregister a worker', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-unreg',
				capabilities: ['typescript'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			await registry.register(registration);
			expect(await registry.getWorker('worker-unreg')).not.toBeNull();

			await registry.unregister('worker-unreg');
			expect(await registry.getWorker('worker-unreg')).toBeNull();
		});

		it('should handle unregistering non-existent worker', async () => {
			await expect(registry.unregister('non-existent')).resolves.not.toThrow();
		});
	});

	describe('heartbeat updates', () => {
		beforeEach(async () => {
			await registry.register({
				workerId: 'worker-hb',
				capabilities: ['typescript'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			});
		});

		it('should update worker heartbeat', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-hb',
				timestamp: new Date().toISOString(),
				status: 'busy',
				uptime: 3600,
			};

			await registry.updateHeartbeat(heartbeat);

			const worker = await registry.getWorker('worker-hb');
			expect(worker?.status).toBe('busy');
			expect(worker?.lastHeartbeat).toBe(heartbeat.timestamp);
		});

		it('should update current task in heartbeat', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-hb',
				timestamp: new Date().toISOString(),
				status: 'busy',
				currentTask: 'task-123',
				uptime: 3600,
			};

			await registry.updateHeartbeat(heartbeat);

			const worker = await registry.getWorker('worker-hb');
			expect(worker?.currentTask).toBe('task-123');
		});

		it('should update uptime metrics', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-hb',
				timestamp: new Date().toISOString(),
				status: 'idle',
				uptime: 7200,
				metrics: {
					cpuUsage: 45,
					memoryUsage: 4096,
					activeConnections: 10,
				},
			};

			await registry.updateHeartbeat(heartbeat);

			const worker = await registry.getWorker('worker-hb');
			expect(worker?.metrics.totalUptime).toBe(7200);
		});

		it('should throw error for unregistered worker heartbeat', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'non-existent',
				timestamp: new Date().toISOString(),
				status: 'idle',
				uptime: 100,
			};

			await expect(registry.updateHeartbeat(heartbeat)).rejects.toThrow(
				'Worker non-existent not registered',
			);
		});
	});

	describe('worker queries', () => {
		beforeEach(async () => {
			await registry.register({
				workerId: 'worker-1',
				capabilities: ['typescript', 'node'],
				resources: { cpu: 4, memory: 8192 },
			});

			await registry.register({
				workerId: 'worker-2',
				capabilities: ['python', 'docker'],
				resources: { cpu: 8, memory: 16384 },
			});

			await registry.register({
				workerId: 'worker-3',
				capabilities: ['typescript', 'docker'],
				resources: { cpu: 2, memory: 4096 },
			});

			// Update some worker statuses
			await registry.updateHeartbeat({
				workerId: 'worker-2',
				timestamp: new Date().toISOString(),
				status: 'busy',
				uptime: 1000,
			});

			await registry.markOffline('worker-3');
		});

		it('should get worker by ID', async () => {
			const worker = await registry.getWorker('worker-1');
			expect(worker).not.toBeNull();
			expect(worker?.workerId).toBe('worker-1');
		});

		it('should return null for non-existent worker', async () => {
			const worker = await registry.getWorker('non-existent');
			expect(worker).toBeNull();
		});

		it('should list all workers', async () => {
			const workers = await registry.listWorkers();
			expect(workers).toHaveLength(3);
			expect(workers.map((w) => w.workerId)).toContain('worker-1');
			expect(workers.map((w) => w.workerId)).toContain('worker-2');
			expect(workers.map((w) => w.workerId)).toContain('worker-3');
		});

		it('should filter workers by status', async () => {
			const idleWorkers = await registry.listWorkers({ status: 'idle' });
			expect(idleWorkers).toHaveLength(1);
			expect(idleWorkers[0]?.workerId).toBe('worker-1');

			const busyWorkers = await registry.listWorkers({ status: 'busy' });
			expect(busyWorkers).toHaveLength(1);
			expect(busyWorkers[0]?.workerId).toBe('worker-2');

			const offlineWorkers = await registry.listWorkers({ status: 'offline' });
			expect(offlineWorkers).toHaveLength(1);
			expect(offlineWorkers[0]?.workerId).toBe('worker-3');
		});

		it('should filter workers by capability', async () => {
			const typescriptWorkers = await registry.listWorkers({ capability: 'typescript' });
			expect(typescriptWorkers).toHaveLength(2);
			expect(typescriptWorkers.map((w) => w.workerId)).toContain('worker-1');
			expect(typescriptWorkers.map((w) => w.workerId)).toContain('worker-3');

			const dockerWorkers = await registry.listWorkers({ capability: 'docker' });
			expect(dockerWorkers).toHaveLength(2);
			expect(dockerWorkers.map((w) => w.workerId)).toContain('worker-2');
			expect(dockerWorkers.map((w) => w.workerId)).toContain('worker-3');
		});

		it('should filter workers by both status and capability', async () => {
			const workers = await registry.listWorkers({
				status: 'idle',
				capability: 'typescript',
			});
			expect(workers).toHaveLength(1);
			expect(workers[0]?.workerId).toBe('worker-1');
		});

		it('should get idle workers', async () => {
			const idleWorkers = await registry.getIdleWorkers();
			expect(idleWorkers).toHaveLength(1);
			expect(idleWorkers[0]?.workerId).toBe('worker-1');
		});

		it('should return empty array when no workers match filter', async () => {
			const workers = await registry.listWorkers({ capability: 'rust' });
			expect(workers).toHaveLength(0);
		});
	});

	describe('worker status management', () => {
		beforeEach(async () => {
			await registry.register({
				workerId: 'worker-status',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});
		});

		it('should mark worker as offline', async () => {
			const worker = await registry.getWorker('worker-status');
			expect(worker?.status).toBe('idle');

			await registry.markOffline('worker-status');

			const offlineWorker = await registry.getWorker('worker-status');
			expect(offlineWorker?.status).toBe('offline');
		});

		it('should handle marking non-existent worker as offline', async () => {
			await expect(registry.markOffline('non-existent')).resolves.not.toThrow();
		});
	});

	describe('task completion metrics', () => {
		beforeEach(async () => {
			await registry.register({
				workerId: 'worker-tasks',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});
		});

		it('should record successful task completion', async () => {
			await registry.recordTaskCompletion('worker-tasks', true, 5000);

			const worker = await registry.getWorker('worker-tasks');
			expect(worker?.metrics.totalTasksCompleted).toBe(1);
			expect(worker?.metrics.totalTasksFailed).toBe(0);
			expect(worker?.metrics.avgTaskDuration).toBe(5000);
		});

		it('should record failed task completion', async () => {
			await registry.recordTaskCompletion('worker-tasks', false, 2000);

			const worker = await registry.getWorker('worker-tasks');
			expect(worker?.metrics.totalTasksCompleted).toBe(0);
			expect(worker?.metrics.totalTasksFailed).toBe(1);
			expect(worker?.metrics.avgTaskDuration).toBe(2000);
		});

		it('should calculate average task duration correctly', async () => {
			await registry.recordTaskCompletion('worker-tasks', true, 1000);
			await registry.recordTaskCompletion('worker-tasks', true, 2000);
			await registry.recordTaskCompletion('worker-tasks', true, 3000);

			const worker = await registry.getWorker('worker-tasks');
			expect(worker?.metrics.totalTasksCompleted).toBe(3);
			expect(worker?.metrics.avgTaskDuration).toBe(2000);
		});

		it('should update average with mixed success and failure', async () => {
			await registry.recordTaskCompletion('worker-tasks', true, 1000);
			await registry.recordTaskCompletion('worker-tasks', false, 3000);
			await registry.recordTaskCompletion('worker-tasks', true, 2000);

			const worker = await registry.getWorker('worker-tasks');
			expect(worker?.metrics.totalTasksCompleted).toBe(2);
			expect(worker?.metrics.totalTasksFailed).toBe(1);
			expect(worker?.metrics.avgTaskDuration).toBe(2000); // (1000 + 3000 + 2000) / 3
		});

		it('should handle task completion for non-existent worker', async () => {
			await expect(
				registry.recordTaskCompletion('non-existent', true, 1000),
			).resolves.not.toThrow();
		});
	});

	describe('factory function', () => {
		it('should create worker registry', () => {
			const newRegistry = createWorkerRegistry();
			expect(newRegistry).toBeInstanceOf(InMemoryWorkerRegistry);
		});
	});
});
