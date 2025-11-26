/**
 * Configuration loader for ADO.
 * Loads and validates ado.config.yaml files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AdoConfig, ProviderConfig } from '@ado/shared';
import { parse as parseYaml } from 'yaml';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AdoConfig = {
	version: '1.1',
	project: {
		id: 'default',
	},
	providers: {},
	routing: {
		strategy: 'subscription-first',
		failover: {
			enabled: true,
			onErrors: ['rate_limit', 'timeout', 'server_error'],
			maxRetries: 3,
			retryDelay: 1000,
		},
		apiFallback: {
			enabled: true,
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
		defaultPolicy: 'review-edits',
		approvalTimeout: '24h',
		notifications: {
			slack: { enabled: false },
			email: { enabled: false },
		},
	},
	storage: {
		driver: 'sqlite',
		path: '.ado/state.db',
		rateLimitTracking: {
			driver: 'memory',
		},
	},
	observability: {
		logging: {
			level: 'info',
			format: 'pretty',
		},
		costTracking: {
			enabled: true,
			reportInterval: 'daily',
		},
	},
};

/**
 * Config file locations in priority order
 */
const CONFIG_LOCATIONS = [
	'ado.config.yaml',
	'ado.config.yml',
	'.ado/config.yaml',
	'.ado/config.yml',
];

/**
 * Global config location
 */
function getGlobalConfigPath(): string {
	return join(homedir(), '.config', 'ado', 'config.yaml');
}

/**
 * Find config file in project directory
 */
export function findConfigFile(projectPath: string): string | null {
	for (const location of CONFIG_LOCATIONS) {
		const fullPath = join(projectPath, location);
		if (existsSync(fullPath)) {
			return fullPath;
		}
	}
	return null;
}

/**
 * Substitute environment variables in string values
 */
function substituteEnvVars(obj: unknown): unknown {
	if (typeof obj === 'string') {
		// Replace ${VAR_NAME} patterns
		return obj.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
			const value = process.env[varName];
			if (value === undefined) {
				throw new Error(`Environment variable ${varName} is not set`);
			}
			return value;
		});
	}

	if (Array.isArray(obj)) {
		return obj.map(substituteEnvVars);
	}

	if (obj !== null && typeof obj === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = substituteEnvVars(value);
		}
		return result;
	}

	return obj;
}

/**
 * Deep merge two objects
 */
function deepMerge(
	base: Record<string, unknown>,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...base };

	for (const key of Object.keys(override)) {
		const overrideValue = override[key];
		const baseValue = base[key];

		if (
			overrideValue !== undefined &&
			overrideValue !== null &&
			typeof overrideValue === 'object' &&
			!Array.isArray(overrideValue) &&
			baseValue !== undefined &&
			baseValue !== null &&
			typeof baseValue === 'object' &&
			!Array.isArray(baseValue)
		) {
			result[key] = deepMerge(
				baseValue as Record<string, unknown>,
				overrideValue as Record<string, unknown>,
			);
		} else if (overrideValue !== undefined) {
			result[key] = overrideValue;
		}
	}

	return result;
}

/**
 * Parse provider configs from YAML
 */
function parseProviders(providersObj: Record<string, unknown>): Record<string, ProviderConfig> {
	const result: Record<string, ProviderConfig> = {};

	for (const [id, config] of Object.entries(providersObj)) {
		if (typeof config !== 'object' || config === null) continue;

		const providerConfig = config as Record<string, unknown>;

		result[id] = {
			id,
			enabled: (providerConfig['enabled'] as boolean) ?? true,
			accessModes: (providerConfig['accessModes'] as ProviderConfig['accessModes']) ?? [],
			capabilities: (providerConfig['capabilities'] as ProviderConfig['capabilities']) ?? {
				codeGeneration: false,
				codeReview: false,
				refactoring: false,
				testing: false,
				documentation: false,
				debugging: false,
				languages: [],
				maxContextTokens: 0,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			},
			contextFile: providerConfig['contextFile'] as string | undefined,
			defaultOptions: providerConfig['defaultOptions'] as ProviderConfig['defaultOptions'],
		};
	}

	return result;
}

/**
 * Load configuration from file
 */
export function loadConfig(configPath: string): AdoConfig {
	const content = readFileSync(configPath, 'utf-8');
	const parsed = parseYaml(content) as Record<string, unknown>;

	// Substitute environment variables
	const substituted = substituteEnvVars(parsed) as Record<string, unknown>;

	// Parse providers separately
	const providers = substituted['providers']
		? parseProviders(substituted['providers'] as Record<string, unknown>)
		: {};

	// Merge with defaults
	const config = deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, {
		...substituted,
		providers,
	}) as unknown as AdoConfig;

	return config;
}

/**
 * Load configuration with fallback to defaults
 */
export function loadConfigWithFallback(projectPath: string): AdoConfig {
	// Try project config first
	const projectConfigPath = findConfigFile(projectPath);
	if (projectConfigPath) {
		return loadConfig(projectConfigPath);
	}

	// Try global config
	const globalConfigPath = getGlobalConfigPath();
	if (existsSync(globalConfigPath)) {
		return loadConfig(globalConfigPath);
	}

	// Return defaults
	return { ...DEFAULT_CONFIG };
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): AdoConfig {
	return { ...DEFAULT_CONFIG };
}
