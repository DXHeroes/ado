/**
 * Parallel Executor - Executes multiple tasks in parallel with worktree isolation.
 */

import type { AgentAdapter, AgentEvent, AgentTask } from '@dxheroes/ado-shared';
import { AdoError } from '@dxheroes/ado-shared';
import type { WorktreeManager } from './worktree-manager.js';

/**
 * Configuration for parallel execution
 */
export interface ParallelExecutionConfig {
	/** Maximum number of concurrent tasks */
	maxConcurrency: number;

	/** Whether to use worktree isolation */
	useWorktreeIsolation: boolean;

	/** Timeout for each task (ms) */
	taskTimeout?: number;
}

/**
 * Result of a parallel execution
 */
export interface ParallelExecutionResult {
	/** Task ID */
	taskId: string;

	/** Whether the task succeeded */
	success: boolean;

	/** Output from the task */
	output?: string;

	/** Error if task failed */
	error?: Error;

	/** Worktree ID if isolation was used */
	worktreeId?: string;

	/** Duration in milliseconds */
	duration: number;
}

/**
 * Parallel task execution info
 */
interface TaskExecution {
	taskId: string;
	task: AgentTask;
	adapter: AgentAdapter;
	worktreeId?: string;
	startTime: number;
}

/**
 * Parallel Executor
 */
export class ParallelExecutor {
	private config: ParallelExecutionConfig;
	private worktreeManager?: WorktreeManager;
	private activeExecutions: Map<string, TaskExecution> = new Map();

	constructor(config: ParallelExecutionConfig, worktreeManager?: WorktreeManager) {
		this.config = config;
		if (worktreeManager) {
			this.worktreeManager = worktreeManager;
		}

		if (config.useWorktreeIsolation && !worktreeManager) {
			throw new Error('WorktreeManager is required when useWorktreeIsolation is true');
		}
	}

	/**
	 * Execute multiple tasks in parallel
	 */
	async executeParallel(
		tasks: Array<{ task: AgentTask; adapter: AgentAdapter }>,
	): Promise<ParallelExecutionResult[]> {
		const results: ParallelExecutionResult[] = [];
		const queue = [...tasks];
		const executing: Promise<ParallelExecutionResult>[] = [];

		// Process tasks with concurrency limit
		while (queue.length > 0 || executing.length > 0) {
			// Start new tasks up to concurrency limit
			while (queue.length > 0 && executing.length < this.config.maxConcurrency) {
				const item = queue.shift();
				if (item) {
					const promise = this.executeTask(item.task, item.adapter);
					executing.push(promise);
				}
			}

			// Wait for at least one task to complete
			if (executing.length > 0) {
				const result = await Promise.race(executing);
				results.push(result);

				// Remove completed task from executing list
				const index = executing.findIndex((p) => p === Promise.resolve(result));
				if (index >= 0) {
					executing.splice(index, 1);
				}
			}
		}

		return results;
	}

	/**
	 * Execute a single task with optional worktree isolation
	 */
	private async executeTask(
		task: AgentTask,
		adapter: AgentAdapter,
	): Promise<ParallelExecutionResult> {
		const startTime = Date.now();
		let worktreeId: string | undefined;

		try {
			// Create worktree if isolation is enabled
			let updatedTask = task;
			if (this.config.useWorktreeIsolation && this.worktreeManager) {
				const worktree = await this.worktreeManager.createWorktree(task.id);
				worktreeId = worktree.id;

				// Update task to use worktree path
				updatedTask = {
					...task,
					projectContext: {
						...task.projectContext,
						repositoryPath: worktree.path,
					},
				};
			}

			// Track execution
			const execution: TaskExecution = {
				taskId: updatedTask.id,
				task: updatedTask,
				adapter,
				...(worktreeId !== undefined && { worktreeId }),
				startTime,
			};
			this.activeExecutions.set(updatedTask.id, execution);

			// Execute task with timeout
			const result = await this.executeWithTimeout(updatedTask, adapter);

			return {
				taskId: task.id,
				success: result.success,
				output: result.output,
				...(worktreeId !== undefined && { worktreeId }),
				duration: Date.now() - startTime,
			};
		} catch (error) {
			return {
				taskId: task.id,
				success: false,
				error: error instanceof Error ? error : new Error(String(error)),
				...(worktreeId !== undefined && { worktreeId }),
				duration: Date.now() - startTime,
			};
		} finally {
			// Clean up
			this.activeExecutions.delete(task.id);

			// Remove worktree if created
			if (worktreeId && this.worktreeManager) {
				await this.worktreeManager.removeWorktree(worktreeId).catch((err) => {
					// Log error but don't fail the task
					// biome-ignore lint/suspicious/noConsole: Error logging
					console.error(`Failed to cleanup worktree ${worktreeId}:`, err);
				});
			}
		}
	}

	/**
	 * Execute task with timeout
	 */
	private async executeWithTimeout(
		task: AgentTask,
		adapter: AgentAdapter,
	): Promise<{ success: boolean; output: string }> {
		const timeout = this.config.taskTimeout;

		let timeoutId: NodeJS.Timeout | undefined;
		const timeoutPromise = timeout
			? new Promise<never>((_, reject) => {
					timeoutId = setTimeout(() => {
						reject(
							new AdoError({
								code: 'TASK_TIMEOUT',
								message: `Task ${task.id} timed out after ${timeout}ms`,
								recoverable: false,
								remediation: 'Increase task timeout or simplify the task',
								cause: undefined,
							}),
						);
					}, timeout);
				})
			: new Promise<never>(() => {}); // Never resolves

		try {
			const executionPromise = this.collectTaskOutput(adapter.execute(task));

			const result = await Promise.race([executionPromise, timeoutPromise]);

			return result;
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}

	/**
	 * Collect output from task execution
	 */
	private async collectTaskOutput(
		events: AsyncIterable<AgentEvent>,
	): Promise<{ success: boolean; output: string }> {
		let output = '';
		let success = false;

		for await (const event of events) {
			if (event.type === 'output') {
				output += event.content;
			} else if (event.type === 'complete') {
				success = event.result.success;
				output = event.result.output;
			} else if (event.type === 'error') {
				throw event.error;
			}
		}

		return { success, output };
	}

	/**
	 * Get currently executing tasks
	 */
	getActiveExecutions(): TaskExecution[] {
		return Array.from(this.activeExecutions.values());
	}

	/**
	 * Cancel all active executions
	 */
	async cancelAll(): Promise<void> {
		const executions = this.getActiveExecutions();

		await Promise.allSettled(
			executions.map(async (exec) => {
				await exec.adapter.interrupt();

				// Clean up worktree
				if (exec.worktreeId && this.worktreeManager) {
					await this.worktreeManager.removeWorktree(exec.worktreeId).catch(() => {});
				}
			}),
		);

		this.activeExecutions.clear();
	}
}

/**
 * Create a new parallel executor
 */
export function createParallelExecutor(
	config: ParallelExecutionConfig,
	worktreeManager?: WorktreeManager,
): ParallelExecutor {
	return new ParallelExecutor(config, worktreeManager);
}
