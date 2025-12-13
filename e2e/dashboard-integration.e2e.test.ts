/**
 * E2E test for dashboard integration with real data
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SqliteStateStore } from '../packages/core/src/state/sqlite.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

describe('Dashboard Integration E2E', () => {
	const testDir = join(process.cwd(), 'tmp', 'e2e-dashboard');
	const dbPath = join(testDir, 'dashboard-test.db');
	let stateStore: SqliteStateStore;

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

	it('should create and retrieve session data for dashboard', () => {
		// Create test session
		const session = stateStore.createSession({
			id: 'dashboard-session-1',
			projectId: 'test-project',
			repositoryKey: 'test-repo',
			providerId: 'claude-code',
			metadata: {
				userName: 'Test User',
				branch: 'main',
			},
		});

		expect(session).toBeDefined();
		expect(session.id).toBe('dashboard-session-1');

		// Retrieve session
		const retrieved = stateStore.getSession(session.id);
		expect(retrieved).toBeDefined();
		expect(retrieved?.metadata).toEqual({
			userName: 'Test User',
			branch: 'main',
		});
	});

	it('should create tasks with full data for dashboard display', () => {
		// Create session first
		const session = stateStore.createSession({
			id: 'dashboard-session-2',
			projectId: 'test-project',
			repositoryKey: 'test-repo',
			providerId: 'claude-code',
		});

		// Create tasks with various statuses
		const tasks = [
			{
				id: 'task-completed',
				definition: {
					id: 'task-completed',
					type: 'code-generation' as const,
					prompt: 'Completed task',
					dependencies: [],
					priority: 1,
				},
				status: 'completed' as const,
				sessionId: session.id,
			},
			{
				id: 'task-running',
				definition: {
					id: 'task-running',
					type: 'code-review' as const,
					prompt: 'Running task',
					dependencies: [],
					priority: 2,
				},
				status: 'running' as const,
				sessionId: session.id,
			},
			{
				id: 'task-failed',
				definition: {
					id: 'task-failed',
					type: 'refactoring' as const,
					prompt: 'Failed task',
					dependencies: [],
					priority: 3,
				},
				status: 'failed' as const,
				sessionId: session.id,
			},
		];

		for (const task of tasks) {
			stateStore.createTask(task);
		}

		// Verify tasks can be retrieved by status (for dashboard)
		const completedTasks = stateStore.getTasksByStatus('completed');
		const runningTasks = stateStore.getTasksByStatus('running');
		const failedTasks = stateStore.getTasksByStatus('failed');

		expect(completedTasks).toHaveLength(1);
		expect(runningTasks).toHaveLength(1);
		expect(failedTasks).toHaveLength(1);

		expect(completedTasks[0]?.id).toBe('task-completed');
		expect(runningTasks[0]?.id).toBe('task-running');
		expect(failedTasks[0]?.id).toBe('task-failed');
	});

	it('should record and retrieve usage data for dashboard metrics', () => {
		// Record usage for multiple providers
		const usageRecords = [
			{
				providerId: 'claude-code',
				model: 'claude-sonnet-4-5',
				tokens: 1000,
				cost: 0.015,
				timestamp: new Date('2025-01-01T10:00:00Z'),
			},
			{
				providerId: 'gemini-cli',
				model: 'gemini-2.0-flash-exp',
				tokens: 2000,
				cost: 0.008,
				timestamp: new Date('2025-01-01T11:00:00Z'),
			},
			{
				providerId: 'claude-code',
				model: 'claude-sonnet-4-5',
				tokens: 500,
				cost: 0.0075,
				timestamp: new Date('2025-01-01T12:00:00Z'),
			},
		];

		for (const record of usageRecords) {
			stateStore.recordUsage(record);
		}

		// Get usage by provider (for dashboard charts)
		const claudeUsage = stateStore.getUsageByProvider('claude-code');
		const geminiUsage = stateStore.getUsageByProvider('gemini-cli');

		expect(claudeUsage.length).toBeGreaterThanOrEqual(2);
		expect(geminiUsage).toHaveLength(1);

		// Get total usage
		const totalUsage = stateStore.getTotalUsage();
		expect(totalUsage.requests).toBe(3);
		expect(totalUsage.tokens).toBe(3500);
		expect(totalUsage.cost).toBeCloseTo(0.0305, 4);
	});

	it('should create checkpoints for task history display', () => {
		// Create session and task
		const session = stateStore.createSession({
			id: 'checkpoint-session',
			projectId: 'test-project',
			repositoryKey: 'test-repo',
			providerId: 'claude-code',
		});

		const task = stateStore.createTask({
			id: 'checkpoint-task',
			definition: {
				id: 'checkpoint-task',
				type: 'code-generation',
				prompt: 'Task with checkpoints',
				dependencies: [],
				priority: 1,
			},
			status: 'running',
			sessionId: session.id,
		});

		// Create multiple checkpoints
		const checkpoints = [
			{
				id: 'cp-1',
				taskId: task.id,
				sessionId: session.id,
				state: JSON.stringify({ step: 1, progress: 25 }),
			},
			{
				id: 'cp-2',
				taskId: task.id,
				sessionId: session.id,
				state: JSON.stringify({ step: 2, progress: 50 }),
			},
			{
				id: 'cp-3',
				taskId: task.id,
				sessionId: session.id,
				state: JSON.stringify({ step: 3, progress: 75 }),
			},
		];

		for (const cp of checkpoints) {
			stateStore.createCheckpoint(cp);
		}

		// Verify latest checkpoint retrieval (for dashboard task detail)
		const latest = stateStore.getLatestCheckpoint(task.id);
		expect(latest).toBeDefined();
		expect(latest?.id).toBe('cp-3');

		const state = JSON.parse(latest?.state ?? '{}');
		expect(state.progress).toBe(75);
	});

	it('should handle session listing for dashboard overview', () => {
		// Create multiple sessions
		for (let i = 1; i <= 5; i++) {
			stateStore.createSession({
				id: `session-${i}`,
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: i % 2 === 0 ? 'claude-code' : 'gemini-cli',
			});
		}

		// Get sessions by project (for dashboard)
		const sessions = stateStore.getSessionsByProject('test-project');
		expect(sessions.length).toBeGreaterThanOrEqual(5);

		// Verify provider distribution
		const claudeSessions = sessions.filter((s) => s.providerId === 'claude-code');
		const geminiSessions = sessions.filter((s) => s.providerId === 'gemini-cli');

		expect(claudeSessions.length).toBeGreaterThan(0);
		expect(geminiSessions.length).toBeGreaterThan(0);
	});
});
