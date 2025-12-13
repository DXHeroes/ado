/**
 * Work Stealing Scheduler
 *
 * Load balancing algorithm where idle workers steal tasks from busy workers.
 * Improves load distribution and cache locality.
 */

export interface WorkStealingConfig {
	/**
	 * Number of workers
	 */
	workerCount: number;

	/**
	 * Maximum steal attempts per worker
	 */
	maxStealAttempts: number;

	/**
	 * Random steal selection (true) vs round-robin (false)
	 */
	randomSteal: boolean;

	/**
	 * Minimum queue size before allowing stealing
	 */
	minQueueSizeForSteal: number;

	/**
	 * Backoff delay when no work available (ms)
	 */
	backoffDelay: number;

	/**
	 * Enable work splitting (split large tasks)
	 */
	enableWorkSplitting: boolean;
}

export interface Task<T = unknown> {
	/**
	 * Task ID
	 */
	id: string;

	/**
	 * Task payload
	 */
	data: T;

	/**
	 * Priority (higher = more important)
	 */
	priority: number;

	/**
	 * Estimated duration (ms)
	 */
	estimatedDuration?: number | undefined;

	/**
	 * Can be split into smaller tasks
	 */
	splittable?: boolean | undefined;
}

export interface WorkerQueue<T = unknown> {
	/**
	 * Worker ID
	 */
	workerId: string;

	/**
	 * Task deque (double-ended queue)
	 */
	tasks: Task<T>[];

	/**
	 * Currently processing task
	 */
	currentTask?: Task<T> | undefined;

	/**
	 * Worker status
	 */
	status: 'idle' | 'busy' | 'stealing';

	/**
	 * Tasks completed
	 */
	completedTasks: number;

	/**
	 * Tasks stolen
	 */
	tasksStolen: number;

	/**
	 * Tasks lost to stealing
	 */
	tasksLost: number;
}

export interface StealResult<T = unknown> {
	/**
	 * Successfully stolen task
	 */
	task?: Task<T> | undefined;

	/**
	 * Victim worker ID
	 */
	victimId?: string | undefined;

	/**
	 * Steal was successful
	 */
	success: boolean;
}

export interface WorkStealingMetrics {
	/**
	 * Total tasks processed
	 */
	totalTasks: number;

	/**
	 * Tasks stolen
	 */
	totalSteals: number;

	/**
	 * Failed steal attempts
	 */
	failedSteals: number;

	/**
	 * Average queue length
	 */
	avgQueueLength: number;

	/**
	 * Worker utilization (0-1)
	 */
	workerUtilization: number;

	/**
	 * Load balance score (0-1, higher = better balance)
	 */
	loadBalanceScore: number;
}

/**
 * Work stealing scheduler
 */
export class WorkStealingScheduler<T = unknown> {
	private config: WorkStealingConfig;
	private workerQueues: Map<string, WorkerQueue<T>> = new Map();
	private stealAttempts = 0;
	private successfulSteals = 0;

	constructor(config?: Partial<WorkStealingConfig>) {
		this.config = {
			workerCount: 4,
			maxStealAttempts: 3,
			randomSteal: true,
			minQueueSizeForSteal: 2,
			backoffDelay: 100,
			enableWorkSplitting: false,
			...config,
		};

		// Initialize worker queues
		for (let i = 0; i < this.config.workerCount; i++) {
			const workerId = `worker-${i}`;
			this.workerQueues.set(workerId, {
				workerId,
				tasks: [],
				status: 'idle',
				completedTasks: 0,
				tasksStolen: 0,
				tasksLost: 0,
			});
		}
	}

	/**
	 * Submit task to scheduler
	 */
	submitTask(task: Task<T>): void {
		// Find least loaded worker
		const targetWorker = this.findLeastLoadedWorker();
		if (!targetWorker) {
			throw new Error('No workers available');
		}

		// Add to worker's queue
		targetWorker.tasks.push(task);
	}

	/**
	 * Submit multiple tasks
	 */
	submitTasks(tasks: Task<T>[]): void {
		// Distribute tasks across workers using round-robin
		let workerIndex = 0;
		const workers = Array.from(this.workerQueues.values());

		for (const task of tasks) {
			workers[workerIndex % workers.length]?.tasks.push(task);
			workerIndex++;
		}
	}

	/**
	 * Get next task for worker (with work stealing)
	 */
	async getNextTask(workerId: string): Promise<Task<T> | undefined> {
		const worker = this.workerQueues.get(workerId);
		if (!worker) {
			throw new Error(`Worker not found: ${workerId}`);
		}

		// Try own queue first (FIFO)
		const ownTask = worker.tasks.shift();
		if (ownTask) {
			worker.status = 'busy';
			worker.currentTask = ownTask;
			return ownTask;
		}

		// Try stealing from other workers
		worker.status = 'stealing';
		const stealResult = await this.stealTask(workerId);

		if (stealResult.success && stealResult.task) {
			worker.status = 'busy';
			worker.currentTask = stealResult.task;
			worker.tasksStolen++;
			this.successfulSteals++;
			return stealResult.task;
		}

		// No work available
		worker.status = 'idle';
		worker.currentTask = undefined;
		return undefined;
	}

	/**
	 * Mark task as completed
	 */
	completeTask(workerId: string, taskId: string): void {
		const worker = this.workerQueues.get(workerId);
		if (!worker) {
			throw new Error(`Worker not found: ${workerId}`);
		}

		if (worker.currentTask?.id === taskId) {
			worker.completedTasks++;
			worker.currentTask = undefined;
			worker.status = 'idle';
		}
	}

	/**
	 * Attempt to steal task from another worker
	 */
	private async stealTask(thiefId: string): Promise<StealResult<T>> {
		const thief = this.workerQueues.get(thiefId);
		if (!thief) {
			return { success: false };
		}

		// Get potential victims (other workers)
		const victims = Array.from(this.workerQueues.values()).filter(
			(w) => w.workerId !== thiefId && w.tasks.length >= this.config.minQueueSizeForSteal,
		);

		if (victims.length === 0) {
			return { success: false };
		}

		// Try stealing from victims
		for (let attempt = 0; attempt < this.config.maxStealAttempts; attempt++) {
			this.stealAttempts++;

			// Select victim
			const victim = this.selectVictim(victims);
			if (!victim) {
				continue;
			}

			// Steal from end of victim's queue (LIFO for stealing)
			const stolenTask = victim.tasks.pop();

			if (stolenTask) {
				victim.tasksLost++;

				// Check if task can be split
				if (
					this.config.enableWorkSplitting &&
					stolenTask.splittable &&
					(stolenTask.estimatedDuration ?? 0) > 1000
				) {
					// Split task (simplified - in real impl would split data)
					const splitTask: Task<T> = {
						...stolenTask,
						id: `${stolenTask.id}-split`,
						estimatedDuration: (stolenTask.estimatedDuration ?? 0) / 2,
					};

					// Return split task to victim
					victim.tasks.push(splitTask);
				}

				return {
					success: true,
					task: stolenTask,
					victimId: victim.workerId,
				};
			}

			// Backoff before next attempt
			await this.sleep(this.config.backoffDelay);
		}

		return { success: false };
	}

	/**
	 * Select victim for stealing
	 */
	private selectVictim(victims: WorkerQueue<T>[]): WorkerQueue<T> | undefined {
		if (victims.length === 0) {
			return undefined;
		}

		if (this.config.randomSteal) {
			// Random selection
			const index = Math.floor(Math.random() * victims.length);
			return victims[index];
		}

		// Select most loaded worker
		return victims.reduce((max, worker) => (worker.tasks.length > max.tasks.length ? worker : max));
	}

	/**
	 * Find least loaded worker
	 */
	private findLeastLoadedWorker(): WorkerQueue<T> | undefined {
		const workers = Array.from(this.workerQueues.values());
		if (workers.length === 0) {
			return undefined;
		}

		return workers.reduce((min, worker) => (worker.tasks.length < min.tasks.length ? worker : min));
	}

	/**
	 * Get scheduler metrics
	 */
	getMetrics(): WorkStealingMetrics {
		const workers = Array.from(this.workerQueues.values());

		const totalTasks = workers.reduce((sum, w) => sum + w.completedTasks, 0);
		const totalQueueLength = workers.reduce((sum, w) => sum + w.tasks.length, 0);
		const avgQueueLength = totalQueueLength / (workers.length || 1);

		const busyWorkers = workers.filter((w) => w.status === 'busy').length;
		const workerUtilization = busyWorkers / (workers.length || 1);

		// Calculate load balance score
		// Score is higher when queue lengths are more evenly distributed
		const queueLengths = workers.map((w) => w.tasks.length);
		const maxQueue = Math.max(...queueLengths);
		const minQueue = Math.min(...queueLengths);
		const loadBalanceScore = maxQueue > 0 ? 1 - (maxQueue - minQueue) / maxQueue : 1;

		const failedSteals = this.stealAttempts - this.successfulSteals;

		return {
			totalTasks,
			totalSteals: this.successfulSteals,
			failedSteals,
			avgQueueLength,
			workerUtilization,
			loadBalanceScore,
		};
	}

	/**
	 * Get worker queue info
	 */
	getWorkerQueue(workerId: string): WorkerQueue<T> | undefined {
		return this.workerQueues.get(workerId);
	}

	/**
	 * Get all worker queues
	 */
	getAllWorkerQueues(): WorkerQueue<T>[] {
		return Array.from(this.workerQueues.values());
	}

	/**
	 * Reset scheduler
	 */
	reset(): void {
		this.stealAttempts = 0;
		this.successfulSteals = 0;

		for (const worker of this.workerQueues.values()) {
			worker.tasks = [];
			worker.currentTask = undefined;
			worker.status = 'idle';
			worker.completedTasks = 0;
			worker.tasksStolen = 0;
			worker.tasksLost = 0;
		}
	}

	/**
	 * Sleep utility
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create work stealing scheduler
 */
export function createWorkStealingScheduler<T = unknown>(
	config?: Partial<WorkStealingConfig>,
): WorkStealingScheduler<T> {
	return new WorkStealingScheduler<T>(config);
}
