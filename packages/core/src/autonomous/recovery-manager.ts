/**
 * Recovery Manager
 *
 * Handles recovery operations: retry, rollback, and restore.
 * Provides transaction-like semantics for autonomous workflows.
 */

import type { CheckpointId, CheckpointManager, TaskState } from '../checkpoint/index.js';

export type RecoveryStrategy = 'retry' | 'rollback' | 'restore' | 'skip' | 'abort';

export interface RetryConfig {
	maxAttempts: number;
	initialDelay: number; // milliseconds
	maxDelay: number; // milliseconds
	backoffMultiplier: number; // exponential backoff multiplier
	retryableErrors?: string[]; // Error codes that should trigger retry
}

export interface RecoveryPoint {
	id: string;
	checkpointId: CheckpointId;
	timestamp: string;
	state: TaskState;
	metadata?: {
		attemptNumber?: number;
		errorCount?: number;
		lastError?: string;
	};
}

export interface RecoveryResult {
	success: boolean;
	strategy: RecoveryStrategy;
	restored?: boolean;
	rolledBack?: boolean;
	retriesAttempted: number;
	message: string;
}

/**
 * Recovery manager
 */
export class RecoveryManager {
	private checkpointManager: CheckpointManager;
	private retryConfig: RetryConfig;
	private recoveryPoints: Map<string, RecoveryPoint[]> = new Map();

	constructor(
		checkpointManager: CheckpointManager,
		retryConfig?: Partial<RetryConfig>,
	) {
		this.checkpointManager = checkpointManager;
		this.retryConfig = {
			maxAttempts: 3,
			initialDelay: 1000,
			maxDelay: 30000,
			backoffMultiplier: 2,
			retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR'],
			...retryConfig,
		};
	}

	/**
	 * Create recovery point
	 */
	async createRecoveryPoint(
		taskId: string,
		state: TaskState,
		metadata?: RecoveryPoint['metadata'],
	): Promise<RecoveryPoint> {
		// Create checkpoint
		const checkpointId = await this.checkpointManager.checkpoint(taskId, state);

		const recoveryPoint: RecoveryPoint = {
			id: `recovery-${Date.now()}`,
			checkpointId,
			timestamp: new Date().toISOString(),
			state,
			...(metadata && { metadata }),
		};

		// Store recovery point
		if (!this.recoveryPoints.has(taskId)) {
			this.recoveryPoints.set(taskId, []);
		}
		this.recoveryPoints.get(taskId)?.push(recoveryPoint);

		return recoveryPoint;
	}

	/**
	 * Execute operation with retry logic
	 */
	async withRetry<T>(
		operation: () => Promise<T>,
		context: { taskId: string; operationName: string },
	): Promise<T> {
		let attempt = 0;
		let lastError: Error | undefined;

		while (attempt < this.retryConfig.maxAttempts) {
			attempt++;

			try {
				const result = await operation();
				return result;
			} catch (error) {
				lastError = error as Error;

				// Check if error is retryable
				const isRetryable = this.isRetryableError(error);

				if (!isRetryable || attempt >= this.retryConfig.maxAttempts) {
					throw error;
				}

				// Calculate delay with exponential backoff
				const delay = Math.min(
					this.retryConfig.initialDelay *
						Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
					this.retryConfig.maxDelay,
				);

				console.warn(
					`Retry ${attempt}/${this.retryConfig.maxAttempts} for ${context.operationName} after ${delay}ms`,
				);

				// Wait before retry
				await this.sleep(delay);
			}
		}

		throw lastError ?? new Error('Operation failed after retries');
	}

	/**
	 * Rollback to previous recovery point
	 */
	async rollback(taskId: string, steps = 1): Promise<RecoveryResult> {
		const points = this.recoveryPoints.get(taskId) ?? [];

		if (points.length === 0) {
			return {
				success: false,
				strategy: 'rollback',
				rolledBack: false,
				retriesAttempted: 0,
				message: 'No recovery points available',
			};
		}

		// Get target recovery point (n steps back)
		const targetIndex = Math.max(0, points.length - 1 - steps);
		const targetPoint = points[targetIndex];

		if (!targetPoint) {
			return {
				success: false,
				strategy: 'rollback',
				rolledBack: false,
				retriesAttempted: 0,
				message: 'Recovery point not found',
			};
		}

		try {
			// Restore from checkpoint
			await this.checkpointManager.restore(targetPoint.checkpointId);

			// Remove rolled back points
			const newPoints = points.slice(0, targetIndex + 1);
			this.recoveryPoints.set(taskId, newPoints);

			return {
				success: true,
				strategy: 'rollback',
				rolledBack: true,
				retriesAttempted: 0,
				message: `Rolled back ${steps} step(s) to recovery point ${targetPoint.id}`,
			};
		} catch (error) {
			return {
				success: false,
				strategy: 'rollback',
				rolledBack: false,
				retriesAttempted: 0,
				message: `Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Restore from specific checkpoint
	 */
	async restore(taskId: string, checkpointId: CheckpointId): Promise<RecoveryResult> {
		try {
			const state = await this.checkpointManager.restore(checkpointId);

			// Create new recovery point after restore
			await this.createRecoveryPoint(taskId, state, {
				attemptNumber: (state.context?.attemptNumber as number | undefined) ?? 0,
			});

			return {
				success: true,
				strategy: 'restore',
				restored: true,
				retriesAttempted: 0,
				message: `Restored from checkpoint ${checkpointId}`,
			};
		} catch (error) {
			return {
				success: false,
				strategy: 'restore',
				restored: false,
				retriesAttempted: 0,
				message: `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			};
		}
	}

	/**
	 * Determine recovery strategy based on error
	 */
	determineStrategy(error: Error, attemptCount: number): RecoveryStrategy {
		// Check if retryable
		if (this.isRetryableError(error) && attemptCount < this.retryConfig.maxAttempts) {
			return 'retry';
		}

		// Check error type for specific strategies
		const errorMessage = error.message.toLowerCase();

		if (errorMessage.includes('stuck') || errorMessage.includes('deadlock')) {
			return 'rollback';
		}

		if (errorMessage.includes('corrupted') || errorMessage.includes('invalid state')) {
			return 'restore';
		}

		// Default to abort for non-recoverable errors
		return 'abort';
	}

	/**
	 * Execute recovery strategy
	 */
	async executeRecovery(
		taskId: string,
		error: Error,
		attemptCount: number,
	): Promise<RecoveryResult> {
		const strategy = this.determineStrategy(error, attemptCount);

		switch (strategy) {
			case 'retry':
				return {
					success: false,
					strategy: 'retry',
					retriesAttempted: attemptCount,
					message: `Will retry (attempt ${attemptCount + 1}/${this.retryConfig.maxAttempts})`,
				};

			case 'rollback':
				return await this.rollback(taskId, 1);

			case 'restore':
				// Restore from latest checkpoint
				const latestCheckpoint = await this.checkpointManager.getLatestCheckpoint(taskId);
				if (!latestCheckpoint) {
					return {
						success: false,
						strategy: 'restore',
						retriesAttempted: attemptCount,
						message: 'No checkpoint available for restore',
					};
				}
				return await this.restore(taskId, latestCheckpoint.id);

			case 'skip':
				return {
					success: true,
					strategy: 'skip',
					retriesAttempted: attemptCount,
					message: 'Skipping failed operation',
				};

			case 'abort':
				return {
					success: false,
					strategy: 'abort',
					retriesAttempted: attemptCount,
					message: `Aborting: ${error.message}`,
				};
		}
	}

	/**
	 * Check if error is retryable
	 */
	private isRetryableError(error: unknown): boolean {
		if (!(error instanceof Error)) return false;

		const errorCode = (error as any).code;
		if (errorCode && this.retryConfig.retryableErrors?.includes(errorCode)) {
			return true;
		}

		// Check error message for retryable patterns
		const message = error.message.toLowerCase();
		return (
			message.includes('timeout') ||
			message.includes('rate limit') ||
			message.includes('network') ||
			message.includes('temporary')
		);
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get recovery points for task
	 */
	getRecoveryPoints(taskId: string): RecoveryPoint[] {
		return this.recoveryPoints.get(taskId) ?? [];
	}

	/**
	 * Clear recovery points for task
	 */
	clearRecoveryPoints(taskId: string): void {
		this.recoveryPoints.delete(taskId);
	}

	/**
	 * Update retry configuration
	 */
	updateRetryConfig(config: Partial<RetryConfig>): void {
		this.retryConfig = {
			...this.retryConfig,
			...config,
		};
	}
}

/**
 * Create recovery manager
 */
export function createRecoveryManager(
	checkpointManager: CheckpointManager,
	retryConfig?: Partial<RetryConfig>,
): RecoveryManager {
	return new RecoveryManager(checkpointManager, retryConfig);
}
