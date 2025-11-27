/**
 * Tasks routes
 */

import type { AsyncStateStore, StateStore } from '@dxheroes/ado-core';
import type { TaskState } from '@dxheroes/ado-shared';
import { Hono } from 'hono';
import type { ApiContext, TaskDetailResponse, TaskResponse } from '../types.js';

/**
 * Type guard to check if a method is async
 */
function isAsyncStateStore(store: StateStore | AsyncStateStore): store is AsyncStateStore {
	return 'then' in (store.getTask('') as Promise<unknown>);
}

/**
 * Convert TaskState to TaskResponse
 */
function taskStateToResponse(task: TaskState): TaskResponse {
	const response: TaskResponse = {
		id: task.id,
		prompt: task.definition.prompt,
		provider: task.providerId ?? 'unknown',
		status:
			task.status === 'running'
				? 'running'
				: task.status === 'completed'
					? 'completed'
					: task.status === 'failed'
						? 'failed'
						: task.status === 'paused'
							? 'paused'
							: 'pending',
		startedAt: task.startedAt?.toISOString() ?? new Date().toISOString(),
	};

	if (task.completedAt) {
		response.completedAt = task.completedAt.toISOString();
	}
	if (task.result?.duration !== undefined) {
		response.duration = task.result.duration;
	}
	if (task.result?.costUsd !== undefined) {
		response.cost = task.result.costUsd;
	}

	return response;
}

/**
 * Convert TaskState to TaskDetailResponse
 */
function taskStateToDetailResponse(task: TaskState): TaskDetailResponse {
	return {
		...taskStateToResponse(task),
		events: [], // Events would need to be tracked separately
	};
}

// In-memory task store for demo purposes (fallback when no state store)
const memoryTasks: Map<string, TaskDetailResponse> = new Map();

export function createTasksRoutes(): Hono<ApiContext> {
	const router = new Hono<ApiContext>();

	// List all tasks
	router.get('/', async (c) => {
		const stateStore = c.get('stateStore');

		if (stateStore) {
			try {
				let allTasks: TaskState[] = [];

				if (isAsyncStateStore(stateStore)) {
					// Async state store
					const [pending, running, paused, completed, failed] = await Promise.all([
						stateStore.getTasksByStatus('pending'),
						stateStore.getTasksByStatus('running'),
						stateStore.getTasksByStatus('paused'),
						stateStore.getTasksByStatus('completed'),
						stateStore.getTasksByStatus('failed'),
					]);
					allTasks = [...pending, ...running, ...paused, ...completed, ...failed];
				} else {
					// Sync state store
					allTasks = [
						...stateStore.getTasksByStatus('pending'),
						...stateStore.getTasksByStatus('running'),
						...stateStore.getTasksByStatus('paused'),
						...stateStore.getTasksByStatus('completed'),
						...stateStore.getTasksByStatus('failed'),
					];
				}

				const taskList = allTasks.map(taskStateToResponse);
				taskList.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

				return c.json(taskList);
			} catch (_error) {
				return c.json({ error: 'Failed to fetch tasks' }, 500);
			}
		}

		// Fallback to in-memory store
		const taskList: TaskResponse[] = Array.from(memoryTasks.values()).map(
			({ events: _events, ...task }) => task,
		);
		taskList.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

		return c.json(taskList);
	});

	// Get task by ID
	router.get('/:id', async (c) => {
		const taskId = c.req.param('id');
		const stateStore = c.get('stateStore');

		if (stateStore) {
			try {
				const task = isAsyncStateStore(stateStore)
					? await stateStore.getTask(taskId)
					: stateStore.getTask(taskId);

				if (!task) {
					return c.json({ error: 'Task not found' }, 404);
				}

				return c.json(taskStateToDetailResponse(task));
			} catch (_error) {
				return c.json({ error: 'Failed to fetch task' }, 500);
			}
		}

		// Fallback to in-memory store
		const task = memoryTasks.get(taskId);
		if (!task) {
			return c.json({ error: 'Task not found' }, 404);
		}

		return c.json(task);
	});

	// Create new task (for internal use)
	router.post('/', async (c) => {
		const body = await c.req.json<{
			id: string;
			prompt: string;
			provider: string;
		}>();

		const stateStore = c.get('stateStore');

		if (stateStore) {
			try {
				const taskState: TaskState = {
					id: body.id,
					definition: {
						prompt: body.prompt,
						projectKey: 'default',
						repositoryPath: process.cwd(),
					},
					status: 'pending',
					providerId: body.provider,
					startedAt: new Date(),
				};

				const created = isAsyncStateStore(stateStore)
					? await stateStore.createTask(taskState)
					: stateStore.createTask(taskState);

				return c.json(taskStateToDetailResponse(created), 201);
			} catch (_error) {
				return c.json({ error: 'Failed to create task' }, 500);
			}
		}

		// Fallback to in-memory store
		const task: TaskDetailResponse = {
			id: body.id,
			prompt: body.prompt,
			provider: body.provider,
			status: 'pending',
			startedAt: new Date().toISOString(),
			events: [
				{
					type: 'created',
					timestamp: new Date().toISOString(),
					data: { prompt: body.prompt },
				},
			],
		};

		memoryTasks.set(task.id, task);
		return c.json(task, 201);
	});

	// Update task status
	router.patch('/:id', async (c) => {
		const taskId = c.req.param('id');
		const stateStore = c.get('stateStore');

		if (stateStore) {
			try {
				const task = isAsyncStateStore(stateStore)
					? await stateStore.getTask(taskId)
					: stateStore.getTask(taskId);

				if (!task) {
					return c.json({ error: 'Task not found' }, 404);
				}

				const body = await c.req.json<Partial<TaskResponse>>();

				// Update task fields
				const updates: Partial<TaskState> = {};
				if (body.status) {
					updates.status = body.status;
					if (body.status === 'completed' || body.status === 'failed') {
						updates.completedAt = new Date();
					}
				}

				if (isAsyncStateStore(stateStore)) {
					await stateStore.updateTask(taskId, updates);
					const updated = await stateStore.getTask(taskId);
					return c.json(updated ? taskStateToDetailResponse(updated) : null);
				}

				stateStore.updateTask(taskId, updates);
				const updated = stateStore.getTask(taskId);
				return c.json(updated ? taskStateToDetailResponse(updated) : null);
			} catch (_error) {
				return c.json({ error: 'Failed to update task' }, 500);
			}
		}

		// Fallback to in-memory store
		const task = memoryTasks.get(taskId);
		if (!task) {
			return c.json({ error: 'Task not found' }, 404);
		}

		const body = await c.req.json<Partial<TaskResponse>>();

		// Update task fields
		if (body.status) {
			task.status = body.status;
			task.events?.push({
				type: 'status_changed',
				timestamp: new Date().toISOString(),
				data: { status: body.status },
			});

			if (body.status === 'completed' || body.status === 'failed') {
				task.completedAt = new Date().toISOString();
				task.duration = Math.floor(
					(new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000,
				);
			}
		}

		memoryTasks.set(taskId, task);
		return c.json(task);
	});

	// Delete task
	router.delete('/:id', async (c) => {
		const taskId = c.req.param('id');

		// Note: State stores don't have a delete method, so we use the in-memory fallback
		if (!memoryTasks.has(taskId)) {
			return c.json({ error: 'Task not found or deletion not supported' }, 404);
		}

		memoryTasks.delete(taskId);
		return c.body(null, 204);
	});

	// Add event to task
	router.post('/:id/events', async (c) => {
		const taskId = c.req.param('id');

		// Events are tracked in memory for now as state store doesn't have event tracking
		const task = memoryTasks.get(taskId);

		if (!task) {
			return c.json({ error: 'Task not found' }, 404);
		}

		const event = await c.req.json<{
			type: string;
			data?: unknown;
		}>();

		task.events = task.events ?? [];
		task.events.push({
			...event,
			timestamp: new Date().toISOString(),
		});

		memoryTasks.set(taskId, task);
		return c.json(task.events[task.events.length - 1], 201);
	});

	return router;
}
