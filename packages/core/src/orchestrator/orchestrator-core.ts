/**
 * Orchestrator Core - Main orchestration engine that ties all components together.
 */

import { AdoError } from '@dxheroes/ado-shared';
import type {
	AgentAdapter,
	AgentTask,
	HITLPolicy,
	TaskDefinition as SharedTaskDefinition,
} from '@dxheroes/ado-shared';
import type { CheckpointId, CheckpointManager, TaskState } from '../checkpoint/index.js';
import type { HITLController, HumanInput } from '../hitl/index.js';
import type { ProviderRegistry } from '../provider/index.js';
import type { ProviderRouter } from '../provider/router.js';
import type { TaskQueue } from '../queue/index.js';
import type { ProgressStream, TaskEvent, TaskHandle, TaskStatus } from '../streaming/index.js';

/**
 * Task definition for orchestrator (extended from shared)
 */
export interface TaskDefinition extends SharedTaskDefinition {
	id?: string;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
	providerRegistry: ProviderRegistry;
	providerRouter: ProviderRouter;
	taskQueue: TaskQueue;
	checkpointManager: CheckpointManager;
	hitlController: HITLController;
	progressStream: ProgressStream;

	// Auto-checkpoint interval (seconds)
	checkpointInterval?: number;

	// Default HITL policy
	defaultHitlPolicy?: HITLPolicy;
}

/**
 * Orchestrator Core
 */
export class OrchestratorCore {
	private config: OrchestratorConfig;
	private adapters: Map<string, AgentAdapter> = new Map();
	private activeTasks: Map<string, TaskExecution> = new Map();

	constructor(config: OrchestratorConfig) {
		this.config = config;

		// Setup task queue handler
		this.config.taskQueue.setHandler(async (task) => {
			await this.executeTask(task);
		});
	}

	/**
	 * Register an agent adapter
	 */
	registerAdapter(adapter: AgentAdapter): void {
		this.adapters.set(adapter.id, adapter);
	}

	/**
	 * Submit a task for execution
	 */
	async submit(definition: TaskDefinition): Promise<TaskHandle> {
		// Generate task ID if not provided
		const taskId = definition.id ?? this.generateTaskId();

		// Create agent task
		const agentTask: AgentTask = {
			id: taskId,
			prompt: definition.prompt,
			projectContext: {
				projectId: definition.projectKey,
				repositoryPath: definition.repositoryPath,
				repositoryKey: definition.projectKey,
			},
		};

		// Store task definition
		const execution: TaskExecution = {
			taskId,
			definition,
			agentTask,
			status: 'queued',
			createdAt: new Date(),
		};
		this.activeTasks.set(taskId, execution);

		// Emit queued event
		this.config.progressStream.emit({
			type: 'task_queued',
			taskId,
			timestamp: new Date(),
			priority: 0,
			queuePosition: 0,
		});

		// Queue task
		await this.config.taskQueue.add(agentTask);

		// Return task handle
		return {
			taskId,
			subscribe: () => this.config.progressStream.subscribe(taskId),
			getStatus: () => this.status(taskId),
			cancel: () => this.cancel(taskId),
		};
	}

	/**
	 * Pause a task
	 */
	async pause(taskId: string): Promise<void> {
		const execution = this.activeTasks.get(taskId);
		if (!execution) {
			throw new AdoError({
				code: 'TASK_NOT_FOUND',
				message: `Task ${taskId} not found`,
				recoverable: false,
				remediation: 'Verify the task ID',
				cause: undefined,
			});
		}

		if (execution.status !== 'running') {
			throw new AdoError({
				code: 'TASK_NOT_RUNNING',
				message: `Task ${taskId} is not running`,
				recoverable: false,
				remediation: 'Only running tasks can be paused',
				cause: undefined,
			});
		}

		// Interrupt the adapter
		if (execution.adapter) {
			await execution.adapter.interrupt();
		}

		// Create checkpoint
		const state = this.getTaskState(execution);
		const checkpointId = await this.config.checkpointManager.checkpoint(taskId, state);

		execution.status = 'paused';
		execution.pausedAt = new Date();
		execution.checkpointId = checkpointId;

		this.config.progressStream.emit({
			type: 'task_paused',
			taskId,
			timestamp: new Date(),
			reason: 'User requested',
		});
	}

	/**
	 * Resume a paused task
	 */
	async resume(taskId: string, humanInput?: HumanInput): Promise<void> {
		const execution = this.activeTasks.get(taskId);
		if (!execution) {
			throw new AdoError({
				code: 'TASK_NOT_FOUND',
				message: `Task ${taskId} not found`,
				recoverable: false,
				remediation: 'Verify the task ID',
				cause: undefined,
			});
		}

		if (execution.status !== 'paused') {
			throw new AdoError({
				code: 'TASK_NOT_PAUSED',
				message: `Task ${taskId} is not paused`,
				recoverable: false,
				remediation: 'Only paused tasks can be resumed',
				cause: undefined,
			});
		}

		// Provide input if given
		if (humanInput) {
			await this.config.hitlController.provideInput(taskId, humanInput);
		}

		// Re-queue task
		execution.status = 'queued';
		execution.resumedAt = new Date();

		await this.config.taskQueue.add(execution.agentTask);

		this.config.progressStream.emit({
			type: 'task_resumed',
			taskId,
			timestamp: new Date(),
		});
	}

	/**
	 * Cancel a task
	 */
	async cancel(taskId: string): Promise<void> {
		const execution = this.activeTasks.get(taskId);
		if (!execution) {
			return;
		}

		// Cancel in queue
		await this.config.taskQueue.cancel(taskId);

		// Interrupt adapter if running
		if (execution.adapter && execution.status === 'running') {
			await execution.adapter.interrupt();
		}

		execution.status = 'cancelled';
		execution.completedAt = new Date();

		this.config.progressStream.emit({
			type: 'task_cancelled',
			taskId,
			timestamp: new Date(),
			reason: 'User requested',
		});

		this.activeTasks.delete(taskId);
	}

	/**
	 * Get task status
	 */
	async status(taskId: string): Promise<TaskStatus> {
		const status = this.config.progressStream.getStatus(taskId);

		if (!status) {
			throw new AdoError({
				code: 'TASK_NOT_FOUND',
				message: `Task ${taskId} not found`,
				recoverable: false,
				remediation: 'Verify the task ID',
				cause: undefined,
			});
		}

		return status;
	}

	/**
	 * Subscribe to task events
	 */
	async *subscribe(taskId: string): AsyncIterable<TaskEvent> {
		yield* this.config.progressStream.subscribe(taskId);
	}

	/**
	 * Get the provider registry (for MCP server access)
	 */
	getRegistry(): ProviderRegistry {
		return this.config.providerRegistry;
	}

	/**
	 * Get the provider router (for MCP server access)
	 */
	getRouter(): ProviderRouter {
		return this.config.providerRouter;
	}

	/**
	 * Get the progress stream (for MCP server access)
	 */
	getProgressStream(): ProgressStream {
		return this.config.progressStream;
	}

	/**
	 * Create a checkpoint for a task
	 */
	async checkpoint(taskId: string): Promise<CheckpointId> {
		const execution = this.activeTasks.get(taskId);
		if (!execution) {
			throw new AdoError({
				code: 'TASK_NOT_FOUND',
				message: `Task ${taskId} not found`,
				recoverable: false,
				remediation: 'Verify the task ID',
				cause: undefined,
			});
		}

		const state = this.getTaskState(execution);
		return await this.config.checkpointManager.checkpoint(taskId, state);
	}

	/**
	 * Restore a task from a checkpoint
	 */
	async restore(checkpointId: CheckpointId): Promise<TaskHandle> {
		const state = await this.config.checkpointManager.restore(checkpointId);

		// Create new task definition from restored state
		const definition: TaskDefinition = {
			id: state.task.id,
			prompt: state.task.prompt,
			projectKey: state.task.projectContext.projectId,
			repositoryPath: state.task.projectContext.repositoryPath,
			...(this.config.defaultHitlPolicy && { hitlPolicy: this.config.defaultHitlPolicy }),
		};

		// Submit as new task
		return await this.submit(definition);
	}

	/**
	 * Execute a task (called by task queue)
	 */
	private async executeTask(task: AgentTask): Promise<void> {
		const execution = this.activeTasks.get(task.id);
		if (!execution) {
			return;
		}

		try {
			// Select provider
			const selection = await this.config.providerRouter.selectProvider(execution.definition);

			if (!selection) {
				throw new AdoError({
					code: 'NO_PROVIDER_AVAILABLE',
					message: 'No suitable provider available',
					recoverable: true,
					remediation: 'Check provider configuration and rate limits',
					cause: undefined,
				});
			}

			// Get adapter
			const adapter = this.adapters.get(selection.provider.id);
			if (!adapter) {
				throw new AdoError({
					code: 'ADAPTER_NOT_FOUND',
					message: `Adapter for provider ${selection.provider.id} not found`,
					recoverable: false,
					remediation: 'Register the adapter before submitting tasks',
					cause: undefined,
				});
			}

			execution.adapter = adapter;
			execution.providerId = selection.provider.id;
			execution.status = 'running';
			execution.startedAt = new Date();

			// Emit started event
			this.config.progressStream.emit({
				type: 'task_started',
				taskId: task.id,
				timestamp: new Date(),
				providerId: selection.provider.id,
			});

			// Start auto-checkpointing if configured
			if (this.config.checkpointInterval && this.config.checkpointInterval > 0) {
				this.config.checkpointManager.startAutoCheckpoint(task.id, () =>
					this.getTaskState(execution),
				);
			}

			// Execute task and stream events
			for await (const event of adapter.execute(task)) {
				// Convert agent events to task events
				await this.handleAgentEvent(task.id, event);
			}

			execution.status = 'completed';
			execution.completedAt = new Date();
		} catch (error) {
			execution.status = 'failed';
			execution.completedAt = new Date();
			execution.error = error instanceof Error ? error : new Error(String(error));

			this.config.progressStream.emit({
				type: 'task_failed',
				taskId: task.id,
				timestamp: new Date(),
				error: execution.error.message,
				recoverable: false,
			});

			throw error;
		} finally {
			// Stop auto-checkpointing
			this.config.checkpointManager.stopAutoCheckpoint(task.id);

			// Cleanup after a delay
			setTimeout(() => {
				this.activeTasks.delete(task.id);
			}, 60000); // 1 minute
		}
	}

	/**
	 * Handle agent events and convert to task events
	 */
	private async handleAgentEvent(
		taskId: string,
		event: import('@dxheroes/ado-shared').AgentEvent,
	): Promise<void> {
		switch (event.type) {
			case 'output':
				this.config.progressStream.emit({
					type: 'task_output',
					taskId,
					timestamp: event.timestamp,
					content: event.content,
					isPartial: event.isPartial,
				});
				break;

			case 'complete':
				this.config.progressStream.emit({
					type: 'task_completed',
					taskId,
					timestamp: event.timestamp,
					success: event.result.success,
					output: event.result.output,
					duration: event.result.duration,
				});
				break;

			case 'error':
				this.config.progressStream.emit({
					type: 'task_failed',
					taskId,
					timestamp: event.timestamp,
					error: event.error.message,
					recoverable: event.recoverable,
				});
				break;

			case 'rate_limit':
				// Handle rate limit - could trigger failover
				// biome-ignore lint/suspicious/noConsole: Info logging
				console.log(`Rate limit hit for task ${taskId}, reason: ${event.reason}`);
				break;
		}
	}

	/**
	 * Get current task state for checkpointing
	 */
	private getTaskState(execution: TaskExecution): TaskState {
		const status = this.config.progressStream.getStatus(execution.taskId);

		return {
			task: execution.agentTask,
			...(execution.sessionId && { sessionId: execution.sessionId }),
			...(execution.providerId && { providerId: execution.providerId }),
			status: execution.status === 'cancelled' ? 'failed' : execution.status,
			progress: status?.progress ?? 0,
			...(status?.output && { output: status.output }),
			...(execution.startedAt && { startedAt: execution.startedAt }),
			...(execution.pausedAt && { pausedAt: execution.pausedAt }),
			...(execution.resumedAt && { resumedAt: execution.resumedAt }),
		};
	}

	/**
	 * Generate a unique task ID
	 */
	private generateTaskId(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2, 8);
		return `task-${timestamp}-${random}`;
	}
}

/**
 * Task execution tracking
 */
interface TaskExecution {
	taskId: string;
	definition: TaskDefinition;
	agentTask: AgentTask;
	adapter?: AgentAdapter;
	providerId?: string;
	sessionId?: string;
	status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
	createdAt: Date;
	startedAt?: Date;
	pausedAt?: Date;
	resumedAt?: Date;
	completedAt?: Date;
	checkpointId?: CheckpointId;
	error?: Error;
}

/**
 * Create a new orchestrator core
 */
export function createOrchestratorCore(config: OrchestratorConfig): OrchestratorCore {
	return new OrchestratorCore(config);
}
