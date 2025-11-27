/**
 * Configuration schema validation using Zod
 */

import { z } from 'zod';

/**
 * Access mode schema
 */
export const AccessModeSchema = z.enum(['subscription', 'api', 'free']);

/**
 * Access mode config schema
 */
export const AccessModeConfigSchema = z.object({
	mode: AccessModeSchema,
	priority: z.number().int().positive(),
	enabled: z.boolean(),

	// Subscription-specific config
	subscription: z
		.object({
			plan: z.string(),
			rateLimits: z.object({
				requestsPerDay: z.number().int().positive().optional(),
				requestsPerHour: z.number().int().positive().optional(),
				tokensPerDay: z.number().int().positive().optional(),
			}),
			resetTime: z.string().optional(),
		})
		.optional(),

	// API-specific config
	api: z
		.object({
			apiKey: z.string(),
			baseUrl: z.string().url().optional(),
			rateLimits: z.object({
				requestsPerMinute: z.number().int().positive(),
				tokensPerMinute: z.number().int().positive(),
			}),
			costPerMillion: z.object({
				input: z.number().positive(),
				output: z.number().positive(),
			}),
		})
		.optional(),
});

/**
 * Agent capabilities schema
 */
export const AgentCapabilitiesSchema = z.object({
	codeGeneration: z.boolean(),
	codeReview: z.boolean(),
	refactoring: z.boolean(),
	testing: z.boolean(),
	documentation: z.boolean(),
	debugging: z.boolean(),
	languages: z.array(z.string()),
	maxContextTokens: z.number().int().nonnegative(),
	supportsStreaming: z.boolean(),
	supportsMCP: z.boolean(),
	supportsResume: z.boolean(),
});

/**
 * Provider config schema
 */
export const ProviderConfigSchema = z.object({
	id: z.string(),
	enabled: z.boolean(),
	accessModes: z.array(AccessModeConfigSchema),
	capabilities: AgentCapabilitiesSchema,
	contextFile: z.string().optional(),
	defaultOptions: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Routing config schema
 */
export const RoutingConfigSchema = z.object({
	strategy: z.enum(['subscription-first', 'round-robin', 'cost-optimized']),
	failover: z.object({
		enabled: z.boolean(),
		onErrors: z.array(z.string()),
		maxRetries: z.number().int().nonnegative(),
		retryDelay: z.number().int().nonnegative(),
	}),
	apiFallback: z.object({
		enabled: z.boolean(),
		confirmAboveCost: z.number().nonnegative(),
		maxCostPerTask: z.number().nonnegative(),
		maxDailyCost: z.number().nonnegative(),
	}),
	matching: z.object({
		preferCapabilityMatch: z.boolean(),
		preferLargerContext: z.boolean(),
		preferFasterProvider: z.boolean(),
	}),
});

/**
 * Orchestration config schema
 */
export const OrchestrationConfigSchema = z.object({
	maxParallelAgents: z.number().int().positive(),
	worktreeIsolation: z.boolean(),
	checkpointInterval: z.number().int().positive(),
	taskQueue: z.object({
		concurrency: z.number().int().positive(),
		retryAttempts: z.number().int().nonnegative(),
		retryDelay: z.number().int().nonnegative(),
	}),
});

/**
 * HITL policy schema
 */
export const HITLPolicySchema = z.enum(['autonomous', 'review-edits', 'approve-steps', 'manual']);

/**
 * HITL config schema
 */
export const HITLConfigSchema = z.object({
	defaultPolicy: HITLPolicySchema,
	approvalTimeout: z.string(), // Duration string like "24h"
	escalateOnCost: z
		.object({
			threshold: z.number().nonnegative(),
			channel: z.enum(['slack', 'email', 'dashboard', 'webhook']),
		})
		.optional(),
	notifications: z.object({
		slack: z.object({
			enabled: z.boolean(),
			webhookUrl: z.string().url().optional(),
			channel: z.string().optional(),
		}),
		email: z.object({
			enabled: z.boolean(),
			smtpHost: z.string().optional(),
			smtpPort: z.number().int().positive().optional(),
			from: z.string().email().optional(),
			to: z.array(z.string().email()).optional(),
		}),
	}),
});

/**
 * Storage driver schema
 */
export const StorageDriverSchema = z.enum(['sqlite', 'postgresql']);

/**
 * Rate limit tracking driver schema
 */
export const RateLimitDriverSchema = z.enum(['memory', 'redis']);

/**
 * Storage config schema
 */
export const StorageConfigSchema = z.object({
	driver: StorageDriverSchema,
	path: z.string().optional(), // For SQLite
	connectionString: z.string().optional(), // For PostgreSQL
	rateLimitTracking: z.object({
		driver: RateLimitDriverSchema,
		redisUrl: z.string().url().optional(),
	}),
});

/**
 * Observability config schema
 */
export const ObservabilityConfigSchema = z.object({
	logging: z.object({
		level: z.enum(['debug', 'info', 'warn', 'error']),
		format: z.enum(['pretty', 'json']),
	}),
	costTracking: z.object({
		enabled: z.boolean(),
		reportInterval: z.enum(['daily', 'weekly', 'monthly']),
	}),
	telemetry: z
		.object({
			enabled: z.boolean(),
			endpoint: z.string().url().optional(),
			serviceName: z.string().optional(),
		})
		.optional(),
});

/**
 * Deployment context type schema
 */
export const DeploymentTypeSchema = z.enum(['local', 'docker', 'k8s']);

/**
 * Deployment context config schema
 */
export const DeploymentContextConfigSchema = z.object({
	type: DeploymentTypeSchema,
	namespace: z.string().optional(),
	kubeconfig: z.string().optional(),
});

/**
 * Deployment config schema
 */
export const DeploymentConfigSchema = z.object({
	default: z.string(),
	contexts: z.record(z.string(), DeploymentContextConfigSchema),
});

/**
 * Project config schema
 */
export const ProjectConfigSchema = z.object({
	id: z.string(),
	repository: z.string().optional(),
});

/**
 * Main ADO config schema
 */
export const AdoConfigSchema = z.object({
	version: z.string(),
	project: ProjectConfigSchema,
	providers: z.record(z.string(), ProviderConfigSchema),
	routing: RoutingConfigSchema,
	orchestration: OrchestrationConfigSchema,
	hitl: HITLConfigSchema,
	storage: StorageConfigSchema,
	observability: ObservabilityConfigSchema,
	deployment: DeploymentConfigSchema.optional(),
});

/**
 * Type inference from Zod schemas
 */
export type AdoConfigValidated = z.infer<typeof AdoConfigSchema>;
export type ProviderConfigValidated = z.infer<typeof ProviderConfigSchema>;
export type RoutingConfigValidated = z.infer<typeof RoutingConfigSchema>;
export type HITLPolicyValidated = z.infer<typeof HITLPolicySchema>;

/**
 * Validate configuration against schema
 */
export function validateConfig(config: unknown): AdoConfigValidated {
	return AdoConfigSchema.parse(config);
}

/**
 * Validate configuration with safe parsing (returns errors instead of throwing)
 */
export function validateConfigSafe(config: unknown): {
	success: boolean;
	data?: AdoConfigValidated;
	error?: z.ZodError;
} {
	const result = AdoConfigSchema.safeParse(config);
	if (result.success) {
		return { success: true, data: result.data };
	}
	return { success: false, error: result.error };
}

/**
 * Format validation errors for user-friendly output
 */
export function formatValidationErrors(error: z.ZodError): string {
	const issues = error.issues.map((issue) => {
		const path = issue.path.join('.');
		return `  - ${path || 'root'}: ${issue.message}`;
	});

	return `Configuration validation failed:\n${issues.join('\n')}`;
}
