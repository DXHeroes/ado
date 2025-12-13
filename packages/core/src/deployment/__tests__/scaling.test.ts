/**
 * Tests for Horizontal Scaling Support
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	GracefulShutdownHandler,
	LivenessProbe,
	ReadinessProbe,
	getCurrentInstance,
	getRecommendedCoordinationStrategy,
	isScaledDeployment,
} from '../scaling.js';

describe('Scaling Utilities', () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Reset environment before each test
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
	});

	describe('getCurrentInstance', () => {
		it('should detect Kubernetes environment from KUBERNETES_SERVICE_HOST', () => {
			process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
			process.env.HOSTNAME = 'ado-pod-12345';
			process.env.POD_NAME = 'ado-pod-12345';
			process.env.POD_IP = '10.244.0.10';

			const instance = getCurrentInstance();

			expect(instance.id).toBe('ado-pod-12345');
			expect(instance.hostname).toBe('ado-pod-12345');
			expect(instance.ipAddress).toBe('10.244.0.10');
			expect(instance.maxCapacity).toBe(10);
			expect(instance.currentLoad).toBe(0);
		});

		it('should detect Kubernetes environment from K8S_NAMESPACE', () => {
			process.env.K8S_NAMESPACE = 'ado-production';
			process.env.HOSTNAME = 'ado-worker-1';

			const instance = getCurrentInstance();

			expect(instance.id).toBe('ado-worker-1');
			expect(instance.hostname).toBe('ado-worker-1');
		});

		it('should use HOSTNAME for id when available', () => {
			process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
			process.env.HOSTNAME = 'ado-pod-hostname';
			process.env.POD_NAME = 'ado-pod-specific';

			const instance = getCurrentInstance();

			expect(instance.id).toBe('ado-pod-hostname');
			expect(instance.hostname).toBe('ado-pod-hostname');
		});

		it('should fallback to POD_NAME when HOSTNAME not available', () => {
			process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
			process.env.HOSTNAME = undefined;
			process.env.POD_NAME = 'ado-pod-specific';

			const instance = getCurrentInstance();

			expect(instance.id).toBe('ado-pod-specific');
		});

		it('should respect MAX_PARALLEL_AGENTS env var', () => {
			process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
			process.env.MAX_PARALLEL_AGENTS = '20';

			const instance = getCurrentInstance();

			expect(instance.maxCapacity).toBe(20);
		});

		it('should handle invalid MAX_PARALLEL_AGENTS as NaN', () => {
			process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';
			process.env.MAX_PARALLEL_AGENTS = 'invalid';

			const instance = getCurrentInstance();

			expect(Number.isNaN(instance.maxCapacity)).toBe(true);
		});

		it('should return local instance info for non-K8s environment', () => {
			process.env.KUBERNETES_SERVICE_HOST = undefined;
			process.env.K8S_NAMESPACE = undefined;

			const instance = getCurrentInstance();

			expect(instance.id).toMatch(/^local-\d+$/);
			expect(instance.hostname).toBeDefined();
			expect(instance.maxCapacity).toBe(10);
			expect(instance.currentLoad).toBe(0);
			expect(instance.ipAddress).toBeUndefined();
		});

		it('should calculate startedAt based on process uptime', () => {
			const instance = getCurrentInstance();
			const now = Date.now();
			const expectedStartTime = now - process.uptime() * 1000;

			expect(instance.startedAt.getTime()).toBeCloseTo(expectedStartTime, -2);
		});

		it('should set lastHeartbeat to current time', () => {
			const before = Date.now();
			const instance = getCurrentInstance();
			const after = Date.now();

			expect(instance.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(before);
			expect(instance.lastHeartbeat.getTime()).toBeLessThanOrEqual(after);
		});
	});

	describe('isScaledDeployment', () => {
		it('should return true when KUBERNETES_SERVICE_HOST is set', () => {
			process.env.KUBERNETES_SERVICE_HOST = '10.0.0.1';

			expect(isScaledDeployment()).toBe(true);
		});

		it('should return true when K8S_NAMESPACE is set', () => {
			process.env.K8S_NAMESPACE = 'ado-production';

			expect(isScaledDeployment()).toBe(true);
		});

		it('should return true when DEPLOYMENT_MODE is scaled', () => {
			process.env.DEPLOYMENT_MODE = 'scaled';

			expect(isScaledDeployment()).toBe(true);
		});

		it('should return false for local deployment', () => {
			process.env.KUBERNETES_SERVICE_HOST = undefined;
			process.env.K8S_NAMESPACE = undefined;
			process.env.DEPLOYMENT_MODE = undefined;

			expect(isScaledDeployment()).toBe(false);
		});
	});

	describe('getRecommendedCoordinationStrategy', () => {
		it('should recommend redis-queue when REDIS_URL is available', () => {
			process.env.REDIS_URL = 'redis://localhost:6379';

			expect(getRecommendedCoordinationStrategy()).toBe('redis-queue');
		});

		it('should recommend postgres-poll when DATABASE_URL is available', () => {
			process.env.DATABASE_URL = 'postgresql://localhost:5432/ado';

			expect(getRecommendedCoordinationStrategy()).toBe('postgres-poll');
		});

		it('should prefer redis-queue over postgres-poll', () => {
			process.env.REDIS_URL = 'redis://localhost:6379';
			process.env.DATABASE_URL = 'postgresql://localhost:5432/ado';

			expect(getRecommendedCoordinationStrategy()).toBe('redis-queue');
		});

		it('should return undefined when no infrastructure is available', () => {
			process.env.REDIS_URL = undefined;
			process.env.DATABASE_URL = undefined;

			expect(getRecommendedCoordinationStrategy()).toBeUndefined();
		});
	});

	describe('GracefulShutdownHandler', () => {
		it('should initialize with default timeout', () => {
			const handler = new GracefulShutdownHandler();

			expect(handler.isShutdown()).toBe(false);
		});

		it('should initialize with custom timeout', () => {
			const handler = new GracefulShutdownHandler(60000);

			expect(handler.isShutdown()).toBe(false);
		});

		it('should register shutdown handlers', async () => {
			const handler = new GracefulShutdownHandler();
			const mockHandler = vi.fn().mockResolvedValue(undefined);

			handler.onShutdown(mockHandler);

			expect(handler.isShutdown()).toBe(false);
		});

		it('should execute shutdown handlers on SIGTERM', async () => {
			const handler = new GracefulShutdownHandler(100);
			const mockHandler1 = vi.fn().mockResolvedValue(undefined);
			const mockHandler2 = vi.fn().mockResolvedValue(undefined);

			handler.onShutdown(mockHandler1);
			handler.onShutdown(mockHandler2);

			// Spy on process.exit
			const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

			// Trigger SIGTERM
			process.emit('SIGTERM' as never);

			// Wait for async handlers
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(handler.isShutdown()).toBe(true);
			expect(mockHandler1).toHaveBeenCalled();
			expect(mockHandler2).toHaveBeenCalled();

			exitSpy.mockRestore();
		});

		it('should execute shutdown handlers on SIGINT', async () => {
			const handler = new GracefulShutdownHandler(100);
			const mockHandler = vi.fn().mockResolvedValue(undefined);

			handler.onShutdown(mockHandler);

			const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

			process.emit('SIGINT' as never);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(handler.isShutdown()).toBe(true);
			expect(mockHandler).toHaveBeenCalled();

			exitSpy.mockRestore();
		});

		it('should handle shutdown handler errors gracefully', async () => {
			const handler = new GracefulShutdownHandler(100);
			const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
			const successHandler = vi.fn().mockResolvedValue(undefined);

			handler.onShutdown(failingHandler);
			handler.onShutdown(successHandler);

			const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

			process.emit('SIGTERM' as never);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(handler.isShutdown()).toBe(true);
			expect(failingHandler).toHaveBeenCalled();
			expect(successHandler).toHaveBeenCalled();

			exitSpy.mockRestore();
		});

		it('should timeout if handlers take too long', async () => {
			const handler = new GracefulShutdownHandler(50);
			const slowHandler = vi
				.fn()
				.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200)));

			handler.onShutdown(slowHandler);

			const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

			process.emit('SIGTERM' as never);

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(handler.isShutdown()).toBe(true);
			expect(exitSpy).toHaveBeenCalledWith(0);

			exitSpy.mockRestore();
		});

		it('should ignore duplicate shutdown signals', async () => {
			const handler = new GracefulShutdownHandler(100);
			const mockHandler = vi.fn().mockResolvedValue(undefined);

			handler.onShutdown(mockHandler);

			const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

			process.emit('SIGTERM' as never);
			process.emit('SIGTERM' as never);
			process.emit('SIGINT' as never);

			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(mockHandler).toHaveBeenCalledTimes(1);

			exitSpy.mockRestore();
		});
	});

	describe('ReadinessProbe', () => {
		it('should initialize with no checks', async () => {
			const probe = new ReadinessProbe();

			const result = await probe.isReady();

			expect(result.ready).toBe(true);
			expect(result.checks).toEqual({});
		});

		it('should add and execute readiness checks', async () => {
			const probe = new ReadinessProbe();
			const mockCheck = vi.fn().mockResolvedValue(true);

			probe.addCheck('database', mockCheck);

			const result = await probe.isReady();

			expect(result.ready).toBe(true);
			expect(result.checks.database).toBe(true);
			expect(mockCheck).toHaveBeenCalled();
		});

		it('should return false if any check fails', async () => {
			const probe = new ReadinessProbe();
			const successCheck = vi.fn().mockResolvedValue(true);
			const failingCheck = vi.fn().mockResolvedValue(false);

			probe.addCheck('success', successCheck);
			probe.addCheck('failing', failingCheck);

			const result = await probe.isReady();

			expect(result.ready).toBe(false);
			expect(result.checks.success).toBe(true);
			expect(result.checks.failing).toBe(false);
		});

		it('should handle check exceptions as failures', async () => {
			const probe = new ReadinessProbe();
			const throwingCheck = vi.fn().mockRejectedValue(new Error('Check failed'));

			probe.addCheck('throwing', throwingCheck);

			const result = await probe.isReady();

			expect(result.ready).toBe(false);
			expect(result.checks.throwing).toBe(false);
		});

		it('should execute multiple checks in parallel', async () => {
			const probe = new ReadinessProbe();
			const check1 = vi.fn().mockResolvedValue(true);
			const check2 = vi.fn().mockResolvedValue(true);
			const check3 = vi.fn().mockResolvedValue(true);

			probe.addCheck('check1', check1);
			probe.addCheck('check2', check2);
			probe.addCheck('check3', check3);

			const result = await probe.isReady();

			expect(result.ready).toBe(true);
			expect(Object.keys(result.checks)).toHaveLength(3);
		});

		it('should maintain check results with mixed success/failure', async () => {
			const probe = new ReadinessProbe();
			const check1 = vi.fn().mockResolvedValue(true);
			const check2 = vi.fn().mockResolvedValue(false);
			const check3 = vi.fn().mockResolvedValue(true);

			probe.addCheck('check1', check1);
			probe.addCheck('check2', check2);
			probe.addCheck('check3', check3);

			const result = await probe.isReady();

			expect(result.ready).toBe(false);
			expect(result.checks.check1).toBe(true);
			expect(result.checks.check2).toBe(false);
			expect(result.checks.check3).toBe(true);
		});
	});

	describe('LivenessProbe', () => {
		it('should initialize with default max inactivity', () => {
			const probe = new LivenessProbe();

			expect(probe.isAlive()).toBe(true);
		});

		it('should initialize with custom max inactivity', () => {
			const probe = new LivenessProbe(60000);

			expect(probe.isAlive()).toBe(true);
		});

		it('should record activity', () => {
			const probe = new LivenessProbe();
			const _before = Date.now();

			probe.recordActivity();

			const timeSinceActivity = probe.getTimeSinceLastActivity();
			expect(timeSinceActivity).toBeLessThan(100);
			expect(timeSinceActivity).toBeGreaterThanOrEqual(0);
		});

		it('should return alive after recent activity', () => {
			const probe = new LivenessProbe(1000);

			probe.recordActivity();

			expect(probe.isAlive()).toBe(true);
		});

		it('should return dead after prolonged inactivity', async () => {
			const probe = new LivenessProbe(100);

			// Wait for inactivity timeout
			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(probe.isAlive()).toBe(false);
		});

		it('should reset inactivity timer on recordActivity', async () => {
			const probe = new LivenessProbe(200);

			// Wait partway through timeout
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(probe.isAlive()).toBe(true);

			// Record activity to reset timer
			probe.recordActivity();

			// Wait again
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should still be alive because we reset the timer
			expect(probe.isAlive()).toBe(true);
		});

		it('should track time since last activity', async () => {
			const probe = new LivenessProbe();

			probe.recordActivity();

			await new Promise((resolve) => setTimeout(resolve, 50));

			const timeSinceActivity = probe.getTimeSinceLastActivity();
			expect(timeSinceActivity).toBeGreaterThanOrEqual(50);
			expect(timeSinceActivity).toBeLessThan(100);
		});

		it('should handle multiple activity recordings', () => {
			const probe = new LivenessProbe();

			probe.recordActivity();
			probe.recordActivity();
			probe.recordActivity();

			expect(probe.isAlive()).toBe(true);
			expect(probe.getTimeSinceLastActivity()).toBeLessThan(100);
		});

		it('should use constructor timestamp for initial activity', () => {
			const probe = new LivenessProbe();

			const timeSinceActivity = probe.getTimeSinceLastActivity();

			expect(timeSinceActivity).toBeGreaterThanOrEqual(0);
			expect(timeSinceActivity).toBeLessThan(100);
		});
	});
});
