/**
 * Rate limit detection and tracking types for ADO.
 */

/**
 * Reason for rate limit
 */
export type RateLimitReason =
	| 'daily_limit'
	| 'hourly_limit'
	| 'token_limit'
	| 'concurrent_limit'
	| 'minute_limit';

/**
 * Current rate limit status
 */
export interface RateLimitStatus {
	isLimited: boolean;
	reason?: RateLimitReason;
	resetsAt?: Date;
	remainingRequests?: number;
	remainingTokens?: number;
}

/**
 * Parsed rate limit information from an error
 */
export interface RateLimitInfo {
	reason: RateLimitReason;
	resetsAt?: Date | undefined;
	retryAfter?: number | undefined; // seconds
	message?: string | undefined;
}

/**
 * Remaining capacity information
 */
export interface RemainingCapacity {
	requests?: number | undefined;
	tokens?: number | undefined;
	resetsAt?: Date | undefined;
}

/**
 * Record of usage for tracking
 */
export interface UsageRecord {
	providerId: string;
	accessMode: 'subscription' | 'api' | 'free';
	timestamp: Date;
	requestCount: number;
	inputTokens: number;
	outputTokens: number;
	costUsd?: number | undefined; // Only for API mode
}

/**
 * Rate limit detector interface
 */
export interface RateLimitDetector {
	/**
	 * Check current rate limit status without making a request
	 */
	getStatus(): Promise<RateLimitStatus>;

	/**
	 * Parse rate limit info from a response error
	 */
	parseRateLimitError(error: Error): RateLimitInfo | null;

	/**
	 * Estimate remaining capacity
	 */
	getRemainingCapacity(): Promise<RemainingCapacity>;

	/**
	 * Record usage for tracking
	 */
	recordUsage(usage: UsageRecord): Promise<void>;
}
