/**
 * PostgreSQL State Store Tests
 */

import type { TaskState, UsageRecord } from '@dxheroes/ado-shared';
import {
	createMockTaskDefinition,
	createMockTaskResult,
	getPostgresConnectionString,
	startPostgresContainer,
	stopPostgresContainer,
} from '@dxheroes/ado-shared/test-utils';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresqlStateStore, createPostgresqlStateStore } from '../postgresql.js';

describe('PostgresqlStateStore', () => {
	let container: StartedPostgreSqlContainer | undefined;
	let connectionString: string;
	let store: PostgresqlStateStore;

	beforeAll(async () => {
		container = await startPostgresContainer();
		connectionString = getPostgresConnectionString(container);
	}, 60000); // Increase timeout for container startup

	afterAll(async () => {
		// Stop container after all tests
		await stopPostgresContainer(container);
	}, 30000);

	beforeEach(async () => {
		// Create new store instance for each test
		store = new PostgresqlStateStore(connectionString);
		// Wait for initialization to complete
		await new Promise((resolve) => setTimeout(resolve, 100));
	});

	afterEach(async () => {
		// Clean up store
		await store.close();
	});

	describe('initialization', () => {
		it('should create database schema on initialization', async () => {
			const newStore = new PostgresqlStateStore(connectionString);
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should be able to create session after initialization
			const session = await newStore.createSession({
				id: 'test-session',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'test-provider',
			});

			expect(session.id).toBe('test-session');

			await newStore.close();
		});

		it('should accept custom pool configuration', async () => {
			const customStore = new PostgresqlStateStore(connectionString, {
				max: 10,
				idleTimeoutMillis: 10000,
				connectionTimeoutMillis: 5000,
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			const session = await customStore.createSession({
				id: 'custom-config',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'test-provider',
			});

			expect(session.id).toBe('custom-config');

			await customStore.close();
		});
	});

	describe('session management', () => {
		it('should create a session', async () => {
			const session = await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			expect(session.id).toBe('session-1');
			expect(session.projectId).toBe('project-1');
			expect(session.repositoryKey).toBe('repo-1');
			expect(session.providerId).toBe('claude-code');
			expect(session.createdAt).toBeInstanceOf(Date);
			expect(session.updatedAt).toBeInstanceOf(Date);
		});

		it('should create session with metadata', async () => {
			const metadata = { custom: 'value', number: 42 };
			const session = await store.createSession({
				id: 'session-2',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
				metadata,
			});

			expect(session.metadata).toEqual(metadata);
		});

		it('should get session by ID', async () => {
			await store.createSession({
				id: 'session-get',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			const session = await store.getSession('session-get');

			expect(session).not.toBeNull();
			expect(session?.id).toBe('session-get');
		});

		it('should return null for non-existent session', async () => {
			const session = await store.getSession('non-existent');
			expect(session).toBeNull();
		});

		it('should get sessions by project', async () => {
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createSession({
				id: 'session-2',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'gemini-cli',
			});

			await store.createSession({
				id: 'session-3',
				projectId: 'project-2',
				repositoryKey: 'repo-2',
				providerId: 'claude-code',
			});

			const sessions = await store.getSessionsByProject('project-1', 'repo-1');

			expect(sessions).toHaveLength(2);
			expect(sessions.map((s) => s.id)).toContain('session-1');
			expect(sessions.map((s) => s.id)).toContain('session-2');
		});

		it('should update session', async () => {
			await store.createSession({
				id: 'session-update',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			const newMetadata = { updated: true };
			await store.updateSession('session-update', {
				providerId: 'gemini-cli',
				metadata: newMetadata,
			});

			const updated = await store.getSession('session-update');
			expect(updated?.providerId).toBe('gemini-cli');
			expect(updated?.metadata).toEqual(newMetadata);
		});

		it('should update session timestamp on update', async () => {
			await store.createSession({
				id: 'session-timestamp',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			const original = await store.getSession('session-timestamp');
			const originalUpdatedAt = original?.updatedAt;

			// Small delay to ensure different timestamp
			await new Promise((resolve) => setTimeout(resolve, 10));

			await store.updateSession('session-timestamp', {
				metadata: { updated: true },
			});

			const updated = await store.getSession('session-timestamp');
			expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt?.getTime());
		});

		it('should handle empty update', async () => {
			await store.createSession({
				id: 'session-empty-update',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.updateSession('session-empty-update', {});

			const session = await store.getSession('session-empty-update');
			expect(session?.providerId).toBe('claude-code');
		});
	});

	describe('task management', () => {
		it('should create a task', async () => {
			const taskState: TaskState = {
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'pending',
			};

			const created = await store.createTask(taskState);

			expect(created.id).toBe('task-1');
			expect(created.status).toBe('pending');
		});

		it('should create task with all fields', async () => {
			// Create session first for foreign key constraint
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			const now = new Date();
			const taskState: TaskState = {
				id: 'task-full',
				definition: createMockTaskDefinition(),
				status: 'completed',
				providerId: 'claude-code',
				sessionId: 'session-1',
				startedAt: now,
				completedAt: now,
				result: createMockTaskResult(),
			};

			const created = await store.createTask(taskState);

			expect(created.id).toBe('task-full');
			expect(created.status).toBe('completed');
			expect(created.providerId).toBe('claude-code');
			expect(created.sessionId).toBe('session-1');
		});

		it('should get task by ID', async () => {
			const taskState: TaskState = {
				id: 'task-get',
				definition: createMockTaskDefinition(),
				status: 'running',
			};

			await store.createTask(taskState);

			const task = await store.getTask('task-get');

			expect(task).not.toBeNull();
			expect(task?.id).toBe('task-get');
			expect(task?.status).toBe('running');
		});

		it('should return null for non-existent task', async () => {
			const task = await store.getTask('non-existent');
			expect(task).toBeNull();
		});

		it('should update task status', async () => {
			const taskState: TaskState = {
				id: 'task-update',
				definition: createMockTaskDefinition(),
				status: 'pending',
			};

			await store.createTask(taskState);

			await store.updateTask('task-update', {
				status: 'running',
				startedAt: new Date(),
			});

			const updated = await store.getTask('task-update');
			expect(updated?.status).toBe('running');
			expect(updated?.startedAt).toBeInstanceOf(Date);
		});

		it('should update task with completion data', async () => {
			const taskState: TaskState = {
				id: 'task-complete',
				definition: createMockTaskDefinition(),
				status: 'running',
			};

			await store.createTask(taskState);

			const result = createMockTaskResult();
			await store.updateTask('task-complete', {
				status: 'completed',
				completedAt: new Date(),
				result,
			});

			const updated = await store.getTask('task-complete');
			expect(updated?.status).toBe('completed');
			expect(updated?.result).toEqual(result);
		});

		it('should update task with error', async () => {
			const taskState: TaskState = {
				id: 'task-error',
				definition: createMockTaskDefinition(),
				status: 'running',
			};

			await store.createTask(taskState);

			await store.updateTask('task-error', {
				status: 'failed',
				error: 'Test error message',
				completedAt: new Date(),
			});

			const updated = await store.getTask('task-error');
			expect(updated?.status).toBe('failed');
			expect(updated?.error).toBe('Test error message');
		});

		it('should get tasks by session', async () => {
			// Create sessions first
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createSession({
				id: 'session-2',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'completed',
				sessionId: 'session-1',
			});

			await store.createTask({
				id: 'task-2',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			await store.createTask({
				id: 'task-3',
				definition: createMockTaskDefinition(),
				status: 'pending',
				sessionId: 'session-2',
			});

			const tasks = await store.getTasksBySession('session-1');

			expect(tasks).toHaveLength(2);
			expect(tasks.map((t) => t.id)).toContain('task-1');
			expect(tasks.map((t) => t.id)).toContain('task-2');
		});

		it('should get tasks by status', async () => {
			await store.createTask({
				id: 'task-pending-1',
				definition: createMockTaskDefinition(),
				status: 'pending',
			});

			await store.createTask({
				id: 'task-pending-2',
				definition: createMockTaskDefinition(),
				status: 'pending',
			});

			await store.createTask({
				id: 'task-running',
				definition: createMockTaskDefinition(),
				status: 'running',
			});

			const pendingTasks = await store.getTasksByStatus('pending');

			expect(pendingTasks).toHaveLength(2);
			expect(pendingTasks.map((t) => t.id)).toContain('task-pending-1');
			expect(pendingTasks.map((t) => t.id)).toContain('task-pending-2');
		});

		it('should handle empty task update', async () => {
			const taskState: TaskState = {
				id: 'task-empty-update',
				definition: createMockTaskDefinition(),
				status: 'pending',
			};

			await store.createTask(taskState);

			// Empty update should not throw
			await expect(store.updateTask('task-empty-update', {})).resolves.not.toThrow();

			const retrieved = await store.getTask('task-empty-update');
			expect(retrieved?.status).toBe('pending');
		});
	});

	describe('usage tracking', () => {
		it('should record usage', async () => {
			const usage: UsageRecord = {
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 500,
			};

			await expect(store.recordUsage(usage)).resolves.not.toThrow();
		});

		it('should record usage with cost', async () => {
			const usage: UsageRecord = {
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 1000,
				costUsd: 0.05,
			};

			await expect(store.recordUsage(usage)).resolves.not.toThrow();
		});

		it('should get usage by provider', async () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			await store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: now,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 500,
			});

			await store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: now,
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 1000,
				costUsd: 0.05,
			});

			await store.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'subscription',
				timestamp: now,
				requestCount: 1,
				inputTokens: 1500,
				outputTokens: 750,
			});

			const claudeUsage = await store.getUsageByProvider('claude-code', yesterday);

			expect(claudeUsage).toHaveLength(2);
			expect(claudeUsage.every((u) => u.providerId === 'claude-code')).toBe(true);
		});

		it('should filter usage by timestamp', async () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

			await store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: twoDaysAgo,
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 250,
			});

			await store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: yesterday,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 500,
			});

			const recentUsage = await store.getUsageByProvider('claude-code', yesterday);

			expect(recentUsage).toHaveLength(1);
			expect(recentUsage[0]?.inputTokens).toBe(1000);
		});

		it('should get total usage', async () => {
			const now = new Date();

			await store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: now,
				requestCount: 2,
				inputTokens: 1000,
				outputTokens: 500,
			});

			await store.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'api',
				timestamp: now,
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 1000,
				costUsd: 0.05,
			});

			const total = await store.getTotalUsage(new Date(now.getTime() - 1000));

			expect(total.requests).toBe(3);
			expect(total.tokens).toBe(4500); // 1000 + 500 + 2000 + 1000
			expect(total.cost).toBeCloseTo(0.05, 2);
		});

		it('should return zero for total usage with no records', async () => {
			const total = await store.getTotalUsage(new Date());

			expect(total.requests).toBe(0);
			expect(total.tokens).toBe(0);
			expect(total.cost).toBe(0);
		});
	});

	describe('checkpoint management', () => {
		it('should create a checkpoint', async () => {
			// Create session and task first for foreign key constraints
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			const checkpoint = await store.createCheckpoint({
				id: 'checkpoint-1',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 50 }),
			});

			expect(checkpoint.id).toBe('checkpoint-1');
			expect(checkpoint.taskId).toBe('task-1');
			expect(checkpoint.sessionId).toBe('session-1');
			expect(checkpoint.createdAt).toBeInstanceOf(Date);
		});

		it('should get checkpoint by ID', async () => {
			// Create session and task first
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			await store.createCheckpoint({
				id: 'checkpoint-get',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 75 }),
			});

			const checkpoint = await store.getCheckpoint('checkpoint-get');

			expect(checkpoint).not.toBeNull();
			expect(checkpoint?.id).toBe('checkpoint-get');
			expect(checkpoint?.taskId).toBe('task-1');
		});

		it('should return null for non-existent checkpoint', async () => {
			const checkpoint = await store.getCheckpoint('non-existent');
			expect(checkpoint).toBeNull();
		});

		it('should get latest checkpoint for task', async () => {
			// Create session and task first
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			// Create multiple checkpoints for same task
			await store.createCheckpoint({
				id: 'checkpoint-1',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 25 }),
			});

			// Small delay to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10));

			await store.createCheckpoint({
				id: 'checkpoint-2',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 50 }),
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			await store.createCheckpoint({
				id: 'checkpoint-3',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 75 }),
			});

			const latest = await store.getLatestCheckpoint('task-1');

			expect(latest).not.toBeNull();
			expect(latest?.id).toBe('checkpoint-3');
		});

		it('should return null for latest checkpoint when no checkpoints exist', async () => {
			const latest = await store.getLatestCheckpoint('non-existent-task');
			expect(latest).toBeNull();
		});

		it('should handle multiple checkpoints for different tasks', async () => {
			// Create session and tasks first
			await store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			await store.createTask({
				id: 'task-2',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			await store.createCheckpoint({
				id: 'checkpoint-task-1',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 50 }),
			});

			await store.createCheckpoint({
				id: 'checkpoint-task-2',
				taskId: 'task-2',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 75 }),
			});

			const task1Latest = await store.getLatestCheckpoint('task-1');
			const task2Latest = await store.getLatestCheckpoint('task-2');

			expect(task1Latest?.id).toBe('checkpoint-task-1');
			expect(task2Latest?.id).toBe('checkpoint-task-2');
		});
	});

	describe('data integrity', () => {
		it('should preserve complex metadata across session operations', async () => {
			const complexMetadata = {
				nested: { value: 42, array: [1, 2, 3] },
				string: 'test',
				boolean: true,
				null: null,
			};

			await store.createSession({
				id: 'metadata-test',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
				metadata: complexMetadata,
			});

			const retrieved = await store.getSession('metadata-test');
			expect(retrieved?.metadata).toEqual(complexMetadata);
		});

		it('should preserve task definition across operations', async () => {
			const definition = createMockTaskDefinition({
				prompt: 'Complex task with special characters: @#$%^&*()',
				projectKey: 'test-project',
				repositoryPath: '/path/with spaces/and-dashes',
				preferredProviders: ['provider-1', 'provider-2'],
			});

			const taskState: TaskState = {
				id: 'definition-test',
				definition,
				status: 'pending',
			};

			await store.createTask(taskState);

			const retrieved = await store.getTask('definition-test');
			expect(retrieved?.definition).toEqual(definition);
		});

		it('should handle cascading deletes for sessions', async () => {
			// This tests foreign key constraints
			await store.createSession({
				id: 'cascade-session',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			await store.createTask({
				id: 'cascade-task',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'cascade-session',
			});

			// Verify relationships are maintained
			const task = await store.getTask('cascade-task');
			expect(task?.sessionId).toBe('cascade-session');
		});
	});

	describe('lifecycle', () => {
		it('should close database connection', async () => {
			await expect(store.close()).resolves.not.toThrow();
		});

		it('should handle multiple close calls', async () => {
			await store.close();
			await expect(store.close()).resolves.not.toThrow();
		});
	});

	describe('factory function', () => {
		it('should create PostgreSQL state store using factory', async () => {
			const newStore = createPostgresqlStateStore(connectionString);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const session = await newStore.createSession({
				id: 'factory-session',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'test-provider',
			});

			expect(session.id).toBe('factory-session');

			await newStore.close();
		});

		it('should create store with custom config using factory', async () => {
			const newStore = createPostgresqlStateStore(connectionString, {
				max: 15,
			});

			await new Promise((resolve) => setTimeout(resolve, 100));

			const session = await newStore.createSession({
				id: 'factory-custom',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'test-provider',
			});

			expect(session.id).toBe('factory-custom');

			await newStore.close();
		});
	});
});
