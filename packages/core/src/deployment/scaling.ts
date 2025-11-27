/**
 * Horizontal Scaling Support
 * Utilities and helpers for running ADO in a horizontally scaled environment
 */

/**
 * Scaling configuration for distributed deployments
 */
export interface ScalingConfig {
	/**
	 * Minimum number of replicas
	 */
	minReplicas: number;

	/**
	 * Maximum number of replicas
	 */
	maxReplicas: number;

	/**
	 * Target CPU utilization percentage for autoscaling
	 */
	targetCPUUtilization?: number;

	/**
	 * Target memory utilization percentage for autoscaling
	 */
	targetMemoryUtilization?: number;

	/**
	 * Enable pod disruption budget
	 */
	enablePodDisruptionBudget?: boolean;

	/**
	 * Minimum available pods during disruption
	 */
	minAvailable?: number;
}

/**
 * Instance information for a scaled deployment
 */
export interface InstanceInfo {
	/**
	 * Unique instance ID (pod name in K8s)
	 */
	id: string;

	/**
	 * Hostname of the instance
	 */
	hostname: string;

	/**
	 * IP address of the instance
	 */
	ipAddress?: string;

	/**
	 * Startup timestamp
	 */
	startedAt: Date;

	/**
	 * Last heartbeat timestamp
	 */
	lastHeartbeat: Date;

	/**
	 * Current load (number of active tasks)
	 */
	currentLoad: number;

	/**
	 * Maximum capacity
	 */
	maxCapacity: number;
}

/**
 * Coordination strategy for distributed task processing
 */
export type CoordinationStrategy =
	| 'redis-queue' // Use Redis-backed BullMQ for task distribution
	| 'postgres-poll' // Poll PostgreSQL for pending tasks
	| 'leader-election'; // Elect a leader to distribute tasks

/**
 * Distributed coordination configuration
 */
export interface CoordinationConfig {
	/**
	 * Strategy for task coordination
	 */
	strategy: CoordinationStrategy;

	/**
	 * Redis URL for queue-based coordination
	 */
	redisUrl?: string;

	/**
	 * PostgreSQL connection string for polling
	 */
	postgresUrl?: string;

	/**
	 * Leader election timeout (milliseconds)
	 */
	leaderElectionTimeout?: number;

	/**
	 * Heartbeat interval (milliseconds)
	 */
	heartbeatInterval?: number;
}

/**
 * Get instance information for current deployment
 */
export function getCurrentInstance(): InstanceInfo {
	// In Kubernetes, use environment variables
	const isK8s =
		process.env.KUBERNETES_SERVICE_HOST !== undefined || process.env.K8S_NAMESPACE !== undefined;

	if (isK8s) {
		const instance: InstanceInfo = {
			id: process.env.HOSTNAME || process.env.POD_NAME || 'unknown',
			hostname: process.env.HOSTNAME || 'unknown',
			startedAt: new Date(Date.now() - process.uptime() * 1000),
			lastHeartbeat: new Date(),
			currentLoad: 0,
			maxCapacity: Number.parseInt(process.env.MAX_PARALLEL_AGENTS || '10', 10),
		};
		if (process.env.POD_IP) {
			instance.ipAddress = process.env.POD_IP;
		}
		return instance;
	}

	// Local deployment
	return {
		id: `local-${process.pid}`,
		hostname: require('node:os').hostname(),
		startedAt: new Date(Date.now() - process.uptime() * 1000),
		lastHeartbeat: new Date(),
		currentLoad: 0,
		maxCapacity: 10,
	};
}

/**
 * Check if running in a scaled deployment
 */
export function isScaledDeployment(): boolean {
	return (
		process.env.KUBERNETES_SERVICE_HOST !== undefined ||
		process.env.K8S_NAMESPACE !== undefined ||
		process.env.DEPLOYMENT_MODE === 'scaled'
	);
}

/**
 * Get recommended coordination strategy based on environment
 */
export function getRecommendedCoordinationStrategy(): CoordinationStrategy | undefined {
	if (process.env.REDIS_URL) {
		return 'redis-queue';
	}

	if (process.env.DATABASE_URL) {
		return 'postgres-poll';
	}

	return undefined;
}

/**
 * Graceful shutdown handler for scaled deployments
 * Ensures tasks are completed or handed off before pod termination
 */
export class GracefulShutdownHandler {
	private shutdownHandlers: Array<() => Promise<void>> = [];
	private isShuttingDown = false;
	private shutdownTimeout: number;

	constructor(shutdownTimeout = 30000) {
		this.shutdownTimeout = shutdownTimeout;
		this.setupSignalHandlers();
	}

	/**
	 * Register a shutdown handler
	 */
	onShutdown(handler: () => Promise<void>): void {
		this.shutdownHandlers.push(handler);
	}

	/**
	 * Check if shutdown is in progress
	 */
	isShutdown(): boolean {
		return this.isShuttingDown;
	}

	private setupSignalHandlers(): void {
		// Kubernetes sends SIGTERM for graceful shutdown
		process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
		process.on('SIGINT', () => this.handleShutdown('SIGINT'));
	}

	private async handleShutdown(_signal: string): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;

		const shutdownPromise = this.executeShutdownHandlers();
		const timeoutPromise = new Promise<void>((resolve) => {
			setTimeout(() => {
				resolve();
			}, this.shutdownTimeout);
		});

		await Promise.race([shutdownPromise, timeoutPromise]);
		process.exit(0);
	}

	private async executeShutdownHandlers(): Promise<void> {
		for (const handler of this.shutdownHandlers) {
			try {
				await handler();
			} catch (_error) {}
		}
	}
}

/**
 * Readiness probe handler
 * Used by Kubernetes to determine if pod is ready to receive traffic
 */
export class ReadinessProbe {
	private checks: Map<string, () => Promise<boolean>> = new Map();

	/**
	 * Register a readiness check
	 */
	addCheck(name: string, check: () => Promise<boolean>): void {
		this.checks.set(name, check);
	}

	/**
	 * Execute all readiness checks
	 */
	async isReady(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
		const results: Record<string, boolean> = {};

		for (const [name, check] of this.checks.entries()) {
			try {
				results[name] = await check();
			} catch (_error) {
				results[name] = false;
			}
		}

		const ready = Object.values(results).every((r) => r);
		return { ready, checks: results };
	}
}

/**
 * Liveness probe handler
 * Used by Kubernetes to determine if pod should be restarted
 */
export class LivenessProbe {
	private lastActivity: Date = new Date();
	private maxInactivityMs: number;

	constructor(maxInactivityMs = 300000) {
		// 5 minutes default
		this.maxInactivityMs = maxInactivityMs;
	}

	/**
	 * Record activity to prevent liveness failure
	 */
	recordActivity(): void {
		this.lastActivity = new Date();
	}

	/**
	 * Check if pod is alive
	 */
	isAlive(): boolean {
		const inactivityMs = Date.now() - this.lastActivity.getTime();
		return inactivityMs < this.maxInactivityMs;
	}

	/**
	 * Get time since last activity
	 */
	getTimeSinceLastActivity(): number {
		return Date.now() - this.lastActivity.getTime();
	}
}
