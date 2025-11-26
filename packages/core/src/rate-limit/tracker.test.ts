/**
 * Tests for Rate Limit Tracker
 */

import { describe, expect, it } from 'vitest';
import { InMemoryRateLimitTracker, createRateLimitTracker } from './tracker.js';

describe('RateLimitTracker', () => {
	describe('createRateLimitTracker', () => {
		it('should create a tracker instance', () => {
			const tracker = createRateLimitTracker();
			expect(tracker).toBeInstanceOf(InMemoryRateLimitTracker);
		});
	});

	describe('configure', () => {
		it('should configure rate limits for a provider', () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'subscription', {
				requestsPerDay: 100,
				tokensPerDay: 1000000,
			});

			// No error thrown means success
			expect(true).toBe(true);
		});
	});

	describe('getStatus', () => {
		it('should return not limited when no config', async () => {
			const tracker = createRateLimitTracker();

			const status = await tracker.getStatus('unknown', 'subscription');

			expect(status.isLimited).toBe(false);
		});

		it('should track daily request limits', async () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'subscription', {
				requestsPerDay: 2,
			});

			// Record usage
			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 2,
				inputTokens: 100,
				outputTokens: 50,
			});

			const status = await tracker.getStatus('claude', 'subscription');

			expect(status.isLimited).toBe(true);
			expect(status.reason).toBe('daily_limit');
		});

		it('should track minute request limits', async () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'api', {
				requestsPerMinute: 1,
			});

			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 100,
				outputTokens: 50,
			});

			const status = await tracker.getStatus('claude', 'api');

			expect(status.isLimited).toBe(true);
			expect(status.reason).toBe('minute_limit');
		});

		it('should track token limits', async () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'subscription', {
				tokensPerDay: 100,
			});

			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 60,
				outputTokens: 50, // Total 110 > 100
			});

			const status = await tracker.getStatus('claude', 'subscription');

			expect(status.isLimited).toBe(true);
			expect(status.reason).toBe('token_limit');
		});
	});

	describe('getRemainingCapacity', () => {
		it('should return empty object when no config', async () => {
			const tracker = createRateLimitTracker();

			const capacity = await tracker.getRemainingCapacity('unknown', 'subscription');

			expect(capacity).toEqual({});
		});

		it('should calculate remaining requests', async () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'subscription', {
				requestsPerDay: 100,
			});

			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 30,
				inputTokens: 100,
				outputTokens: 50,
			});

			const capacity = await tracker.getRemainingCapacity('claude', 'subscription');

			expect(capacity.requests).toBe(70);
		});

		it('should calculate remaining tokens', async () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'subscription', {
				tokensPerDay: 1000,
			});

			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 300,
				outputTokens: 200,
			});

			const capacity = await tracker.getRemainingCapacity('claude', 'subscription');

			expect(capacity.tokens).toBe(500);
		});
	});

	describe('parseError', () => {
		it('should parse rate limit error', () => {
			const tracker = createRateLimitTracker();

			const error = new Error('Rate limit exceeded. Too many requests.');
			const info = tracker.parseError(error);

			expect(info).not.toBeNull();
			expect(info?.reason).toBe('daily_limit');
		});

		it('should detect minute limit', () => {
			const tracker = createRateLimitTracker();

			const error = new Error('Rate limit: 60 requests per minute exceeded');
			const info = tracker.parseError(error);

			expect(info?.reason).toBe('minute_limit');
		});

		it('should detect hour limit', () => {
			const tracker = createRateLimitTracker();

			const error = new Error('Hourly rate limit reached');
			const info = tracker.parseError(error);

			expect(info?.reason).toBe('hourly_limit');
		});

		it('should detect token limit from rate limit message', () => {
			const tracker = createRateLimitTracker();

			// The parser looks for "rate limit" or "429" AND "token"
			const error = new Error('Rate limit exceeded: token quota reached');
			const info = tracker.parseError(error);

			expect(info?.reason).toBe('token_limit');
		});

		it('should extract retry-after', () => {
			const tracker = createRateLimitTracker();

			const error = new Error('Rate limited. Please retry after 60 seconds.');
			const info = tracker.parseError(error);

			expect(info?.retryAfter).toBe(60);
		});

		it('should return null for non-rate-limit errors', () => {
			const tracker = createRateLimitTracker();

			const error = new Error('Connection failed');
			const info = tracker.parseError(error);

			expect(info).toBeNull();
		});
	});

	describe('recordUsage', () => {
		it('should record usage', async () => {
			const tracker = createRateLimitTracker();

			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 100,
				outputTokens: 50,
			});

			// Success if no error
			expect(true).toBe(true);
		});

		it('should clean up old entries', async () => {
			const tracker = createRateLimitTracker();

			tracker.configure('claude', 'subscription', {
				requestsPerDay: 100,
			});

			// Record old usage (more than 24 hours ago)
			const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: oldDate,
				requestCount: 50,
				inputTokens: 100,
				outputTokens: 50,
			});

			// Record current usage
			await tracker.recordUsage({
				providerId: 'claude',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 10,
				inputTokens: 100,
				outputTokens: 50,
			});

			const capacity = await tracker.getRemainingCapacity('claude', 'subscription');

			// Should only count recent usage (10), not old (50)
			expect(capacity.requests).toBe(90);
		});
	});
});
