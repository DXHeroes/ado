/**
 * Tests for configuration schema validation
 */

import { describe, expect, it } from 'vitest';
import {
	AccessModeConfigSchema,
	AdoConfigSchema,
	AgentCapabilitiesSchema,
	DeploymentConfigSchema,
	HITLConfigSchema,
	HITLPolicySchema,
	ObservabilityConfigSchema,
	OrchestrationConfigSchema,
	ProviderConfigSchema,
	RoutingConfigSchema,
	StorageConfigSchema,
	formatValidationErrors,
	validateConfig,
	validateConfigSafe,
} from '../schema.js';

describe('Configuration Schema', () => {
	describe('AccessModeConfigSchema', () => {
		it('should validate subscription access mode', () => {
			const config = {
				mode: 'subscription',
				priority: 1,
				enabled: true,
				subscription: {
					plan: 'Pro',
					rateLimits: {
						requestsPerDay: 1000,
						tokensPerDay: 1000000,
					},
				},
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate API access mode', () => {
			const config = {
				mode: 'api',
				priority: 2,
				enabled: true,
				api: {
					apiKey: 'sk-test123',
					rateLimits: {
						requestsPerMinute: 100,
						tokensPerMinute: 50000,
					},
					costPerMillion: {
						input: 3.0,
						output: 15.0,
					},
				},
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate free access mode', () => {
			const config = {
				mode: 'free',
				priority: 3,
				enabled: false,
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should reject invalid mode', () => {
			const config = {
				mode: 'invalid',
				priority: 1,
				enabled: true,
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should reject non-positive priority', () => {
			const config = {
				mode: 'subscription',
				priority: 0,
				enabled: true,
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should reject negative priority', () => {
			const config = {
				mode: 'subscription',
				priority: -1,
				enabled: true,
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should require apiKey for API mode', () => {
			const config = {
				mode: 'api',
				priority: 1,
				enabled: true,
				api: {
					rateLimits: {
						requestsPerMinute: 100,
						tokensPerMinute: 50000,
					},
					costPerMillion: {
						input: 3.0,
						output: 15.0,
					},
				},
			};

			const result = AccessModeConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});
	});

	describe('AgentCapabilitiesSchema', () => {
		it('should validate complete capabilities', () => {
			const capabilities = {
				codeGeneration: true,
				codeReview: true,
				refactoring: true,
				testing: false,
				documentation: true,
				debugging: true,
				languages: ['typescript', 'javascript', 'python'],
				maxContextTokens: 200000,
				supportsStreaming: true,
				supportsMCP: true,
				supportsResume: true,
			};

			const result = AgentCapabilitiesSchema.safeParse(capabilities);
			expect(result.success).toBe(true);
		});

		it('should reject negative maxContextTokens', () => {
			const capabilities = {
				codeGeneration: true,
				codeReview: false,
				refactoring: false,
				testing: false,
				documentation: false,
				debugging: false,
				languages: [],
				maxContextTokens: -1,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			};

			const result = AgentCapabilitiesSchema.safeParse(capabilities);
			expect(result.success).toBe(false);
		});

		it('should accept zero maxContextTokens', () => {
			const capabilities = {
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
			};

			const result = AgentCapabilitiesSchema.safeParse(capabilities);
			expect(result.success).toBe(true);
		});
	});

	describe('ProviderConfigSchema', () => {
		it('should validate complete provider config', () => {
			const config = {
				id: 'claude-code',
				enabled: true,
				accessModes: [
					{
						mode: 'subscription',
						priority: 1,
						enabled: true,
						subscription: {
							plan: 'Pro',
							rateLimits: {
								requestsPerDay: 1000,
							},
						},
					},
				],
				capabilities: {
					codeGeneration: true,
					codeReview: true,
					refactoring: true,
					testing: false,
					documentation: true,
					debugging: true,
					languages: ['typescript', 'javascript'],
					maxContextTokens: 200000,
					supportsStreaming: true,
					supportsMCP: true,
					supportsResume: true,
				},
				contextFile: '.claude/context.md',
				defaultOptions: {
					temperature: 0.7,
				},
			};

			const result = ProviderConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should accept provider without optional fields', () => {
			const config = {
				id: 'minimal-provider',
				enabled: true,
				accessModes: [],
				capabilities: {
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
			};

			const result = ProviderConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	describe('RoutingConfigSchema', () => {
		it('should validate subscription-first strategy', () => {
			const config = {
				strategy: 'subscription-first',
				failover: {
					enabled: true,
					onErrors: ['rate_limit', 'timeout'],
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
			};

			const result = RoutingConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate round-robin strategy', () => {
			const config = {
				strategy: 'round-robin',
				failover: {
					enabled: false,
					onErrors: [],
					maxRetries: 0,
					retryDelay: 0,
				},
				apiFallback: {
					enabled: false,
					confirmAboveCost: 0,
					maxCostPerTask: 0,
					maxDailyCost: 0,
				},
				matching: {
					preferCapabilityMatch: false,
					preferLargerContext: false,
					preferFasterProvider: false,
				},
			};

			const result = RoutingConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate cost-optimized strategy', () => {
			const config = {
				strategy: 'cost-optimized',
				failover: {
					enabled: true,
					onErrors: ['server_error'],
					maxRetries: 5,
					retryDelay: 2000,
				},
				apiFallback: {
					enabled: true,
					confirmAboveCost: 5.0,
					maxCostPerTask: 20.0,
					maxDailyCost: 100.0,
				},
				matching: {
					preferCapabilityMatch: true,
					preferLargerContext: false,
					preferFasterProvider: true,
				},
			};

			const result = RoutingConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should reject invalid strategy', () => {
			const config = {
				strategy: 'invalid-strategy',
				failover: {
					enabled: true,
					onErrors: [],
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
			};

			const result = RoutingConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should reject negative values', () => {
			const config = {
				strategy: 'subscription-first',
				failover: {
					enabled: true,
					onErrors: [],
					maxRetries: -1,
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
			};

			const result = RoutingConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});
	});

	describe('OrchestrationConfigSchema', () => {
		it('should validate complete orchestration config', () => {
			const config = {
				maxParallelAgents: 10,
				worktreeIsolation: true,
				checkpointInterval: 30,
				taskQueue: {
					concurrency: 5,
					retryAttempts: 3,
					retryDelay: 1000,
				},
			};

			const result = OrchestrationConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should reject zero or negative maxParallelAgents', () => {
			const config = {
				maxParallelAgents: 0,
				worktreeIsolation: true,
				checkpointInterval: 30,
				taskQueue: {
					concurrency: 5,
					retryAttempts: 3,
					retryDelay: 1000,
				},
			};

			const result = OrchestrationConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should accept zero retry attempts', () => {
			const config = {
				maxParallelAgents: 5,
				worktreeIsolation: false,
				checkpointInterval: 60,
				taskQueue: {
					concurrency: 1,
					retryAttempts: 0,
					retryDelay: 0,
				},
			};

			const result = OrchestrationConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	describe('HITLConfigSchema', () => {
		it('should validate autonomous policy', () => {
			const config = {
				defaultPolicy: 'autonomous',
				approvalTimeout: '1h',
				notifications: {
					slack: { enabled: false },
					email: { enabled: false },
				},
			};

			const result = HITLConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate review-edits policy', () => {
			const config = {
				defaultPolicy: 'review-edits',
				approvalTimeout: '24h',
				notifications: {
					slack: {
						enabled: true,
						webhookUrl: 'https://hooks.slack.com/test',
						channel: '#dev',
					},
					email: { enabled: false },
				},
			};

			const result = HITLConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate approve-steps policy', () => {
			const config = {
				defaultPolicy: 'approve-steps',
				approvalTimeout: '12h',
				escalateOnCost: {
					threshold: 10.0,
					channel: 'slack',
				},
				notifications: {
					slack: { enabled: true },
					email: {
						enabled: true,
						smtpHost: 'smtp.example.com',
						smtpPort: 587,
						from: 'ado@example.com',
						to: ['team@example.com'],
					},
				},
			};

			const result = HITLConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate manual policy', () => {
			const config = {
				defaultPolicy: 'manual',
				approvalTimeout: '48h',
				notifications: {
					slack: { enabled: false },
					email: { enabled: false },
				},
			};

			const result = HITLConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should reject invalid policy', () => {
			const config = {
				defaultPolicy: 'invalid-policy',
				approvalTimeout: '24h',
				notifications: {
					slack: { enabled: false },
					email: { enabled: false },
				},
			};

			const result = HITLConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should reject invalid email format', () => {
			const config = {
				defaultPolicy: 'review-edits',
				approvalTimeout: '24h',
				notifications: {
					slack: { enabled: false },
					email: {
						enabled: true,
						from: 'invalid-email',
						to: ['valid@example.com'],
					},
				},
			};

			const result = HITLConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should validate all escalation channels', () => {
			const channels = ['slack', 'email', 'dashboard', 'webhook'];

			for (const channel of channels) {
				const config = {
					defaultPolicy: 'review-edits',
					approvalTimeout: '24h',
					escalateOnCost: {
						threshold: 5.0,
						channel,
					},
					notifications: {
						slack: { enabled: false },
						email: { enabled: false },
					},
				};

				const result = HITLConfigSchema.safeParse(config);
				expect(result.success).toBe(true);
			}
		});
	});

	describe('StorageConfigSchema', () => {
		it('should validate SQLite config', () => {
			const config = {
				driver: 'sqlite',
				path: '.ado/state.db',
				rateLimitTracking: {
					driver: 'memory',
				},
			};

			const result = StorageConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate PostgreSQL config', () => {
			const config = {
				driver: 'postgresql',
				connectionString: 'postgres://localhost:5432/ado',
				rateLimitTracking: {
					driver: 'redis',
					redisUrl: 'redis://localhost:6379',
				},
			};

			const result = StorageConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should reject invalid storage driver', () => {
			const config = {
				driver: 'mysql',
				rateLimitTracking: {
					driver: 'memory',
				},
			};

			const result = StorageConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('should reject invalid rate limit driver', () => {
			const config = {
				driver: 'sqlite',
				rateLimitTracking: {
					driver: 'invalid',
				},
			};

			const result = StorageConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});
	});

	describe('ObservabilityConfigSchema', () => {
		it('should validate complete observability config', () => {
			const config = {
				logging: {
					level: 'debug',
					format: 'json',
				},
				costTracking: {
					enabled: true,
					reportInterval: 'weekly',
				},
				telemetry: {
					enabled: true,
					endpoint: 'https://otlp.example.com',
					serviceName: 'ado-production',
				},
			};

			const result = ObservabilityConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate all log levels', () => {
			const levels = ['debug', 'info', 'warn', 'error'];

			for (const level of levels) {
				const config = {
					logging: { level, format: 'pretty' },
					costTracking: { enabled: true, reportInterval: 'daily' },
				};

				const result = ObservabilityConfigSchema.safeParse(config);
				expect(result.success).toBe(true);
			}
		});

		it('should validate all report intervals', () => {
			const intervals = ['daily', 'weekly', 'monthly'];

			for (const reportInterval of intervals) {
				const config = {
					logging: { level: 'info', format: 'pretty' },
					costTracking: { enabled: true, reportInterval },
				};

				const result = ObservabilityConfigSchema.safeParse(config);
				expect(result.success).toBe(true);
			}
		});

		it('should accept config without telemetry', () => {
			const config = {
				logging: { level: 'info', format: 'pretty' },
				costTracking: { enabled: false, reportInterval: 'daily' },
			};

			const result = ObservabilityConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	describe('DeploymentConfigSchema', () => {
		it('should validate local deployment', () => {
			const config = {
				default: 'local',
				contexts: {
					local: {
						type: 'local',
					},
				},
			};

			const result = DeploymentConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate Docker deployment', () => {
			const config = {
				default: 'docker',
				contexts: {
					docker: {
						type: 'docker',
					},
				},
			};

			const result = DeploymentConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate Kubernetes deployment', () => {
			const config = {
				default: 'k8s-prod',
				contexts: {
					'k8s-prod': {
						type: 'k8s',
						namespace: 'ado-production',
						kubeconfig: '~/.kube/config',
					},
				},
			};

			const result = DeploymentConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should validate multiple contexts', () => {
			const config = {
				default: 'local',
				contexts: {
					local: { type: 'local' },
					dev: { type: 'k8s', namespace: 'ado-dev' },
					prod: { type: 'k8s', namespace: 'ado-prod' },
				},
			};

			const result = DeploymentConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	describe('AdoConfigSchema', () => {
		it('should validate minimal complete config', () => {
			const config = {
				version: '1.1',
				project: { id: 'test-project' },
				providers: {},
				routing: {
					strategy: 'subscription-first',
					failover: {
						enabled: true,
						onErrors: ['rate_limit'],
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
					rateLimitTracking: { driver: 'memory' },
				},
				observability: {
					logging: { level: 'info', format: 'pretty' },
					costTracking: { enabled: true, reportInterval: 'daily' },
				},
			};

			const result = AdoConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});

		it('should accept config without deployment', () => {
			const config = {
				version: '1.1',
				project: { id: 'test' },
				providers: {},
				routing: {
					strategy: 'subscription-first',
					failover: { enabled: true, onErrors: [], maxRetries: 3, retryDelay: 1000 },
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
					maxParallelAgents: 5,
					worktreeIsolation: true,
					checkpointInterval: 30,
					taskQueue: { concurrency: 3, retryAttempts: 3, retryDelay: 1000 },
				},
				hitl: {
					defaultPolicy: 'review-edits',
					approvalTimeout: '24h',
					notifications: { slack: { enabled: false }, email: { enabled: false } },
				},
				storage: {
					driver: 'sqlite',
					rateLimitTracking: { driver: 'memory' },
				},
				observability: {
					logging: { level: 'info', format: 'pretty' },
					costTracking: { enabled: true, reportInterval: 'daily' },
				},
			};

			const result = AdoConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
		});
	});

	describe('validateConfig', () => {
		it('should validate valid config', () => {
			const config = {
				version: '1.1',
				project: { id: 'test' },
				providers: {},
				routing: {
					strategy: 'subscription-first',
					failover: { enabled: true, onErrors: [], maxRetries: 3, retryDelay: 1000 },
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
					maxParallelAgents: 5,
					worktreeIsolation: true,
					checkpointInterval: 30,
					taskQueue: { concurrency: 3, retryAttempts: 3, retryDelay: 1000 },
				},
				hitl: {
					defaultPolicy: 'review-edits',
					approvalTimeout: '24h',
					notifications: { slack: { enabled: false }, email: { enabled: false } },
				},
				storage: {
					driver: 'sqlite',
					rateLimitTracking: { driver: 'memory' },
				},
				observability: {
					logging: { level: 'info', format: 'pretty' },
					costTracking: { enabled: true, reportInterval: 'daily' },
				},
			};

			expect(() => validateConfig(config)).not.toThrow();
		});

		it('should throw error for invalid config', () => {
			const config = {
				version: '1.1',
				project: { id: 123 }, // Invalid: should be string
			};

			expect(() => validateConfig(config)).toThrow();
		});
	});

	describe('validateConfigSafe', () => {
		it('should return success for valid config', () => {
			const config = {
				version: '1.1',
				project: { id: 'test' },
				providers: {},
				routing: {
					strategy: 'subscription-first',
					failover: { enabled: true, onErrors: [], maxRetries: 3, retryDelay: 1000 },
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
					maxParallelAgents: 5,
					worktreeIsolation: true,
					checkpointInterval: 30,
					taskQueue: { concurrency: 3, retryAttempts: 3, retryDelay: 1000 },
				},
				hitl: {
					defaultPolicy: 'review-edits',
					approvalTimeout: '24h',
					notifications: { slack: { enabled: false }, email: { enabled: false } },
				},
				storage: {
					driver: 'sqlite',
					rateLimitTracking: { driver: 'memory' },
				},
				observability: {
					logging: { level: 'info', format: 'pretty' },
					costTracking: { enabled: true, reportInterval: 'daily' },
				},
			};

			const result = validateConfigSafe(config);
			expect(result.success).toBe(true);
			expect(result.data).toBeDefined();
			expect(result.error).toBeUndefined();
		});

		it('should return error for invalid config', () => {
			const config = {
				version: '1.1',
				project: { id: 123 },
			};

			const result = validateConfigSafe(config);
			expect(result.success).toBe(false);
			expect(result.data).toBeUndefined();
			expect(result.error).toBeDefined();
		});
	});

	describe('formatValidationErrors', () => {
		it('should format validation errors', () => {
			const config = {
				version: '1.1',
				project: { id: 123 },
			};

			const result = validateConfigSafe(config);
			if (!result.success && result.error) {
				const formatted = formatValidationErrors(result.error);
				expect(formatted).toContain('Configuration validation failed');
				expect(formatted).toContain('project.id');
			}
		});

		it('should format multiple errors', () => {
			const config = {
				version: 123, // Invalid: should be string
				project: { id: 123 }, // Invalid: should be string
			};

			const result = validateConfigSafe(config);
			if (!result.success && result.error) {
				const formatted = formatValidationErrors(result.error);
				expect(formatted).toContain('version');
				expect(formatted).toContain('project.id');
			}
		});
	});

	describe('HITLPolicySchema', () => {
		it('should validate all policy values', () => {
			const policies = ['autonomous', 'review-edits', 'approve-steps', 'manual'];

			for (const policy of policies) {
				const result = HITLPolicySchema.safeParse(policy);
				expect(result.success).toBe(true);
			}
		});

		it('should reject invalid policy', () => {
			const result = HITLPolicySchema.safeParse('invalid');
			expect(result.success).toBe(false);
		});
	});
});
