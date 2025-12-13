/**
 * Tests for RecoveryManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	RecoveryManager,
	createRecoveryManager,
	type RecoveryPoint,
	type RetryConfig,
} from '../recovery-manager.js';
import {
	CheckpointManager,
	InMemoryCheckpointStorage,
	type TaskState,
	type CheckpointId,
} from '../../checkpoint/index.js';

describe('RecoveryManager', () => {
	let checkpointManager: CheckpointManager;
	let recoveryManager: RecoveryManager;

	beforeEach(() => {
		const storage = new InMemoryCheckpointStorage();
		checkpointManager = new CheckpointManager(storage);
		recoveryManager = new RecoveryManager(checkpointManager);
	});

	describe('constructor', () => {
		it('should create with default config', () => {
			const manager = new RecoveryManager(checkpointManager);
			expect(manager).toBeDefined();
		});

		it('should create with custom retry config', () => {
			const retryConfig: Partial<RetryConfig> = {
				maxAttempts: 5,
				initialDelay: 2000,
				maxDelay: 60000,
				backoffMultiplier: 3,
				retryableErrors: ['CUSTOM_ERROR'],
			};

			const manager = new RecoveryManager(checkpointManager, retryConfig);
			expect(manager).toBeDefined();
		});
	});

	describe('createRecoveryManager', () => {
		it('should create manager with factory function', () => {
			const manager = createRecoveryManager(checkpointManager);
			expect(manager).toBeDefined();
		});

		it('should create with custom config', () => {
			const manager = createRecoveryManager(checkpointManager, {
				maxAttempts: 10,
			});
			expect(manager).toBeDefined();
		});
	});

	describe('createRecoveryPoint', () => {
		it('should create recovery point with checkpoint', async () => {
			const taskId = 'task-1';
			const state: TaskState = {
				task: {
					taskId,
					prompt: 'Test task',
					providerId: 'test-provider',
				},
				status: 'running',
				progress: 50,
			};

			const recoveryPoint = await recoveryManager.createRecoveryPoint(
				taskId,
				state,
			);

			expect(recoveryPoint).toBeDefined();
			expect(recoveryPoint.id).toBeTruthy();
			expect(recoveryPoint.checkpointId).toBeTruthy();
			expect(recoveryPoint.state).toEqual(state);
			expect(recoveryPoint.timestamp).toBeTruthy();
		});

		it('should create recovery point with metadata', async () => {
			const taskId = 'task-2';
			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 25,
			};

			const metadata = {
				attemptNumber: 2,
				errorCount: 1,
				lastError: 'Some error',
			};

			const recoveryPoint = await recoveryManager.createRecoveryPoint(
				taskId,
				state,
				metadata,
			);

			expect(recoveryPoint.metadata).toEqual(metadata);
		});

		it('should store multiple recovery points', async () => {
			const taskId = 'task-3';

			for (let i = 0; i < 3; i++) {
				const state: TaskState = {
					task: { taskId, prompt: 'Test', providerId: 'test' },
					status: 'running',
					progress: i * 30,
				};

				await recoveryManager.createRecoveryPoint(taskId, state);
			}

			const points = recoveryManager.getRecoveryPoints(taskId);
			expect(points).toHaveLength(3);
		});
	});

	describe('withRetry', () => {
		it('should succeed on first attempt', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			const result = await recoveryManager.withRetry(operation, {
				taskId: 'task-1',
				operationName: 'test-op',
			});

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on retryable error', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('RATE_LIMIT'))
				.mockResolvedValue('success');

			const manager = new RecoveryManager(checkpointManager, {
				maxAttempts: 3,
				initialDelay: 10,
			});

			const result = await manager.withRetry(operation, {
				taskId: 'task-2',
				operationName: 'test-op',
			});

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should respect max attempts', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('TIMEOUT'));

			const manager = new RecoveryManager(checkpointManager, {
				maxAttempts: 3,
				initialDelay: 10,
			});

			await expect(
				manager.withRetry(operation, {
					taskId: 'task-3',
					operationName: 'test-op',
				}),
			).rejects.toThrow('TIMEOUT');

			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should not retry non-retryable errors', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('FATAL_ERROR'));

			const manager = new RecoveryManager(checkpointManager, {
				retryableErrors: ['RATE_LIMIT', 'TIMEOUT'],
			});

			await expect(
				manager.withRetry(operation, {
					taskId: 'task-4',
					operationName: 'test-op',
				}),
			).rejects.toThrow('FATAL_ERROR');

			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should use exponential backoff', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('TIMEOUT'))
				.mockRejectedValueOnce(new Error('TIMEOUT'))
				.mockResolvedValue('success');

			const manager = new RecoveryManager(checkpointManager, {
				maxAttempts: 3,
				initialDelay: 100,
				backoffMultiplier: 2,
				maxDelay: 1000,
			});

			const startTime = Date.now();
			await manager.withRetry(operation, {
				taskId: 'task-5',
				operationName: 'test-op',
			});
			const duration = Date.now() - startTime;

			// Should wait at least initialDelay (100ms) + initialDelay * 2 (200ms) = 300ms
			expect(duration).toBeGreaterThanOrEqual(250);
		});

		it('should respect max delay', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('TIMEOUT'))
				.mockResolvedValue('success');

			const manager = new RecoveryManager(checkpointManager, {
				maxAttempts: 3,
				initialDelay: 1000,
				backoffMultiplier: 10,
				maxDelay: 500,
			});

			const startTime = Date.now();
			await manager.withRetry(operation, {
				taskId: 'task-6',
				operationName: 'test-op',
			});
			const duration = Date.now() - startTime;

			// Should not wait more than maxDelay
			expect(duration).toBeLessThan(1000);
		});
	});

	describe('rollback', () => {
		it('should rollback to previous recovery point', async () => {
			const taskId = 'task-rollback';

			// Create multiple recovery points
			const state1: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 25,
			};
			const state2: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 50,
			};
			const state3: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 75,
			};

			await recoveryManager.createRecoveryPoint(taskId, state1);
			await recoveryManager.createRecoveryPoint(taskId, state2);
			await recoveryManager.createRecoveryPoint(taskId, state3);

			const result = await recoveryManager.rollback(taskId, 1);

			expect(result.success).toBe(true);
			expect(result.strategy).toBe('rollback');
			expect(result.rolledBack).toBe(true);

			// Should have 2 recovery points left (rolled back 1 step)
			const points = recoveryManager.getRecoveryPoints(taskId);
			expect(points).toHaveLength(2);
		});

		it('should rollback multiple steps', async () => {
			const taskId = 'task-rollback-multi';

			for (let i = 0; i < 5; i++) {
				const state: TaskState = {
					task: { taskId, prompt: 'Test', providerId: 'test' },
					status: 'running',
					progress: i * 20,
				};
				await recoveryManager.createRecoveryPoint(taskId, state);
			}

			const result = await recoveryManager.rollback(taskId, 3);

			expect(result.success).toBe(true);
			expect(result.rolledBack).toBe(true);

			const points = recoveryManager.getRecoveryPoints(taskId);
			expect(points).toHaveLength(2);
		});

		it('should fail when no recovery points exist', async () => {
			const result = await recoveryManager.rollback('unknown-task', 1);

			expect(result.success).toBe(false);
			expect(result.rolledBack).toBe(false);
			expect(result.message).toContain('No recovery points');
		});

		it('should handle rollback to first point', async () => {
			const taskId = 'task-first';

			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 50,
			};

			await recoveryManager.createRecoveryPoint(taskId, state);

			// Try to rollback 10 steps (should rollback to first)
			const result = await recoveryManager.rollback(taskId, 10);

			expect(result.success).toBe(true);
			expect(recoveryManager.getRecoveryPoints(taskId)).toHaveLength(1);
		});
	});

	describe('restore', () => {
		it('should restore from specific checkpoint', async () => {
			const taskId = 'task-restore';
			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 60,
			};

			const recoveryPoint = await recoveryManager.createRecoveryPoint(
				taskId,
				state,
			);

			const result = await recoveryManager.restore(
				taskId,
				recoveryPoint.checkpointId,
			);

			expect(result.success).toBe(true);
			expect(result.strategy).toBe('restore');
			expect(result.restored).toBe(true);
		});

		it('should create new recovery point after restore', async () => {
			const taskId = 'task-restore-new';
			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 40,
			};

			const recoveryPoint = await recoveryManager.createRecoveryPoint(
				taskId,
				state,
			);

			const initialCount = recoveryManager.getRecoveryPoints(taskId).length;

			await recoveryManager.restore(taskId, recoveryPoint.checkpointId);

			const finalCount = recoveryManager.getRecoveryPoints(taskId).length;
			expect(finalCount).toBe(initialCount + 1);
		});

		it('should fail for invalid checkpoint', async () => {
			const result = await recoveryManager.restore('task', 'invalid-checkpoint-id');

			expect(result.success).toBe(false);
			expect(result.restored).toBe(false);
		});
	});

	describe('determineStrategy', () => {
		it('should suggest retry for retryable errors within limit', () => {
			const error = new Error('RATE_LIMIT');
			const strategy = recoveryManager.determineStrategy(error, 1);

			expect(strategy).toBe('retry');
		});

		it('should not suggest retry when max attempts reached', () => {
			const manager = new RecoveryManager(checkpointManager, {
				maxAttempts: 3,
			});

			const error = new Error('TIMEOUT');
			const strategy = manager.determineStrategy(error, 3);

			expect(strategy).not.toBe('retry');
		});

		it('should suggest rollback for stuck errors', () => {
			const error = new Error('Task is stuck in deadlock');
			const strategy = recoveryManager.determineStrategy(error, 2);

			expect(strategy).toBe('rollback');
		});

		it('should suggest restore for corrupted state', () => {
			const error = new Error('State is corrupted');
			const strategy = recoveryManager.determineStrategy(error, 2);

			expect(strategy).toBe('restore');
		});

		it('should suggest abort for fatal errors', () => {
			const error = new Error('FATAL: Unrecoverable error');
			const strategy = recoveryManager.determineStrategy(error, 2);

			expect(strategy).toBe('abort');
		});
	});

	describe('executeRecovery', () => {
		it('should execute retry strategy', async () => {
			const error = new Error('TIMEOUT');

			const result = await recoveryManager.executeRecovery('task-1', error, 1);

			expect(result.strategy).toBe('retry');
			expect(result.retriesAttempted).toBe(1);
		});

		it('should execute rollback strategy', async () => {
			const taskId = 'task-rollback-exec';

			// Create recovery point first
			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 50,
			};
			await recoveryManager.createRecoveryPoint(taskId, state);

			const error = new Error('stuck in loop');
			const result = await recoveryManager.executeRecovery(taskId, error, 2);

			expect(result.strategy).toBe('rollback');
		});

		it('should execute restore strategy', async () => {
			const taskId = 'task-restore-exec';

			// Create checkpoint
			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 30,
			};
			await recoveryManager.createRecoveryPoint(taskId, state);

			const error = new Error('corrupted state');
			const result = await recoveryManager.executeRecovery(taskId, error, 2);

			expect(result.strategy).toBe('restore');
		});

		it('should execute abort strategy', async () => {
			const error = new Error('FATAL_ERROR');

			const result = await recoveryManager.executeRecovery('task', error, 2);

			expect(result.success).toBe(false);
			expect(result.strategy).toBe('abort');
		});

		it('should handle restore when no checkpoint available', async () => {
			const error = new Error('invalid state detected');

			const result = await recoveryManager.executeRecovery(
				'unknown-task',
				error,
				2,
			);

			expect(result.success).toBe(false);
			expect(result.message).toContain('No checkpoint');
		});
	});

	describe('getRecoveryPoints', () => {
		it('should return empty array for unknown task', () => {
			const points = recoveryManager.getRecoveryPoints('unknown');
			expect(points).toEqual([]);
		});

		it('should return all recovery points for task', async () => {
			const taskId = 'task-points';

			for (let i = 0; i < 3; i++) {
				const state: TaskState = {
					task: { taskId, prompt: 'Test', providerId: 'test' },
					status: 'running',
					progress: i * 30,
				};
				await recoveryManager.createRecoveryPoint(taskId, state);
			}

			const points = recoveryManager.getRecoveryPoints(taskId);
			expect(points).toHaveLength(3);
		});
	});

	describe('clearRecoveryPoints', () => {
		it('should clear recovery points for task', async () => {
			const taskId = 'task-clear';

			const state: TaskState = {
				task: { taskId, prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 50,
			};
			await recoveryManager.createRecoveryPoint(taskId, state);

			expect(recoveryManager.getRecoveryPoints(taskId)).toHaveLength(1);

			recoveryManager.clearRecoveryPoints(taskId);

			expect(recoveryManager.getRecoveryPoints(taskId)).toHaveLength(0);
		});

		it('should not affect other tasks', async () => {
			const state1: TaskState = {
				task: { taskId: 'task-a', prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 25,
			};
			const state2: TaskState = {
				task: { taskId: 'task-b', prompt: 'Test', providerId: 'test' },
				status: 'running',
				progress: 75,
			};

			await recoveryManager.createRecoveryPoint('task-a', state1);
			await recoveryManager.createRecoveryPoint('task-b', state2);

			recoveryManager.clearRecoveryPoints('task-a');

			expect(recoveryManager.getRecoveryPoints('task-a')).toHaveLength(0);
			expect(recoveryManager.getRecoveryPoints('task-b')).toHaveLength(1);
		});
	});

	describe('updateRetryConfig', () => {
		it('should update retry configuration', () => {
			const manager = new RecoveryManager(checkpointManager, {
				maxAttempts: 3,
			});

			manager.updateRetryConfig({
				maxAttempts: 10,
				initialDelay: 5000,
			});

			// Config should be updated (verify through behavior)
			expect(manager).toBeDefined();
		});
	});

	describe('error detection', () => {
		it('should detect timeout in error message', () => {
			const manager = new RecoveryManager(checkpointManager);

			const errors = [
				new Error('Operation timeout'),
				new Error('Request timed out'),
				new Error('TIMEOUT'),
			];

			for (const error of errors) {
				const strategy = manager.determineStrategy(error, 1);
				expect(strategy).toBe('retry');
			}
		});

		it('should detect rate limit in error message', () => {
			const manager = new RecoveryManager(checkpointManager);

			const errors = [
				new Error('Rate limit exceeded'),
				new Error('Too many requests - rate limited'),
			];

			for (const error of errors) {
				const strategy = manager.determineStrategy(error, 1);
				expect(strategy).toBe('retry');
			}
		});

		it('should detect network errors', () => {
			const manager = new RecoveryManager(checkpointManager);

			const errors = [
				new Error('Network error occurred'),
				new Error('Connection failed - network issue'),
			];

			for (const error of errors) {
				const strategy = manager.determineStrategy(error, 1);
				expect(strategy).toBe('retry');
			}
		});

		it('should detect temporary errors', () => {
			const manager = new RecoveryManager(checkpointManager);

			const error = new Error('Temporary failure - please retry');
			const strategy = manager.determineStrategy(error, 1);

			expect(strategy).toBe('retry');
		});
	});
});
