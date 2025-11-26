/**
 * Provider configuration types for ADO.
 * Defines how agents are configured with subscription and API access modes.
 */

/**
 * Rate limits for subscription-based access
 */
export interface SubscriptionRateLimits {
	requestsPerDay?: number;
	requestsPerHour?: number;
	tokensPerDay?: number;
}

/**
 * Rate limits for API-based access
 */
export interface ApiRateLimits {
	requestsPerMinute: number;
	tokensPerMinute: number;
}

/**
 * Cost per million tokens for API access
 */
export interface TokenCost {
	input: number;
	output: number;
}

/**
 * Subscription-specific configuration
 */
export interface SubscriptionConfig {
	plan: string; // 'free', 'pro', 'max', 'team', etc.
	rateLimits: SubscriptionRateLimits;
	resetTime?: string; // "00:00 UTC"
}

/**
 * API-specific configuration
 */
export interface ApiConfig {
	apiKey: string;
	baseUrl?: string;
	rateLimits: ApiRateLimits;
	costPerMillion: TokenCost;
}

/**
 * Access mode types: subscription, api, or free
 */
export type AccessMode = 'subscription' | 'api' | 'free';

/**
 * Configuration for a specific access mode
 */
export interface AccessModeConfig {
	mode: AccessMode;
	priority: number; // Lower = higher priority (1 = try first)
	enabled: boolean;

	// Subscription-specific (optional)
	subscription?: SubscriptionConfig;

	// API-specific (optional)
	api?: ApiConfig;
}

/**
 * Capabilities of an agent
 */
export interface AgentCapabilities {
	codeGeneration: boolean;
	codeReview: boolean;
	refactoring: boolean;
	testing: boolean;
	documentation: boolean;
	debugging: boolean;

	languages: string[];
	maxContextTokens: number;
	supportsStreaming: boolean;
	supportsMCP: boolean;
	supportsResume: boolean;
}

/**
 * Default options for a provider
 */
export interface ProviderDefaultOptions {
	model?: string;
	maxTurns?: number;
	permissionMode?: string;
	approvalMode?: string;
}

/**
 * Main provider configuration
 */
export interface ProviderConfig {
	id: string;
	enabled: boolean;
	accessModes: AccessModeConfig[];
	capabilities: AgentCapabilities;
	contextFile?: string | undefined; // CLAUDE.md, GEMINI.md, etc.
	defaultOptions?: ProviderDefaultOptions | undefined;
}

/**
 * Result of selecting a provider for a task
 */
export interface ProviderSelection {
	provider: ProviderConfig;
	accessMode: AccessModeConfig;
	reason: string;
	estimatedCost?: number | undefined; // Only for API mode
}
