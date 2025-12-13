/**
 * SQLite State Store Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { TaskState, UsageRecord } from '@dxheroes/ado-shared';
import { createMockTaskDefinition, createMockTaskResult } from '@dxheroes/ado-shared/test-utils';
import { SqliteStateStore, type SessionRecord, type CheckpointRecord } from '../sqlite.js';

describe('SqliteStateStore', () => {
	let tempDir: string;
	let dbPath: string;
	let store: SqliteStateStore;

	beforeEach(() => {
		// Create temporary directory for test database
		tempDir = mkdtempSync(join(tmpdir(), 'ado-test-'));
		dbPath = join(tempDir, 'test.db');
		store = new SqliteStateStore(dbPath);
	});

	afterEach(() => {
		// Clean up
		store.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe('session management', () => {
		it('should create a session', () => {
			const session = store.createSession({
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

		it('should create session with metadata', () => {
			const metadata = { custom: 'value', number: 42 };
			const session = store.createSession({
				id: 'session-2',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
				metadata,
			});

			expect(session.metadata).toEqual(metadata);
		});

		it('should get session by ID', () => {
			store.createSession({
				id: 'session-get',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			const session = store.getSession('session-get');

			expect(session).not.toBeNull();
			expect(session?.id).toBe('session-get');
		});

		it('should return null for non-existent session', () => {
			const session = store.getSession('non-existent');
			expect(session).toBeNull();
		});

		it('should get sessions by project', () => {
			store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createSession({
				id: 'session-2',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'gemini-cli',
			});

			store.createSession({
				id: 'session-3',
				projectId: 'project-2',
				repositoryKey: 'repo-2',
				providerId: 'claude-code',
			});

			const sessions = store.getSessionsByProject('project-1', 'repo-1');

			expect(sessions).toHaveLength(2);
			expect(sessions.map((s) => s.id)).toContain('session-1');
			expect(sessions.map((s) => s.id)).toContain('session-2');
		});

		it('should update session', () => {
			store.createSession({
				id: 'session-update',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			const newMetadata = { updated: true };
			store.updateSession('session-update', {
				providerId: 'gemini-cli',
				metadata: newMetadata,
			});

			const updated = store.getSession('session-update');
			expect(updated?.providerId).toBe('gemini-cli');
			expect(updated?.metadata).toEqual(newMetadata);
		});
	});

	describe('task management', () => {
		it('should create a task', () => {
			const taskState: TaskState = {
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'pending',
			};

			const created = store.createTask(taskState);

			expect(created.id).toBe('task-1');
			expect(created.status).toBe('pending');
		});

		it('should create task with all fields', () => {
			// Create session first for foreign key constraint
			store.createSession({
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

			const created = store.createTask(taskState);

			expect(created.id).toBe('task-full');
			expect(created.status).toBe('completed');
			expect(created.providerId).toBe('claude-code');
			expect(created.sessionId).toBe('session-1');
		});

		it('should get task by ID', () => {
			const taskState: TaskState = {
				id: 'task-get',
				definition: createMockTaskDefinition(),
				status: 'running',
			};

			store.createTask(taskState);

			const task = store.getTask('task-get');

			expect(task).not.toBeNull();
			expect(task?.id).toBe('task-get');
			expect(task?.status).toBe('running');
		});

		it('should return null for non-existent task', () => {
			const task = store.getTask('non-existent');
			expect(task).toBeNull();
		});

		it('should update task status', () => {
			const taskState: TaskState = {
				id: 'task-update',
				definition: createMockTaskDefinition(),
				status: 'pending',
			};

			store.createTask(taskState);

			store.updateTask('task-update', {
				status: 'running',
				startedAt: new Date(),
			});

			const updated = store.getTask('task-update');
			expect(updated?.status).toBe('running');
			expect(updated?.startedAt).toBeInstanceOf(Date);
		});

		it('should update task with completion data', () => {
			const taskState: TaskState = {
				id: 'task-complete',
				definition: createMockTaskDefinition(),
				status: 'running',
			};

			store.createTask(taskState);

			const result = createMockTaskResult();
			store.updateTask('task-complete', {
				status: 'completed',
				completedAt: new Date(),
				result,
			});

			const updated = store.getTask('task-complete');
			expect(updated?.status).toBe('completed');
			expect(updated?.result).toEqual(result);
		});

		it('should update task with error', () => {
			const taskState: TaskState = {
				id: 'task-error',
				definition: createMockTaskDefinition(),
				status: 'running',
			};

			store.createTask(taskState);

			store.updateTask('task-error', {
				status: 'failed',
				error: 'Test error message',
				completedAt: new Date(),
			});

			const updated = store.getTask('task-error');
			expect(updated?.status).toBe('failed');
			expect(updated?.error).toBe('Test error message');
		});

		it('should get tasks by session', () => {
			// Create sessions first
			store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createSession({
				id: 'session-2',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'completed',
				sessionId: 'session-1',
			});

			store.createTask({
				id: 'task-2',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			store.createTask({
				id: 'task-3',
				definition: createMockTaskDefinition(),
				status: 'pending',
				sessionId: 'session-2',
			});

			const tasks = store.getTasksBySession('session-1');

			expect(tasks).toHaveLength(2);
			expect(tasks.map((t) => t.id)).toContain('task-1');
			expect(tasks.map((t) => t.id)).toContain('task-2');
		});

		it('should get tasks by status', () => {
			store.createTask({
				id: 'task-pending-1',
				definition: createMockTaskDefinition(),
				status: 'pending',
			});

			store.createTask({
				id: 'task-pending-2',
				definition: createMockTaskDefinition(),
				status: 'pending',
			});

			store.createTask({
				id: 'task-running',
				definition: createMockTaskDefinition(),
				status: 'running',
			});

			const pendingTasks = store.getTasksByStatus('pending');

			expect(pendingTasks).toHaveLength(2);
			expect(pendingTasks.map((t) => t.id)).toContain('task-pending-1');
			expect(pendingTasks.map((t) => t.id)).toContain('task-pending-2');
		});
	});

	describe('usage tracking', () => {
		it('should record usage', () => {
			const usage: UsageRecord = {
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 500,
			};

			// Should not throw
			expect(() => store.recordUsage(usage)).not.toThrow();
		});

		it('should record usage with cost', () => {
			const usage: UsageRecord = {
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 1000,
				costUsd: 0.05,
			};

			expect(() => store.recordUsage(usage)).not.toThrow();
		});

		it('should get usage by provider', () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: now,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 500,
			});

			store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: now,
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 1000,
				costUsd: 0.05,
			});

			store.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'subscription',
				timestamp: now,
				requestCount: 1,
				inputTokens: 1500,
				outputTokens: 750,
			});

			const claudeUsage = store.getUsageByProvider('claude-code', yesterday);

			expect(claudeUsage).toHaveLength(2);
			expect(claudeUsage.every((u) => u.providerId === 'claude-code')).toBe(true);
		});

		it('should filter usage by timestamp', () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

			store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: twoDaysAgo,
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 250,
			});

			store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: yesterday,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 500,
			});

			const recentUsage = store.getUsageByProvider('claude-code', yesterday);

			expect(recentUsage).toHaveLength(1);
			expect(recentUsage[0]?.inputTokens).toBe(1000);
		});

		it('should get total usage', () => {
			const now = new Date();

			store.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: now,
				requestCount: 2,
				inputTokens: 1000,
				outputTokens: 500,
			});

			store.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'api',
				timestamp: now,
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 1000,
				costUsd: 0.05,
			});

			const total = store.getTotalUsage(new Date(now.getTime() - 1000));

			expect(total.requests).toBe(3);
			expect(total.tokens).toBe(4500); // 1000 + 500 + 2000 + 1000
			expect(total.cost).toBeCloseTo(0.05, 2);
		});

		it('should return zero for total usage with no records', () => {
			const total = store.getTotalUsage(new Date());

			expect(total.requests).toBe(0);
			expect(total.tokens).toBe(0);
			expect(total.cost).toBe(0);
		});
	});

	describe('checkpoint management', () => {
		it('should create a checkpoint', () => {
			// Create session and task first for foreign key constraints
			store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			const checkpoint = store.createCheckpoint({
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

		it('should get checkpoint by ID', () => {
			// Create session and task first
			store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			store.createCheckpoint({
				id: 'checkpoint-get',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 75 }),
			});

			const checkpoint = store.getCheckpoint('checkpoint-get');

			expect(checkpoint).not.toBeNull();
			expect(checkpoint?.id).toBe('checkpoint-get');
			expect(checkpoint?.taskId).toBe('task-1');
		});

		it('should return null for non-existent checkpoint', () => {
			const checkpoint = store.getCheckpoint('non-existent');
			expect(checkpoint).toBeNull();
		});

		it('should get latest checkpoint for task', async () => {
			// Create session and task first
			store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			// Create multiple checkpoints for same task
			store.createCheckpoint({
				id: 'checkpoint-1',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 25 }),
			});

			// Small delay to ensure different timestamps
			const delay = () => new Promise((resolve) => setTimeout(resolve, 10));
			await delay();

			store.createCheckpoint({
				id: 'checkpoint-2',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 50 }),
			});

			await delay();

			store.createCheckpoint({
				id: 'checkpoint-3',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 75 }),
			});

			const latest = store.getLatestCheckpoint('task-1');

			expect(latest).not.toBeNull();
			expect(latest?.id).toBe('checkpoint-3');
		});

		it('should return null for latest checkpoint when no checkpoints exist', () => {
			const latest = store.getLatestCheckpoint('non-existent-task');
			expect(latest).toBeNull();
		});

		it('should handle multiple checkpoints for different tasks', () => {
			// Create session and tasks first
			store.createSession({
				id: 'session-1',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
			});

			store.createTask({
				id: 'task-1',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			store.createTask({
				id: 'task-2',
				definition: createMockTaskDefinition(),
				status: 'running',
				sessionId: 'session-1',
			});

			store.createCheckpoint({
				id: 'checkpoint-task-1',
				taskId: 'task-1',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 50 }),
			});

			store.createCheckpoint({
				id: 'checkpoint-task-2',
				taskId: 'task-2',
				sessionId: 'session-1',
				state: JSON.stringify({ progress: 75 }),
			});

			const task1Latest = store.getLatestCheckpoint('task-1');
			const task2Latest = store.getLatestCheckpoint('task-2');

			expect(task1Latest?.id).toBe('checkpoint-task-1');
			expect(task2Latest?.id).toBe('checkpoint-task-2');
		});
	});

	describe('lifecycle', () => {
		it('should close database connection', () => {
			// Should not throw
			expect(() => store.close()).not.toThrow();
		});

		it('should create database directory if it does not exist', () => {
			const nestedPath = join(tempDir, 'nested', 'directory', 'test.db');
			const nestedStore = new SqliteStateStore(nestedPath);

			expect(nestedStore).toBeDefined();

			// Should be able to create session
			const session = nestedStore.createSession({
				id: 'test-session',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'test-provider',
			});

			expect(session.id).toBe('test-session');

			nestedStore.close();
		});
	});

	describe('data integrity', () => {
		it('should preserve complex metadata across session operations', () => {
			const complexMetadata = {
				nested: { value: 42, array: [1, 2, 3] },
				string: 'test',
				boolean: true,
				null: null,
			};

			store.createSession({
				id: 'metadata-test',
				projectId: 'project-1',
				repositoryKey: 'repo-1',
				providerId: 'claude-code',
				metadata: complexMetadata,
			});

			const retrieved = store.getSession('metadata-test');
			expect(retrieved?.metadata).toEqual(complexMetadata);
		});

		it('should preserve task definition across operations', () => {
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

			store.createTask(taskState);

			const retrieved = store.getTask('definition-test');
			expect(retrieved?.definition).toEqual(definition);
		});

		it('should handle empty update gracefully', () => {
			const taskState: TaskState = {
				id: 'empty-update',
				definition: createMockTaskDefinition(),
				status: 'pending',
			};

			store.createTask(taskState);

			// Empty update should not throw
			expect(() => store.updateTask('empty-update', {})).not.toThrow();

			const retrieved = store.getTask('empty-update');
			expect(retrieved?.status).toBe('pending');
		});
	});
});
