/**
 * Worker Health Monitor
 *
 * Monitors worker health and marks stale workers as offline.
 */

import type { WorkerRegistry } from './worker-protocol.js';

export interface HealthMonitorConfig {
	/**
	 * Interval between health checks in milliseconds
	 */
	checkInterval: number;

	/**
	 * Timeout after which a worker is considered stale (no heartbeat)
	 */
	heartbeatTimeout: number;

	/**
	 * Callback when a worker is marked offline
	 */
	onWorkerOffline?: (workerId: string) => void | Promise<void>;
}

/**
 * Worker health monitor
 */
export class WorkerHealthMonitor {
	private intervalId: NodeJS.Timeout | null = null;
	private isRunning = false;

	constructor(
		private registry: WorkerRegistry,
		private config: HealthMonitorConfig,
	) {}

	/**
	 * Start health monitoring
	 */
	start(): void {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;
		this.intervalId = setInterval(() => this.checkHealth(), this.config.checkInterval);
	}

	/**
	 * Stop health monitoring
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.isRunning = false;
	}

	/**
	 * Perform health check on all workers
	 */
	private async checkHealth(): Promise<void> {
		try {
			const workers = await this.registry.listWorkers();
			const now = Date.now();

			for (const worker of workers) {
				// Skip already offline workers
				if (worker.status === 'offline') {
					continue;
				}

				const lastHeartbeat = new Date(worker.lastHeartbeat).getTime();
				const timeSinceHeartbeat = now - lastHeartbeat;

				// Mark as offline if heartbeat timeout exceeded
				if (timeSinceHeartbeat > this.config.heartbeatTimeout) {
					await this.registry.markOffline(worker.workerId);

					// Call callback if provided
					if (this.config.onWorkerOffline) {
						await this.config.onWorkerOffline(worker.workerId);
					}
				}
			}
		} catch (_error) {}
	}

	/**
	 * Check if monitoring is running
	 */
	isMonitoring(): boolean {
		return this.isRunning;
	}
}

/**
 * Create worker health monitor
 */
export function createWorkerHealthMonitor(
	registry: WorkerRegistry,
	config?: Partial<HealthMonitorConfig>,
): WorkerHealthMonitor {
	const defaultConfig: HealthMonitorConfig = {
		checkInterval: 30000, // 30 seconds
		heartbeatTimeout: 300000, // 5 minutes
		...config,
	};

	return new WorkerHealthMonitor(registry, defaultConfig);
}
