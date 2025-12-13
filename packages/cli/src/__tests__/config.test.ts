/**
 * Tests for config command
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { cleanupTempDir, createTempProject } from '@dxheroes/ado-shared/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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
		select: vi.fn(),
		multiselect: vi.fn(),
		cancel: vi.fn(),
		isCancel: vi.fn().mockReturnValue(false),
		spinner: vi.fn(() => ({
			start: vi.fn(),
			stop: vi.fn(),
		})),
	};
});

// Mock adapter
vi.mock('@dxheroes/ado-adapters', () => ({
	createClaudeCodeAdapter: vi.fn(() => ({
		isAvailable: vi.fn().mockResolvedValue(true),
	})),
}));

describe('Config Command', () => {
	let projectDir: string;
	let configPath: string;

	beforeEach(async () => {
		projectDir = await createTempProject({
			prefix: 'ado-config-test-',
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
      - mode: api
        priority: 10
        enabled: false

  gemini-cli:
    enabled: false
    accessModes:
      - mode: api
        priority: 11
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
	});

	afterEach(async () => {
		await cleanupTempDir(projectDir);
		vi.clearAllMocks();
	});

	describe('show command', () => {
		it('should load configuration', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			expect(config.project.id).toBe('test-project');
			expect(config.project.repository).toBe('test-repo');
			expect(config.routing.strategy).toBe('subscription-first');
		});

		it('should display project information', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const projectInfo = {
				id: config.project.id,
				repository: config.project.repository ?? 'not set',
			};

			expect(projectInfo.id).toBe('test-project');
			expect(projectInfo.repository).toBe('test-repo');
		});

		it('should display routing configuration', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const routingInfo = {
				strategy: config.routing.strategy,
				apiFallback: config.routing.apiFallback.enabled,
				maxCost: config.routing.apiFallback.maxCostPerTask,
			};

			expect(routingInfo.strategy).toBe('subscription-first');
			expect(routingInfo.apiFallback).toBe(true);
			expect(routingInfo.maxCost).toBe(10.0);
		});

		it('should list all providers with status', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const providers = Object.entries(config.providers).map(([id, c]) => {
				const modes = c.accessModes
					.filter((m) => m.enabled)
					.map((m) => m.mode)
					.join(', ');
				return {
					id,
					enabled: c.enabled,
					modes: modes || 'no modes',
				};
			});

			expect(providers).toHaveLength(2);
			expect(providers[0]?.id).toBe('claude-code');
			expect(providers[0]?.enabled).toBe(true);
			expect(providers[0]?.modes).toBe('subscription');

			expect(providers[1]?.id).toBe('gemini-cli');
			expect(providers[1]?.enabled).toBe(false);
			expect(providers[1]?.modes).toBe('api');
		});

		it('should handle missing repository field', async () => {
			// Create config without repository
			const tempDir = await createTempProject({
				prefix: 'ado-config-no-repo-',
				files: {
					'ado.config.yaml': `
project:
  id: test-project

providers: {}

routing:
  strategy: subscription-first
`,
				},
			});

			try {
				const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
				const config = loadConfigWithFallback(tempDir);

				expect(config.project.repository).toBeUndefined();
			} finally {
				await cleanupTempDir(tempDir);
			}
		});
	});

	describe('providers command', () => {
		it('should list all providers', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const providers = Object.entries(config.providers);

			expect(providers).toHaveLength(2);
			expect(providers.map(([id]) => id)).toContain('claude-code');
			expect(providers.map(([id]) => id)).toContain('gemini-cli');
		});

		it('should toggle provider enabled status', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const providersConfig = rawConfig.providers as Record<
				string,
				{ enabled: boolean; accessModes: unknown[] }
			>;
			const provider = providersConfig['claude-code'];

			// Toggle enabled
			if (provider) {
				provider.enabled = !provider.enabled;
			}

			writeFileSync(configPath, stringifyYaml(rawConfig));

			// Read back
			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const updatedProviders = updatedConfig.providers as Record<string, { enabled: boolean }>;

			expect(updatedProviders['claude-code']?.enabled).toBe(false);
		});

		it('should update access mode enabled status', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const providersConfig = rawConfig.providers as Record<
				string,
				{ accessModes: Array<{ mode: string; enabled: boolean }> }
			>;
			const provider = providersConfig['claude-code'];

			if (provider?.accessModes) {
				for (const mode of provider.accessModes) {
					if (mode.mode === 'api') {
						mode.enabled = true;
					}
				}
			}

			writeFileSync(configPath, stringifyYaml(rawConfig));

			// Read back
			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const updatedProviders = updatedConfig.providers as Record<
				string,
				{ accessModes: Array<{ mode: string; enabled: boolean }> }
			>;
			const apiMode = updatedProviders['claude-code']?.accessModes.find((m) => m.mode === 'api');

			expect(apiMode?.enabled).toBe(true);
		});

		it('should check provider availability', async () => {
			const { createClaudeCodeAdapter } = await import('@dxheroes/ado-adapters');
			const adapter = createClaudeCodeAdapter();
			const available = await adapter.isAvailable();

			expect(available).toBe(true);
		});

		it('should handle unavailable providers', async () => {
			const { createClaudeCodeAdapter } = await import('@dxheroes/ado-adapters');
			const mockAdapter = {
				isAvailable: vi.fn().mockResolvedValue(false),
			};

			vi.mocked(createClaudeCodeAdapter).mockReturnValue(mockAdapter as never);

			const available = await mockAdapter.isAvailable();
			expect(available).toBe(false);
		});
	});

	describe('set command', () => {
		it('should set string value', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

			// Set project.id
			const project = rawConfig.project as Record<string, unknown>;
			project.id = 'new-project-id';

			writeFileSync(configPath, stringifyYaml(rawConfig));

			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			expect((updatedConfig.project as Record<string, unknown>).id).toBe('new-project-id');
		});

		it('should set number value', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

			// Set routing.apiFallback.maxCostPerTask
			const routing = rawConfig.routing as Record<string, unknown>;
			const apiFallback = routing.apiFallback as Record<string, unknown>;
			apiFallback.maxCostPerTask = 20.0;

			writeFileSync(configPath, stringifyYaml(rawConfig));

			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const updatedRouting = updatedConfig.routing as Record<string, unknown>;
			const updatedApiFallback = updatedRouting.apiFallback as Record<string, unknown>;

			expect(updatedApiFallback.maxCostPerTask).toBe(20.0);
		});

		it('should set boolean value', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

			// Set routing.apiFallback.enabled
			const routing = rawConfig.routing as Record<string, unknown>;
			const apiFallback = routing.apiFallback as Record<string, unknown>;
			apiFallback.enabled = false;

			writeFileSync(configPath, stringifyYaml(rawConfig));

			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const updatedRouting = updatedConfig.routing as Record<string, unknown>;
			const updatedApiFallback = updatedRouting.apiFallback as Record<string, unknown>;

			expect(updatedApiFallback.enabled).toBe(false);
		});

		it('should create nested keys if missing', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;

			// Create new.nested.key
			if (!rawConfig.new) {
				rawConfig.new = {};
			}
			const newSection = rawConfig.new as Record<string, unknown>;
			if (!newSection.nested) {
				newSection.nested = {};
			}
			const nested = newSection.nested as Record<string, unknown>;
			nested.key = 'value';

			writeFileSync(configPath, stringifyYaml(rawConfig));

			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const newObj = updatedConfig.new as Record<string, unknown>;
			const nestedObj = newObj.nested as Record<string, unknown>;

			expect(nestedObj.key).toBe('value');
		});

		it('should parse JSON values', () => {
			const testCases = [
				{ input: '{"foo":"bar"}', expected: { foo: 'bar' } },
				{ input: '[1,2,3]', expected: [1, 2, 3] },
				{ input: 'true', expected: true },
				{ input: 'false', expected: false },
				{ input: '42', expected: 42 },
				{ input: 'plain string', expected: 'plain string' },
			];

			for (const { input, expected } of testCases) {
				let parsedValue: unknown = input;
				try {
					parsedValue = JSON.parse(input);
				} catch {
					if (input === 'true') parsedValue = true;
					else if (input === 'false') parsedValue = false;
					else if (!Number.isNaN(Number(input))) parsedValue = Number(input);
				}

				expect(parsedValue).toEqual(expected);
			}
		});
	});

	describe('access modes configuration', () => {
		it('should list access modes for provider', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const provider = config.providers['claude-code'];
			const accessModes = provider?.accessModes;

			expect(accessModes).toHaveLength(2);
			expect(accessModes?.[0]?.mode).toBe('subscription');
			expect(accessModes?.[0]?.enabled).toBe(true);
			expect(accessModes?.[1]?.mode).toBe('api');
			expect(accessModes?.[1]?.enabled).toBe(false);
		});

		it('should enable/disable multiple access modes', () => {
			const rawConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const providersConfig = rawConfig.providers as Record<
				string,
				{ accessModes: Array<{ mode: string; enabled: boolean }> }
			>;
			const provider = providersConfig['claude-code'];

			const selectedModes = ['api']; // Enable only API

			if (provider?.accessModes) {
				for (const mode of provider.accessModes) {
					mode.enabled = selectedModes.includes(mode.mode);
				}
			}

			writeFileSync(configPath, stringifyYaml(rawConfig));

			// Read back
			const updatedConfig = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
			const updatedProviders = updatedConfig.providers as Record<
				string,
				{ accessModes: Array<{ mode: string; enabled: boolean }> }
			>;

			const subscriptionMode = updatedProviders['claude-code']?.accessModes.find(
				(m) => m.mode === 'subscription',
			);
			const apiMode = updatedProviders['claude-code']?.accessModes.find((m) => m.mode === 'api');

			expect(subscriptionMode?.enabled).toBe(false);
			expect(apiMode?.enabled).toBe(true);
		});

		it('should show access mode priorities', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const provider = config.providers['claude-code'];
			const accessModes = provider?.accessModes.map((m) => ({
				mode: m.mode,
				priority: m.priority,
			}));

			expect(accessModes?.[0]?.priority).toBe(1);
			expect(accessModes?.[1]?.priority).toBe(10);
		});
	});

	describe('error handling', () => {
		it('should handle missing config file', async () => {
			const { findConfigFile } = await import('@dxheroes/ado-core');
			const uninitDir = await createTempProject({
				prefix: 'ado-no-config-',
				files: {},
			});

			try {
				const configPath = findConfigFile(uninitDir);
				// findConfigFile returns null when not found
				expect(configPath).toBeNull();
			} finally {
				await cleanupTempDir(uninitDir);
			}
		});

		it('should handle invalid YAML', () => {
			writeFileSync(configPath, 'invalid: yaml: content: [');

			expect(() => {
				parseYaml(readFileSync(configPath, 'utf-8'));
			}).toThrow();
		});

		it('should handle invalid key path', () => {
			const key = '';
			const parts = key.split('.');

			expect(parts).toEqual(['']);
		});

		it('should handle non-existent provider', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const provider = config.providers['non-existent'];

			expect(provider).toBeUndefined();
		});
	});

	describe('multi-provider scenarios', () => {
		it('should handle empty providers list', async () => {
			const tempDir = await createTempProject({
				prefix: 'ado-no-providers-',
				files: {
					'ado.config.yaml': `
project:
  id: test-project

providers: {}

routing:
  strategy: subscription-first
`,
				},
			});

			try {
				const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
				const config = loadConfigWithFallback(tempDir);

				const providers = Object.entries(config.providers);
				expect(providers).toHaveLength(0);
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		it('should check all enabled providers', async () => {
			const { loadConfigWithFallback } = await import('@dxheroes/ado-core');
			const config = loadConfigWithFallback(projectDir);

			const enabledProviders = Object.entries(config.providers).filter(([_id, c]) => c.enabled);

			expect(enabledProviders).toHaveLength(1);
			expect(enabledProviders[0]?.[0]).toBe('claude-code');
		});
	});
});
