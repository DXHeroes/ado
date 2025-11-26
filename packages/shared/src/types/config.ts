/**
 * Configuration schema types for ADO.
 * Maps to ado.config.yaml structure.
 */

import type { ProviderConfig } from './provider.js';
import type { HITLPolicy } from './task.js';

/**
 * Project configuration section
 */
export interface ProjectConfig {
	id: string;
	repository?: string;
}

/**
 * Routing strategy type
 */
export type RoutingStrategy = 'subscription-first' | 'round-robin' | 'cost-optimized';

/**
 * Failover configuration
 */
export interface FailoverConfig {
	enabled: boolean;
	onErrors: string[];
	maxRetries: number;
	retryDelay: number; // ms
}

/**
 * API fallback configuration
 */
export interface ApiFallbackConfig {
	enabled: boolean;
	confirmAboveCost: number;
	maxCostPerTask: number;
	maxDailyCost: number;
}

/**
 * Routing matching preferences
 */
export interface MatchingConfig {
	preferCapabilityMatch: boolean;
	preferLargerContext: boolean;
	preferFasterProvider: boolean;
}

/**
 * Routing configuration section
 */
export interface RoutingConfig {
	strategy: RoutingStrategy;
	failover: FailoverConfig;
	apiFallback: ApiFallbackConfig;
	matching: MatchingConfig;
}

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
	concurrency: number;
	retryAttempts: number;
	retryDelay: number;
}

/**
 * Orchestration configuration section
 */
export interface OrchestrationConfig {
	maxParallelAgents: number;
	worktreeIsolation: boolean;
	checkpointInterval: number;
	taskQueue: TaskQueueConfig;
}

/**
 * Slack notification config
 */
export interface SlackConfig {
	enabled: boolean;
	webhookUrl?: string;
	channel?: string;
}

/**
 * Email notification config
 */
export interface EmailConfig {
	enabled: boolean;
	to?: string;
}

/**
 * Cost escalation config
 */
export interface CostEscalationConfig {
	threshold: number;
	channel: string;
}

/**
 * HITL configuration section
 */
export interface HITLConfig {
	defaultPolicy: HITLPolicy;
	approvalTimeout: string;
	escalateOnCost?: CostEscalationConfig;
	notifications: {
		slack: SlackConfig;
		email: EmailConfig;
	};
}

/**
 * Storage driver type
 */
export type StorageDriver = 'sqlite' | 'postgresql';

/**
 * Rate limit tracking driver
 */
export type RateLimitDriver = 'memory' | 'redis';

/**
 * Storage configuration section
 */
export interface StorageConfig {
	driver: StorageDriver;
	path?: string; // For SQLite
	connectionString?: string; // For PostgreSQL
	rateLimitTracking: {
		driver: RateLimitDriver;
		redisUrl?: string;
	};
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
	level: 'debug' | 'info' | 'warn' | 'error';
	format: 'pretty' | 'json';
}

/**
 * Cost tracking configuration
 */
export interface CostTrackingConfig {
	enabled: boolean;
	reportInterval: 'hourly' | 'daily' | 'weekly';
}

/**
 * Observability configuration section
 */
export interface ObservabilityConfig {
	logging: LoggingConfig;
	costTracking: CostTrackingConfig;
}

/**
 * Deployment context
 */
export interface DeploymentContext {
	type: 'docker' | 'k8s';
	namespace?: string;
	kubeconfig?: string;
}

/**
 * Deployment configuration section
 */
export interface DeploymentConfig {
	default: string;
	contexts: Record<string, DeploymentContext>;
}

/**
 * Main ADO configuration structure
 */
export interface AdoConfig {
	version: string;
	project: ProjectConfig;
	providers: Record<string, ProviderConfig>;
	routing: RoutingConfig;
	orchestration: OrchestrationConfig;
	hitl: HITLConfig;
	storage: StorageConfig;
	observability: ObservabilityConfig;
	deployment?: DeploymentConfig;
}
