/**
 * Tests for configuration loader
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findConfigFile, getDefaultConfig, loadConfig, loadConfigWithFallback } from '../loader.js';

describe('Config Loader', () => {
	const testDir = join(process.cwd(), '.test-config');
	const globalConfigDir = join(homedir(), '.config', 'ado');
	const globalConfigPath = join(globalConfigDir, 'config.yaml');

	beforeEach(() => {
		// Create test directory
		if (!existsSync(testDir)) {
			mkdirSync(testDir, { recursive: true });
		}
	});

	afterEach(() => {
		// Cleanup test directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		// Cleanup global config if created
		if (existsSync(globalConfigPath)) {
			rmSync(globalConfigPath, { force: true });
		}
	});

	describe('getDefaultConfig', () => {
		it('should return default configuration', () => {
			const config = getDefaultConfig();

			expect(config.version).toBe('1.1');
			expect(config.project.id).toBe('default');
			expect(config.routing.strategy).toBe('subscription-first');
			expect(config.orchestration.maxParallelAgents).toBe(10);
			expect(config.storage.driver).toBe('sqlite');
			expect(config.observability.logging.level).toBe('info');
		});

		it('should return a copy of default config', () => {
			const config1 = getDefaultConfig();
			const config2 = getDefaultConfig();

			expect(config1).not.toBe(config2);
			expect(config1).toEqual(config2);
		});
	});

	describe('findConfigFile', () => {
		it('should find ado.config.yaml in project root', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			writeFileSync(configPath, 'version: "1.1"\n');

			const found = findConfigFile(testDir);
			expect(found).toBe(configPath);
		});

		it('should find ado.config.yml in project root', () => {
			const configPath = join(testDir, 'ado.config.yml');
			writeFileSync(configPath, 'version: "1.1"\n');

			const found = findConfigFile(testDir);
			expect(found).toBe(configPath);
		});

		it('should find config in .ado directory', () => {
			const adoDir = join(testDir, '.ado');
			mkdirSync(adoDir);
			const configPath = join(adoDir, 'config.yaml');
			writeFileSync(configPath, 'version: "1.1"\n');

			const found = findConfigFile(testDir);
			expect(found).toBe(configPath);
		});

		it('should prioritize root over .ado directory', () => {
			const rootConfig = join(testDir, 'ado.config.yaml');
			const adoDir = join(testDir, '.ado');
			mkdirSync(adoDir);
			const adoConfig = join(adoDir, 'config.yaml');

			writeFileSync(rootConfig, 'version: "1.1"\n');
			writeFileSync(adoConfig, 'version: "1.0"\n');

			const found = findConfigFile(testDir);
			expect(found).toBe(rootConfig);
		});

		it('should return null if no config file found', () => {
			const found = findConfigFile(testDir);
			expect(found).toBeNull();
		});
	});

	describe('loadConfig', () => {
		it('should load minimal valid configuration', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test-project
providers: {}
routing:
  strategy: subscription-first
  failover:
    enabled: true
    onErrors: [rate_limit]
    maxRetries: 3
    retryDelay: 1000
  apiFallback:
    enabled: true
    confirmAboveCost: 1.0
    maxCostPerTask: 10.0
    maxDailyCost: 50.0
  matching:
    preferCapabilityMatch: true
    preferLargerContext: true
    preferFasterProvider: false
orchestration:
  maxParallelAgents: 5
  worktreeIsolation: true
  checkpointInterval: 30
  taskQueue:
    concurrency: 3
    retryAttempts: 3
    retryDelay: 1000
hitl:
  defaultPolicy: review-edits
  approvalTimeout: "24h"
  notifications:
    slack:
      enabled: false
    email:
      enabled: false
storage:
  driver: sqlite
  path: .ado/state.db
  rateLimitTracking:
    driver: memory
observability:
  logging:
    level: info
    format: pretty
  costTracking:
    enabled: true
    reportInterval: daily
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath);
			expect(config.version).toBe('1.1');
			expect(config.project.id).toBe('test-project');
			expect(config.orchestration.maxParallelAgents).toBe(5);
		});

		it('should merge with default configuration', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: minimal-project
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.version).toBe('1.1');
			expect(config.project.id).toBe('minimal-project');
			// Should have defaults
			expect(config.routing.strategy).toBe('subscription-first');
			expect(config.storage.driver).toBe('sqlite');
		});

		it('should substitute environment variables', () => {
			process.env.TEST_PROJECT_ID = 'env-project';
			process.env.TEST_DB_PATH = '/custom/db.sqlite';

			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: \${TEST_PROJECT_ID}
storage:
  driver: sqlite
  path: \${TEST_DB_PATH}
  rateLimitTracking:
    driver: memory
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.project.id).toBe('env-project');
			expect(config.storage.path).toBe('/custom/db.sqlite');

			process.env.TEST_PROJECT_ID = undefined;
			process.env.TEST_DB_PATH = undefined;
		});

		it('should use default value for undefined env vars', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: \${UNDEFINED_VAR:-default-project}
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.project.id).toBe('default-project');
		});

		it('should keep undefined env vars without default', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: \${UNDEFINED_VAR}
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.project.id).toBe('${UNDEFINED_VAR}');
		});

		it('should parse provider configurations', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
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
      testing: false
      documentation: true
      debugging: true
      languages: [typescript, javascript, python]
      maxContextTokens: 200000
      supportsStreaming: true
      supportsMCP: true
      supportsResume: true
    contextFile: .claude/context.md
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.providers['claude-code']).toBeDefined();
			expect(config.providers['claude-code']?.id).toBe('claude-code');
			expect(config.providers['claude-code']?.enabled).toBe(true);
			expect(config.providers['claude-code']?.capabilities.codeGeneration).toBe(true);
			expect(config.providers['claude-code']?.capabilities.maxContextTokens).toBe(200000);
		});

		it('should throw error for invalid configuration when validation enabled', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: 123
routing:
  strategy: invalid-strategy
`;
			writeFileSync(configPath, yamlContent);

			expect(() => loadConfig(configPath)).toThrow(/validation failed/);
		});

		it('should not throw error when validation disabled', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: 123
`;
			writeFileSync(configPath, yamlContent);

			expect(() => loadConfig(configPath, { validate: false })).not.toThrow();
		});

		it('should handle nested object merging', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
orchestration:
  maxParallelAgents: 20
  taskQueue:
    concurrency: 10
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.orchestration.maxParallelAgents).toBe(20);
			expect(config.orchestration.taskQueue.concurrency).toBe(10);
			// Should keep defaults
			expect(config.orchestration.worktreeIsolation).toBe(true);
			expect(config.orchestration.taskQueue.retryAttempts).toBe(3);
		});

		it('should handle array replacement (not merge)', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
routing:
  failover:
    onErrors: [timeout]
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.routing.failover.onErrors).toEqual(['timeout']);
			// Should not merge with defaults
			expect(config.routing.failover.onErrors).not.toContain('rate_limit');
		});
	});

	describe('loadConfigWithFallback', () => {
		it('should load project config if found', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: project-config
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfigWithFallback(testDir, { validate: false });
			expect(config.project.id).toBe('project-config');
		});

		it('should fallback to global config if project config not found', () => {
			// Create global config
			if (!existsSync(globalConfigDir)) {
				mkdirSync(globalConfigDir, { recursive: true });
			}
			const yamlContent = `
version: "1.1"
project:
  id: global-config
`;
			writeFileSync(globalConfigPath, yamlContent);

			const config = loadConfigWithFallback(testDir, { validate: false });
			expect(config.project.id).toBe('global-config');
		});

		it('should return defaults if no config file found', () => {
			const config = loadConfigWithFallback(testDir);
			expect(config.project.id).toBe('default');
			expect(config.routing.strategy).toBe('subscription-first');
		});

		it('should prioritize project config over global config', () => {
			// Create project config
			const projectConfigPath = join(testDir, 'ado.config.yaml');
			writeFileSync(
				projectConfigPath,
				`
version: "1.1"
project:
  id: project-config
`,
			);

			// Create global config
			if (!existsSync(globalConfigDir)) {
				mkdirSync(globalConfigDir, { recursive: true });
			}
			writeFileSync(
				globalConfigPath,
				`
version: "1.1"
project:
  id: global-config
`,
			);

			const config = loadConfigWithFallback(testDir, { validate: false });
			expect(config.project.id).toBe('project-config');
		});
	});

	describe('Environment variable substitution', () => {
		it('should substitute multiple env vars in same string', () => {
			process.env.TEST_HOST = 'localhost';
			process.env.TEST_PORT = '5432';

			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
storage:
  driver: postgresql
  connectionString: "postgres://\${TEST_HOST}:\${TEST_PORT}/ado"
  rateLimitTracking:
    driver: memory
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.storage.connectionString).toBe('postgres://localhost:5432/ado');

			process.env.TEST_HOST = undefined;
			process.env.TEST_PORT = undefined;
		});

		it('should substitute env vars in nested objects', () => {
			process.env.SLACK_WEBHOOK = 'https://hooks.slack.com/test';

			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
hitl:
  notifications:
    slack:
      enabled: true
      webhookUrl: \${SLACK_WEBHOOK}
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.hitl.notifications.slack.webhookUrl).toBe('https://hooks.slack.com/test');

			process.env.SLACK_WEBHOOK = undefined;
		});

		it('should substitute env vars in arrays', () => {
			process.env.LANG1 = 'typescript';
			process.env.LANG2 = 'python';

			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
providers:
  test-provider:
    capabilities:
      languages:
        - \${LANG1}
        - \${LANG2}
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.providers['test-provider']?.capabilities.languages).toEqual([
				'typescript',
				'python',
			]);

			process.env.LANG1 = undefined;
			process.env.LANG2 = undefined;
		});
	});

	describe('Edge cases', () => {
		it('should handle empty providers object', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
providers: {}
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.providers).toEqual({});
		});

		it('should handle null provider config', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
providers:
  null-provider: null
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.providers['null-provider']).toBeUndefined();
		});

		it('should handle provider with partial config', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			const yamlContent = `
version: "1.1"
project:
  id: test
providers:
  minimal-provider:
    enabled: true
`;
			writeFileSync(configPath, yamlContent);

			const config = loadConfig(configPath, { validate: false });
			expect(config.providers['minimal-provider']?.id).toBe('minimal-provider');
			expect(config.providers['minimal-provider']?.enabled).toBe(true);
			expect(config.providers['minimal-provider']?.accessModes).toEqual([]);
		});

		it('should handle reading non-existent file', () => {
			const nonExistentPath = join(testDir, 'non-existent.yaml');
			expect(() => loadConfig(nonExistentPath)).toThrow();
		});

		it('should handle invalid YAML', () => {
			const configPath = join(testDir, 'ado.config.yaml');
			writeFileSync(configPath, 'invalid: yaml: content:');

			expect(() => loadConfig(configPath)).toThrow();
		});
	});
});
