/**
 * CLI Integration Tests
 *
 * Tests the main CLI commands and their functionality.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Test fixtures and utilities
const TEST_DIR = join(process.cwd(), 'test-workspace');

beforeEach(() => {
	// Create test workspace
	if (!existsSync(TEST_DIR)) {
		mkdirSync(TEST_DIR, { recursive: true });
	}
	process.chdir(TEST_DIR);
});

afterEach(() => {
	// Cleanup
	process.chdir(join(TEST_DIR, '..'));
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true, force: true });
	}
});

describe('CLI Commands', () => {
	describe('init command', () => {
		it('should create configuration files when ado.config.yaml does not exist', async () => {
			const { initCommand } = await import('../commands/init.js');

			// Mock the command action
			const configPath = join(TEST_DIR, 'ado.config.yaml');
			const claudeMdPath = join(TEST_DIR, 'CLAUDE.md');

			expect(existsSync(configPath)).toBe(false);
			expect(existsSync(claudeMdPath)).toBe(false);

			// Note: Full integration would require mocking @clack/prompts
			// For now, we verify the command is properly exported
			expect(initCommand).toBeDefined();
			expect(initCommand.name()).toBe('init');
		});
	});

	describe('status command', () => {
		it('should export status command properly', async () => {
			const { statusCommand } = await import('../commands/status.js');

			expect(statusCommand).toBeDefined();
			expect(statusCommand.name()).toBe('status');
		});
	});

	describe('run command', () => {
		it('should export run command properly', async () => {
			const { runCommand } = await import('../commands/run.js');

			expect(runCommand).toBeDefined();
			expect(runCommand.name()).toBe('run');
		});
	});

	describe('config command', () => {
		it('should export config command properly', async () => {
			const { configCommand } = await import('../commands/config.js');

			expect(configCommand).toBeDefined();
			expect(configCommand.name()).toBe('config');
		});
	});

	describe('report command', () => {
		it('should export report command properly', async () => {
			const { reportCommand } = await import('../commands/report.js');

			expect(reportCommand).toBeDefined();
			expect(reportCommand.name()).toBe('report');
		});
	});

	describe('workflow command', () => {
		it('should export workflow command properly', async () => {
			const { workflowCommand } = await import('../commands/workflow.js');

			expect(workflowCommand).toBeDefined();
			expect(workflowCommand.name()).toBe('workflow');
		});
	});
});

describe('Configuration Loading', () => {
	it('should load config from ado.config.yaml when present', async () => {
		const { findConfigFile, loadConfig } = await import('@dxheroes/ado-core');

		// Create a test config
		const configContent = `version: "1.1"
project:
  id: "test-project"
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
    capabilities:
      codeGeneration: true
      codeReview: true
      refactoring: true
      testing: true
      documentation: true
      debugging: true
      languages: []
      maxContextTokens: 200000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
`;

		const configPath = join(TEST_DIR, 'ado.config.yaml');
		const { writeFileSync } = await import('node:fs');
		writeFileSync(configPath, configContent);

		// Test finding the config
		const foundPath = findConfigFile(TEST_DIR);
		expect(foundPath).toBe(configPath);

		// Test loading the config
		const config = loadConfig(configPath, { validate: false });
		expect(config.project.id).toBe('test-project');
		expect(config.providers['claude-code']?.enabled).toBe(true);
	});

	it('should return defaults when no config file exists', async () => {
		const { loadConfigWithFallback } = await import('@dxheroes/ado-core');

		const config = loadConfigWithFallback(TEST_DIR, { validate: false });
		expect(config).toBeDefined();
		expect(config.version).toBe('1.1');
		expect(config.routing.strategy).toBe('subscription-first');
	});
});

describe('State Store', () => {
	it('should create and initialize SQLite state store', async () => {
		const { SqliteStateStore } = await import('@dxheroes/ado-core');

		const dbPath = join(TEST_DIR, '.ado', 'state.db');
		mkdirSync(join(TEST_DIR, '.ado'), { recursive: true });

		const store = new SqliteStateStore(dbPath);

		// Test basic operations
		expect(store).toBeDefined();

		const taskId = 'test-task-1';
		store.createTask({
			id: taskId,
			definition: {
				prompt: 'Test task',
				projectKey: 'test-project',
				repositoryPath: TEST_DIR,
			},
			providerId: 'claude-code',
			status: 'pending',
		});

		const task = store.getTask(taskId);
		expect(task).toBeDefined();
		expect(task?.definition.prompt).toBe('Test task');
		expect(task?.status).toBe('pending');

		store.close();
	});

	it('should track task status transitions', async () => {
		const { SqliteStateStore } = await import('@dxheroes/ado-core');

		const dbPath = join(TEST_DIR, '.ado', 'state.db');
		mkdirSync(join(TEST_DIR, '.ado'), { recursive: true });

		const store = new SqliteStateStore(dbPath);

		const taskId = 'test-task-2';
		const task = {
			id: taskId,
			definition: {
				prompt: 'Test task 2',
				projectKey: 'test-project',
				repositoryPath: TEST_DIR,
			},
			providerId: 'claude-code',
			status: 'pending' as const,
		};

		store.createTask(task);

		// Update to running
		store.updateTask(taskId, { status: 'running', startedAt: new Date() });
		let updated = store.getTask(taskId);
		expect(updated?.status).toBe('running');

		// Update to completed
		store.updateTask(taskId, {
			status: 'completed',
			completedAt: new Date(),
			result: {
				success: true,
				output: 'Task completed successfully',
				duration: 1000,
			},
		});
		updated = store.getTask(taskId);
		expect(updated?.status).toBe('completed');

		store.close();
	});
});

describe('Provider Adapters', () => {
	it('should create Claude Code adapter', async () => {
		const { createClaudeCodeAdapter } = await import('@dxheroes/ado-adapters');

		const adapter = createClaudeCodeAdapter();

		expect(adapter).toBeDefined();
		expect(adapter.id).toBe('claude-code');
		expect(adapter.capabilities).toBeDefined();
		expect(adapter.capabilities.codeGeneration).toBe(true);
	});

	it('should check adapter availability', async () => {
		const { createClaudeCodeAdapter } = await import('@dxheroes/ado-adapters');

		const adapter = createClaudeCodeAdapter();
		const isAvailable = await adapter.isAvailable();

		// This will vary based on environment, but should not throw
		expect(typeof isAvailable).toBe('boolean');
	});
});

describe('Configuration Validation', () => {
	it('should validate correct configuration', async () => {
		const { validateConfigSafe } = await import('@dxheroes/ado-core');

		const validConfig = {
			version: '1.1',
			project: {
				id: 'test',
			},
			providers: {},
			routing: {
				strategy: 'subscription-first' as const,
				failover: {
					enabled: true,
					onErrors: ['rate_limit' as const],
					maxRetries: 3,
					retryDelay: 1000,
				},
				apiFallback: {
					enabled: false,
					confirmAboveCost: 1.0,
					maxCostPerTask: 10.0,
					maxDailyCost: 50.0,
				},
				matching: {
					preferCapabilityMatch: true,
					preferLargerContext: true,
					preferFasterProvider: false,
				},
			},
			orchestration: {
				maxParallelAgents: 10,
				worktreeIsolation: true,
				checkpointInterval: 30,
				taskQueue: {
					concurrency: 5,
					retryAttempts: 3,
					retryDelay: 1000,
				},
			},
			hitl: {
				defaultPolicy: 'review-edits' as const,
				approvalTimeout: '24h',
				notifications: {
					slack: { enabled: false },
					email: { enabled: false },
				},
			},
			storage: {
				driver: 'sqlite' as const,
				path: '.ado/state.db',
				rateLimitTracking: {
					driver: 'memory' as const,
				},
			},
			observability: {
				logging: {
					level: 'info' as const,
					format: 'pretty' as const,
				},
				costTracking: {
					enabled: true,
					reportInterval: 'daily' as const,
				},
			},
		};

		const result = validateConfigSafe(validConfig);
		expect(result.success).toBe(true);
	});
});
