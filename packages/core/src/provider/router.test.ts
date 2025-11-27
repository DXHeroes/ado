/**
 * Tests for Subscription-First Router
 */

import type { ProviderConfig, TaskDefinition } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRateLimitTracker } from '../rate-limit/tracker.js';
import { DefaultProviderRegistry } from './registry.js';

describe('Subscription-First Router', () => {
	let registry: DefaultProviderRegistry;
	let rateLimitTracker: InMemoryRateLimitTracker;

	const claudeProvider: ProviderConfig = {
		id: 'claude-code',
		enabled: true,
		accessModes: [
			{
				mode: 'subscription',
				priority: 1,
				enabled: true,
				subscription: {
					plan: 'max',
					rateLimits: {
						requestsPerDay: 500,
						tokensPerDay: 5000000,
					},
					resetTime: '00:00 UTC',
				},
			},
			{
				mode: 'api',
				priority: 10,
				enabled: true,
				api: {
					apiKey: 'test-key',
					rateLimits: {
						requestsPerMinute: 50,
						tokensPerMinute: 100000,
					},
					costPerMillion: {
						input: 3.0,
						output: 15.0,
					},
				},
			},
		],
		capabilities: {
			codeGeneration: true,
			codeReview: true,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: true,
			languages: ['typescript', 'python'],
			maxContextTokens: 200000,
			supportsStreaming: true,
			supportsMCP: true,
			supportsResume: true,
		},
	};

	const geminiProvider: ProviderConfig = {
		id: 'gemini-cli',
		enabled: true,
		accessModes: [
			{
				mode: 'subscription',
				priority: 2,
				enabled: true,
				subscription: {
					plan: 'advanced',
					rateLimits: {
						requestsPerDay: 1000,
					},
					resetTime: '00:00 UTC',
				},
			},
			{
				mode: 'api',
				priority: 11,
				enabled: true,
				api: {
					apiKey: 'test-key',
					rateLimits: {
						requestsPerMinute: 60,
						tokensPerMinute: 120000,
					},
					costPerMillion: {
						input: 1.25,
						output: 5.0,
					},
				},
			},
		],
		capabilities: {
			codeGeneration: true,
			codeReview: true,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: true,
			languages: ['typescript', 'python', 'go'],
			maxContextTokens: 1000000,
			supportsStreaming: true,
			supportsMCP: true,
			supportsResume: false,
		},
	};

	beforeEach(() => {
		rateLimitTracker = new InMemoryRateLimitTracker();
		registry = new DefaultProviderRegistry(rateLimitTracker);

		// Configure rate limits
		rateLimitTracker.configure('claude-code', 'subscription', {
			requestsPerDay: 500,
			tokensPerDay: 5000000,
			resetTime: '00:00 UTC',
		});

		rateLimitTracker.configure('gemini-cli', 'subscription', {
			requestsPerDay: 1000,
			resetTime: '00:00 UTC',
		});

		// Register providers
		registry.register(claudeProvider);
		registry.register(geminiProvider);
	});

	describe('Provider Selection', () => {
		it('should select subscription mode first (priority 1)', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
			};

			const selection = await registry.selectProvider(task);

			expect(selection).not.toBeNull();
			expect(selection?.provider.id).toBe('claude-code');
			expect(selection?.accessMode.mode).toBe('subscription');
			expect(selection?.reason).toBe('subscription available');
		});

		it('should fall back to next priority when rate limited', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
			};

			// Exhaust claude subscription
			for (let i = 0; i < 500; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'claude-code',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			const selection = await registry.selectProvider(task);

			expect(selection).not.toBeNull();
			expect(selection?.provider.id).toBe('gemini-cli');
			expect(selection?.accessMode.mode).toBe('subscription');
		});

		it('should fall back to API when all subscriptions exhausted', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				allowApiFailover: true,
			};

			// Exhaust both subscriptions
			for (let i = 0; i < 500; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'claude-code',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			for (let i = 0; i < 1000; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'gemini-cli',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			const selection = await registry.selectProvider(task);

			expect(selection).not.toBeNull();
			expect(selection?.accessMode.mode).toBe('api');
			expect(selection?.reason).toBe('API fallback');
			expect(selection?.estimatedCost).toBeGreaterThan(0);
		});

		it('should skip API fallback when disabled', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				allowApiFailover: false,
			};

			// Exhaust all subscriptions
			for (let i = 0; i < 500; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'claude-code',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			for (let i = 0; i < 1000; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'gemini-cli',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			const selection = await registry.selectProvider(task);

			expect(selection).toBeNull();
		});

		it('should respect max API cost limit', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				allowApiFailover: true,
				maxApiCostUsd: 0.001, // Very low limit
			};

			// Exhaust all subscriptions
			for (let i = 0; i < 500; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'claude-code',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			for (let i = 0; i < 1000; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'gemini-cli',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			const selection = await registry.selectProvider(task);

			// Should be null because estimated cost exceeds maxApiCostUsd
			expect(selection).toBeNull();
		});

		it('should filter by preferred providers', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				preferredProviders: ['gemini-cli'],
			};

			const selection = await registry.selectProvider(task);

			expect(selection).not.toBeNull();
			expect(selection?.provider.id).toBe('gemini-cli');
		});

		it('should exclude specified providers', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				excludeProviders: ['claude-code'],
			};

			const selection = await registry.selectProvider(task);

			expect(selection).not.toBeNull();
			expect(selection?.provider.id).toBe('gemini-cli');
		});

		it('should filter by required capabilities', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				constraints: {
					requiredCapabilities: ['supportsResume'],
				},
			};

			const selection = await registry.selectProvider(task);

			expect(selection).not.toBeNull();
			expect(selection?.provider.id).toBe('claude-code');
			expect(selection?.provider.capabilities.supportsResume).toBe(true);
		});
	});

	describe('Provider Management', () => {
		it('should enable/disable providers', () => {
			registry.setEnabled('claude-code', false);

			const providers = registry.getEnabled();
			expect(providers).toHaveLength(1);
			expect(providers[0]?.id).toBe('gemini-cli');
		});

		it('should enable/disable access modes', () => {
			registry.setAccessModeEnabled('claude-code', 'api', false);

			const provider = registry.get('claude-code');
			const apiMode = provider?.accessModes.find((am) => am.mode === 'api');

			expect(apiMode?.enabled).toBe(false);
		});

		it('should update priority', () => {
			registry.setPriority('claude-code', 'api', 5);

			const provider = registry.get('claude-code');
			const apiMode = provider?.accessModes.find((am) => am.mode === 'api');

			expect(apiMode?.priority).toBe(5);
		});
	});

	describe('Cost Estimation', () => {
		it('should estimate cost for API mode', async () => {
			const task: TaskDefinition = {
				prompt: 'Test task',
				projectKey: 'test',
				repositoryPath: '/test',
				allowApiFailover: true,
			};

			// Exhaust subscriptions
			for (let i = 0; i < 500; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'claude-code',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			for (let i = 0; i < 1000; i++) {
				await rateLimitTracker.recordUsage({
					providerId: 'gemini-cli',
					accessMode: 'subscription',
					timestamp: new Date(),
					requestCount: 1,
					inputTokens: 1000,
					outputTokens: 2000,
				});
			}

			const selection = await registry.selectProvider(task);

			expect(selection?.estimatedCost).toBeDefined();
			expect(selection?.estimatedCost).toBeGreaterThan(0);
		});
	});
});
