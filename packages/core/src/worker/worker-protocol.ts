/**
 * Worker Communication Protocol
 *
 * Protocol for communication between orchestrator and remote workers.
 */

export interface WorkerRegistration {
	workerId: string;
	capabilities: string[];
	resources: {
		cpu: number; // Number of cores
		memory: number; // MB
	};
	metadata?: {
		hostname?: string;
		platform?: string;
		nodeVersion?: string;
		[key: string]: unknown;
	};
}

export interface WorkerHeartbeat {
	workerId: string;
	timestamp: string;
	status: 'idle' | 'busy' | 'offline';
	currentTask?: string;
	uptime: number; // seconds
	metrics?: {
		cpuUsage: number; // 0-100
		memoryUsage: number; // MB
		activeConnections: number;
	};
}

export interface TaskAssignment {
	taskId: string;
	workerId: string;
	assignedAt: string;
	taskData: {
		prompt: string;
		repositoryPath: string;
		provider?: string;
		maxCost?: number;
		qualityGates?: Record<string, unknown>;
	};
}

export interface TaskProgress {
	taskId: string;
	workerId: string;
	progress: number; // 0-100
	status: 'starting' | 'running' | 'validating' | 'completing' | 'completed' | 'failed';
	currentStep?: string;
	logs?: string[];
	metrics?: {
		tokensUsed: number;
		cost: number;
		duration: number; // seconds
	};
}

export interface TaskResult {
	taskId: string;
	workerId: string;
	status: 'completed' | 'failed' | 'cancelled';
	result?: {
		filesModified: string[];
		commitHash?: string;
		validationResults?: Record<string, unknown>;
	};
	error?: {
		message: string;
		code: string;
		stack?: string;
	};
	completedAt: string;
	metrics: {
		duration: number;
		tokensUsed: number;
		cost: number;
	};
}

/**
 * Protocol message types
 */
export type WorkerMessage =
	| { type: 'register'; data: WorkerRegistration }
	| { type: 'heartbeat'; data: WorkerHeartbeat }
	| { type: 'task.progress'; data: TaskProgress }
	| { type: 'task.result'; data: TaskResult }
	| { type: 'error'; data: { workerId: string; error: string } };

export type OrchestratorMessage =
	| { type: 'registered'; data: { workerId: string; success: boolean } }
	| { type: 'task.assign'; data: TaskAssignment }
	| { type: 'task.cancel'; data: { taskId: string; reason?: string } }
	| { type: 'shutdown'; data: { graceful: boolean; timeout?: number } }
	| { type: 'ping'; data: { timestamp: string } };

/**
 * Worker state
 */
export interface WorkerState {
	workerId: string;
	status: 'idle' | 'busy' | 'offline';
	registeredAt: string;
	lastHeartbeat: string;
	currentTask?: string | undefined;
	capabilities: string[];
	resources: {
		cpu: number;
		memory: number;
	};
	metrics: {
		totalTasksCompleted: number;
		totalTasksFailed: number;
		totalUptime: number;
		avgTaskDuration: number;
	};
}

/**
 * Worker registry interface
 */
export interface WorkerRegistry {
	register(registration: WorkerRegistration): Promise<void>;
	unregister(workerId: string): Promise<void>;
	updateHeartbeat(heartbeat: WorkerHeartbeat): Promise<void>;
	getWorker(workerId: string): Promise<WorkerState | null>;
	listWorkers(filter?: { status?: string; capability?: string }): Promise<WorkerState[]>;
	getIdleWorkers(): Promise<WorkerState[]>;
	markOffline(workerId: string): Promise<void>;
}
