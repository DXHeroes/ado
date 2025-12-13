/**
 * Worker Registry Implementation
 *
 * Manages worker registration and state using state store.
 */

import type {
	WorkerHeartbeat,
	WorkerRegistration,
	WorkerRegistry,
	WorkerState,
} from './worker-protocol.js';

/**
 * In-memory worker registry implementation
 */
export class InMemoryWorkerRegistry implements WorkerRegistry {
	private workers: Map<string, WorkerState> = new Map();

	async register(registration: WorkerRegistration): Promise<void> {
		const now = new Date().toISOString();

		this.workers.set(registration.workerId, {
			workerId: registration.workerId,
			status: 'idle',
			registeredAt: now,
			lastHeartbeat: now,
			capabilities: registration.capabilities,
			resources: registration.resources,
			metrics: {
				totalTasksCompleted: 0,
				totalTasksFailed: 0,
				totalUptime: 0,
				avgTaskDuration: 0,
			},
		});
	}

	async unregister(workerId: string): Promise<void> {
		this.workers.delete(workerId);
	}

	async updateHeartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
		const worker = this.workers.get(heartbeat.workerId);
		if (!worker) {
			throw new Error(`Worker ${heartbeat.workerId} not registered`);
		}

		worker.lastHeartbeat = heartbeat.timestamp;
		worker.status = heartbeat.status;
		worker.currentTask = heartbeat.currentTask;

		if (heartbeat.metrics) {
			worker.metrics.totalUptime = heartbeat.uptime;
		}
	}

	async getWorker(workerId: string): Promise<WorkerState | null> {
		return this.workers.get(workerId) ?? null;
	}

	async listWorkers(filter?: {
		status?: string;
		capability?: string;
	}): Promise<WorkerState[]> {
		let workers = Array.from(this.workers.values());

		if (filter?.status) {
			workers = workers.filter((w) => w.status === filter.status);
		}

		if (filter?.capability) {
			const capability = filter.capability;
			workers = workers.filter((w) => w.capabilities.includes(capability));
		}

		return workers;
	}

	async getIdleWorkers(): Promise<WorkerState[]> {
		return Array.from(this.workers.values()).filter((w) => w.status === 'idle');
	}

	async markOffline(workerId: string): Promise<void> {
		const worker = this.workers.get(workerId);
		if (worker) {
			worker.status = 'offline';
		}
	}

	// Helper methods for metrics
	async recordTaskCompletion(workerId: string, success: boolean, duration: number): Promise<void> {
		const worker = this.workers.get(workerId);
		if (!worker) return;

		if (success) {
			worker.metrics.totalTasksCompleted++;
		} else {
			worker.metrics.totalTasksFailed++;
		}

		// Update average task duration
		const totalTasks = worker.metrics.totalTasksCompleted + worker.metrics.totalTasksFailed;
		worker.metrics.avgTaskDuration =
			(worker.metrics.avgTaskDuration * (totalTasks - 1) + duration) / totalTasks;
	}
}

/**
 * Create worker registry
 */
export function createWorkerRegistry(): WorkerRegistry {
	return new InMemoryWorkerRegistry();
}
