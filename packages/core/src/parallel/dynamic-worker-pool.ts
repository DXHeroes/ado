/**
 * Dynamic Worker Pool
 *
 * Manages remote worker instances with auto-scaling.
 * Supports scaling up/down based on demand.
 */

import type { K8sWorkerSpawner } from '../worker/k8s-worker-spawner.js';
import type { WorkerMessage, WorkerRegistration } from '../worker/worker-protocol.js';
import type { WorkerPool } from './parallel-scheduler.js';

export interface DynamicWorkerPoolConfig {
	/**
	 * Minimum number of workers
	 */
	minWorkers: number;

	/**
	 * Maximum number of workers
	 */
	maxWorkers: number;

	/**
	 * Target CPU utilization (0-1)
	 */
	targetUtilization: number;

	/**
	 * Scale up threshold (queue length)
	 */
	scaleUpThreshold: number;

	/**
	 * Scale down threshold (idle time in ms)
	 */
	scaleDownThreshold: number;

	/**
	 * Cooldown period between scaling operations (ms)
	 */
	scalingCooldown: number;

	/**
	 * Worker idle timeout (ms)
	 */
	workerIdleTimeout: number;
}

export interface WorkerInstance {
	/**
	 * Worker ID
	 */
	id: string;

	/**
	 * Worker status
	 */
	status: 'spawning' | 'ready' | 'busy' | 'idle' | 'terminating';

	/**
	 * Registration info (if registered)
	 */
	registration?: WorkerRegistration | undefined;

	/**
	 * Current task ID (if busy)
	 */
	currentTaskId?: string | undefined;

	/**
	 * Spawn timestamp
	 */
	spawnedAt: Date;

	/**
	 * Last used timestamp
	 */
	lastUsedAt?: Date | undefined;

	/**
	 * CPU utilization (0-1)
	 */
	cpuUtilization: number;

	/**
	 * Memory utilization (0-1)
	 */
	memoryUtilization: number;
}

export interface ScalingMetrics {
	/**
	 * Current worker count
	 */
	currentWorkers: number;

	/**
	 * Desired worker count
	 */
	desiredWorkers: number;

	/**
	 * Busy workers
	 */
	busyWorkers: number;

	/**
	 * Idle workers
	 */
	idleWorkers: number;

	/**
	 * Queue length
	 */
	queueLength: number;

	/**
	 * Average CPU utilization
	 */
	avgCpuUtilization: number;

	/**
	 * Average memory utilization
	 */
	avgMemoryUtilization: number;

	/**
	 * Last scaling action
	 */
	lastScalingAction?:
		| {
				timestamp: Date;
				action: 'scale-up' | 'scale-down';
				delta: number;
		  }
		| undefined;
}

/**
 * Dynamic worker pool with auto-scaling
 */
export class DynamicWorkerPool implements WorkerPool {
	private config: DynamicWorkerPoolConfig;
	private spawner: K8sWorkerSpawner;
	private workers: Map<string, WorkerInstance> = new Map();
	private taskQueue: string[] = [];
	private lastScalingAction?: Date | undefined;
	private scalingInterval?: NodeJS.Timeout | undefined;

	constructor(spawner: K8sWorkerSpawner, config?: Partial<DynamicWorkerPoolConfig>) {
		this.spawner = spawner;
		this.config = {
			minWorkers: 1,
			maxWorkers: 10,
			targetUtilization: 0.7,
			scaleUpThreshold: 3,
			scaleDownThreshold: 5 * 60 * 1000, // 5 minutes
			scalingCooldown: 60 * 1000, // 1 minute
			workerIdleTimeout: 10 * 60 * 1000, // 10 minutes
			...config,
		};
	}

	/**
	 * Initialize pool with minimum workers
	 */
	async initialize(): Promise<void> {
		// Spawn minimum workers
		await this.scaleToTarget(this.config.minWorkers);

		// Start auto-scaling monitor
		this.startAutoScaling();
	}

	/**
	 * Get available worker
	 */
	async getAvailableWorker(): Promise<string | undefined> {
		// Find idle worker
		const idleWorker = Array.from(this.workers.values()).find(
			(w) => w.status === 'idle' || w.status === 'ready',
		);

		if (idleWorker) {
			// Mark as busy
			idleWorker.status = 'busy';
			idleWorker.lastUsedAt = new Date();
			return idleWorker.id;
		}

		// No idle workers, add to queue
		// Queue will be processed when workers become available
		return undefined;
	}

	/**
	 * Execute task on worker
	 */
	async executeTask(
		workerId: string,
		taskId: string,
		_taskDefinition: unknown,
	): Promise<{ success: boolean; error?: string }> {
		const worker = this.workers.get(workerId);
		if (!worker) {
			return { success: false, error: 'Worker not found' };
		}

		// Update worker state
		worker.status = 'busy';
		worker.currentTaskId = taskId;
		worker.lastUsedAt = new Date();

		// In real implementation, this would send task to worker via protocol
		// For now, simulate task execution
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve({ success: true });
			}, 1000);
		});
	}

	/**
	 * Release worker after task completion
	 */
	releaseWorker(workerId: string): void {
		const worker = this.workers.get(workerId);
		if (!worker) {
			return;
		}

		worker.status = 'idle';
		worker.currentTaskId = undefined;
		worker.lastUsedAt = new Date();

		// Process queue if any
		if (this.taskQueue.length > 0) {
			const taskId = this.taskQueue.shift();
			if (taskId) {
				worker.status = 'busy';
				worker.currentTaskId = taskId;
			}
		}
	}

	/**
	 * Check if worker is available
	 */
	async isWorkerAvailable(workerId: string): Promise<boolean> {
		const worker = this.workers.get(workerId);
		return worker?.status === 'idle' || worker?.status === 'ready' || false;
	}

	/**
	 * Start auto-scaling monitor
	 */
	private startAutoScaling(): void {
		// Check every 30 seconds
		this.scalingInterval = setInterval(() => {
			this.evaluateScaling();
		}, 30000);
	}

	/**
	 * Stop auto-scaling monitor
	 */
	stopAutoScaling(): void {
		if (this.scalingInterval) {
			clearInterval(this.scalingInterval);
			this.scalingInterval = undefined;
		}
	}

	/**
	 * Evaluate if scaling is needed
	 */
	private async evaluateScaling(): Promise<void> {
		// Check cooldown
		if (this.lastScalingAction) {
			const timeSinceLastScaling = Date.now() - this.lastScalingAction.getTime();
			if (timeSinceLastScaling < this.config.scalingCooldown) {
				return;
			}
		}

		const metrics = this.getMetrics();

		// Scale up if queue is building up
		if (
			metrics.queueLength >= this.config.scaleUpThreshold &&
			metrics.currentWorkers < this.config.maxWorkers
		) {
			await this.scaleUp(1);
			return;
		}

		// Scale up if high utilization
		if (
			metrics.avgCpuUtilization > this.config.targetUtilization &&
			metrics.currentWorkers < this.config.maxWorkers
		) {
			await this.scaleUp(1);
			return;
		}

		// Scale down if idle workers
		const idleTime = this.config.scaleDownThreshold;
		const now = Date.now();

		const idleWorkers = Array.from(this.workers.values()).filter((w) => {
			if (w.status !== 'idle') return false;
			if (!w.lastUsedAt) return false;
			return now - w.lastUsedAt.getTime() > idleTime;
		});

		if (idleWorkers.length > 0 && metrics.currentWorkers > this.config.minWorkers) {
			// Scale down one worker at a time
			await this.scaleDown(1);
		}
	}

	/**
	 * Scale up by adding workers
	 */
	private async scaleUp(count: number): Promise<void> {
		const currentCount = this.workers.size;
		const targetCount = Math.min(currentCount + count, this.config.maxWorkers);
		const delta = targetCount - currentCount;

		if (delta <= 0) return;

		await this.scaleToTarget(targetCount);

		this.lastScalingAction = new Date();
	}

	/**
	 * Scale down by removing idle workers
	 */
	private async scaleDown(count: number): Promise<void> {
		const currentCount = this.workers.size;
		const targetCount = Math.max(currentCount - count, this.config.minWorkers);
		const delta = currentCount - targetCount;

		if (delta <= 0) return;

		// Find idle workers to terminate
		const idleWorkers = Array.from(this.workers.values())
			.filter((w) => w.status === 'idle')
			.slice(0, delta);

		for (const worker of idleWorkers) {
			await this.terminateWorker(worker.id);
		}

		this.lastScalingAction = new Date();
	}

	/**
	 * Scale to target worker count
	 */
	private async scaleToTarget(target: number): Promise<void> {
		const current = this.workers.size;
		const delta = target - current;

		if (delta > 0) {
			// Spawn workers
			for (let i = 0; i < delta; i++) {
				await this.spawnWorker();
			}
		} else if (delta < 0) {
			// Terminate workers
			const toTerminate = Array.from(this.workers.values())
				.filter((w) => w.status === 'idle')
				.slice(0, Math.abs(delta));

			for (const worker of toTerminate) {
				await this.terminateWorker(worker.id);
			}
		}
	}

	/**
	 * Spawn new worker
	 */
	private async spawnWorker(): Promise<void> {
		const workerId = `dynamic-worker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

		// Create worker instance
		const worker: WorkerInstance = {
			id: workerId,
			status: 'spawning',
			spawnedAt: new Date(),
			cpuUtilization: 0,
			memoryUtilization: 0,
		};

		this.workers.set(workerId, worker);

		try {
			// Spawn worker pod
			await this.spawner.spawnWorker({
				image: 'ado-worker:latest', // TODO: Make configurable
				namespace: 'default',
				resources: {
					requests: {
						cpu: '1',
						memory: '2Gi',
					},
				},
			});

			// Update status
			worker.status = 'ready';
		} catch (_error) {
			// Failed to spawn
			this.workers.delete(workerId);
		}
	}

	/**
	 * Terminate worker
	 */
	private async terminateWorker(workerId: string): Promise<void> {
		const worker = this.workers.get(workerId);
		if (!worker) return;

		worker.status = 'terminating';

		try {
			await this.spawner.terminateWorker(workerId);
			this.workers.delete(workerId);
		} catch (_error) {}
	}

	/**
	 * Get scaling metrics
	 */
	getMetrics(): ScalingMetrics {
		const workers = Array.from(this.workers.values());

		const busyWorkers = workers.filter((w) => w.status === 'busy').length;
		const idleWorkers = workers.filter((w) => w.status === 'idle').length;

		const avgCpuUtilization =
			workers.reduce((sum, w) => sum + w.cpuUtilization, 0) / (workers.length || 1);

		const avgMemoryUtilization =
			workers.reduce((sum, w) => sum + w.memoryUtilization, 0) / (workers.length || 1);

		// Calculate desired workers inline to avoid circular dependency
		const demandBasedCount = busyWorkers + Math.ceil(this.taskQueue.length / 2);
		const utilizationBasedCount = Math.ceil(
			workers.length * (avgCpuUtilization / this.config.targetUtilization),
		);
		const desiredCount = Math.max(demandBasedCount, utilizationBasedCount);
		const desiredWorkers = Math.max(
			this.config.minWorkers,
			Math.min(this.config.maxWorkers, desiredCount),
		);

		return {
			currentWorkers: workers.length,
			desiredWorkers,
			busyWorkers,
			idleWorkers,
			queueLength: this.taskQueue.length,
			avgCpuUtilization,
			avgMemoryUtilization,
		};
	}

	/**
	 * Shutdown pool
	 */
	async shutdown(): Promise<void> {
		this.stopAutoScaling();

		// Terminate all workers
		const workerIds = Array.from(this.workers.keys());
		await Promise.allSettled(workerIds.map((id) => this.terminateWorker(id)));
	}

	/**
	 * Handle worker message (for protocol integration)
	 */
	handleWorkerMessage(workerId: string, message: WorkerMessage): void {
		const worker = this.workers.get(workerId);
		if (!worker) return;

		switch (message.type) {
			case 'register':
				worker.registration = message.data;
				worker.status = 'ready';
				break;

			case 'heartbeat':
				worker.cpuUtilization = (message.data.metrics?.cpuUsage ?? 0) / 100;
				worker.memoryUtilization = (message.data.metrics?.memoryUsage ?? 0) / 1024;
				break;

			case 'task.result':
				worker.status = 'idle';
				worker.currentTaskId = undefined;
				worker.lastUsedAt = new Date();
				break;
		}
	}
}

/**
 * Create dynamic worker pool
 */
export function createDynamicWorkerPool(
	spawner: K8sWorkerSpawner,
	config?: Partial<DynamicWorkerPoolConfig>,
): DynamicWorkerPool {
	return new DynamicWorkerPool(spawner, config);
}
