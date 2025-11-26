/**
 * Rate Limit Tracker - tracks usage and determines rate limit status.
 */

import type {
	AccessMode,
	RateLimitInfo,
	RateLimitReason,
	RateLimitStatus,
	RemainingCapacity,
	UsageRecord,
} from '@ado/shared';

/**
 * Rate limit configuration for a provider/mode combination
 */
export interface RateLimitConfig {
	requestsPerMinute?: number | undefined;
	requestsPerHour?: number | undefined;
	requestsPerDay?: number | undefined;
	tokensPerMinute?: number | undefined;
	tokensPerDay?: number | undefined;
	resetTime?: string | undefined; // e.g., "00:00 UTC"
}

/**
 * Rate limit tracker interface
 */
export interface RateLimitTracker {
	/** Get current rate limit status */
	getStatus(providerId: string, mode: AccessMode): Promise<RateLimitStatus>;

	/** Record usage */
	recordUsage(usage: UsageRecord): Promise<void>;

	/** Get remaining capacity */
	getRemainingCapacity(providerId: string, mode: AccessMode): Promise<RemainingCapacity>;

	/** Configure rate limits for a provider */
	configure(providerId: string, mode: AccessMode, limits: RateLimitConfig): void;

	/** Parse rate limit error from agent response */
	parseError(error: Error): RateLimitInfo | null;
}

/**
 * In-memory usage record storage
 */
interface UsageEntry {
	timestamp: Date;
	requestCount: number;
	inputTokens: number;
	outputTokens: number;
}

/**
 * Default in-memory rate limit tracker
 */
export class InMemoryRateLimitTracker implements RateLimitTracker {
	private configs: Map<string, RateLimitConfig> = new Map();
	private usage: Map<string, UsageEntry[]> = new Map();

	private getKey(providerId: string, mode: AccessMode): string {
		return `${providerId}:${mode}`;
	}

	configure(providerId: string, mode: AccessMode, limits: RateLimitConfig): void {
		const key = this.getKey(providerId, mode);
		this.configs.set(key, { ...limits });
	}

	async recordUsage(record: UsageRecord): Promise<void> {
		const key = this.getKey(record.providerId, record.accessMode);
		const entries = this.usage.get(key) ?? [];

		entries.push({
			timestamp: record.timestamp,
			requestCount: record.requestCount,
			inputTokens: record.inputTokens,
			outputTokens: record.outputTokens,
		});

		// Keep only last 24 hours of data
		const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const filtered = entries.filter((e) => e.timestamp > dayAgo);
		this.usage.set(key, filtered);
	}

	async getStatus(providerId: string, mode: AccessMode): Promise<RateLimitStatus> {
		const key = this.getKey(providerId, mode);
		const config = this.configs.get(key);

		if (!config) {
			// No config = no limits
			return { isLimited: false };
		}

		const entries = this.usage.get(key) ?? [];
		const now = new Date();

		// Check minute limits
		if (config.requestsPerMinute !== undefined) {
			const minuteAgo = new Date(now.getTime() - 60 * 1000);
			const minuteRequests = this.sumRequests(entries, minuteAgo);
			if (minuteRequests >= config.requestsPerMinute) {
				return {
					isLimited: true,
					reason: 'minute_limit',
					resetsAt: new Date(minuteAgo.getTime() + 60 * 1000),
					remainingRequests: 0,
				};
			}
		}

		// Check hourly limits
		if (config.requestsPerHour !== undefined) {
			const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
			const hourRequests = this.sumRequests(entries, hourAgo);
			if (hourRequests >= config.requestsPerHour) {
				return {
					isLimited: true,
					reason: 'hourly_limit',
					resetsAt: new Date(hourAgo.getTime() + 60 * 60 * 1000),
					remainingRequests: 0,
				};
			}
		}

		// Check daily limits
		if (config.requestsPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const dayRequests = this.sumRequests(entries, resetTime);
			if (dayRequests >= config.requestsPerDay) {
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
			const dayTokens = this.sumTokens(entries, resetTime);
			if (dayTokens >= config.tokensPerDay) {
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

		const entries = this.usage.get(key) ?? [];
		const result: RemainingCapacity = {};

		if (config.requestsPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const used = this.sumRequests(entries, resetTime);
			result.requests = Math.max(0, config.requestsPerDay - used);
			result.resetsAt = this.getNextResetTime(config.resetTime);
		}

		if (config.tokensPerDay !== undefined) {
			const resetTime = this.getDailyResetTime(config.resetTime);
			const used = this.sumTokens(entries, resetTime);
			result.tokens = Math.max(0, config.tokensPerDay - used);
		}

		return result;
	}

	parseError(error: Error): RateLimitInfo | null {
		const message = error.message.toLowerCase();

		// Common rate limit patterns
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

			// Try to extract retry-after
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

	private sumRequests(entries: UsageEntry[], since: Date): number {
		return entries.filter((e) => e.timestamp > since).reduce((sum, e) => sum + e.requestCount, 0);
	}

	private sumTokens(entries: UsageEntry[], since: Date): number {
		return entries
			.filter((e) => e.timestamp > since)
			.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
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

		// If reset time is in the future today, use yesterday's reset
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
 * Create a new in-memory rate limit tracker
 */
export function createRateLimitTracker(): RateLimitTracker {
	return new InMemoryRateLimitTracker();
}
