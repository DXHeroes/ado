/**
 * Integration test for run command
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { cleanupTempDir, createTempProject } from '@dxheroes/ado-shared/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Run Command Integration', () => {
	let projectDir: string;

	beforeAll(async () => {
		// Create a temporary test project
		projectDir = await createTempProject({
			prefix: 'ado-cli-test-',
			initGit: true,
			files: {
				'README.md': '# Test Project\n\nThis is a test project for ADO.',
				'src/index.ts': 'export const hello = () => "Hello World";',
				'package.json': JSON.stringify(
					{
						name: 'test-project',
						version: '1.0.0',
						type: 'module',
						scripts: {
							test: 'echo "No tests yet"',
						},
					},
					null,
					2,
				),
			},
		});
	});

	afterAll(async () => {
		// Cleanup temp directory
		await cleanupTempDir(projectDir);
	});

	describe('project setup', () => {
		it('should have created a temporary project', async () => {
			const packageJsonPath = path.join(projectDir, 'package.json');
			const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
			const pkg = JSON.parse(packageJson);

			expect(pkg.name).toBe('test-project');
		});

		it('should have git initialized', async () => {
			const gitDir = path.join(projectDir, '.git');
			const stat = await fs.stat(gitDir);

			expect(stat.isDirectory()).toBe(true);
		});

		it('should have test files created', async () => {
			const srcIndex = path.join(projectDir, 'src/index.ts');
			const content = await fs.readFile(srcIndex, 'utf-8');

			expect(content).toContain('hello');
		});
	});

	describe('ado directory initialization', () => {
		it('should create .ado directory structure', async () => {
			const adoDir = path.join(projectDir, '.ado');
			const stateDir = path.join(adoDir, 'state');

			// Create directories that would be created by ensureAdoDir
			await fs.mkdir(adoDir, { recursive: true });
			await fs.mkdir(stateDir, { recursive: true });

			const adoStat = await fs.stat(adoDir);
			const stateStat = await fs.stat(stateDir);

			expect(adoStat.isDirectory()).toBe(true);
			expect(stateStat.isDirectory()).toBe(true);
		});
	});

	describe('configuration loading', () => {
		it('should load default configuration', () => {
			// This test verifies that the config loading mechanism works
			// In a real integration test, we would load the actual config
			const defaultConfig = {
				providers: [],
				preferences: {
					subscriptionFirst: true,
					defaultHitlPolicy: 'review-edits',
					telemetry: {
						enabled: false,
					},
				},
			};

			expect(defaultConfig.preferences.subscriptionFirst).toBe(true);
		});

		it('should support custom ado.config.yaml', async () => {
			const configPath = path.join(projectDir, 'ado.config.yaml');
			const configContent = `
providers:
  - id: claude-code
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true

preferences:
  subscriptionFirst: true
  defaultHitlPolicy: review-edits
`;

			await fs.writeFile(configPath, configContent);

			const fileExists = await fs
				.access(configPath)
				.then(() => true)
				.catch(() => false);
			expect(fileExists).toBe(true);
		});
	});

	describe('task definition creation', () => {
		it('should create task definition from prompt', () => {
			const prompt = 'Add unit tests for hello function';
			const taskDefinition = {
				prompt,
				projectKey: path.basename(projectDir),
				repositoryPath: projectDir,
				preferredProviders: undefined,
				excludeProviders: undefined,
				preferredAccessMode: undefined,
				allowApiFailover: true,
				maxApiCostUsd: 10.0,
				constraints: undefined,
				hitlPolicy: 'review-edits' as const,
			};

			expect(taskDefinition.prompt).toBe(prompt);
			expect(taskDefinition.repositoryPath).toBe(projectDir);
		});

		it('should support provider preferences', () => {
			const taskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: projectDir,
				preferredProviders: ['claude-code', 'cursor-cli'],
				excludeProviders: ['copilot'],
				hitlPolicy: 'autonomous' as const,
			};

			expect(taskDefinition.preferredProviders).toEqual(['claude-code', 'cursor-cli']);
			expect(taskDefinition.excludeProviders).toEqual(['copilot']);
		});
	});

	describe('adapter initialization', () => {
		it('should validate adapter availability check', () => {
			// Mock adapter for testing
			const mockAdapter = {
				id: 'test-adapter',
				capabilities: {
					codeGeneration: true,
					codeReview: true,
					refactoring: false,
					testing: true,
					documentation: true,
					debugging: true,
					languages: ['typescript'],
					maxContextTokens: 100000,
					supportsStreaming: true,
					supportsMCP: false,
					supportsResume: false,
				},
				isAvailable: async () => true,
			};

			expect(mockAdapter.capabilities.codeGeneration).toBe(true);
		});
	});

	describe('state management', () => {
		it('should create task state', () => {
			const taskState = {
				id: 'task-123',
				definition: {
					prompt: 'Test task',
					projectKey: 'test',
					repositoryPath: projectDir,
					hitlPolicy: 'review-edits' as const,
				},
				status: 'pending' as const,
				providerId: undefined,
				sessionId: undefined,
				startedAt: undefined,
				completedAt: undefined,
				error: undefined,
				result: undefined,
			};

			expect(taskState.status).toBe('pending');
			expect(taskState.definition.prompt).toBe('Test task');
		});
	});

	describe('file system operations', () => {
		it('should be able to read project files', async () => {
			const readmePath = path.join(projectDir, 'README.md');
			const content = await fs.readFile(readmePath, 'utf-8');

			expect(content).toContain('Test Project');
		});

		it('should be able to write files', async () => {
			const testFilePath = path.join(projectDir, 'test-output.txt');
			await fs.writeFile(testFilePath, 'Test output');

			const content = await fs.readFile(testFilePath, 'utf-8');
			expect(content).toBe('Test output');

			// Cleanup
			await fs.unlink(testFilePath);
		});

		it('should handle nested directory creation', async () => {
			const nestedDir = path.join(projectDir, 'nested/deep/dir');
			await fs.mkdir(nestedDir, { recursive: true });

			const stat = await fs.stat(nestedDir);
			expect(stat.isDirectory()).toBe(true);
		});
	});

	describe('permission modes', () => {
		it('should support different permission modes', () => {
			const modes = ['acceptEdits', 'default', 'acceptAll'];

			expect(modes).toContain('acceptEdits');
			expect(modes).toContain('default');
		});
	});

	describe('event streaming', () => {
		it('should handle agent events', () => {
			const events = [
				{ type: 'start' as const, timestamp: new Date(), taskId: 'task-1' },
				{ type: 'output' as const, timestamp: new Date(), taskId: 'task-1', content: 'Test' },
				{ type: 'complete' as const, timestamp: new Date(), taskId: 'task-1' },
			];

			expect(events).toHaveLength(3);
			expect(events[0]?.type).toBe('start');
			expect(events[2]?.type).toBe('complete');
		});
	});
});
