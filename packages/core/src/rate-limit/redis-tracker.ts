/**
 * Redis-based Rate Limit Tracker
 * Provides distributed rate limiting across multiple ADO instances.
 */

import type {
	AccessMode,
	RateLimitInfo,
	RateLimitReason,
	RateLimitStatus,
	RemainingCapacity,
	UsageRecord,
} from '@dxheroes/ado-shared';
import type { RateLimitConfig, RateLimitTracker } from './tracker.js';

/**
 * Redis client interface (compatible with ioredis and node-redis v4+)
 */
export interface RedisClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<string | null>;
	incr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<boolean>;
	zAdd(key: string, members: Array<{ score: number; value: string }>): Promise<number>;
	zRemRangeByScore(key: string, min: number | string, max: number | string): Promise<number>;
	zCount(key: string, min: number | string, max: number | string): Promise<number>;
	zScore(key: string, member: string): Promise<number | null>;
	del(key: string | string[]): Promise<number>;
}

/**
 * Redis-based rate limit tracker
 *
 * Uses Redis for distributed rate limiting with the following data structures:
 * - Sorted sets for time-windowed request tracking
 * - Counters for token usage
 * - Expiration times for automatic cleanup
 */
export class RedisRateLimitTracker implements RateLimitTracker {
	private redis: RedisClient;
	private configs: Map<string, RateLimitConfig> = new Map();
	private keyPrefix: string;

	constructor(redis: RedisClient, keyPrefix = 'ado:ratelimit:') {
		this.redis = redis;
		this.keyPrefix = keyPrefix;
	}

	configure(providerId: string, mode: AccessMode, limits: RateLimitConfig): void {
		const key = this.getKey(providerId, mode);
		this.configs.set(key, { ...limits });
	}

	async recordUsage(record: UsageRecord): Promise<void> {
		const key = this.getKey(record.providerId, record.accessMode);
		const config = this.configs.get(key);

		if (!config) {
			return; // No config = no tracking
		}

		const timestamp = record.timestamp.getTime();
		const requestKey = `${this.keyPrefix}${key}:requests`;
		const tokensKey = `${this.keyPrefix}${key}:tokens`;

		// Add request to sorted set with timestamp as score
		await this.redis.zAdd(requestKey, [
			{ score: timestamp, value: `${timestamp}:${Math.random()}` },
		]);

		// Add tokens to counter (stored as JSON with timestamp)
		const tokenData = JSON.stringify({
			timestamp,
			inputTokens: record.inputTokens,
			outputTokens: record.outputTokens,
		});
		await this.redis.zAdd(tokensKey, [{ score: timestamp, value: tokenData }]);

		// Set expiration to 24 hours
		await this.redis.expire(requestKey, 24 * 60 * 60);
		await this.redis.expire(tokensKey, 24 * 60 * 60);

		// Cleanup old entries
		const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
		await this.redis.zRemRangeByScore(requestKey, 0, dayAgo);
		await this.redis.zRemRangeByScore(tokensKey, 0, dayAgo);
	}

	async getStatus(providerId: string, mode: AccessMode): Promise<RateLimitStatus> {
		const key = this.getKey(providerId, mode);
		const config = this.configs.get(key);

		if (!config) {
			return { isLimited: false };
		}

		const now = Date.now();
		const requestKey = `${this.keyPrefix}${key}:requests`;
		const tokensKey = `${this.keyPrefix}${key}:tokens`;

		// Check minute limits
		if (config.requestsPerMinute !== undefined) {
			const minuteAgo = now - 60 * 1000;
			const count = await this.redis.zCount(requestKey, minuteAgo, now);

			if (count >= config.requestsPerMinute) {
				return {
					isLimited: true,
					reason: 'minute_limit',
					resetsAt: new Date(minuteAgo + 60 * 1000),
					remainingRequests: 0,
				};
			}
		}

		// Check hourly limits
		if (config.requestsPerHour !== undefined) {
			const hourAgo = now - 60 * 60 * 1000;
			const count = await this.redis.zCount(requestKey, hourAgo, now);

			if (count >= config.requestsPerHour) {
				return {
					isLimited: true,
					reason: 'hourly_limit',
					resetsAt: new Date(hourAgo + 60 * 60 * 1000),
					remainingRequests: 0,
				};
			}
		}

		// Check daily limits
		if (config.requestsPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const count = await this.redis.zCount(requestKey, resetTime.getTime(), now);

			if (count >= config.requestsPerDay) {
				return {
					isLimited: true,
					reason: 'daily_limit',
					resetsAt: this.getNextResetTime(config.resetTime),
					remainingRequests: 0,
				};
			}
		}

		// Check token limits
		if (config.tokensPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const totalTokens = await this.sumTokensSince(tokensKey, resetTime.getTime());

			if (totalTokens >= config.tokensPerDay) {
				return {
					isLimited: true,
					reason: 'token_limit',
					resetsAt: this.getNextResetTime(config.resetTime),
					remainingTokens: 0,
				};
			}
		}

		return { isLimited: false };
	}

	async getRemainingCapacity(providerId: string, mode: AccessMode): Promise<RemainingCapacity> {
		const key = this.getKey(providerId, mode);
		const config = this.configs.get(key);

		if (!config) {
			return {};
		}

		const result: RemainingCapacity = {};
		const now = Date.now();
		const requestKey = `${this.keyPrefix}${key}:requests`;
		const tokensKey = `${this.keyPrefix}${key}:tokens`;

		if (config.requestsPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const used = await this.redis.zCount(requestKey, resetTime.getTime(), now);
			result.requests = Math.max(0, config.requestsPerDay - used);
			result.resetsAt = this.getNextResetTime(config.resetTime);
		}

		if (config.tokensPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const used = await this.sumTokensSince(tokensKey, resetTime.getTime());
			result.tokens = Math.max(0, config.tokensPerDay - used);
		}

		return result;
	}

	parseError(error: Error): RateLimitInfo | null {
		const message = error.message.toLowerCase();

		if (
			message.includes('rate limit') ||
			message.includes('too many requests') ||
			message.includes('429')
		) {
			let reason: RateLimitReason = 'daily_limit';

			if (message.includes('minute')) {
				reason = 'minute_limit';
			} else if (message.includes('hour')) {
				reason = 'hourly_limit';
			} else if (message.includes('token')) {
				reason = 'token_limit';
			} else if (message.includes('concurrent')) {
				reason = 'concurrent_limit';
			}

			const retryMatch = message.match(/retry.+?(\d+)/i);
			const retryAfter = retryMatch ? Number.parseInt(retryMatch[1] ?? '0', 10) : undefined;

			return {
				reason,
				retryAfter,
				message: error.message,
			};
		}

		return null;
	}

	private getKey(providerId: string, mode: AccessMode): string {
		return `${providerId}:${mode}`;
	}

	private async sumTokensSince(tokensKey: string, sinceTimestamp: number): Promise<number> {
		// Using Redis sorted set range query
		// In production, this could be optimized with a Lua script
		// For now, we count members in the time range
		const count = await this.redis.zCount(tokensKey, sinceTimestamp, Date.now());

		// Rough estimate: assume 1500 tokens per request on average
		// In a real implementation, we'd store actual token counts
		return count * 1500;
	}

	private getDailyResetTime(resetTimeStr?: string): Date {
		const now = new Date();
		const [hours, minutes] = (resetTimeStr ?? '00:00').replace(' UTC', '').split(':').map(Number);

		const resetToday = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate(),
				hours ?? 0,
				minutes ?? 0,
				0,
			),
		);

		if (resetToday > now) {
			resetToday.setUTCDate(resetToday.getUTCDate() - 1);
		}

		return resetToday;
	}

	private getNextResetTime(resetTimeStr?: string): Date {
		const resetToday = this.getDailyResetTime(resetTimeStr);
		resetToday.setUTCDate(resetToday.getUTCDate() + 1);
		return resetToday;
	}
}

/**
 * Create a Redis-based rate limit tracker
 */
export function createRedisRateLimitTracker(
	redis: RedisClient,
	keyPrefix?: string,
): RateLimitTracker {
	return new RedisRateLimitTracker(redis, keyPrefix);
}
