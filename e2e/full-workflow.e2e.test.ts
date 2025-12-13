/**
 * E2E test for complete task execution workflow
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Full Workflow E2E', () => {
	const testDir = join(process.cwd(), 'tmp', 'e2e-test');
	const configPath = join(testDir, 'ado.config.yaml');

	beforeAll(() => {
		// Create test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		mkdirSync(testDir, { recursive: true });

		// Create minimal test config
		const config = `
version: "1.0"
project:
  id: e2e-test
  name: E2E Test Project

providers:
  - id: claude-code
    enabled: true
    accessModes:
      - type: subscription
        priority: 1
        maxConcurrent: 1
`;
		writeFileSync(configPath, config);
	});

	afterAll(() => {
		// Cleanup
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it('should execute a simple task end-to-end', async () => {
		// This test requires ADO CLI to be built
		const cliPath = join(process.cwd(), 'packages', 'cli', 'dist', 'index.js');

		if (!existsSync(cliPath)) {
			return;
		}

		const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
			(resolve) => {
				const proc = spawn(
					'node',
					[cliPath, 'run', 'echo "Hello from ADO"', '--config', configPath],
					{
						cwd: testDir,
						env: {
							...process.env,
							ADO_TEST_MODE: '1',
						},
					},
				);

				let stdout = '';
				let stderr = '';

				proc.stdout?.on('data', (data) => {
					stdout += data.toString();
				});

				proc.stderr?.on('data', (data) => {
					stderr += data.toString();
				});

				proc.on('close', (exitCode) => {
					resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
				});

				// Timeout after 30 seconds
				setTimeout(() => {
					proc.kill();
					resolve({ stdout, stderr, exitCode: 124 });
				}, 30000);
			},
		);

		// Verify execution
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Hello from ADO');
	}, 35000);

	it('should show status after task execution', async () => {
		const cliPath = join(process.cwd(), 'packages', 'cli', 'dist', 'index.js');

		if (!existsSync(cliPath)) {
			return;
		}

		const result = await new Promise<{ stdout: string; exitCode: number }>((resolve) => {
			const proc = spawn('node', [cliPath, 'status', '--config', configPath], {
				cwd: testDir,
				env: {
					...process.env,
					ADO_TEST_MODE: '1',
				},
			});

			let stdout = '';

			proc.stdout?.on('data', (data) => {
				stdout += data.toString();
			});

			proc.on('close', (exitCode) => {
				resolve({ stdout, exitCode: exitCode ?? 1 });
			});

			setTimeout(() => {
				proc.kill();
				resolve({ stdout, exitCode: 124 });
			}, 10000);
		});

		expect(result.exitCode).toBe(0);
		// Status should show project info
		expect(result.stdout).toContain('e2e-test');
	}, 15000);

	it('should handle configuration errors gracefully', async () => {
		const cliPath = join(process.cwd(), 'packages', 'cli', 'dist', 'index.js');

		if (!existsSync(cliPath)) {
			return;
		}

		// Use non-existent config
		const result = await new Promise<{ stderr: string; exitCode: number }>((resolve) => {
			const proc = spawn('node', [cliPath, 'status', '--config', '/nonexistent.yaml'], {
				cwd: testDir,
			});

			let stderr = '';

			proc.stderr?.on('data', (data) => {
				stderr += data.toString();
			});

			proc.on('close', (exitCode) => {
				resolve({ stderr, exitCode: exitCode ?? 1 });
			});

			setTimeout(() => {
				proc.kill();
				resolve({ stderr, exitCode: 124 });
			}, 10000);
		});

		expect(result.exitCode).not.toBe(0);
		// Should show config error
		expect(result.stderr).toMatch(/config|not found|ENOENT/i);
	}, 15000);
});
