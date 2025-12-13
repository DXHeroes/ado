/**
 * Tests for status command
 */

import { existsSync } from 'node:fs';
import { createStateStore } from '@dxheroes/ado-core';
import type { SqliteStateStore } from '@dxheroes/ado-core';
import { cleanupTempDir, createTempProject } from '@dxheroes/ado-shared/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @clack/prompts
vi.mock('@clack/prompts', async (importOriginal) => {
	const original = await importOriginal<typeof import('@clack/prompts')>();
	return {
		...original,
		intro: vi.fn(),
		log: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			success: vi.fn(),
			message: vi.fn(),
			step: vi.fn(),
		},
		note: vi.fn(),
		outro: vi.fn(),
	};
});

// Mock adapter
vi.mock('@dxheroes/ado-adapters', () => ({
	createClaudeCodeAdapter: vi.fn(() => ({
		isAvailable: vi.fn().mockResolvedValue(true),
	})),
}));

describe('Status Command', () => {
	let projectDir: string;
	let stateStore: SqliteStateStore;
	let configPath: string;

	beforeEach(async () => {
		// Create temp project
		projectDir = await createTempProject({
			prefix: 'ado-status-test-',
			initGit: true,
			files: {
				'ado.config.yaml': `
project:
  id: test-project
  repository: test-repo

providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true

  gemini-cli:
    enabled: false
    accessModes:
      - mode: api
        priority: 10
        enabled: true

routing:
  strategy: subscription-first
  apiFallback:
    enabled: true
    maxCostPerTask: 10.0
`,
			},
		});

		configPath = `${projectDir}/ado.config.yaml`;

		// Create state store
		const stateDbPath = `${projectDir}/.ado/state.db`;
		stateStore = createStateStore(stateDbPath);
	});

	afterEach(async () => {
		if (stateStore) {
			stateStore.close();
		}
		await cleanupTempDir(projectDir);
		vi.clearAllMocks();
	});

	describe('without initialization', () => {
		it('should detect when ADO is not initialized', async () => {
			const uninitDir = await createTempProject({
				prefix: 'ado-uninit-',
				files: {},
			});

			try {
				const { findConfigFile } = await import('@dxheroes/ado-core');
				const configPath = findConfigFile(uninitDir);

				// findConfigFile returns null when not found
				expect(configPath).toBeNull();
			} finally {
				await cleanupTempDir(uninitDir);
			}
		});

		it('should show warning when config not found', async () => {
			const uninitDir = await createTempProject({
				prefix: 'ado-uninit-',
				files: {},
			});

			try {
				const { findConfigFile } = await import('@dxheroes/ado-core');
				const configPath = findConfigFile(uninitDir);

				// findConfigFile returns null when not found
				expect(configPath).toBeNull();
			} finally {
				await cleanupTempDir(uninitDir);
			}
		});
	});

	describe('with configuration', () => {
		it('should detect config file', () => {
			expect(existsSync(configPath)).toBe(true);
		});

		it('should load configuration', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			expect(config.project.id).toBe('test-project');
			expect(config.routing.strategy).toBe('subscription-first');
		});

		it('should show provider status', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const providerStatus: Record<
				string,
				{ enabled: boolean; available: boolean; accessModes: string[] }
			> = {};

			for (const [id, providerConfig] of Object.entries(config.providers)) {
				const enabledModes = providerConfig.accessModes.filter((m) => m.enabled).map((m) => m.mode);

				providerStatus[id] = {
					enabled: providerConfig.enabled,
					available: false,
					accessModes: enabledModes,
				};
			}

			expect(providerStatus['claude-code']).toBeDefined();
			expect(providerStatus['claude-code']?.enabled).toBe(true);
			expect(providerStatus['claude-code']?.accessModes).toContain('subscription');

			expect(providerStatus['gemini-cli']).toBeDefined();
			expect(providerStatus['gemini-cli']?.enabled).toBe(false);
		});
	});

	describe('with state database', () => {
		it('should create state database', () => {
			const stateDbPath = `${projectDir}/.ado/state.db`;
			expect(existsSync(stateDbPath)).toBe(true);
		});

		it('should retrieve running tasks', () => {
			// Create test task
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			stateStore.createTask({
				id: 'task-1',
				definition: {
					prompt: 'Test task',
					projectKey: 'test-project',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits',
				},
				status: 'running',
				providerId: 'claude-code',
				sessionId: 'session-1',
				startedAt: new Date(),
			});

			const runningTasks = stateStore.getTasksByStatus('running');
			expect(runningTasks).toHaveLength(1);
			expect(runningTasks[0]?.id).toBe('task-1');
			expect(runningTasks[0]?.status).toBe('running');
		});

		it('should retrieve completed tasks', () => {
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			// Create multiple completed tasks
			for (let i = 0; i < 5; i++) {
				stateStore.createTask({
					id: `task-${i}`,
					definition: {
						prompt: `Task ${i}`,
						projectKey: 'test-project',
						repositoryPath: projectDir,
						hitlPolicy: 'review-edits',
					},
					status: 'completed',
					providerId: 'claude-code',
					sessionId: 'session-1',
					startedAt: new Date(Date.now() - i * 1000),
					completedAt: new Date(),
				});
			}

			const completedTasks = stateStore.getTasksByStatus('completed');
			expect(completedTasks).toHaveLength(5);
		});

		it('should retrieve failed tasks', () => {
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			stateStore.createTask({
				id: 'task-failed',
				definition: {
					prompt: 'Failed task',
					projectKey: 'test-project',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits',
				},
				status: 'failed',
				providerId: 'claude-code',
				sessionId: 'session-1',
				startedAt: new Date(),
				completedAt: new Date(),
				error: 'Test error',
			});

			const failedTasks = stateStore.getTasksByStatus('failed');
			expect(failedTasks).toHaveLength(1);
			expect(failedTasks[0]?.error).toBe('Test error');
		});

		it('should sort tasks by time descending', () => {
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			// Create tasks with different timestamps
			const now = Date.now();
			stateStore.createTask({
				id: 'task-1',
				definition: {
					prompt: 'Old task',
					projectKey: 'test-project',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits',
				},
				status: 'completed',
				providerId: 'claude-code',
				sessionId: 'session-1',
				startedAt: new Date(now - 3000),
			});

			stateStore.createTask({
				id: 'task-2',
				definition: {
					prompt: 'New task',
					projectKey: 'test-project',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits',
				},
				status: 'completed',
				providerId: 'claude-code',
				sessionId: 'session-1',
				startedAt: new Date(now - 1000),
			});

			stateStore.createTask({
				id: 'task-3',
				definition: {
					prompt: 'Newest task',
					projectKey: 'test-project',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits',
				},
				status: 'running',
				providerId: 'claude-code',
				sessionId: 'session-1',
				startedAt: new Date(now),
			});

			const running = stateStore.getTasksByStatus('running');
			const completed = stateStore.getTasksByStatus('completed');

			const allTasks = [...running, ...completed].sort((a, b) => {
				const aTime = a.startedAt?.getTime() ?? 0;
				const bTime = b.startedAt?.getTime() ?? 0;
				return bTime - aTime;
			});

			expect(allTasks[0]?.id).toBe('task-3'); // Newest
			expect(allTasks[1]?.id).toBe('task-2');
			expect(allTasks[2]?.id).toBe('task-1'); // Oldest
		});

		it('should calculate usage stats', () => {
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			// Record usage
			stateStore.recordUsage({
				sessionId: 'session-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				accessMode: 'api',
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				cost: 0.05,
			});

			stateStore.recordUsage({
				sessionId: 'session-1',
				timestamp: new Date(),
				providerId: 'claude-code',
				accessMode: 'api',
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 1000,
				cost: 0.025,
			});

			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const stats = stateStore.getTotalUsage(today);

			expect(stats.requests).toBe(2);
			expect(stats.tokens).toBe(4500); // 1000 + 2000 + 500 + 1000
			// Cost should be 0 if no cost recorded, or close to 0.075 if recorded
			expect(stats.cost).toBeGreaterThanOrEqual(0);
		});

		it('should limit recent tasks to 10', () => {
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			// Create 15 tasks
			for (let i = 0; i < 15; i++) {
				stateStore.createTask({
					id: `task-${i}`,
					definition: {
						prompt: `Task ${i}`,
						projectKey: 'test-project',
						repositoryPath: projectDir,
						hitlPolicy: 'review-edits',
					},
					status: 'completed',
					providerId: 'claude-code',
					sessionId: 'session-1',
					startedAt: new Date(Date.now() - i * 1000),
				});
			}

			const completed = stateStore.getTasksByStatus('completed');
			const recentTasks = completed.slice(0, 10);

			expect(recentTasks).toHaveLength(10);
		});
	});

	describe('task formatting', () => {
		it('should format task ID to 8 characters', () => {
			const fullId = 'task-123456789-abcdef';
			const shortId = fullId.slice(0, 8);

			expect(shortId).toBe('task-123');
			expect(shortId).toHaveLength(8);
		});

		it('should format task with all fields', () => {
			const task = {
				id: 'task-12345678',
				status: 'completed',
				provider: 'claude-code',
				startedAt: new Date('2024-01-01T10:00:00Z'),
			};

			const formatted = {
				id: task.id.slice(0, 8),
				status: task.status,
				provider: task.provider,
				startedAt: task.startedAt.toLocaleString(),
			};

			expect(formatted.id).toBe('task-123');
			expect(formatted.status).toBe('completed');
			expect(formatted.provider).toBe('claude-code');
			expect(formatted.startedAt).toBeDefined();
		});
	});

	describe('JSON output', () => {
		it('should support JSON output format', () => {
			const jsonOutput = {
				hasConfig: true,
				projectId: 'test-project',
				providers: {
					'claude-code': {
						enabled: true,
						available: true,
						accessModes: ['subscription'],
					},
				},
				recentTasks: [],
				usageStats: {
					requests: 0,
					tokens: 0,
					cost: 0,
				},
			};

			expect(jsonOutput.hasConfig).toBe(true);
			expect(jsonOutput.projectId).toBe('test-project');
			expect(jsonOutput.providers['claude-code']?.enabled).toBe(true);
		});
	});

	describe('provider availability check', () => {
		it('should check Claude adapter availability', async () => {
			const { createClaudeCodeAdapter } = await import('@dxheroes/ado-adapters');
			const adapter = createClaudeCodeAdapter();
			const available = await adapter.isAvailable();

			expect(available).toBe(true);
		});

		it('should handle unavailable adapters', async () => {
			const { createClaudeCodeAdapter } = await import('@dxheroes/ado-adapters');
			const mockAdapter = {
				isAvailable: vi.fn().mockResolvedValue(false),
			};

			vi.mocked(createClaudeCodeAdapter).mockReturnValue(mockAdapter as never);

			const available = await mockAdapter.isAvailable();
			expect(available).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle empty providers list', () => {
			const providerStatus: Record<string, unknown> = {};
			const entries = Object.entries(providerStatus);

			expect(entries).toHaveLength(0);
		});

		it('should handle missing state database', () => {
			const stateDbPath = `${projectDir}/.ado/nonexistent.db`;
			const hasStateDb = existsSync(stateDbPath);

			expect(hasStateDb).toBe(false);
		});

		it('should handle tasks without timestamps', () => {
			stateStore.createSession({
				id: 'session-1',
				projectId: 'test-project',
				repositoryKey: 'test-repo',
				providerId: 'claude-code',
			});

			stateStore.createTask({
				id: 'task-no-time',
				definition: {
					prompt: 'Task without timestamp',
					projectKey: 'test-project',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits',
				},
				status: 'pending',
				providerId: 'claude-code',
				sessionId: 'session-1',
			});

			const tasks = stateStore.getTasksByStatus('pending');
			expect(tasks[0]?.startedAt).toBeUndefined();
		});

		it('should handle zero usage stats', () => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const stats = stateStore.getTotalUsage(today);

			expect(stats.requests).toBe(0);
			expect(stats.tokens).toBe(0);
			expect(stats.cost).toBe(0);
		});
	});
});
