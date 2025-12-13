/**
 * PostgreSQL Worker Registry Tests
 *
 * Tests for PostgreSQL-backed worker registry with mocked database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
	PostgreSQLWorkerRegistry,
	createPostgreSQLWorkerRegistry,
} from '../postgresql-worker-registry.js';
import type { WorkerRegistration, WorkerHeartbeat } from '../worker-protocol.js';

describe('PostgreSQLWorkerRegistry', () => {
	let registry: PostgreSQLWorkerRegistry;
	let mockPool: Pool;

	beforeEach(() => {
		mockPool = {
			query: vi.fn(),
		} as unknown as Pool;

		registry = new PostgreSQLWorkerRegistry(mockPool);
	});

	describe('worker registration', () => {
		it('should register a new worker', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript', 'node'],
				resources: {
					cpu: 4,
					memory: 8192,
				},
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.register(registration);

			expect(mockPool.query).toHaveBeenCalledTimes(1);
			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('INSERT INTO workers');
			expect(sql).toContain('ON CONFLICT');
			expect(params[0]).toBe('worker-1');
			expect(params[1]).toBe('idle');
			expect(params[5]).toBe(JSON.stringify(['typescript', 'node']));
			expect(params[6]).toBe(JSON.stringify({ cpu: 4, memory: 8192 }));
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

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.register(registration);

			expect(mockPool.query).toHaveBeenCalledTimes(1);
		});

		it('should handle re-registration with ON CONFLICT', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-rereg',
				capabilities: ['java', 'kotlin'],
				resources: {
					cpu: 8,
					memory: 16384,
				},
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.register(registration);

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];

			expect(sql).toContain('ON CONFLICT (worker_id)');
			expect(sql).toContain('DO UPDATE SET');
		});
	});

	describe('worker unregistration', () => {
		it('should unregister a worker', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.unregister('worker-1');

			expect(mockPool.query).toHaveBeenCalledTimes(1);
			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('DELETE FROM workers');
			expect(params[0]).toBe('worker-1');
		});

		it('should handle unregistering non-existent worker', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 0 });

			await expect(registry.unregister('non-existent')).resolves.not.toThrow();
		});
	});

	describe('heartbeat updates', () => {
		it('should update worker heartbeat', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: '2024-01-01T00:00:00Z',
				status: 'busy',
				uptime: 3600,
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.updateHeartbeat(heartbeat);

			expect(mockPool.query).toHaveBeenCalledTimes(1);
			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('UPDATE workers');
			expect(sql).toContain('SET last_heartbeat');
			expect(params[0]).toBe('2024-01-01T00:00:00Z');
			expect(params[1]).toBe('busy');
			expect(params[2]).toBeNull();
			expect(params[3]).toBe('worker-1');
		});

		it('should update heartbeat with current task', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'worker-1',
				timestamp: '2024-01-01T00:00:00Z',
				status: 'busy',
				currentTask: 'task-123',
				uptime: 3600,
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.updateHeartbeat(heartbeat);

			const call = (mockPool.query as any).mock.calls[0];
			const params = call[1];

			expect(params[2]).toBe('task-123');
		});

		it('should throw error when worker not registered', async () => {
			const heartbeat: WorkerHeartbeat = {
				workerId: 'non-existent',
				timestamp: '2024-01-01T00:00:00Z',
				status: 'idle',
				uptime: 100,
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 0 });

			await expect(registry.updateHeartbeat(heartbeat)).rejects.toThrow(
				'Worker non-existent not registered',
			);
		});
	});

	describe('worker queries', () => {
		it('should get worker by ID', async () => {
			const mockRow = {
				worker_id: 'worker-1',
				status: 'idle',
				registered_at: new Date('2024-01-01T00:00:00Z'),
				last_heartbeat: new Date('2024-01-01T00:05:00Z'),
				current_task: null,
				capabilities: ['typescript', 'node'],
				resources: { cpu: 4, memory: 8192 },
				metrics: {
					totalTasksCompleted: 5,
					totalTasksFailed: 1,
					totalUptime: 3600,
					avgTaskDuration: 1200,
				},
			};

			(mockPool.query as any).mockResolvedValue({
				rows: [mockRow],
				rowCount: 1,
			});

			const worker = await registry.getWorker('worker-1');

			expect(worker).not.toBeNull();
			expect(worker?.workerId).toBe('worker-1');
			expect(worker?.status).toBe('idle');
			expect(worker?.registeredAt).toBe('2024-01-01T00:00:00.000Z');
			expect(worker?.lastHeartbeat).toBe('2024-01-01T00:05:00.000Z');
			expect(worker?.capabilities).toEqual(['typescript', 'node']);
			expect(worker?.resources).toEqual({ cpu: 4, memory: 8192 });

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('SELECT');
			expect(sql).toContain('FROM workers');
			expect(params[0]).toBe('worker-1');
		});

		it('should return null for non-existent worker', async () => {
			(mockPool.query as any).mockResolvedValue({
				rows: [],
				rowCount: 0,
			});

			const worker = await registry.getWorker('non-existent');

			expect(worker).toBeNull();
		});

		it('should list all workers', async () => {
			const mockRows = [
				{
					worker_id: 'worker-1',
					status: 'idle',
					registered_at: new Date('2024-01-01T00:00:00Z'),
					last_heartbeat: new Date('2024-01-01T00:05:00Z'),
					current_task: null,
					capabilities: ['typescript'],
					resources: { cpu: 4, memory: 8192 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				},
				{
					worker_id: 'worker-2',
					status: 'busy',
					registered_at: new Date('2024-01-01T00:01:00Z'),
					last_heartbeat: new Date('2024-01-01T00:06:00Z'),
					current_task: 'task-123',
					capabilities: ['python'],
					resources: { cpu: 8, memory: 16384 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				},
			];

			(mockPool.query as any).mockResolvedValue({
				rows: mockRows,
				rowCount: 2,
			});

			const workers = await registry.listWorkers();

			expect(workers).toHaveLength(2);
			expect(workers[0]?.workerId).toBe('worker-1');
			expect(workers[1]?.workerId).toBe('worker-2');

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];

			expect(sql).toContain('SELECT');
			expect(sql).toContain('FROM workers');
			expect(sql).toContain('ORDER BY last_heartbeat DESC');
		});

		it('should filter workers by status', async () => {
			const mockRows = [
				{
					worker_id: 'worker-1',
					status: 'idle',
					registered_at: new Date('2024-01-01T00:00:00Z'),
					last_heartbeat: new Date('2024-01-01T00:05:00Z'),
					current_task: null,
					capabilities: ['typescript'],
					resources: { cpu: 4, memory: 8192 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				},
			];

			(mockPool.query as any).mockResolvedValue({
				rows: mockRows,
				rowCount: 1,
			});

			const workers = await registry.listWorkers({ status: 'idle' });

			expect(workers).toHaveLength(1);
			expect(workers[0]?.status).toBe('idle');

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('AND status = $1');
			expect(params[0]).toBe('idle');
		});

		it('should filter workers by capability', async () => {
			const mockRows = [
				{
					worker_id: 'worker-1',
					status: 'idle',
					registered_at: new Date('2024-01-01T00:00:00Z'),
					last_heartbeat: new Date('2024-01-01T00:05:00Z'),
					current_task: null,
					capabilities: ['typescript', 'node'],
					resources: { cpu: 4, memory: 8192 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				},
			];

			(mockPool.query as any).mockResolvedValue({
				rows: mockRows,
				rowCount: 1,
			});

			const workers = await registry.listWorkers({ capability: 'typescript' });

			expect(workers).toHaveLength(1);
			expect(workers[0]?.capabilities).toContain('typescript');

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('AND capabilities::text LIKE $1');
			expect(params[0]).toBe('%"typescript"%');
		});

		it('should filter workers by both status and capability', async () => {
			const mockRows = [
				{
					worker_id: 'worker-1',
					status: 'idle',
					registered_at: new Date('2024-01-01T00:00:00Z'),
					last_heartbeat: new Date('2024-01-01T00:05:00Z'),
					current_task: null,
					capabilities: ['typescript'],
					resources: { cpu: 4, memory: 8192 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				},
			];

			(mockPool.query as any).mockResolvedValue({
				rows: mockRows,
				rowCount: 1,
			});

			const workers = await registry.listWorkers({
				status: 'idle',
				capability: 'typescript',
			});

			expect(workers).toHaveLength(1);

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('AND status = $1');
			expect(sql).toContain('AND capabilities::text LIKE $2');
			expect(params[0]).toBe('idle');
			expect(params[1]).toBe('%"typescript"%');
		});

		it('should get idle workers', async () => {
			const mockRows = [
				{
					worker_id: 'worker-1',
					status: 'idle',
					registered_at: new Date('2024-01-01T00:00:00Z'),
					last_heartbeat: new Date('2024-01-01T00:05:00Z'),
					current_task: null,
					capabilities: ['typescript'],
					resources: { cpu: 4, memory: 8192 },
					metrics: {
						totalTasksCompleted: 0,
						totalTasksFailed: 0,
						totalUptime: 0,
						avgTaskDuration: 0,
					},
				},
			];

			(mockPool.query as any).mockResolvedValue({
				rows: mockRows,
				rowCount: 1,
			});

			const workers = await registry.getIdleWorkers();

			expect(workers).toHaveLength(1);
			expect(workers[0]?.status).toBe('idle');
		});
	});

	describe('worker status management', () => {
		it('should mark worker as offline', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.markOffline('worker-1');

			expect(mockPool.query).toHaveBeenCalledTimes(1);
			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('UPDATE workers');
			expect(sql).toContain("SET status = 'offline'");
			expect(params[0]).toBe('worker-1');
		});

		it('should handle marking non-existent worker as offline', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 0 });

			await expect(registry.markOffline('non-existent')).resolves.not.toThrow();
		});
	});

	describe('stale worker cleanup', () => {
		it('should cleanup stale workers', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 3 });

			const count = await registry.cleanupStaleWorkers(300000); // 5 minutes

			expect(count).toBe(3);
			expect(mockPool.query).toHaveBeenCalledTimes(1);

			const call = (mockPool.query as any).mock.calls[0];
			const sql = call[0];
			const params = call[1];

			expect(sql).toContain('UPDATE workers');
			expect(sql).toContain("SET status = 'offline'");
			expect(sql).toContain('WHERE last_heartbeat < $1');
			expect(sql).toContain("AND status != 'offline'");
			expect(params[0]).toBeDefined();
		});

		it('should use default timeout when not specified', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 0 });

			const count = await registry.cleanupStaleWorkers();

			expect(count).toBe(0);
			expect(mockPool.query).toHaveBeenCalledTimes(1);
		});

		it('should return zero when no stale workers exist', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: 0 });

			const count = await registry.cleanupStaleWorkers(300000);

			expect(count).toBe(0);
		});

		it('should calculate cutoff timestamp correctly', async () => {
			const now = Date.now();
			const timeout = 600000; // 10 minutes

			(mockPool.query as any).mockResolvedValue({ rowCount: 0 });

			await registry.cleanupStaleWorkers(timeout);

			const call = (mockPool.query as any).mock.calls[0];
			const params = call[1];
			const cutoffTime = new Date(params[0]).getTime();

			// Should be approximately 10 minutes ago (allowing 1 second margin)
			expect(Math.abs(cutoffTime - (now - timeout))).toBeLessThan(1000);
		});

		it('should handle null rowCount', async () => {
			(mockPool.query as any).mockResolvedValue({ rowCount: null });

			const count = await registry.cleanupStaleWorkers(300000);

			expect(count).toBe(0);
		});
	});

	describe('error handling', () => {
		it('should propagate database errors during registration', async () => {
			const error = new Error('Database connection failed');
			(mockPool.query as any).mockRejectedValue(error);

			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			};

			await expect(registry.register(registration)).rejects.toThrow(
				'Database connection failed',
			);
		});

		it('should propagate database errors during queries', async () => {
			const error = new Error('Query failed');
			(mockPool.query as any).mockRejectedValue(error);

			await expect(registry.getWorker('worker-1')).rejects.toThrow('Query failed');
		});

		it('should propagate database errors during updates', async () => {
			const error = new Error('Update failed');
			(mockPool.query as any).mockRejectedValue(error);

			await expect(registry.markOffline('worker-1')).rejects.toThrow('Update failed');
		});
	});

	describe('data serialization', () => {
		it('should serialize capabilities as JSON', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript', 'node', 'docker'],
				resources: { cpu: 4, memory: 8192 },
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.register(registration);

			const call = (mockPool.query as any).mock.calls[0];
			const params = call[1];

			expect(params[5]).toBe(JSON.stringify(['typescript', 'node', 'docker']));
		});

		it('should serialize resources as JSON', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript'],
				resources: { cpu: 8, memory: 32768 },
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.register(registration);

			const call = (mockPool.query as any).mock.calls[0];
			const params = call[1];

			expect(params[6]).toBe(JSON.stringify({ cpu: 8, memory: 32768 }));
		});

		it('should serialize metrics as JSON', async () => {
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			};

			(mockPool.query as any).mockResolvedValue({ rowCount: 1 });

			await registry.register(registration);

			const call = (mockPool.query as any).mock.calls[0];
			const params = call[1];

			const metrics = JSON.parse(params[7]);
			expect(metrics).toEqual({
				totalTasksCompleted: 0,
				totalTasksFailed: 0,
				totalUptime: 0,
				avgTaskDuration: 0,
			});
		});

		it('should deserialize worker data correctly', async () => {
			const mockRow = {
				worker_id: 'worker-1',
				status: 'idle',
				registered_at: new Date('2024-01-01T00:00:00Z'),
				last_heartbeat: new Date('2024-01-01T00:05:00Z'),
				current_task: 'task-123',
				capabilities: ['typescript', 'node'],
				resources: { cpu: 4, memory: 8192 },
				metrics: {
					totalTasksCompleted: 10,
					totalTasksFailed: 2,
					totalUptime: 7200,
					avgTaskDuration: 1500,
				},
			};

			(mockPool.query as any).mockResolvedValue({
				rows: [mockRow],
				rowCount: 1,
			});

			const worker = await registry.getWorker('worker-1');

			expect(worker?.workerId).toBe('worker-1');
			expect(worker?.status).toBe('idle');
			expect(worker?.currentTask).toBe('task-123');
			expect(worker?.capabilities).toEqual(['typescript', 'node']);
			expect(worker?.resources).toEqual({ cpu: 4, memory: 8192 });
			expect(worker?.metrics).toEqual({
				totalTasksCompleted: 10,
				totalTasksFailed: 2,
				totalUptime: 7200,
				avgTaskDuration: 1500,
			});
		});
	});

	describe('factory function', () => {
		it('should create PostgreSQL worker registry', () => {
			const newRegistry = createPostgreSQLWorkerRegistry(mockPool);
			expect(newRegistry).toBeInstanceOf(PostgreSQLWorkerRegistry);
		});

		it('should use provided pool', async () => {
			const newRegistry = createPostgreSQLWorkerRegistry(mockPool);

			(mockPool.query as any).mockResolvedValue({
				rows: [],
				rowCount: 0,
			});

			await newRegistry.listWorkers();

			expect(mockPool.query).toHaveBeenCalled();
		});
	});
});
