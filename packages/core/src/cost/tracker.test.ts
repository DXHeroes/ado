/**
 * Tests for Cost Tracker
 */

import type { UsageRecord } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCostTracker } from './tracker.js';

describe('InMemoryCostTracker', () => {
	let tracker: InMemoryCostTracker;

	beforeEach(() => {
		tracker = new InMemoryCostTracker();
	});

	describe('recordUsage', () => {
		it('should record usage', async () => {
			const usage: UsageRecord = {
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			};

			await tracker.recordUsage(usage);

			const summary = await tracker.getSummary();
			expect(summary.totalCost).toBe(0.045);
			expect(summary.requestCount).toBe(1);
			expect(summary.inputTokens).toBe(1000);
			expect(summary.outputTokens).toBe(2000);
		});

		it('should accumulate multiple usages', async () => {
			const usage1: UsageRecord = {
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			};

			const usage2: UsageRecord = {
				providerId: 'gemini-cli',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 1000,
				costUsd: 0.0125,
			};

			await tracker.recordUsage(usage1);
			await tracker.recordUsage(usage2);

			const summary = await tracker.getSummary();
			expect(summary.totalCost).toBeCloseTo(0.0575, 4);
			expect(summary.requestCount).toBe(2);
		});
	});

	describe('getSummary', () => {
		it('should return summary by provider', async () => {
			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			await tracker.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 1000,
				costUsd: 0.0125,
			});

			const summary = await tracker.getSummary();

			expect(summary.byProvider.size).toBe(2);
			expect(summary.byProvider.get('claude-code')?.totalCost).toBe(0.045);
			expect(summary.byProvider.get('gemini-cli')?.totalCost).toBe(0.0125);
		});

		it('should return summary by access mode', async () => {
			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'subscription',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
			});

			const summary = await tracker.getSummary();

			expect(summary.byMode.size).toBe(2);
			expect(summary.byMode.get('api')?.totalCost).toBe(0.045);
			expect(summary.byMode.get('subscription')?.totalCost).toBe(0);
		});

		it('should filter by date range', async () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: yesterday,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: now,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			const summary = await tracker.getSummary({
				startDate: now,
				endDate: tomorrow,
			});

			expect(summary.requestCount).toBe(1);
			expect(summary.totalCost).toBe(0.045);
		});

		it('should filter by provider', async () => {
			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			await tracker.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 1000,
				costUsd: 0.0125,
			});

			const summary = await tracker.getSummary({
				providerId: 'claude-code',
			});

			expect(summary.requestCount).toBe(1);
			expect(summary.totalCost).toBe(0.045);
		});
	});

	describe('getDailyCost', () => {
		it('should calculate daily cost', async () => {
			const today = new Date();
			const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: today,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: tomorrow,
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			const todayCost = await tracker.getDailyCost(today);
			expect(todayCost).toBe(0.045);
		});
	});

	describe('isOverDailyLimit', () => {
		it('should check if over daily limit', async () => {
			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 5.0,
			});

			const isOver = await tracker.isOverDailyLimit(10.0);
			expect(isOver).toBe(false);

			const isOverLower = await tracker.isOverDailyLimit(4.0);
			expect(isOverLower).toBe(true);
		});
	});

	describe('estimateCost', () => {
		it('should estimate cost correctly', () => {
			const cost = tracker.estimateCost(
				'claude-code',
				1000,
				2000,
				{ input: 3.0, output: 15.0 }, // Claude Sonnet 4
			);

			// (1000 * 3.0 / 1M) + (2000 * 15.0 / 1M) = 0.003 + 0.030 = 0.033
			expect(cost).toBeCloseTo(0.033, 4);
		});
	});

	describe('getProviderBreakdown', () => {
		it('should return providers sorted by cost', async () => {
			await tracker.recordUsage({
				providerId: 'claude-code',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 1000,
				outputTokens: 2000,
				costUsd: 0.045,
			});

			await tracker.recordUsage({
				providerId: 'gemini-cli',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 500,
				outputTokens: 1000,
				costUsd: 0.0125,
			});

			await tracker.recordUsage({
				providerId: 'cursor-cli',
				accessMode: 'api',
				timestamp: new Date(),
				requestCount: 1,
				inputTokens: 2000,
				outputTokens: 4000,
				costUsd: 0.09,
			});

			const breakdown = await tracker.getProviderBreakdown();

			expect(breakdown).toHaveLength(3);
			expect(breakdown[0]?.providerId).toBe('cursor-cli');
			expect(breakdown[1]?.providerId).toBe('claude-code');
			expect(breakdown[2]?.providerId).toBe('gemini-cli');
		});
	});
});
