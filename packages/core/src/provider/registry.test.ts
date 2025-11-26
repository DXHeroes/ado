/**
 * Tests for Provider Registry
 */

import { describe, expect, it } from 'vitest';
import { createRateLimitTracker } from '../rate-limit/tracker.js';
import { DefaultProviderRegistry, createProviderRegistry } from './registry.js';

describe('ProviderRegistry', () => {
	const createTestProvider = (id: string, enabled = true) => ({
		id,
		enabled,
		accessModes: [
			{
				mode: 'subscription' as const,
				enabled: true,
				priority: 1,
			},
		],
		capabilities: {
			codeGeneration: true,
			codeReview: true,
			refactoring: true,
			testing: true,
			documentation: true,
			debugging: true,
			languages: ['typescript', 'javascript'],
			maxContextTokens: 100000,
			supportsStreaming: true,
			supportsMCP: false,
			supportsResume: true,
		},
	});

	describe('createProviderRegistry', () => {
		it('should create a registry instance', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);
			expect(registry).toBeInstanceOf(DefaultProviderRegistry);
		});
	});

	describe('register', () => {
		it('should register a provider', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('test-provider'));

			const providers = registry.getAll();
			expect(providers).toHaveLength(1);
			expect(providers[0]?.id).toBe('test-provider');
		});

		it('should register disabled providers too', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('disabled-provider', false));

			const allProviders = registry.getAll();
			expect(allProviders).toHaveLength(1);

			const enabledProviders = registry.getEnabled();
			expect(enabledProviders).toHaveLength(0);
		});
	});

	describe('get', () => {
		it('should return provider by ID', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('my-provider'));

			const provider = registry.get('my-provider');
			expect(provider).toBeDefined();
			expect(provider?.id).toBe('my-provider');
		});

		it('should return undefined for unknown provider', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			const provider = registry.get('unknown');
			expect(provider).toBeUndefined();
		});
	});

	describe('setEnabled', () => {
		it('should enable a disabled provider', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('provider', false));
			expect(registry.getEnabled()).toHaveLength(0);

			registry.setEnabled('provider', true);
			expect(registry.getEnabled()).toHaveLength(1);
		});

		it('should disable an enabled provider', () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('provider', true));
			expect(registry.getEnabled()).toHaveLength(1);

			registry.setEnabled('provider', false);
			expect(registry.getEnabled()).toHaveLength(0);
		});
	});

	describe('selectProvider', () => {
		it('should select an available provider', async () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('provider-1'));
			registry.register(createTestProvider('provider-2'));

			const task = {
				prompt: 'Test task',
				projectKey: 'test-project',
				repositoryPath: '/test/path',
			};

			const selection = await registry.selectProvider(task);

			expect(selection).toBeDefined();
			expect(['provider-1', 'provider-2']).toContain(selection?.provider.id);
		});

		it('should respect preferred providers', async () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('provider-1'));
			registry.register(createTestProvider('provider-2'));

			const task = {
				prompt: 'Test task',
				projectKey: 'test-project',
				repositoryPath: '/test/path',
				preferredProviders: ['provider-2'],
			};

			const selection = await registry.selectProvider(task);

			expect(selection?.provider.id).toBe('provider-2');
		});

		it('should exclude specified providers', async () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			registry.register(createTestProvider('provider-1'));
			registry.register(createTestProvider('provider-2'));

			const task = {
				prompt: 'Test task',
				projectKey: 'test-project',
				repositoryPath: '/test/path',
				excludeProviders: ['provider-1'],
			};

			const selection = await registry.selectProvider(task);

			expect(selection?.provider.id).toBe('provider-2');
		});

		it('should return null when no providers available', async () => {
			const tracker = createRateLimitTracker();
			const registry = createProviderRegistry(tracker);

			const task = {
				prompt: 'Test task',
				projectKey: 'test-project',
				repositoryPath: '/test/path',
			};

			const selection = await registry.selectProvider(task);

			expect(selection).toBeNull();
		});
	});
});
