/**
 * Checkpoint Manager - Handles task state persistence and restoration.
 */

import { AdoError } from '@dxheroes/ado-shared';
import type { AgentTask } from '@dxheroes/ado-shared';

/**
 * Checkpoint ID type
 */
export type CheckpointId = string;

/**
 * Task checkpoint data
 */
export interface TaskCheckpoint {
	id: CheckpointId;
	taskId: string;
	state: TaskState;
	createdAt: Date;
	metadata?: Record<string, unknown>;
}

/**
 * Task state snapshot
 */
export interface TaskState {
	task: AgentTask;
	sessionId?: string;
	providerId?: string;
	status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
	progress: number; // 0-100
	output?: string;
	filesModified?: string[];
	tokensUsed?: {
		input: number;
		output: number;
	};
	startedAt?: Date;
	pausedAt?: Date;
	resumedAt?: Date;
	context?: Record<string, unknown>;
}

/**
 * Checkpoint storage interface
 */
export interface CheckpointStorage {
	save(checkpoint: TaskCheckpoint): Promise<void>;
	load(checkpointId: CheckpointId): Promise<TaskCheckpoint | null>;
	list(taskId?: string): Promise<TaskCheckpoint[]>;
	delete(checkpointId: CheckpointId): Promise<void>;
	cleanup(olderThan: Date): Promise<number>;
}

/**
 * In-memory checkpoint storage (for development)
 */
export class InMemoryCheckpointStorage implements CheckpointStorage {
	private checkpoints: Map<CheckpointId, TaskCheckpoint> = new Map();

	async save(checkpoint: TaskCheckpoint): Promise<void> {
		this.checkpoints.set(checkpoint.id, checkpoint);
	}

	async load(checkpointId: CheckpointId): Promise<TaskCheckpoint | null> {
		return this.checkpoints.get(checkpointId) ?? null;
	}

	async list(taskId?: string): Promise<TaskCheckpoint[]> {
		const checkpoints = Array.from(this.checkpoints.values());
		return taskId ? checkpoints.filter((c) => c.taskId === taskId) : checkpoints;
	}

	async delete(checkpointId: CheckpointId): Promise<void> {
		this.checkpoints.delete(checkpointId);
	}

	async cleanup(olderThan: Date): Promise<number> {
		const toDelete: CheckpointId[] = [];
		for (const [id, checkpoint] of this.checkpoints.entries()) {
			if (checkpoint.createdAt < olderThan) {
				toDelete.push(id);
			}
		}

		for (const id of toDelete) {
			this.checkpoints.delete(id);
		}

		return toDelete.length;
	}

	clear(): void {
		this.checkpoints.clear();
	}
}

/**
 * Checkpoint manager configuration
 */
export interface CheckpointManagerConfig {
	/** Auto-checkpoint interval in seconds (0 = disabled) */
	autoCheckpointInterval?: number;

	/** Maximum number of checkpoints per task */
	maxCheckpointsPerTask?: number;

	/** Cleanup old checkpoints after this many days */
	cleanupAfterDays?: number;
}

/**
 * Checkpoint Manager
 */
export class CheckpointManager {
	private storage: CheckpointStorage;
	private config: CheckpointManagerConfig;
	private autoCheckpointTimers: Map<string, NodeJS.Timeout> = new Map();

	constructor(storage: CheckpointStorage, config: CheckpointManagerConfig = {}) {
		this.storage = storage;
		this.config = {
			autoCheckpointInterval: config.autoCheckpointInterval ?? 30, // 30 seconds default
			maxCheckpointsPerTask: config.maxCheckpointsPerTask ?? 10,
			cleanupAfterDays: config.cleanupAfterDays ?? 7,
		};
	}

	/**
	 * Create a checkpoint for a task
	 */
	async checkpoint(taskId: string, state: TaskState): Promise<CheckpointId> {
		const checkpointId = this.generateCheckpointId(taskId);

		const checkpoint: TaskCheckpoint = {
			id: checkpointId,
			taskId,
			state,
			createdAt: new Date(),
		};

		await this.storage.save(checkpoint);

		// Cleanup old checkpoints if limit exceeded
		await this.cleanupOldCheckpoints(taskId);

		return checkpointId;
	}

	/**
	 * Restore task state from a checkpoint
	 */
	async restore(checkpointId: CheckpointId): Promise<TaskState> {
		const checkpoint = await this.storage.load(checkpointId);

		if (!checkpoint) {
			throw new AdoError({
				code: 'CHECKPOINT_NOT_FOUND',
				message: `Checkpoint ${checkpointId} not found`,
				recoverable: false,
				remediation: 'Verify the checkpoint ID and try again',
				cause: undefined,
			});
		}

		return checkpoint.state;
	}

	/**
	 * Get the latest checkpoint for a task
	 */
	async getLatestCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
		const checkpoints = await this.storage.list(taskId);

		if (checkpoints.length === 0) {
			return null;
		}

		// Sort by creation date descending
		checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

		return checkpoints[0] ?? null;
	}

	/**
	 * List all checkpoints for a task
	 */
	async listCheckpoints(taskId: string): Promise<TaskCheckpoint[]> {
		const checkpoints = await this.storage.list(taskId);
		return checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	/**
	 * Delete a checkpoint
	 */
	async deleteCheckpoint(checkpointId: CheckpointId): Promise<void> {
		await this.storage.delete(checkpointId);
	}

	/**
	 * Start auto-checkpointing for a task
	 */
	startAutoCheckpoint(taskId: string, getState: () => TaskState | Promise<TaskState>): void {
		if (!this.config.autoCheckpointInterval || this.config.autoCheckpointInterval <= 0) {
			return;
		}

		// Clear existing timer
		this.stopAutoCheckpoint(taskId);

		const intervalMs = this.config.autoCheckpointInterval * 1000;

		const timer = setInterval(async () => {
			try {
				const state = await getState();
				await this.checkpoint(taskId, state);
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error(`Auto-checkpoint failed for task ${taskId}:`, error);
			}
		}, intervalMs);

		this.autoCheckpointTimers.set(taskId, timer);
	}

	/**
	 * Stop auto-checkpointing for a task
	 */
	stopAutoCheckpoint(taskId: string): void {
		const timer = this.autoCheckpointTimers.get(taskId);
		if (timer) {
			clearInterval(timer);
			this.autoCheckpointTimers.delete(taskId);
		}
	}

	/**
	 * Cleanup old checkpoints for a task
	 */
	private async cleanupOldCheckpoints(taskId: string): Promise<void> {
		const maxCheckpoints = this.config.maxCheckpointsPerTask ?? 10;
		const checkpoints = await this.storage.list(taskId);

		if (checkpoints.length <= maxCheckpoints) {
			return;
		}

		// Sort by creation date descending
		checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

		// Delete oldest checkpoints
		const toDelete = checkpoints.slice(maxCheckpoints);
		await Promise.all(toDelete.map((c) => this.storage.delete(c.id)));
	}

	/**
	 * Cleanup checkpoints older than configured days
	 */
	async cleanupOld(): Promise<number> {
		const days = this.config.cleanupAfterDays ?? 7;
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - days);

		return await this.storage.cleanup(cutoffDate);
	}

	/**
	 * Generate a unique checkpoint ID
	 */
	private generateCheckpointId(taskId: string): CheckpointId {
		const timestamp = Date.now();
		const random = Math.random().toString(36).slice(2, 8);
		return `checkpoint-${taskId}-${timestamp}-${random}`;
	}

	/**
	 * Cleanup all auto-checkpoint timers
	 */
	dispose(): void {
		for (const timer of this.autoCheckpointTimers.values()) {
			clearInterval(timer);
		}
		this.autoCheckpointTimers.clear();
	}
}

/**
 * Create a new checkpoint manager
 */
export function createCheckpointManager(
	storage: CheckpointStorage,
	config?: CheckpointManagerConfig,
): CheckpointManager {
	return new CheckpointManager(storage, config);
}
