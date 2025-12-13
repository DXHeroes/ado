/**
 * E2E test for parallel task execution
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SqliteStateStore } from '../packages/core/src/state/sqlite.js';
import { ParallelScheduler } from '../packages/core/src/parallel/parallel-scheduler.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskDefinition } from '@dxheroes/ado-shared';

describe('Parallel Execution E2E', () => {
	const testDir = join(process.cwd(), 'tmp', 'e2e-parallel');
	const dbPath = join(testDir, 'test.db');
	let stateStore: SqliteStateStore;
	let scheduler: ParallelScheduler;

	beforeAll(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		mkdirSync(testDir, { recursive: true });

		stateStore = new SqliteStateStore(dbPath);
	});

	afterAll(() => {
		stateStore?.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it('should execute independent tasks in parallel', async () => {
		const session = stateStore.createSession({
			id: 'parallel-session-1',
			projectId: 'test-project',
			repositoryKey: 'test-repo',
			providerId: 'claude-code',
		});

		// Create independent tasks
		const tasks: TaskDefinition[] = [
			{
				id: 'task-1',
				type: 'code-generation',
				prompt: 'Create function A',
				dependencies: [],
				priority: 1,
			},
			{
				id: 'task-2',
				type: 'code-generation',
				prompt: 'Create function B',
				dependencies: [],
				priority: 1,
			},
			{
				id: 'task-3',
				type: 'code-generation',
				prompt: 'Create function C',
				dependencies: [],
				priority: 1,
			},
		];

		for (const taskDef of tasks) {
			stateStore.createTask({
				id: taskDef.id,
				definition: taskDef,
				status: 'pending',
				sessionId: session.id,
			});
		}

		// Initialize scheduler
		scheduler = new ParallelScheduler({
			maxConcurrent: 3,
			stateStore,
		});

		// Execute tasks (mock execution)
		const results = await scheduler.executeTasks(tasks, {
			execute: async (task) => {
				// Simulate work
				await new Promise((resolve) => setTimeout(resolve, 100));
				return {
					success: true,
					output: `Completed ${task.id}`,
				};
			},
		});

		expect(results).toHaveLength(3);
		expect(results.every((r) => r.success)).toBe(true);
	}, 10000);

	it('should respect task dependencies', async () => {
		const session = stateStore.createSession({
			id: 'parallel-session-2',
			projectId: 'test-project',
			repositoryKey: 'test-repo',
			providerId: 'claude-code',
		});

		// Create dependent tasks (A -> B -> C)
		const tasks: TaskDefinition[] = [
			{
				id: 'task-a',
				type: 'code-generation',
				prompt: 'Create base',
				dependencies: [],
				priority: 1,
			},
			{
				id: 'task-b',
				type: 'code-generation',
				prompt: 'Extend base',
				dependencies: ['task-a'],
				priority: 1,
			},
			{
				id: 'task-c',
				type: 'code-generation',
				prompt: 'Use extension',
				dependencies: ['task-b'],
				priority: 1,
			},
		];

		for (const taskDef of tasks) {
			stateStore.createTask({
				id: taskDef.id,
				definition: taskDef,
				status: 'pending',
				sessionId: session.id,
			});
		}

		const executionOrder: string[] = [];

		// Execute tasks
		const results = await scheduler.executeTasks(tasks, {
			execute: async (task) => {
				executionOrder.push(task.id);
				await new Promise((resolve) => setTimeout(resolve, 50));
				return {
					success: true,
					output: `Completed ${task.id}`,
				};
			},
		});

		expect(results).toHaveLength(3);
		expect(executionOrder).toEqual(['task-a', 'task-b', 'task-c']);
	}, 10000);

	it('should handle task failures gracefully', async () => {
		const session = stateStore.createSession({
			id: 'parallel-session-3',
			projectId: 'test-project',
			repositoryKey: 'test-repo',
			providerId: 'claude-code',
		});

		const tasks: TaskDefinition[] = [
			{
				id: 'task-success',
				type: 'code-generation',
				prompt: 'Success task',
				dependencies: [],
				priority: 1,
			},
			{
				id: 'task-fail',
				type: 'code-generation',
				prompt: 'Failing task',
				dependencies: [],
				priority: 1,
			},
		];

		for (const taskDef of tasks) {
			stateStore.createTask({
				id: taskDef.id,
				definition: taskDef,
				status: 'pending',
				sessionId: session.id,
			});
		}

		const results = await scheduler.executeTasks(tasks, {
			execute: async (task) => {
				if (task.id === 'task-fail') {
					throw new Error('Simulated failure');
				}
				return {
					success: true,
					output: `Completed ${task.id}`,
				};
			},
		});

		expect(results).toHaveLength(2);
		const successResult = results.find((r) => r.taskId === 'task-success');
		const failResult = results.find((r) => r.taskId === 'task-fail');

		expect(successResult?.success).toBe(true);
		expect(failResult?.success).toBe(false);
		expect(failResult?.error).toContain('Simulated failure');
	}, 10000);
});
