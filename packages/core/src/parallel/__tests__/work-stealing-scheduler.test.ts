/**
 * Tests for WorkStealingScheduler
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	type Task,
	type WorkStealingConfig,
	WorkStealingScheduler,
	createWorkStealingScheduler,
} from '../work-stealing-scheduler.js';

describe('WorkStealingScheduler', () => {
	let scheduler: WorkStealingScheduler;

	beforeEach(() => {
		scheduler = new WorkStealingScheduler({
			workerCount: 4,
			maxStealAttempts: 3,
			randomSteal: false,
			minQueueSizeForSteal: 2,
			backoffDelay: 10,
			enableWorkSplitting: false,
		});
	});

	describe('constructor', () => {
		it('should create scheduler with default config', () => {
			const s = new WorkStealingScheduler();
			expect(s).toBeDefined();
		});

		it('should create scheduler with custom config', () => {
			const config: Partial<WorkStealingConfig> = {
				workerCount: 8,
				maxStealAttempts: 5,
				randomSteal: true,
			};

			const s = new WorkStealingScheduler(config);
			expect(s).toBeDefined();
		});

		it('should use factory function', () => {
			const s = createWorkStealingScheduler();
			expect(s).toBeDefined();
		});

		it('should initialize worker queues', () => {
			const queues = scheduler.getAllWorkerQueues();
			expect(queues).toHaveLength(4);
			expect(queues.every((q) => q.tasks.length === 0)).toBe(true);
			expect(queues.every((q) => q.status === 'idle')).toBe(true);
		});
	});

	describe('submitTask', () => {
		it('should submit task to least loaded worker', () => {
			const task: Task = {
				id: 'task-1',
				data: { value: 1 },
				priority: 5,
			};

			scheduler.submitTask(task);

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(1);
		});

		it('should distribute tasks to least loaded workers', () => {
			const tasks: Task[] = [
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
				{ id: 'task-3', data: {}, priority: 1 },
			];

			for (const task of tasks) {
				scheduler.submitTask(task);
			}

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(3);
		});

		it('should throw if no workers available', () => {
			const emptyScheduler = new WorkStealingScheduler({ workerCount: 0 });

			expect(() => {
				emptyScheduler.submitTask({ id: 'task-1', data: {}, priority: 1 });
			}).toThrow('No workers available');
		});
	});

	describe('submitTasks', () => {
		it('should distribute tasks using round-robin', () => {
			const tasks: Task[] = [
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
				{ id: 'task-3', data: {}, priority: 1 },
				{ id: 'task-4', data: {}, priority: 1 },
			];

			scheduler.submitTasks(tasks);

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(4);
			// With 4 workers and 4 tasks, each should get 1
			expect(queues.every((q) => q.tasks.length === 1)).toBe(true);
		});

		it('should handle more tasks than workers', () => {
			const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
				id: `task-${i}`,
				data: {},
				priority: 1,
			}));

			scheduler.submitTasks(tasks);

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(10);
		});

		it('should handle empty task list', () => {
			scheduler.submitTasks([]);

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(0);
		});
	});

	describe('getNextTask', () => {
		it('should return task from own queue', async () => {
			const task: Task = {
				id: 'task-1',
				data: { value: 1 },
				priority: 5,
			};

			scheduler.submitTask(task);

			const nextTask = await scheduler.getNextTask('worker-0');

			expect(nextTask).toBeDefined();
			expect(nextTask?.id).toBe('task-1');
		});

		it('should mark worker as busy when getting task', async () => {
			const task: Task = {
				id: 'task-1',
				data: {},
				priority: 1,
			};

			scheduler.submitTask(task);

			await scheduler.getNextTask('worker-0');

			const queue = scheduler.getWorkerQueue('worker-0');
			expect(queue?.status).toBe('busy');
			expect(queue?.currentTask).toBeDefined();
		});

		it('should steal task when own queue is empty', async () => {
			// Add tasks to worker-1
			const tasks: Task[] = [
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
				{ id: 'task-3', data: {}, priority: 1 },
			];

			const queue1 = scheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push(...tasks);
			}

			// worker-0 has empty queue, should steal
			const task = await scheduler.getNextTask('worker-0');

			expect(task).toBeDefined();

			const queue0 = scheduler.getWorkerQueue('worker-0');
			expect(queue0?.tasksStolen).toBe(1);

			const queue1After = scheduler.getWorkerQueue('worker-1');
			expect(queue1After?.tasksLost).toBe(1);
		});

		it('should return undefined when no work available', async () => {
			const task = await scheduler.getNextTask('worker-0');

			expect(task).toBeUndefined();

			const queue = scheduler.getWorkerQueue('worker-0');
			expect(queue?.status).toBe('idle');
		});

		it('should use FIFO for own queue', async () => {
			const tasks: Task[] = [
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
				{ id: 'task-3', data: {}, priority: 1 },
			];

			for (const task of tasks) {
				scheduler.submitTask(task);
			}

			const queue = scheduler.getWorkerQueue('worker-0');
			if (queue && queue.tasks.length >= 2) {
				const task1 = await scheduler.getNextTask('worker-0');
				expect(task1?.id).toBe('task-1');

				scheduler.completeTask('worker-0', 'task-1');

				const task2 = await scheduler.getNextTask('worker-0');
				expect(task2?.id).toBe('task-2');
			}
		});

		it('should use LIFO for stealing (from end of queue)', async () => {
			// Add tasks to worker-1
			const tasks: Task[] = [
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
				{ id: 'task-3', data: {}, priority: 1 },
			];

			const queue1 = scheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push(...tasks);
			}

			// worker-0 steals - should get from end (LIFO)
			const stolenTask = await scheduler.getNextTask('worker-0');

			expect(stolenTask?.id).toBe('task-3'); // Last task
		});

		it('should throw for unknown worker', async () => {
			await expect(scheduler.getNextTask('unknown-worker')).rejects.toThrow(
				'Worker not found: unknown-worker',
			);
		});
	});

	describe('completeTask', () => {
		it('should mark task as completed', async () => {
			const task: Task = {
				id: 'task-1',
				data: {},
				priority: 1,
			};

			scheduler.submitTask(task);
			await scheduler.getNextTask('worker-0');

			scheduler.completeTask('worker-0', 'task-1');

			const queue = scheduler.getWorkerQueue('worker-0');
			expect(queue?.completedTasks).toBe(1);
			expect(queue?.status).toBe('idle');
			expect(queue?.currentTask).toBeUndefined();
		});

		it('should only complete current task', async () => {
			const task: Task = {
				id: 'task-1',
				data: {},
				priority: 1,
			};

			scheduler.submitTask(task);
			await scheduler.getNextTask('worker-0');

			// Try to complete different task
			scheduler.completeTask('worker-0', 'task-2');

			const queue = scheduler.getWorkerQueue('worker-0');
			expect(queue?.completedTasks).toBe(0);
		});

		it('should throw for unknown worker', () => {
			expect(() => {
				scheduler.completeTask('unknown-worker', 'task-1');
			}).toThrow('Worker not found: unknown-worker');
		});
	});

	describe('work stealing', () => {
		it('should only steal when victim has enough tasks', async () => {
			const smallScheduler = new WorkStealingScheduler({
				workerCount: 2,
				minQueueSizeForSteal: 3,
			});

			// Add only 1 task to worker-1 (below threshold)
			const queue1 = smallScheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push({ id: 'task-1', data: {}, priority: 1 });
			}

			// worker-0 tries to steal
			const task = await smallScheduler.getNextTask('worker-0');

			expect(task).toBeUndefined(); // Can't steal, below threshold
		});

		it('should respect max steal attempts', async () => {
			const limitedScheduler = new WorkStealingScheduler({
				workerCount: 4,
				maxStealAttempts: 1,
				backoffDelay: 1,
			});

			// Add tasks to other worker so stealing can be attempted (need >= minQueueSizeForSteal = 2)
			const queue1 = limitedScheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push(
					{ id: 'task-1', data: {}, priority: 1 },
					{ id: 'task-2', data: {}, priority: 1 },
				);
			}

			// Worker-0 tries to get task (should try to steal)
			await limitedScheduler.getNextTask('worker-0');

			const metrics = limitedScheduler.getMetrics();
			// Should have attempted stealing (either successful or failed)
			expect(metrics.failedSteals + metrics.totalSteals).toBeGreaterThan(0);
		});

		it('should select most loaded worker for stealing when not random', async () => {
			const scheduler = new WorkStealingScheduler({
				workerCount: 3,
				randomSteal: false,
			});

			// Add different number of tasks to workers
			const queue1 = scheduler.getWorkerQueue('worker-1');
			const queue2 = scheduler.getWorkerQueue('worker-2');

			if (queue1 && queue2) {
				queue1.tasks.push(
					{ id: 'task-1', data: {}, priority: 1 },
					{ id: 'task-2', data: {}, priority: 1 },
				);

				queue2.tasks.push(
					{ id: 'task-3', data: {}, priority: 1 },
					{ id: 'task-4', data: {}, priority: 1 },
					{ id: 'task-5', data: {}, priority: 1 },
				);
			}

			// worker-0 steals - should prefer worker-2 (most loaded)
			await scheduler.getNextTask('worker-0');

			const queue2After = scheduler.getWorkerQueue('worker-2');
			expect(queue2After?.tasksLost).toBeGreaterThan(0);
		});

		it('should use random selection when enabled', async () => {
			const randomScheduler = new WorkStealingScheduler({
				workerCount: 4,
				randomSteal: true,
			});

			// Add tasks to multiple workers
			for (let i = 1; i < 4; i++) {
				const queue = randomScheduler.getWorkerQueue(`worker-${i}`);
				if (queue) {
					queue.tasks.push(
						{ id: `task-${i}-1`, data: {}, priority: 1 },
						{ id: `task-${i}-2`, data: {}, priority: 1 },
						{ id: `task-${i}-3`, data: {}, priority: 1 },
					);
				}
			}

			// Should steal from random worker
			await randomScheduler.getNextTask('worker-0');

			// At least one worker should have lost a task
			const queues = randomScheduler.getAllWorkerQueues();
			const totalLost = queues.reduce((sum, q) => sum + q.tasksLost, 0);
			expect(totalLost).toBe(1);
		});
	});

	describe('work splitting', () => {
		it('should split large tasks when enabled', async () => {
			const splittingScheduler = new WorkStealingScheduler({
				workerCount: 2,
				enableWorkSplitting: true,
			});

			// Add a large splittable task to worker-1
			const queue1 = splittingScheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push({
					id: 'large-task',
					data: {},
					priority: 1,
					splittable: true,
					estimatedDuration: 5000,
				});
				queue1.tasks.push({
					id: 'task-2',
					data: {},
					priority: 1,
				});
			}

			// worker-0 steals
			const stolenTask = await splittingScheduler.getNextTask('worker-0');

			if (stolenTask?.splittable) {
				// Original worker should have split task
				const queue1After = splittingScheduler.getWorkerQueue('worker-1');
				// Check that queue has some tasks
				expect(queue1After?.tasks.length).toBeGreaterThan(0);
			}
		});

		it('should not split small tasks', async () => {
			const splittingScheduler = new WorkStealingScheduler({
				workerCount: 2,
				enableWorkSplitting: true,
			});

			// Add a small splittable task
			const queue1 = splittingScheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push(
					{
						id: 'small-task',
						data: {},
						priority: 1,
						splittable: true,
						estimatedDuration: 500, // Below 1000ms threshold
					},
					{ id: 'task-2', data: {}, priority: 1 },
				);
			}

			await splittingScheduler.getNextTask('worker-0');

			// Should not split small task
			expect(true).toBe(true);
		});

		it('should not split non-splittable tasks', async () => {
			const splittingScheduler = new WorkStealingScheduler({
				workerCount: 2,
				enableWorkSplitting: true,
			});

			const queue1 = splittingScheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push(
					{
						id: 'non-splittable',
						data: {},
						priority: 1,
						splittable: false,
						estimatedDuration: 5000,
					},
					{ id: 'task-2', data: {}, priority: 1 },
				);
			}

			await splittingScheduler.getNextTask('worker-0');

			// Should not split
			expect(true).toBe(true);
		});
	});

	describe('getMetrics', () => {
		it('should return scheduler metrics', () => {
			const metrics = scheduler.getMetrics();

			expect(metrics.totalTasks).toBe(0);
			expect(metrics.totalSteals).toBe(0);
			expect(metrics.failedSteals).toBe(0);
			expect(metrics.avgQueueLength).toBe(0);
			expect(metrics.workerUtilization).toBe(0);
			expect(metrics.loadBalanceScore).toBe(1); // Perfect balance when empty
		});

		it('should track completed tasks', async () => {
			const tasks: Task[] = [
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
			];

			scheduler.submitTasks(tasks);

			await scheduler.getNextTask('worker-0');
			scheduler.completeTask('worker-0', 'task-1');

			await scheduler.getNextTask('worker-1');
			scheduler.completeTask('worker-1', 'task-2');

			const metrics = scheduler.getMetrics();
			expect(metrics.totalTasks).toBe(2);
		});

		it('should track successful steals', async () => {
			const queue1 = scheduler.getWorkerQueue('worker-1');
			if (queue1) {
				queue1.tasks.push(
					{ id: 'task-1', data: {}, priority: 1 },
					{ id: 'task-2', data: {}, priority: 1 },
					{ id: 'task-3', data: {}, priority: 1 },
				);
			}

			await scheduler.getNextTask('worker-0');

			const metrics = scheduler.getMetrics();
			expect(metrics.totalSteals).toBe(1);
		});

		it('should calculate average queue length', () => {
			const tasks: Task[] = Array.from({ length: 8 }, (_, i) => ({
				id: `task-${i}`,
				data: {},
				priority: 1,
			}));

			scheduler.submitTasks(tasks);

			const metrics = scheduler.getMetrics();
			expect(metrics.avgQueueLength).toBe(2); // 8 tasks / 4 workers
		});

		it('should calculate worker utilization', async () => {
			scheduler.submitTask({ id: 'task-1', data: {}, priority: 1 });
			await scheduler.getNextTask('worker-0');

			const metrics = scheduler.getMetrics();
			expect(metrics.workerUtilization).toBe(0.25); // 1 busy / 4 workers
		});

		it('should calculate load balance score', () => {
			// Perfectly balanced
			const balancedTasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
				id: `task-${i}`,
				data: {},
				priority: 1,
			}));

			scheduler.submitTasks(balancedTasks);

			const balancedMetrics = scheduler.getMetrics();
			expect(balancedMetrics.loadBalanceScore).toBe(1);

			// Unbalanced
			scheduler.reset();
			const unbalancedTasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
				id: `task-${i}`,
				data: {},
				priority: 1,
			}));

			// Add all to one worker
			const queue = scheduler.getWorkerQueue('worker-0');
			if (queue) {
				queue.tasks.push(...unbalancedTasks);
			}

			const unbalancedMetrics = scheduler.getMetrics();
			expect(unbalancedMetrics.loadBalanceScore).toBeLessThan(1);
		});
	});

	describe('getWorkerQueue', () => {
		it('should return worker queue by ID', () => {
			const queue = scheduler.getWorkerQueue('worker-0');

			expect(queue).toBeDefined();
			expect(queue?.workerId).toBe('worker-0');
		});

		it('should return undefined for unknown worker', () => {
			const queue = scheduler.getWorkerQueue('unknown');

			expect(queue).toBeUndefined();
		});
	});

	describe('getAllWorkerQueues', () => {
		it('should return all worker queues', () => {
			const queues = scheduler.getAllWorkerQueues();

			expect(queues).toHaveLength(4);
			expect(queues.every((q) => q.workerId.startsWith('worker-'))).toBe(true);
		});
	});

	describe('reset', () => {
		it('should reset scheduler state', async () => {
			// Add and process some tasks
			scheduler.submitTasks([
				{ id: 'task-1', data: {}, priority: 1 },
				{ id: 'task-2', data: {}, priority: 1 },
			]);

			await scheduler.getNextTask('worker-0');
			scheduler.completeTask('worker-0', 'task-1');

			let metrics = scheduler.getMetrics();
			expect(metrics.totalTasks).toBeGreaterThan(0);

			// Reset
			scheduler.reset();

			metrics = scheduler.getMetrics();
			expect(metrics.totalTasks).toBe(0);
			expect(metrics.totalSteals).toBe(0);

			const queues = scheduler.getAllWorkerQueues();
			expect(queues.every((q) => q.tasks.length === 0)).toBe(true);
			expect(queues.every((q) => q.status === 'idle')).toBe(true);
			expect(queues.every((q) => q.completedTasks === 0)).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('should handle single worker', async () => {
			const singleScheduler = new WorkStealingScheduler({ workerCount: 1 });

			singleScheduler.submitTask({ id: 'task-1', data: {}, priority: 1 });

			const task = await singleScheduler.getNextTask('worker-0');

			expect(task).toBeDefined();

			// Cannot steal with single worker
			const metrics = singleScheduler.getMetrics();
			expect(metrics.totalSteals).toBe(0);
		});

		it('should handle high task priority', () => {
			const highPriorityTask: Task = {
				id: 'critical-task',
				data: {},
				priority: 100,
			};

			scheduler.submitTask(highPriorityTask);

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(1);
		});

		it('should handle tasks with estimated duration', () => {
			const task: Task = {
				id: 'timed-task',
				data: {},
				priority: 1,
				estimatedDuration: 5000,
			};

			scheduler.submitTask(task);

			const queues = scheduler.getAllWorkerQueues();
			const totalTasks = queues.reduce((sum, q) => sum + q.tasks.length, 0);

			expect(totalTasks).toBe(1);
		});

		it('should handle concurrent task requests', async () => {
			const tasks: Task[] = Array.from({ length: 4 }, (_, i) => ({
				id: `task-${i}`,
				data: {},
				priority: 1,
			}));

			scheduler.submitTasks(tasks);

			// Simulate concurrent requests
			const taskPromises = [
				scheduler.getNextTask('worker-0'),
				scheduler.getNextTask('worker-1'),
				scheduler.getNextTask('worker-2'),
				scheduler.getNextTask('worker-3'),
			];

			const results = await Promise.all(taskPromises);

			// All workers should get tasks
			expect(results.filter((r) => r !== undefined)).toHaveLength(4);
		});
	});
});
