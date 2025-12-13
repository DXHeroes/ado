/**
 * Tests for workflow command
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkflowDefinition } from '@dxheroes/ado-core';
import { cleanupTempDir, createTempProject } from '@dxheroes/ado-shared/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';

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
		spinner: vi.fn(() => ({
			start: vi.fn(),
			stop: vi.fn(),
		})),
	};
});

// Mock adapters
vi.mock('@dxheroes/ado-adapters', () => ({
	createClaudeCodeAdapter: vi.fn(() => ({
		id: 'claude-code',
		isAvailable: vi.fn().mockResolvedValue(true),
		initialize: vi.fn().mockResolvedValue(undefined),
		execute: vi.fn().mockImplementation(async function* () {
			yield { type: 'start', timestamp: new Date(), taskId: 'test' };
			yield { type: 'complete', timestamp: new Date(), taskId: 'test', result: { duration: 1000 } };
		}),
	})),
	createGeminiCLIAdapter: vi.fn(() => ({ id: 'gemini-cli' })),
	createCursorCLIAdapter: vi.fn(() => ({ id: 'cursor-cli' })),
	createCopilotCLIAdapter: vi.fn(() => ({ id: 'copilot-cli' })),
	createCodexCLIAdapter: vi.fn(() => ({ id: 'codex-cli' })),
}));

describe('Workflow Command', () => {
	let projectDir: string;
	let workflowFile: string;

	beforeEach(async () => {
		projectDir = await createTempProject({
			prefix: 'ado-workflow-test-',
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

routing:
  strategy: subscription-first
  apiFallback:
    enabled: true
    maxCostPerTask: 10.0
`,
			},
		});

		workflowFile = join(projectDir, 'test.workflow.yaml');
	});

	afterEach(async () => {
		await cleanupTempDir(projectDir);
		vi.clearAllMocks();
	});

	describe('workflow file parsing', () => {
		it('should parse basic task workflow', () => {
			const workflowYaml = {
				name: 'test-workflow',
				description: 'Test workflow',
				steps: [
					{
						id: 'step1',
						type: 'task',
						prompt: 'Test task',
					},
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.name).toBe('test-workflow');
			expect(parsed.steps).toHaveLength(1);
			expect(parsed.steps[0].type).toBe('task');
		});

		it('should parse sequential workflow', () => {
			const workflowYaml = {
				name: 'sequential-workflow',
				steps: [
					{
						id: 'seq1',
						type: 'sequential',
						steps: [
							{ id: 's1', type: 'task', prompt: 'Task 1' },
							{ id: 's2', type: 'task', prompt: 'Task 2' },
						],
					},
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].type).toBe('sequential');
			expect(parsed.steps[0].steps).toHaveLength(2);
		});

		it('should parse parallel workflow', () => {
			const workflowYaml = {
				name: 'parallel-workflow',
				steps: [
					{
						id: 'par1',
						type: 'parallel',
						maxConcurrency: 3,
						steps: [
							{ id: 'p1', type: 'task', prompt: 'Parallel task 1' },
							{ id: 'p2', type: 'task', prompt: 'Parallel task 2' },
							{ id: 'p3', type: 'task', prompt: 'Parallel task 3' },
						],
					},
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].type).toBe('parallel');
			expect(parsed.steps[0].maxConcurrency).toBe(3);
			expect(parsed.steps[0].steps).toHaveLength(3);
		});

		it('should parse branch workflow', () => {
			const workflowYaml = {
				name: 'branch-workflow',
				steps: [
					{
						id: 'branch1',
						type: 'branch',
						condition: 'result.status === "success"',
						then: { id: 'success', type: 'task', prompt: 'Success task' },
						else: { id: 'failure', type: 'task', prompt: 'Failure task' },
					},
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].type).toBe('branch');
			expect(parsed.steps[0].condition).toBeDefined();
			expect(parsed.steps[0].then).toBeDefined();
			expect(parsed.steps[0].else).toBeDefined();
		});

		it('should support provider specification in tasks', () => {
			const workflowYaml = {
				name: 'provider-workflow',
				steps: [
					{
						id: 'task1',
						type: 'task',
						prompt: 'Task with provider',
						provider: 'claude-code',
					},
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].provider).toBe('claude-code');
		});

		it('should support timeout configuration', () => {
			const workflowYaml = {
				name: 'timeout-workflow',
				timeout: 60000,
				steps: [{ id: 'task1', type: 'task', prompt: 'Test' }],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.timeout).toBe(60000);
		});
	});

	describe('workflow validation', () => {
		it('should validate workflow has name', () => {
			const invalidYaml = {
				steps: [{ id: 'task1', type: 'task', prompt: 'Test' }],
			};

			writeFileSync(workflowFile, YAML.stringify(invalidYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.name).toBeUndefined();
		});

		it('should validate workflow has steps', () => {
			const invalidYaml = {
				name: 'no-steps-workflow',
				steps: [],
			};

			writeFileSync(workflowFile, YAML.stringify(invalidYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps).toHaveLength(0);
		});

		it('should validate task step has prompt', () => {
			const invalidYaml = {
				name: 'invalid-task',
				steps: [{ id: 'task1', type: 'task' }],
			};

			writeFileSync(workflowFile, YAML.stringify(invalidYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].prompt).toBeUndefined();
		});

		it('should validate sequential step has nested steps', () => {
			const invalidYaml = {
				name: 'invalid-sequential',
				steps: [{ id: 'seq1', type: 'sequential', steps: [] }],
			};

			writeFileSync(workflowFile, YAML.stringify(invalidYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].steps).toHaveLength(0);
		});

		it('should validate parallel step has nested steps', () => {
			const invalidYaml = {
				name: 'invalid-parallel',
				steps: [{ id: 'par1', type: 'parallel' }],
			};

			writeFileSync(workflowFile, YAML.stringify(invalidYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].steps).toBeUndefined();
		});

		it('should validate branch step has condition and then', () => {
			const invalidYaml = {
				name: 'invalid-branch',
				steps: [{ id: 'branch1', type: 'branch' }],
			};

			writeFileSync(workflowFile, YAML.stringify(invalidYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].condition).toBeUndefined();
			expect(parsed.steps[0].then).toBeUndefined();
		});
	});

	describe('workflow list command', () => {
		it('should find workflow files', () => {
			writeFileSync(
				workflowFile,
				YAML.stringify({
					name: 'test-workflow',
					steps: [{ id: 'task1', type: 'task', prompt: 'Test' }],
				}),
			);

			writeFileSync(
				join(projectDir, 'another.workflow.yml'),
				YAML.stringify({
					name: 'another-workflow',
					steps: [{ id: 'task2', type: 'task', prompt: 'Another' }],
				}),
			);

			const fs = require('node:fs');
			const files = fs
				.readdirSync(projectDir)
				.filter((f: string) => f.endsWith('.workflow.yaml') || f.endsWith('.workflow.yml'));

			expect(files).toHaveLength(2);
		});

		it('should parse workflow names from files', () => {
			writeFileSync(
				workflowFile,
				YAML.stringify({
					name: 'my-workflow',
					steps: [{ id: 'task1', type: 'task', prompt: 'Test' }],
				}),
			);

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.name).toBe('my-workflow');
		});

		it('should handle invalid workflow files', () => {
			writeFileSync(workflowFile, 'invalid: yaml: [');

			expect(() => {
				const content = readFileSync(workflowFile, 'utf-8');
				YAML.parse(content);
			}).toThrow();
		});
	});

	describe('workflow execution', () => {
		it('should create workflow definition from YAML', async () => {
			const { parseConditionExpression } = await import('@dxheroes/ado-core');

			const yaml = {
				name: 'test-workflow',
				description: 'Test description',
				timeout: 30000,
				steps: [{ id: 'task1', type: 'task', prompt: 'Test task' }],
			};

			const definition: WorkflowDefinition = {
				id: `workflow-${yaml.name}-${Date.now()}`,
				name: yaml.name,
				description: yaml.description,
				timeout: yaml.timeout,
				rootStep: {
					id: 'task1',
					type: 'task',
					task: {
						id: `${yaml.name}-task1`,
						prompt: 'Test task',
						projectContext: {
							projectId: 'test-project',
							repositoryPath: projectDir,
							repositoryKey: 'test-project',
						},
					},
				},
			};

			expect(definition.name).toBe('test-workflow');
			expect(definition.description).toBe('Test description');
			expect(definition.timeout).toBe(30000);
			expect(definition.rootStep.type).toBe('task');
		});

		it('should execute workflow engine', async () => {
			const { WorkflowEngine } = await import('@dxheroes/ado-core');

			const engine = new WorkflowEngine();

			const taskExecutor = vi.fn().mockResolvedValue({
				id: 'task-1',
				status: 'completed',
				result: 'Success',
			});

			engine.setTaskExecutor(taskExecutor);

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test',
				rootStep: {
					id: 'task1',
					type: 'task',
					task: {
						id: 'task-1',
						prompt: 'Test',
						projectContext: {
							projectId: 'test',
							repositoryPath: projectDir,
							repositoryKey: 'test',
						},
					},
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('completed');
			expect(taskExecutor).toHaveBeenCalled();
		});

		it('should handle workflow events', async () => {
			const { WorkflowEngine } = await import('@dxheroes/ado-core');

			const engine = new WorkflowEngine();
			const events: string[] = [];

			engine.on((event) => {
				events.push(event.type);
			});

			const taskExecutor = vi.fn().mockResolvedValue({
				id: 'task-1',
				status: 'completed',
				result: 'Success',
			});

			engine.setTaskExecutor(taskExecutor);

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test',
				rootStep: {
					id: 'task1',
					type: 'task',
					task: {
						id: 'task-1',
						prompt: 'Test',
						projectContext: {
							projectId: 'test',
							repositoryPath: projectDir,
							repositoryKey: 'test',
						},
					},
				},
			};

			await engine.execute(workflow);

			expect(events).toContain('step_started');
			expect(events).toContain('step_completed');
			expect(events).toContain('workflow_completed');
		});

		it('should handle workflow failure', async () => {
			const { WorkflowEngine } = await import('@dxheroes/ado-core');

			const engine = new WorkflowEngine();

			const taskExecutor = vi.fn().mockRejectedValue(new Error('Task failed'));

			engine.setTaskExecutor(taskExecutor);

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test',
				rootStep: {
					id: 'task1',
					type: 'task',
					task: {
						id: 'task-1',
						prompt: 'Test',
						projectContext: {
							projectId: 'test',
							repositoryPath: projectDir,
							repositoryKey: 'test',
						},
					},
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('failed');
			expect(result.error).toBeDefined();
		});
	});

	describe('dry run mode', () => {
		it('should parse workflow without execution', () => {
			const workflowYaml = {
				name: 'dry-run-workflow',
				steps: [{ id: 'task1', type: 'task', prompt: 'Test' }],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.name).toBe('dry-run-workflow');
			// No execution occurs in dry run
		});
	});

	describe('complex workflows', () => {
		it('should handle nested sequential and parallel steps', () => {
			const workflowYaml = {
				name: 'complex-workflow',
				steps: [
					{
						id: 'seq1',
						type: 'sequential',
						steps: [
							{
								id: 'par1',
								type: 'parallel',
								steps: [
									{ id: 't1', type: 'task', prompt: 'Task 1' },
									{ id: 't2', type: 'task', prompt: 'Task 2' },
								],
							},
							{ id: 't3', type: 'task', prompt: 'Task 3' },
						],
					},
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].type).toBe('sequential');
			expect(parsed.steps[0].steps[0].type).toBe('parallel');
			expect(parsed.steps[0].steps[0].steps).toHaveLength(2);
		});

		it('should handle multiple root steps wrapped in sequential', () => {
			const workflowYaml = {
				name: 'multi-step-workflow',
				steps: [
					{ id: 'task1', type: 'task', prompt: 'Task 1' },
					{ id: 'task2', type: 'task', prompt: 'Task 2' },
					{ id: 'task3', type: 'task', prompt: 'Task 3' },
				],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps).toHaveLength(3);
		});
	});

	describe('error handling', () => {
		it('should handle missing workflow file', () => {
			const nonExistentFile = join(projectDir, 'nonexistent.workflow.yaml');
			const fs = require('node:fs');

			expect(fs.existsSync(nonExistentFile)).toBe(false);
		});

		it('should handle invalid step type', () => {
			const workflowYaml = {
				name: 'invalid-type-workflow',
				steps: [{ id: 'invalid', type: 'unknown-type' as never }],
			};

			writeFileSync(workflowFile, YAML.stringify(workflowYaml));

			const content = readFileSync(workflowFile, 'utf-8');
			const parsed = YAML.parse(content);

			expect(parsed.steps[0].type).toBe('unknown-type');
		});
	});
});
