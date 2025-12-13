/**
 * Parallel Task Scheduler
 *
 * Schedules and executes tasks in parallel based on dependency graph.
 * Supports both local and remote worker pools.
 */

import type { ExecutionPlan, TaskStage } from '../autonomous/dependency-graph.js';
import type { RecoveryManager } from '../autonomous/recovery-manager.js';

export interface TaskExecution {
	taskId: string;
	status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
	workerId?: string | undefined;
	startedAt?: Date | undefined;
	completedAt?: Date | undefined;
	duration?: number | undefined;
	error?: string | undefined;
	retries: number;
}

export interface SchedulerConfig {
	/**
	 * Maximum concurrent task executions
	 */
	maxConcurrency: number;

	/**
	 * Maximum retries per task
	 */
	maxRetries: number;

	/**
	 * Timeout per task (milliseconds)
	 */
	taskTimeout: number;

	/**
	 * Enable failover to other workers on failure
	 */
	enableFailover: boolean;

	/**
	 * Strategy for handling task failures
	 */
	failureStrategy: 'abort' | 'continue' | 'retry';
}

export interface SchedulerResult {
	success: boolean;
	totalTasks: number;
	completedTasks: number;
	failedTasks: number;
	duration: number;
	executions: TaskExecution[];
}

export interface WorkerPool {
	/**
	 * Get available worker ID
	 */
	getAvailableWorker(): Promise<string | undefined>;

	/**
	 * Execute task on worker
	 */
	executeTask(
		workerId: string,
		taskId: string,
		taskDefinition: unknown,
	): Promise<{ success: boolean; error?: string }>;

	/**
	 * Release worker after task completion
	 */
	releaseWorker(workerId: string): void;

	/**
	 * Check if worker is available
	 */
	isWorkerAvailable(workerId: string): Promise<boolean>;
}

/**
 * Parallel task scheduler
 */
export class ParallelScheduler {
	private config: SchedulerConfig;
	private workerPool: WorkerPool;
	private recoveryManager: RecoveryManager;
	private executions: Map<string, TaskExecution> = new Map();
	private runningTasks: Set<string> = new Set();

	constructor(
		workerPool: WorkerPool,
		recoveryManager: RecoveryManager,
		config?: Partial<SchedulerConfig>,
	) {
		this.workerPool = workerPool;
		this.recoveryManager = recoveryManager;
		this.config = {
			maxConcurrency: 4,
			maxRetries: 3,
			taskTimeout: 30 * 60 * 1000, // 30 minutes
			enableFailover: true,
			failureStrategy: 'retry',
			...config,
		};
	}

	/**
	 * Execute tasks from execution plan in parallel
	 */
	async execute(
		executionPlan: ExecutionPlan,
		taskDefinitions: Map<string, unknown>,
	): Promise<SchedulerResult> {
		const startTime = Date.now();

		// Initialize executions
		for (const task of executionPlan.tasks) {
			this.executions.set(task.id, {
				taskId: task.id,
				status: 'pending',
				retries: 0,
			});
		}

		try {
			// Execute stages sequentially, tasks within stage in parallel
			for (const stage of executionPlan.stages) {
				await this.executeStage(stage, taskDefinitions);

				// Check for failures
				const stageExecutions = stage.tasks.map((tid) => this.executions.get(tid));
				const failedTasks = stageExecutions.filter((e) => e?.status === 'failed');

				if (failedTasks.length > 0 && this.config.failureStrategy === 'abort') {
					throw new Error(`Stage ${stage.stage} failed with ${failedTasks.length} task(s)`);
				}
			}

			// Calculate results
			const executions = Array.from(this.executions.values());
			const completedTasks = executions.filter((e) => e.status === 'completed').length;
			const failedTasks = executions.filter((e) => e.status === 'failed').length;

			return {
				success: failedTasks === 0,
				totalTasks: executions.length,
				completedTasks,
				failedTasks,
				duration: Date.now() - startTime,
				executions,
			};
		} catch (_error) {
			const executions = Array.from(this.executions.values());
			return {
				success: false,
				totalTasks: executions.length,
				completedTasks: executions.filter((e) => e.status === 'completed').length,
				failedTasks: executions.filter((e) => e.status === 'failed').length,
				duration: Date.now() - startTime,
				executions,
			};
		}
	}

	/**
	 * Execute all tasks in a stage in parallel
	 */
	private async executeStage(
		stage: TaskStage,
		taskDefinitions: Map<string, unknown>,
	): Promise<void> {
		// Execute tasks in parallel with concurrency limit
		const taskPromises = stage.tasks.map((taskId) =>
			this.executeTaskWithConcurrencyLimit(taskId, taskDefinitions.get(taskId)),
		);

		await Promise.allSettled(taskPromises);
	}

	/**
	 * Execute task with concurrency control
	 */
	private async executeTaskWithConcurrencyLimit(
		taskId: string,
		taskDefinition: unknown,
	): Promise<void> {
		// Wait for available slot
		while (this.runningTasks.size >= this.config.maxConcurrency) {
			await this.sleep(100);
		}

		// Add to running tasks
		this.runningTasks.add(taskId);

		try {
			await this.executeTask(taskId, taskDefinition);
		} finally {
			// Remove from running tasks
			this.runningTasks.delete(taskId);
		}
	}

	/**
	 * Execute single task with retry logic
	 */
	private async executeTask(taskId: string, taskDefinition: unknown): Promise<void> {
		const execution = this.executions.get(taskId);
		if (!execution) {
			throw new Error(`Execution not found for task: ${taskId}`);
		}

		// Use recovery manager for retry logic
		await this.recoveryManager
			.withRetry(
				async () => {
					// Get available worker
					const workerId = await this.workerPool.getAvailableWorker();
					if (!workerId) {
						throw new Error('No available workers');
					}

					// Update execution
					execution.status = 'running';
					execution.workerId = workerId;
					execution.startedAt = new Date();

					// Execute task with timeout
					const result = await this.executeWithTimeout(
						() => this.workerPool.executeTask(workerId, taskId, taskDefinition),
						this.config.taskTimeout,
					);

					// Update execution
					execution.completedAt = new Date();
					execution.duration =
						execution.completedAt.getTime() - (execution.startedAt?.getTime() ?? 0);

					if (result.success) {
						execution.status = 'completed';
					} else {
						execution.error = result.error;
						throw new Error(result.error ?? 'Task execution failed');
					}

					// Release worker
					this.workerPool.releaseWorker(workerId);

					return result;
				},
				{
					taskId,
					operationName: `task-${taskId}`,
				},
			)
			.catch((error) => {
				// Handle final failure after retries
				execution.status = 'failed';
				execution.error = error instanceof Error ? error.message : 'Unknown error';
				execution.completedAt = new Date();

				if (this.config.failureStrategy === 'abort') {
					throw error;
				}
			});
	}

	/**
	 * Execute operation with timeout
	 */
	private async executeWithTimeout<T>(operation: () => Promise<T>, timeout: number): Promise<T> {
		return await Promise.race([
			operation(),
			new Promise<T>((_resolve, reject) => {
				setTimeout(() => reject(new Error('Task timeout')), timeout);
			}),
		]);
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get execution status for task
	 */
	getTaskStatus(taskId: string): TaskExecution | undefined {
		return this.executions.get(taskId);
	}

	/**
	 * Get all executions
	 */
	getAllExecutions(): TaskExecution[] {
		return Array.from(this.executions.values());
	}

	/**
	 * Get running task count
	 */
	getRunningTaskCount(): number {
		return this.runningTasks.size;
	}

	/**
	 * Cancel all running tasks
	 */
	async cancelAll(): Promise<void> {
		// Mark all running tasks as failed
		for (const taskId of this.runningTasks) {
			const execution = this.executions.get(taskId);
			if (execution) {
				execution.status = 'failed';
				execution.error = 'Cancelled by user';
				execution.completedAt = new Date();
			}
		}

		this.runningTasks.clear();
	}
}

/**
 * Local worker pool implementation (single machine)
 */
export class LocalWorkerPool implements WorkerPool {
	private availableWorkers: Set<string>;
	private busyWorkers: Set<string>;
	private taskExecutor: (
		taskId: string,
		taskDefinition: unknown,
	) => Promise<{ success: boolean; error?: string }>;

	constructor(
		maxWorkers: number,
		taskExecutor: (
			taskId: string,
			taskDefinition: unknown,
		) => Promise<{ success: boolean; error?: string }>,
	) {
		this.taskExecutor = taskExecutor;

		// Create worker IDs
		this.availableWorkers = new Set();
		this.busyWorkers = new Set();

		for (let i = 0; i < maxWorkers; i++) {
			this.availableWorkers.add(`local-worker-${i}`);
		}
	}

	async getAvailableWorker(): Promise<string | undefined> {
		const workerId = this.availableWorkers.values().next().value;
		if (workerId) {
			this.availableWorkers.delete(workerId);
			this.busyWorkers.add(workerId);
		}
		return workerId;
	}

	async executeTask(
		_workerId: string,
		taskId: string,
		taskDefinition: unknown,
	): Promise<{ success: boolean; error?: string }> {
		return await this.taskExecutor(taskId, taskDefinition);
	}

	releaseWorker(workerId: string): void {
		this.busyWorkers.delete(workerId);
		this.availableWorkers.add(workerId);
	}

	async isWorkerAvailable(workerId: string): Promise<boolean> {
		return this.availableWorkers.has(workerId);
	}

	getAvailableWorkerCount(): number {
		return this.availableWorkers.size;
	}

	getBusyWorkerCount(): number {
		return this.busyWorkers.size;
	}
}

/**
 * Create parallel scheduler
 */
export function createParallelScheduler(
	workerPool: WorkerPool,
	recoveryManager: RecoveryManager,
	config?: Partial<SchedulerConfig>,
): ParallelScheduler {
	return new ParallelScheduler(workerPool, recoveryManager, config);
}

/**
 * Create local worker pool
 */
export function createLocalWorkerPool(
	maxWorkers: number,
	taskExecutor: (
		taskId: string,
		taskDefinition: unknown,
	) => Promise<{ success: boolean; error?: string }>,
): LocalWorkerPool {
	return new LocalWorkerPool(maxWorkers, taskExecutor);
}
