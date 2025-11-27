/**
 * ADO API Types
 */

import type { AsyncStateStore, StateStore } from '@dxheroes/ado-core';
import type { Env } from 'hono';

/**
 * API server configuration
 */
export interface ApiConfig {
	/** Port to listen on */
	port?: number;
	/** Host to bind to */
	host?: string;
	/** CORS allowed origins */
	corsOrigins?: string[];
	/** Path to SQLite state store */
	stateStorePath?: string;
	/** Redis URL for distributed state */
	redisUrl?: string;
	/** PostgreSQL URL for distributed state */
	postgresUrl?: string;
	/** Optional state store instance */
	stateStore?: StateStore | AsyncStateStore;
}

/**
 * Hono context with ADO config
 */
export interface ApiContext extends Env {
	Variables: {
		config: ApiConfig;
		stateStore?: StateStore | AsyncStateStore;
	};
}

/**
 * Dashboard stats response
 */
export interface DashboardStats {
	activeTasks: number;
	completedToday: number;
	apiCost24h: number;
	avgDuration: number;
	recentAlerts: Array<{
		message: string;
		time: string;
	}>;
}

/**
 * Usage history response
 */
export interface UsageHistory {
	taskVolume: Array<{ date: string; count: number }>;
	providerUsage: Array<{ provider: string; count: number }>;
	costTrend: Array<{ date: string; subscription: number; api: number }>;
}

/**
 * Task response
 */
export interface TaskResponse {
	id: string;
	prompt: string;
	provider: string;
	status: 'running' | 'paused' | 'completed' | 'failed' | 'pending';
	startedAt: string;
	completedAt?: string;
	duration?: number;
	cost?: number;
	accessMode?: string;
}

/**
 * Task detail response
 */
export interface TaskDetailResponse extends TaskResponse {
	events?: Array<{
		type: string;
		timestamp: string;
		data?: unknown;
	}>;
}

/**
 * Provider response
 */
export interface ProviderResponse {
	id: string;
	name: string;
	enabled: boolean;
	accessModes: Array<{
		mode: 'subscription' | 'api' | 'free';
		enabled: boolean;
		priority: number;
	}>;
	rateLimits?: {
		requestsPerDay?: number;
		requestsPerHour?: number;
		tokensPerDay?: number;
	};
	capabilities: {
		codeGeneration: boolean;
		codeReview: boolean;
		refactoring: boolean;
		testing: boolean;
		documentation: boolean;
		debugging: boolean;
	};
	usage?: {
		requestsToday?: number;
	};
}
