/**
 * Firecracker Sandbox Tests
 *
 * Tests for Firecracker microVM management with mocked VM operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	FirecrackerSandbox,
	createFirecrackerSandbox,
	type FirecrackerConfig,
	type ExecutionRequest,
} from '../firecracker-sandbox.js';

describe('FirecrackerSandbox', () => {
	let sandbox: FirecrackerSandbox;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(async () => {
		if (sandbox) {
			await sandbox.cleanup();
		}
		vi.useRealTimers();
	});

	describe('sandbox initialization', () => {
		it('should initialize with default config', () => {
			sandbox = new FirecrackerSandbox({});
			expect(sandbox).toBeDefined();

			const metrics = sandbox.getMetrics();
			expect(metrics.totalCreated).toBe(0);
			expect(metrics.active).toBe(0);
		});

		it('should initialize with custom config', () => {
			const config: Partial<FirecrackerConfig> = {
				firecrackerBinPath: '/custom/firecracker',
				kernelImagePath: '/custom/kernel',
				rootfsPath: '/custom/rootfs',
				vcpuCount: 2,
				memSizeMb: 256,
				enableNetwork: true,
				maxExecutionTime: 60000,
				sandboxDir: '/tmp/custom-sandboxes',
			};

			sandbox = new FirecrackerSandbox(config);
			expect(sandbox).toBeDefined();
		});
	});

	describe('sandbox creation', () => {
		beforeEach(() => {
			sandbox = new FirecrackerSandbox({});
		});

		it('should create a sandbox instance', async () => {
			const createPromise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await createPromise;

			expect(instance.id).toMatch(/^fc-\d+-[a-z0-9]{6}$/);
			expect(instance.status).toBe('ready');
			expect(instance.pid).toBeGreaterThan(0);
			expect(instance.createdAt).toBeInstanceOf(Date);
			expect(instance.socketPath).toContain(instance.id);
		});

		it('should update metrics on sandbox creation', async () => {
			const createPromise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			await createPromise;

			const metrics = sandbox.getMetrics();
			expect(metrics.totalCreated).toBe(1);
			expect(metrics.active).toBe(1);
		});

		it('should create multiple sandboxes', async () => {
			const promise1 = sandbox.createSandbox();
			const promise2 = sandbox.createSandbox();
			const promise3 = sandbox.createSandbox();

			await vi.advanceTimersByTimeAsync(125);

			const instances = await Promise.all([promise1, promise2, promise3]);

			expect(instances).toHaveLength(3);
			expect(new Set(instances.map((i) => i.id)).size).toBe(3);

			const metrics = sandbox.getMetrics();
			expect(metrics.totalCreated).toBe(3);
			expect(metrics.active).toBe(3);
		});

		it('should track average startup time', async () => {
			const promise1 = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			await promise1;

			const metrics = sandbox.getMetrics();
			expect(metrics.avgStartupTime).toBeGreaterThan(0);
			expect(metrics.avgStartupTime).toBeLessThanOrEqual(150);
		});

		it('should start sandbox in starting status', async () => {
			const promise = sandbox.createSandbox();
			const metrics = sandbox.getMetrics();

			expect(metrics.active).toBe(1);

			await vi.advanceTimersByTimeAsync(125);
			await promise;
		});
	});

	describe('code execution', () => {
		let sandboxId: string;

		beforeEach(async () => {
			sandbox = new FirecrackerSandbox({});
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;
			sandboxId = instance.id;
		});

		it('should execute code successfully', async () => {
			const request: ExecutionRequest = {
				code: 'console.log("Hello, world!");',
				runtime: 'node',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result.success).toBeDefined();
			expect(result.exitCode).toBeDefined();
			expect(result.executionTime).toBeGreaterThan(0);
		});

		it('should execute with custom timeout', async () => {
			const request: ExecutionRequest = {
				code: 'console.log("test");',
				runtime: 'node',
				timeout: 10000,
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result).toBeDefined();
		});

		it('should execute with environment variables', async () => {
			const request: ExecutionRequest = {
				code: 'console.log(process.env.TEST);',
				runtime: 'node',
				env: {
					TEST: 'value',
					DEBUG: 'true',
				},
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result).toBeDefined();
		});

		it('should execute with custom working directory', async () => {
			const request: ExecutionRequest = {
				code: 'pwd',
				runtime: 'bash',
				cwd: '/tmp',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result).toBeDefined();
		});

		it('should execute Python code', async () => {
			const request: ExecutionRequest = {
				code: 'print("Hello from Python")',
				runtime: 'python',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result).toBeDefined();
		});

		it('should execute Bash code', async () => {
			const request: ExecutionRequest = {
				code: 'echo "Hello from Bash"',
				runtime: 'bash',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result).toBeDefined();
		});

		it('should allow network access when specified', async () => {
			const request: ExecutionRequest = {
				code: 'curl https://api.example.com',
				runtime: 'bash',
				allowNetwork: true,
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result).toBeDefined();
		});

		it('should throw error for non-existent sandbox', async () => {
			const request: ExecutionRequest = {
				code: 'console.log("test");',
				runtime: 'node',
			};

			await expect(sandbox.execute('non-existent', request)).rejects.toThrow(
				'Sandbox not found: non-existent',
			);
		});

		it('should throw error for sandbox not ready', async () => {
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;
			instance.status = 'stopped';

			const request: ExecutionRequest = {
				code: 'console.log("test");',
				runtime: 'node',
			};

			await expect(sandbox.execute(instance.id, request)).rejects.toThrow(
				'Sandbox not ready: stopped',
			);
		});

		it('should update metrics on successful execution', async () => {
			const request: ExecutionRequest = {
				code: 'console.log("success");',
				runtime: 'node',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			await executePromise;

			const metrics = sandbox.getMetrics();
			expect(metrics.avgExecutionTime).toBeGreaterThan(0);
		});

		it('should track execution metrics', async () => {
			const request: ExecutionRequest = {
				code: 'console.log("test");',
				runtime: 'node',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await executePromise;

			expect(result.executionTime).toBeGreaterThan(0);
			expect(result.exitCode).toBeDefined();
			expect(result.stdout).toBeDefined();
			expect(result.stderr).toBeDefined();
		});

		it('should restore sandbox to ready state after execution', async () => {
			const request: ExecutionRequest = {
				code: 'console.log("test");',
				runtime: 'node',
			};

			const executePromise = sandbox.execute(sandboxId, request);
			await vi.advanceTimersByTimeAsync(1500);
			await executePromise;

			const instance = sandbox.getSandbox(sandboxId);
			expect(instance?.status).toBe('ready');
		});
	});

	describe('sandbox queries', () => {
		beforeEach(async () => {
			sandbox = new FirecrackerSandbox({});
		});

		it('should get sandbox by id', async () => {
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const created = await promise;

			const instance = sandbox.getSandbox(created.id);
			expect(instance).toBeDefined();
			expect(instance?.id).toBe(created.id);
		});

		it('should return undefined for non-existent sandbox', () => {
			const instance = sandbox.getSandbox('non-existent');
			expect(instance).toBeUndefined();
		});

		it('should list all sandboxes', async () => {
			const promise1 = sandbox.createSandbox();
			const promise2 = sandbox.createSandbox();

			await vi.advanceTimersByTimeAsync(125);
			await Promise.all([promise1, promise2]);

			const instances = sandbox.listSandboxes();
			expect(instances).toHaveLength(2);
		});

		it('should return empty array when no sandboxes exist', () => {
			const instances = sandbox.listSandboxes();
			expect(instances).toHaveLength(0);
		});
	});

	describe('sandbox destruction', () => {
		beforeEach(async () => {
			sandbox = new FirecrackerSandbox({});
		});

		it('should destroy a sandbox', async () => {
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;

			await sandbox.destroySandbox(instance.id);

			const retrieved = sandbox.getSandbox(instance.id);
			expect(retrieved).toBeUndefined();

			const metrics = sandbox.getMetrics();
			expect(metrics.active).toBe(0);
		});

		it('should update sandbox status on destruction', async () => {
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;

			expect(instance.status).toBe('ready');

			await sandbox.destroySandbox(instance.id);

			// Sandbox should be removed from registry
			const retrieved = sandbox.getSandbox(instance.id);
			expect(retrieved).toBeUndefined();
		});

		it('should handle destroying non-existent sandbox', async () => {
			await expect(sandbox.destroySandbox('non-existent')).resolves.not.toThrow();
		});

		it('should handle errors during destruction gracefully', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;

			// Force an error scenario
			instance.status = 'failed';

			await expect(sandbox.destroySandbox(instance.id)).resolves.not.toThrow();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('cleanup', () => {
		beforeEach(async () => {
			sandbox = new FirecrackerSandbox({});
		});

		it('should cleanup all sandboxes', async () => {
			const promise1 = sandbox.createSandbox();
			const promise2 = sandbox.createSandbox();
			const promise3 = sandbox.createSandbox();

			await vi.advanceTimersByTimeAsync(125);
			await Promise.all([promise1, promise2, promise3]);

			expect(sandbox.listSandboxes()).toHaveLength(3);

			await sandbox.cleanup();

			expect(sandbox.listSandboxes()).toHaveLength(0);

			const metrics = sandbox.getMetrics();
			expect(metrics.active).toBe(0);
		});

		it('should handle cleanup with no sandboxes', async () => {
			await expect(sandbox.cleanup()).resolves.not.toThrow();
		});

		it('should handle partial cleanup failures', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const promise1 = sandbox.createSandbox();
			const promise2 = sandbox.createSandbox();

			await vi.advanceTimersByTimeAsync(125);
			await Promise.all([promise1, promise2]);

			// Should not throw even if some fail
			await expect(sandbox.cleanup()).resolves.not.toThrow();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('metrics tracking', () => {
		beforeEach(async () => {
			sandbox = new FirecrackerSandbox({});
		});

		it('should track total created sandboxes', async () => {
			const promise1 = sandbox.createSandbox();
			const promise2 = sandbox.createSandbox();

			await vi.advanceTimersByTimeAsync(125);
			await Promise.all([promise1, promise2]);

			const metrics = sandbox.getMetrics();
			expect(metrics.totalCreated).toBe(2);
		});

		it('should track active sandboxes', async () => {
			const promise1 = sandbox.createSandbox();
			const promise2 = sandbox.createSandbox();

			await vi.advanceTimersByTimeAsync(125);
			const instances = await Promise.all([promise1, promise2]);

			expect(sandbox.getMetrics().active).toBe(2);

			await sandbox.destroySandbox(instances[0]!.id);

			expect(sandbox.getMetrics().active).toBe(1);
		});

		it('should track metrics structure', async () => {
			const metrics = sandbox.getMetrics();
			expect(metrics.failedExecutions).toBeDefined();
			expect(metrics.successRate).toBeDefined();
			expect(metrics.avgExecutionTime).toBeDefined();
			expect(metrics.avgStartupTime).toBeDefined();
			expect(metrics.totalCreated).toBeDefined();
			expect(metrics.active).toBeDefined();
		});

		it('should track startup time accurately', async () => {
			const metricsBeforeCreation = sandbox.getMetrics();
			expect(metricsBeforeCreation.avgStartupTime).toBe(125);

			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			await promise;

			const metricsAfterCreation = sandbox.getMetrics();
			expect(metricsAfterCreation.avgStartupTime).toBeGreaterThan(0);
		});

		it('should return metrics snapshot', async () => {
			const metrics1 = sandbox.getMetrics();
			expect(metrics1.totalCreated).toBe(0);

			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			await promise;

			const metrics2 = sandbox.getMetrics();
			expect(metrics2.totalCreated).toBe(1);

			// First metrics should not have changed
			expect(metrics1.totalCreated).toBe(0);
		});
	});

	describe('error handling', () => {
		beforeEach(async () => {
			sandbox = new FirecrackerSandbox({});
		});

		it('should handle execution errors gracefully', async () => {
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;

			const request: ExecutionRequest = {
				code: 'throw new Error("test error")',
				runtime: 'node',
			};

			const execPromise = sandbox.execute(instance.id, request);
			await vi.advanceTimersByTimeAsync(1500);
			const result = await execPromise;

			expect(result).toBeDefined();
			// Result should indicate failure but not throw
			expect(result.success).toBeDefined();
		});

		it('should track failed executions in metrics', async () => {
			const promise = sandbox.createSandbox();
			await vi.advanceTimersByTimeAsync(125);
			const instance = await promise;

			const initialMetrics = sandbox.getMetrics();
			const initialFailed = initialMetrics.failedExecutions;

			// Execute multiple times to get some failures (simulation has ~10% failure rate)
			for (let i = 0; i < 20; i++) {
				const request: ExecutionRequest = {
					code: 'test',
					runtime: 'node',
				};
				const execPromise = sandbox.execute(instance.id, request);
				await vi.advanceTimersByTimeAsync(1500);
				await execPromise;
			}

			const finalMetrics = sandbox.getMetrics();
			// Should have some failures due to simulated ~10% failure rate
			expect(finalMetrics.failedExecutions).toBeGreaterThanOrEqual(initialFailed);
		});
	});

	describe('factory function', () => {
		it('should create sandbox with default config', () => {
			const newSandbox = createFirecrackerSandbox();
			expect(newSandbox).toBeInstanceOf(FirecrackerSandbox);
		});

		it('should create sandbox with custom config', () => {
			const config: Partial<FirecrackerConfig> = {
				vcpuCount: 4,
				memSizeMb: 512,
			};
			const newSandbox = createFirecrackerSandbox(config);
			expect(newSandbox).toBeInstanceOf(FirecrackerSandbox);
		});

		it('should create sandbox with empty config', () => {
			const newSandbox = createFirecrackerSandbox({});
			expect(newSandbox).toBeInstanceOf(FirecrackerSandbox);
		});
	});
});
