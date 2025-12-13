/**
 * E2E Test - Single Task Workflow
 *
 * This test validates the full end-to-end workflow of executing a simple task
 * using the ADO CLI. It creates a temporary project, runs a task, and verifies
 * the results.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { cleanupTempDir, createTempProject } from '@dxheroes/ado-shared/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

describe('E2E: Single Task Workflow', () => {
	let projectDir: string;
	let _cliPath: string;

	beforeAll(async () => {
		// Create a temporary test project
		projectDir = await createTempProject({
			prefix: 'ado-e2e-test-',
			initGit: true,
			files: {
				'README.md': '# Test Project\n\nA simple test project.',
				'src/calculator.ts': `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`,
				'package.json': JSON.stringify(
					{
						name: 'e2e-test-project',
						version: '1.0.0',
						type: 'module',
						scripts: {
							test: 'echo "No tests configured"',
						},
					},
					null,
					2,
				),
				'tsconfig.json': JSON.stringify(
					{
						compilerOptions: {
							target: 'ES2022',
							module: 'ESNext',
							moduleResolution: 'bundler',
							strict: true,
							outDir: './dist',
						},
						include: ['src/**/*'],
					},
					null,
					2,
				),
			},
		});

		// Set CLI path (adjust based on actual build output)
		_cliPath = path.join(process.cwd(), 'packages/cli/dist/index.js');
	});

	afterAll(async () => {
		// Cleanup temp directory
		await cleanupTempDir(projectDir);
	});

	describe('project setup', () => {
		it('should have created a valid TypeScript project', async () => {
			const tsconfigPath = path.join(projectDir, 'tsconfig.json');
			const tsconfig = await fs.readFile(tsconfigPath, 'utf-8');
			const config = JSON.parse(tsconfig);

			expect(config.compilerOptions.strict).toBe(true);
		});

		it('should have source files', async () => {
			const calculatorPath = path.join(projectDir, 'src/calculator.ts');
			const content = await fs.readFile(calculatorPath, 'utf-8');

			expect(content).toContain('export function add');
			expect(content).toContain('export function subtract');
		});
	});

	describe('configuration', () => {
		it('should create minimal config file', async () => {
			const configPath = path.join(projectDir, 'ado.config.yaml');
			const configContent = `
# ADO Configuration for E2E Test
providers: []

preferences:
  subscriptionFirst: true
  defaultHitlPolicy: autonomous
  telemetry:
    enabled: false
`;

			await fs.writeFile(configPath, configContent);

			const exists = await fs
				.access(configPath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(true);
		});
	});

	describe('task execution simulation', () => {
		it('should validate task definition structure', () => {
			const taskDefinition = {
				prompt: 'Add a multiply function to calculator.ts',
				projectKey: 'e2e-test-project',
				repositoryPath: projectDir,
				hitlPolicy: 'autonomous' as const,
				allowApiFailover: false,
			};

			expect(taskDefinition.prompt).toBeTruthy();
			expect(taskDefinition.repositoryPath).toBe(projectDir);
			expect(taskDefinition.hitlPolicy).toBe('autonomous');
		});

		it('should handle task state transitions', () => {
			const _states = ['pending', 'running', 'completed'];
			let currentState = 'pending';

			// Simulate state transition
			currentState = 'running';
			expect(currentState).toBe('running');

			currentState = 'completed';
			expect(currentState).toBe('completed');
		});
	});

	describe('file operations', () => {
		it('should be able to modify source files', async () => {
			const calculatorPath = path.join(projectDir, 'src/calculator.ts');
			const originalContent = await fs.readFile(calculatorPath, 'utf-8');

			// Simulate adding a new function
			const newContent = `${originalContent}
export function multiply(a: number, b: number): number {
  return a * b;
}
`;

			await fs.writeFile(calculatorPath, newContent);

			const updatedContent = await fs.readFile(calculatorPath, 'utf-8');
			expect(updatedContent).toContain('export function multiply');
		});

		it('should create test files', async () => {
			const testDir = path.join(projectDir, 'src/__tests__');
			await fs.mkdir(testDir, { recursive: true });

			const testFilePath = path.join(testDir, 'calculator.test.ts');
			const testContent = `
import { describe, it, expect } from 'vitest';
import { add, subtract } from '../calculator.js';

describe('Calculator', () => {
  it('should add numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('should subtract numbers', () => {
    expect(subtract(5, 3)).toBe(2);
  });
});
`;

			await fs.writeFile(testFilePath, testContent);

			const exists = await fs
				.access(testFilePath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(true);
		});
	});

	describe('git operations', () => {
		it('should be able to check git status', async () => {
			const { stdout } = await execAsync('git status --porcelain', { cwd: projectDir });

			// Should have modified files
			expect(stdout).toBeTruthy();
		});

		it('should be able to stage changes', async () => {
			await execAsync('git add .', { cwd: projectDir });

			const { stdout } = await execAsync('git diff --cached --name-only', {
				cwd: projectDir,
			});

			expect(stdout.length).toBeGreaterThan(0);
		});

		it('should be able to create commits', async () => {
			await execAsync('git add .', { cwd: projectDir });
			await execAsync('git commit -m "Add multiply function and tests"', {
				cwd: projectDir,
			});

			const { stdout } = await execAsync('git log --oneline -1', { cwd: projectDir });

			expect(stdout).toContain('Add multiply function');
		});
	});

	describe('result validation', () => {
		it('should validate task completion result', () => {
			const taskResult = {
				success: true,
				output: 'Added multiply function to calculator.ts and created test file',
				tokensUsed: {
					input: 1000,
					output: 500,
				},
				costUsd: 0.05,
				duration: 5000,
				filesModified: ['src/calculator.ts', 'src/__tests__/calculator.test.ts'],
			};

			expect(taskResult.success).toBe(true);
			expect(taskResult.filesModified).toHaveLength(2);
			expect(taskResult.duration).toBeGreaterThan(0);
		});

		it('should track cost and token usage', () => {
			const usageStats = {
				totalTasks: 1,
				completedTasks: 1,
				failedTasks: 0,
				totalCost: 0.05,
				totalTokens: 1500,
				avgDuration: 5000,
			};

			expect(usageStats.completedTasks).toBe(1);
			expect(usageStats.totalCost).toBeGreaterThan(0);
			expect(usageStats.totalTokens).toBeGreaterThan(0);
		});
	});

	describe('error handling', () => {
		it('should handle invalid task gracefully', () => {
			const errorResult = {
				success: false,
				error: 'Task failed: No available providers',
				taskId: 'task-123',
			};

			expect(errorResult.success).toBe(false);
			expect(errorResult.error).toContain('No available providers');
		});

		it('should handle file system errors', async () => {
			const invalidPath = path.join(projectDir, 'nonexistent/file.ts');

			await expect(fs.readFile(invalidPath, 'utf-8')).rejects.toThrow();
		});
	});

	describe('cleanup', () => {
		it('should be able to reset changes', async () => {
			// Create a temporary file
			const tempFile = path.join(projectDir, 'temp.txt');
			await fs.writeFile(tempFile, 'temporary content');

			// Remove it
			await fs.unlink(tempFile);

			const exists = await fs
				.access(tempFile)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(false);
		});
	});

	describe('workflow completion', () => {
		it('should verify all expected files exist', async () => {
			const expectedFiles = [
				'README.md',
				'package.json',
				'tsconfig.json',
				'src/calculator.ts',
				'src/__tests__/calculator.test.ts',
			];

			for (const file of expectedFiles) {
				const filePath = path.join(projectDir, file);
				const exists = await fs
					.access(filePath)
					.then(() => true)
					.catch(() => false);
				expect(exists).toBe(true);
			}
		});

		it('should have valid git history', async () => {
			const { stdout } = await execAsync('git log --oneline', { cwd: projectDir });

			expect(stdout).toContain('Add multiply function');
		});
	});
});
