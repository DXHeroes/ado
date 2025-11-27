/**
 * Task Queue - Manages task queuing, prioritization, and execution.
 *
 * Note: This is an in-memory implementation. For production with BullMQ,
 * replace with Redis-backed queue.
 */

import { AdoError } from '@dxheroes/ado-shared';
import type { AgentTask } from '@dxheroes/ado-shared';

/**
 * Task queue item with priority and metadata
 */
export interface QueuedTask {
	id: string;
	task: AgentTask;
	priority: number;
	addedAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	retryCount: number;
	error?: Error;
}

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
	/** Maximum number of concurrent tasks */
	concurrency: number;

	/** Maximum retry attempts for failed tasks */
	retryAttempts: number;

	/** Delay between retries (ms) */
	retryDelay: number;

	/** Maximum queue size (0 = unlimited) */
	maxQueueSize?: number;
}

/**
 * Task queue statistics
 */
export interface QueueStats {
	queued: number;
	running: number;
	completed: number;
	failed: number;
	cancelled: number;
	totalProcessed: number;
}

/**
 * Task execution handler
 */
export type TaskHandler = (task: AgentTask) => Promise<void>;

/**
 * In-memory task queue with concurrency control
 */
export class TaskQueue {
	private config: TaskQueueConfig;
	private queue: Map<string, QueuedTask> = new Map();
	private running: Set<string> = new Set();
	private handler?: TaskHandler;
	private stats = {
		completed: 0,
		failed: 0,
		cancelled: 0,
	};

	constructor(config: TaskQueueConfig) {
		this.config = config;
	}

	/**
	 * Set the task execution handler
	 */
	setHandler(handler: TaskHandler): void {
		this.handler = handler;
	}

	/**
	 * Add a task to the queue
	 */
	async add(task: AgentTask, priority = 0): Promise<string> {
		// Check queue size limit
		if (this.config.maxQueueSize && this.queue.size >= this.config.maxQueueSize) {
			throw new AdoError({
				code: 'QUEUE_FULL',
				message: `Task queue is full (max: ${this.config.maxQueueSize})`,
				recoverable: true,
				remediation: 'Wait for tasks to complete or increase maxQueueSize',
				cause: undefined,
			});
		}

		const queuedTask: QueuedTask = {
			id: task.id,
			task,
			priority,
			addedAt: new Date(),
			status: 'queued',
			retryCount: 0,
		};

		this.queue.set(task.id, queuedTask);

		// Process queue
		setImmediate(() => this.processQueue());

		return task.id;
	}

	/**
	 * Cancel a queued or running task
	 */
	async cancel(taskId: string): Promise<boolean> {
		const queuedTask = this.queue.get(taskId);
		if (!queuedTask) {
			return false;
		}

		if (queuedTask.status === 'running') {
			// Mark for cancellation, actual interrupt handled by executor
			queuedTask.status = 'cancelled';
			queuedTask.completedAt = new Date();
			this.running.delete(taskId);
			this.stats.cancelled++;
		} else if (queuedTask.status === 'queued') {
			queuedTask.status = 'cancelled';
			queuedTask.completedAt = new Date();
			this.stats.cancelled++;
		}

		return true;
	}

	/**
	 * Get task status
	 */
	getTask(taskId: string): QueuedTask | undefined {
		return this.queue.get(taskId);
	}

	/**
	 * Get all tasks in a specific state
	 */
	getTasks(status?: QueuedTask['status']): QueuedTask[] {
		const tasks = Array.from(this.queue.values());
		return status ? tasks.filter((t) => t.status === status) : tasks;
	}

	/**
	 * Get queue statistics
	 */
	getStats(): QueueStats {
		const tasks = Array.from(this.queue.values());
		return {
			queued: tasks.filter((t) => t.status === 'queued').length,
			running: tasks.filter((t) => t.status === 'running').length,
			completed: this.stats.completed,
			failed: this.stats.failed,
			cancelled: this.stats.cancelled,
			totalProcessed: this.stats.completed + this.stats.failed + this.stats.cancelled,
		};
	}

	/**
	 * Clear completed/failed/cancelled tasks
	 */
	cleanup(): void {
		const toDelete: string[] = [];
		for (const [id, task] of this.queue.entries()) {
			if (['completed', 'failed', 'cancelled'].includes(task.status)) {
				toDelete.push(id);
			}
		}

		for (const id of toDelete) {
			this.queue.delete(id);
		}
	}

	/**
	 * Process queued tasks with concurrency control
	 */
	private async processQueue(): Promise<void> {
		if (!this.handler) {
			return;
		}

		// Get queued tasks sorted by priority (higher first) then by age (older first)
		const queued = this.getTasks('queued').sort((a, b) => {
			if (a.priority !== b.priority) {
				return b.priority - a.priority;
			}
			return a.addedAt.getTime() - b.addedAt.getTime();
		});

		// Start tasks up to concurrency limit
		while (this.running.size < this.config.concurrency && queued.length > 0) {
			const queuedTask = queued.shift();
			if (!queuedTask) break;

			queuedTask.status = 'running';
			queuedTask.startedAt = new Date();
			this.running.add(queuedTask.id);

			// Execute task asynchronously
			this.executeTask(queuedTask).catch((err) => {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error(`Task ${queuedTask.id} execution error:`, err);
			});
		}
	}

	/**
	 * Execute a single task with retry logic
	 */
	private async executeTask(queuedTask: QueuedTask): Promise<void> {
		if (!this.handler) {
			return;
		}

		try {
			await this.handler(queuedTask.task);

			queuedTask.status = 'completed';
			queuedTask.completedAt = new Date();
			this.stats.completed++;
		} catch (error) {
			queuedTask.error = error instanceof Error ? error : new Error(String(error));

			// Check if we should retry
			if (queuedTask.retryCount < this.config.retryAttempts) {
				queuedTask.retryCount++;
				queuedTask.status = 'queued';

				// Schedule retry with delay
				setTimeout(() => {
					this.processQueue();
				}, this.config.retryDelay);
			} else {
				queuedTask.status = 'failed';
				queuedTask.completedAt = new Date();
				this.stats.failed++;
			}
		} finally {
			this.running.delete(queuedTask.id);

			// Process next tasks
			setImmediate(() => this.processQueue());
		}
	}

	/**
	 * Wait for all tasks to complete
	 */
	async drain(): Promise<void> {
		return new Promise<void>((resolve) => {
			const checkComplete = () => {
				const stats = this.getStats();
				if (stats.queued === 0 && stats.running === 0) {
					resolve();
				} else {
					setTimeout(checkComplete, 100);
				}
			};
			checkComplete();
		});
	}

	/**
	 * Clear all tasks and reset queue
	 */
	clear(): void {
		this.queue.clear();
		this.running.clear();
		this.stats = {
			completed: 0,
			failed: 0,
			cancelled: 0,
		};
	}
}

/**
 * Create a new task queue
 */
export function createTaskQueue(config: TaskQueueConfig): TaskQueue {
	return new TaskQueue(config);
}
