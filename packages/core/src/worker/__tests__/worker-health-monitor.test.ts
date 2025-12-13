/**
 * Worker Health Monitor Tests
 *
 * Tests for worker health monitoring and heartbeat detection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type HealthMonitorConfig,
	WorkerHealthMonitor,
	createWorkerHealthMonitor,
} from '../worker-health-monitor.js';
import type { WorkerHeartbeat, WorkerRegistration } from '../worker-protocol.js';
import { InMemoryWorkerRegistry } from '../worker-registry.js';

describe('WorkerHealthMonitor', () => {
	let registry: InMemoryWorkerRegistry;
	let monitor: WorkerHealthMonitor;

	beforeEach(() => {
		registry = new InMemoryWorkerRegistry();
		vi.useFakeTimers();
	});

	afterEach(() => {
		if (monitor) {
			monitor.stop();
		}
		vi.useRealTimers();
	});

	describe('monitor lifecycle', () => {
		it('should start monitoring', () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);
			monitor.start();

			expect(monitor.isMonitoring()).toBe(true);
		});

		it('should stop monitoring', () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);
			monitor.start();
			expect(monitor.isMonitoring()).toBe(true);

			monitor.stop();
			expect(monitor.isMonitoring()).toBe(false);
		});

		it('should not start monitoring twice', () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);
			monitor.start();
			monitor.start();

			expect(monitor.isMonitoring()).toBe(true);
		});

		it('should handle multiple stop calls', () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);
			monitor.start();
			monitor.stop();
			monitor.stop();

			expect(monitor.isMonitoring()).toBe(false);
		});

		it('should be initially not monitoring', () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);
			expect(monitor.isMonitoring()).toBe(false);
		});
	});

	describe('heartbeat timeout detection', () => {
		it('should mark worker offline after heartbeat timeout', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register worker
			const registration: WorkerRegistration = {
				workerId: 'worker-1',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			};
			await registry.register(registration);

			// Worker is initially idle
			const worker = await registry.getWorker('worker-1');
			expect(worker?.status).toBe('idle');

			// Start monitoring
			monitor.start();

			// Advance time past heartbeat timeout
			await vi.advanceTimersByTimeAsync(6000);

			// Worker should now be marked offline
			const offlineWorker = await registry.getWorker('worker-1');
			expect(offlineWorker?.status).toBe('offline');
		});

		it('should not mark worker offline before timeout', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 10000,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register worker
			await registry.register({
				workerId: 'worker-2',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Advance time but not past timeout
			await vi.advanceTimersByTimeAsync(5000);

			// Worker should still be idle
			const worker = await registry.getWorker('worker-2');
			expect(worker?.status).toBe('idle');
		});

		it('should keep worker alive with regular heartbeats', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register worker
			await registry.register({
				workerId: 'worker-3',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Send heartbeats regularly
			for (let i = 0; i < 5; i++) {
				await vi.advanceTimersByTimeAsync(2000);
				const heartbeat: WorkerHeartbeat = {
					workerId: 'worker-3',
					timestamp: new Date().toISOString(),
					status: 'busy',
					uptime: (i + 1) * 2000,
				};
				await registry.updateHeartbeat(heartbeat);
			}

			// Worker should still be busy (not offline)
			const worker = await registry.getWorker('worker-3');
			expect(worker?.status).toBe('busy');
		});

		it('should skip already offline workers', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register worker and mark it offline
			await registry.register({
				workerId: 'worker-4',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});
			await registry.markOffline('worker-4');

			const offlineWorker = await registry.getWorker('worker-4');
			expect(offlineWorker?.status).toBe('offline');

			monitor.start();

			// Advance time past heartbeat timeout
			await vi.advanceTimersByTimeAsync(6000);

			// Worker should still be offline (no duplicate marking)
			const stillOffline = await registry.getWorker('worker-4');
			expect(stillOffline?.status).toBe('offline');
		});
	});

	describe('multiple workers', () => {
		it('should monitor multiple workers independently', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register multiple workers
			await registry.register({
				workerId: 'worker-a',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			await registry.register({
				workerId: 'worker-b',
				capabilities: ['python'],
				resources: { cpu: 8, memory: 16384 },
			});

			monitor.start();

			// Send heartbeat for worker-a to keep it alive
			await vi.advanceTimersByTimeAsync(2000);
			await registry.updateHeartbeat({
				workerId: 'worker-a',
				timestamp: new Date().toISOString(),
				status: 'busy',
				uptime: 2000,
			});

			// Advance time past timeout
			await vi.advanceTimersByTimeAsync(4000);

			// worker-a should still be alive, worker-b should be offline
			const workerA = await registry.getWorker('worker-a');
			const workerB = await registry.getWorker('worker-b');

			expect(workerA?.status).toBe('busy');
			expect(workerB?.status).toBe('offline');
		});

		it('should handle no workers gracefully', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);
			monitor.start();

			// Should not throw even with no workers
			await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();
		});
	});

	describe('offline callback', () => {
		it('should call callback when worker goes offline', async () => {
			const onWorkerOffline = vi.fn();
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
				onWorkerOffline,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register worker
			await registry.register({
				workerId: 'worker-callback',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Advance time past timeout
			await vi.advanceTimersByTimeAsync(6000);

			// Callback should have been called
			expect(onWorkerOffline).toHaveBeenCalledWith('worker-callback');
			expect(onWorkerOffline).toHaveBeenCalledTimes(1);
		});

		it('should call callback for each offline worker', async () => {
			const onWorkerOffline = vi.fn();
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
				onWorkerOffline,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			// Register multiple workers
			await registry.register({
				workerId: 'worker-1',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			await registry.register({
				workerId: 'worker-2',
				capabilities: ['python'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Advance time past timeout
			await vi.advanceTimersByTimeAsync(6000);

			// Callback should be called twice
			expect(onWorkerOffline).toHaveBeenCalledTimes(2);
			expect(onWorkerOffline).toHaveBeenCalledWith('worker-1');
			expect(onWorkerOffline).toHaveBeenCalledWith('worker-2');
		});

		it('should not call callback for workers that stay alive', async () => {
			const onWorkerOffline = vi.fn();
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
				onWorkerOffline,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			await registry.register({
				workerId: 'worker-alive',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Send heartbeat before timeout
			await vi.advanceTimersByTimeAsync(3000);
			await registry.updateHeartbeat({
				workerId: 'worker-alive',
				timestamp: new Date().toISOString(),
				status: 'busy',
				uptime: 3000,
			});

			await vi.advanceTimersByTimeAsync(3000);

			// Callback should not be called
			expect(onWorkerOffline).not.toHaveBeenCalled();
		});

		it('should handle async callback', async () => {
			const onWorkerOffline = vi.fn(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
				onWorkerOffline,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			await registry.register({
				workerId: 'worker-async',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();
			await vi.advanceTimersByTimeAsync(6000);

			expect(onWorkerOffline).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		it('should handle errors in health check gracefully', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			// Create a registry that throws on listWorkers
			const errorRegistry = {
				...registry,
				listWorkers: vi.fn().mockRejectedValue(new Error('Database error')),
			};

			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(errorRegistry as any, config);
			monitor.start();

			// Should not throw even with error
			await expect(vi.advanceTimersByTimeAsync(2000)).resolves.not.toThrow();

			expect(consoleErrorSpy).toHaveBeenCalledWith('Health check failed:', expect.any(Error));

			consoleErrorSpy.mockRestore();
		});

		it('should handle callback errors gracefully', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const onWorkerOffline = vi.fn().mockRejectedValue(new Error('Callback error'));
			const config: HealthMonitorConfig = {
				checkInterval: 1000,
				heartbeatTimeout: 5000,
				onWorkerOffline,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			await registry.register({
				workerId: 'worker-error',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Should not throw even with callback error
			await expect(vi.advanceTimersByTimeAsync(6000)).resolves.not.toThrow();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('check interval configuration', () => {
		it('should respect custom check interval', async () => {
			const config: HealthMonitorConfig = {
				checkInterval: 2000, // 2 seconds
				heartbeatTimeout: 5000,
			};

			monitor = new WorkerHealthMonitor(registry, config);

			await registry.register({
				workerId: 'worker-interval',
				capabilities: ['typescript'],
				resources: { cpu: 4, memory: 8192 },
			});

			monitor.start();

			// Advance by 1 second - no check yet
			await vi.advanceTimersByTimeAsync(1000);
			const worker1 = await registry.getWorker('worker-interval');
			expect(worker1?.status).toBe('idle');

			// Advance by another 1 second - still within first interval
			await vi.advanceTimersByTimeAsync(1000);

			// Advance past timeout to trigger offline
			await vi.advanceTimersByTimeAsync(5000);
			const worker2 = await registry.getWorker('worker-interval');
			expect(worker2?.status).toBe('offline');
		});
	});

	describe('factory function', () => {
		it('should create monitor with default config', () => {
			const newMonitor = createWorkerHealthMonitor(registry);
			expect(newMonitor).toBeInstanceOf(WorkerHealthMonitor);
			expect(newMonitor.isMonitoring()).toBe(false);
			newMonitor.stop();
		});

		it('should create monitor with partial config', () => {
			const newMonitor = createWorkerHealthMonitor(registry, {
				checkInterval: 10000,
			});
			expect(newMonitor).toBeInstanceOf(WorkerHealthMonitor);
			newMonitor.stop();
		});

		it('should use default values when not specified', () => {
			const newMonitor = createWorkerHealthMonitor(registry, {});
			expect(newMonitor).toBeInstanceOf(WorkerHealthMonitor);
			newMonitor.stop();
		});
	});
});
