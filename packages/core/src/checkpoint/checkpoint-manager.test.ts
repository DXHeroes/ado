/**
 * Checkpoint Manager Tests
 */

import type { AgentTask } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	CheckpointManager,
	InMemoryCheckpointStorage,
	type TaskState,
} from './checkpoint-manager.js';

describe('CheckpointManager', () => {
	let manager: CheckpointManager;
	let storage: InMemoryCheckpointStorage;

	beforeEach(() => {
		storage = new InMemoryCheckpointStorage();
		manager = new CheckpointManager(storage, {
			autoCheckpointInterval: 0, // Disable auto-checkpoint for tests
			maxCheckpointsPerTask: 3,
			cleanupAfterDays: 7,
		});
	});

	describe('checkpoint', () => {
		it('should create a checkpoint', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const state: TaskState = {
				task,
				status: 'running',
				progress: 50,
			};

			const checkpointId = await manager.checkpoint('task-1', state);

			expect(checkpointId).toBeDefined();
			expect(checkpointId).toContain('checkpoint-task-1');
		});
	});

	describe('restore', () => {
		it('should restore from a checkpoint', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const state: TaskState = {
				task,
				status: 'running',
				progress: 50,
				output: 'Some output',
			};

			const checkpointId = await manager.checkpoint('task-1', state);
			const restored = await manager.restore(checkpointId);

			expect(restored.task.id).toBe('task-1');
			expect(restored.status).toBe('running');
			expect(restored.progress).toBe(50);
			expect(restored.output).toBe('Some output');
		});

		it('should throw error for non-existent checkpoint', async () => {
			await expect(manager.restore('non-existent')).rejects.toThrow('not found');
		});
	});

	describe('getLatestCheckpoint', () => {
		it('should return the most recent checkpoint', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			// Create multiple checkpoints
			await manager.checkpoint('task-1', { task, status: 'running', progress: 25 });
			await new Promise((resolve) => setTimeout(resolve, 10));
			await manager.checkpoint('task-1', { task, status: 'running', progress: 50 });
			await new Promise((resolve) => setTimeout(resolve, 10));
			const latestId = await manager.checkpoint('task-1', {
				task,
				status: 'running',
				progress: 75,
			});

			const latest = await manager.getLatestCheckpoint('task-1');

			expect(latest).toBeDefined();
			expect(latest?.id).toBe(latestId);
			expect(latest?.state.progress).toBe(75);
		});

		it('should return null for task with no checkpoints', async () => {
			const latest = await manager.getLatestCheckpoint('non-existent');
			expect(latest).toBeNull();
		});
	});

	describe('listCheckpoints', () => {
		it('should list all checkpoints for a task', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await manager.checkpoint('task-1', { task, status: 'running', progress: 25 });
			await new Promise((resolve) => setTimeout(resolve, 10));
			await manager.checkpoint('task-1', { task, status: 'running', progress: 50 });
			await new Promise((resolve) => setTimeout(resolve, 10));
			await manager.checkpoint('task-1', { task, status: 'running', progress: 75 });

			const checkpoints = await manager.listCheckpoints('task-1');

			expect(checkpoints.length).toBeGreaterThanOrEqual(3);
			// Should be sorted by creation date descending
			// Note: may have been trimmed to maxCheckpointsPerTask
			const progresses = checkpoints.map((c) => c.state.progress);
			expect(progresses).toContain(75);
			expect(progresses).toContain(50);
			expect(progresses).toContain(25);
		});
	});

	describe('cleanup', () => {
		it('should cleanup old checkpoints beyond max limit', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			// Create 5 checkpoints (max is 3)
			for (let i = 1; i <= 5; i++) {
				await manager.checkpoint('task-1', { task, status: 'running', progress: i * 20 });
				await new Promise((resolve) => setTimeout(resolve, 10));
			}

			const checkpoints = await manager.listCheckpoints('task-1');

			// Should only keep the 3 most recent
			expect(checkpoints).toHaveLength(3);
			expect(checkpoints[0]?.state.progress).toBe(100);
			expect(checkpoints[1]?.state.progress).toBe(80);
			expect(checkpoints[2]?.state.progress).toBe(60);
		});
	});

	describe('deleteCheckpoint', () => {
		it('should delete a checkpoint', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const checkpointId = await manager.checkpoint('task-1', {
				task,
				status: 'running',
				progress: 50,
			});

			await manager.deleteCheckpoint(checkpointId);

			await expect(manager.restore(checkpointId)).rejects.toThrow('not found');
		});
	});
});
