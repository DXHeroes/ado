/**
 * Task Queue Tests
 */

import type { AgentTask } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskQueue } from './task-queue.js';

describe('TaskQueue', () => {
	let queue: TaskQueue;

	beforeEach(() => {
		queue = new TaskQueue({
			concurrency: 2,
			retryAttempts: 2,
			retryDelay: 100,
		});
	});

	describe('add', () => {
		it('should add a task to the queue', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const taskId = await queue.add(task);
			expect(taskId).toBe('task-1');

			const queuedTask = queue.getTask(taskId);
			expect(queuedTask).toBeDefined();
			expect(queuedTask?.status).toBe('queued');
		});

		it('should respect queue size limit', async () => {
			const limitedQueue = new TaskQueue({
				concurrency: 1,
				retryAttempts: 0,
				retryDelay: 0,
				maxQueueSize: 2,
			});

			const task1: AgentTask = {
				id: 'task-1',
				prompt: 'Task 1',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const task2: AgentTask = {
				id: 'task-2',
				prompt: 'Task 2',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const task3: AgentTask = {
				id: 'task-3',
				prompt: 'Task 3',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await limitedQueue.add(task1);
			await limitedQueue.add(task2);

			await expect(limitedQueue.add(task3)).rejects.toThrow('queue is full');
		});
	});

	describe('cancel', () => {
		it('should cancel a queued task', async () => {
			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await queue.add(task);
			const cancelled = await queue.cancel('task-1');

			expect(cancelled).toBe(true);

			const queuedTask = queue.getTask('task-1');
			expect(queuedTask?.status).toBe('cancelled');
		});

		it('should return false for non-existent task', async () => {
			const cancelled = await queue.cancel('non-existent');
			expect(cancelled).toBe(false);
		});
	});

	describe('execution', () => {
		it('should execute tasks with concurrency limit', async () => {
			const executed: string[] = [];
			const handler = vi.fn(async (task: AgentTask) => {
				executed.push(task.id);
				await new Promise((resolve) => setTimeout(resolve, 50));
			});

			queue.setHandler(handler);

			const task1: AgentTask = {
				id: 'task-1',
				prompt: 'Task 1',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const task2: AgentTask = {
				id: 'task-2',
				prompt: 'Task 2',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const task3: AgentTask = {
				id: 'task-3',
				prompt: 'Task 3',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await queue.add(task1);
			await queue.add(task2);
			await queue.add(task3);

			await queue.drain();

			expect(executed).toContain('task-1');
			expect(executed).toContain('task-2');
			expect(executed).toContain('task-3');
			expect(handler).toHaveBeenCalledTimes(3);
		});

		it('should retry failed tasks', async () => {
			let attempts = 0;
			const handler = vi.fn(async (_task: AgentTask) => {
				attempts++;
				if (attempts < 3) {
					throw new Error('Task failed');
				}
			});

			queue.setHandler(handler);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await queue.add(task);
			await queue.drain();

			// Should be called 3 times: initial + 2 retries
			expect(handler).toHaveBeenCalledTimes(3);
			expect(queue.getTask('task-1')?.status).toBe('completed');
		});

		it('should mark task as failed after max retries', async () => {
			const handler = vi.fn(async () => {
				throw new Error('Task always fails');
			});

			queue.setHandler(handler);

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await queue.add(task);
			await queue.drain();

			// Should be called 3 times: initial + 2 retries
			expect(handler).toHaveBeenCalledTimes(3);
			expect(queue.getTask('task-1')?.status).toBe('failed');
			expect(queue.getTask('task-1')?.error).toBeDefined();
		});
	});

	describe('getStats', () => {
		it('should return correct statistics', async () => {
			queue.setHandler(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});

			const task1: AgentTask = {
				id: 'task-1',
				prompt: 'Task 1',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			const task2: AgentTask = {
				id: 'task-2',
				prompt: 'Task 2',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await queue.add(task1);
			await queue.add(task2);

			await queue.drain();

			const stats = queue.getStats();
			expect(stats.completed).toBe(2);
			expect(stats.failed).toBe(0);
			expect(stats.totalProcessed).toBe(2);
		});
	});

	describe('cleanup', () => {
		it('should remove completed tasks', async () => {
			queue.setHandler(async () => {});

			const task: AgentTask = {
				id: 'task-1',
				prompt: 'Test task',
				projectContext: {
					projectId: 'test',
					repositoryPath: '/test',
					repositoryKey: 'test',
				},
			};

			await queue.add(task);
			await queue.drain();

			expect(queue.getTask('task-1')).toBeDefined();

			queue.cleanup();

			expect(queue.getTask('task-1')).toBeUndefined();
		});
	});
});
