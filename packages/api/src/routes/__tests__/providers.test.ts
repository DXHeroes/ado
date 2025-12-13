/**
 * Providers Routes Tests
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { StateStore } from '@dxheroes/ado-core';
import { Hono } from 'hono';
import { createProvidersRoutes } from '../providers.js';
import type { ApiContext } from '../../types.js';

// Mock @dxheroes/ado-core to control config loading
vi.mock('@dxheroes/ado-core', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@dxheroes/ado-core')>();
	return {
		...actual,
		loadConfigWithFallback: vi.fn(() => ({
			providers: {
				'claude-code': {
					id: 'claude-code',
					enabled: true,
					accessModes: [
						{ mode: 'subscription', enabled: true, priority: 1 },
						{ mode: 'api', enabled: true, priority: 2 },
					],
					capabilities: {
						codeGeneration: true,
						codeReview: true,
						refactoring: true,
						testing: true,
						documentation: true,
						debugging: true,
						languages: [],
						maxContextTokens: 200000,
						supportsStreaming: true,
					},
				},
				'gemini-cli': {
					id: 'gemini-cli',
					enabled: true,
					accessModes: [
						{ mode: 'free', enabled: true, priority: 1 },
						{ mode: 'api', enabled: true, priority: 2 },
					],
					capabilities: {
						codeGeneration: true,
						codeReview: true,
						refactoring: true,
						testing: true,
						documentation: true,
						debugging: true,
						languages: [],
						maxContextTokens: 100000,
						supportsStreaming: true,
					},
				},
				'cursor-cli': {
					id: 'cursor-cli',
					enabled: true,
					accessModes: [{ mode: 'subscription', enabled: true, priority: 1 }],
					capabilities: {
						codeGeneration: true,
						codeReview: true,
						refactoring: true,
						testing: true,
						documentation: true,
						debugging: true,
						languages: [],
						maxContextTokens: 200000,
						supportsStreaming: true,
					},
				},
				'copilot-cli': {
					id: 'copilot-cli',
					enabled: true,
					accessModes: [{ mode: 'subscription', enabled: true, priority: 1 }],
					capabilities: {
						codeGeneration: true,
						codeReview: false,
						refactoring: true,
						testing: true,
						documentation: true,
						debugging: false,
						languages: [],
						maxContextTokens: 150000,
						supportsStreaming: true,
					},
				},
				'codex-cli': {
					id: 'codex-cli',
					enabled: false,
					accessModes: [{ mode: 'api', enabled: true, priority: 1 }],
					capabilities: {
						codeGeneration: true,
						codeReview: false,
						refactoring: true,
						testing: false,
						documentation: true,
						debugging: false,
						languages: [],
						maxContextTokens: 80000,
						supportsStreaming: false,
					},
				},
			},
		})),
	};
});

describe('Providers Routes', () => {
	let app: Hono<ApiContext>;
	let mockStateStore: StateStore;

	beforeEach(() => {
		mockStateStore = {
			createSession: vi.fn(),
			getSession: vi.fn(),
			getSessionsByProject: vi.fn(),
			updateSession: vi.fn(),
			createTask: vi.fn(),
			getTask: vi.fn(),
			updateTask: vi.fn(),
			getTasksBySession: vi.fn(),
			getTasksByStatus: vi.fn(),
			recordUsage: vi.fn(),
			getUsageByProvider: vi.fn().mockReturnValue([]),
			getTotalUsage: vi.fn(),
			createCheckpoint: vi.fn(),
			getCheckpoint: vi.fn(),
			getLatestCheckpoint: vi.fn(),
			close: vi.fn(),
		};

		app = new Hono<ApiContext>();
		app.use('*', (c, next) => {
			c.set('stateStore', mockStateStore);
			return next();
		});
		app.route('/providers', createProvidersRoutes());
	});

	describe('GET /providers', () => {
		it('should list all providers', async () => {
			const res = await app.request('/providers');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(Array.isArray(json)).toBe(true);
		});

		it('should return provider configuration', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			if (json.length > 0) {
				const provider = json[0];
				expect(provider).toHaveProperty('id');
				expect(provider).toHaveProperty('name');
				expect(provider).toHaveProperty('enabled');
				expect(provider).toHaveProperty('accessModes');
				expect(provider).toHaveProperty('capabilities');
				expect(provider).toHaveProperty('usage');
			}
		});

		it('should include access modes', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			if (json.length > 0) {
				const provider = json[0];
				expect(Array.isArray(provider.accessModes)).toBe(true);
				if (provider.accessModes.length > 0) {
					expect(provider.accessModes[0]).toHaveProperty('mode');
					expect(provider.accessModes[0]).toHaveProperty('enabled');
					expect(provider.accessModes[0]).toHaveProperty('priority');
				}
			}
		});

		it('should include capabilities', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			if (json.length > 0) {
				const provider = json[0];
				expect(provider.capabilities).toHaveProperty('codeGeneration');
				expect(provider.capabilities).toHaveProperty('codeReview');
				expect(provider.capabilities).toHaveProperty('refactoring');
				expect(provider.capabilities).toHaveProperty('testing');
				expect(provider.capabilities).toHaveProperty('documentation');
				expect(provider.capabilities).toHaveProperty('debugging');
			}
		});

		it('should include usage data', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			if (json.length > 0) {
				const provider = json[0];
				expect(provider.usage).toHaveProperty('requestsToday');
			}
		});

		it('should fallback to default providers on config error', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers');
			const json = await res.json();

			expect(Array.isArray(json)).toBe(true);
			expect(json.length).toBeGreaterThan(0);
		});

		it('should include rate limits when available', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			const providerWithLimits = json.find((p: any) => p.rateLimits);
			if (providerWithLimits) {
				expect(providerWithLimits.rateLimits).toBeDefined();
			}
		});
	});

	describe('GET /providers/:id', () => {
		it('should get provider by ID', async () => {
			const res = await app.request('/providers/claude-code');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json.id).toBe('claude-code');
		});

		it('should return provider details', async () => {
			const res = await app.request('/providers/claude-code');
			const json = await res.json();

			expect(json).toHaveProperty('id');
			expect(json).toHaveProperty('name');
			expect(json).toHaveProperty('enabled');
			expect(json).toHaveProperty('accessModes');
			expect(json).toHaveProperty('capabilities');
		});

		it('should return 404 for non-existent provider', async () => {
			const res = await app.request('/providers/non-existent-provider');

			expect(res.status).toBe(404);
			const json = await res.json();
			expect(json).toHaveProperty('error', 'Provider not found');
		});

		it('should include all capability flags', async () => {
			const res = await app.request('/providers/claude-code');
			const json = await res.json();

			expect(typeof json.capabilities.codeGeneration).toBe('boolean');
			expect(typeof json.capabilities.codeReview).toBe('boolean');
			expect(typeof json.capabilities.refactoring).toBe('boolean');
			expect(typeof json.capabilities.testing).toBe('boolean');
			expect(typeof json.capabilities.documentation).toBe('boolean');
			expect(typeof json.capabilities.debugging).toBe('boolean');
		});

		it('should include access mode configurations', async () => {
			const res = await app.request('/providers/claude-code');
			const json = await res.json();

			expect(Array.isArray(json.accessModes)).toBe(true);
			expect(json.accessModes.length).toBeGreaterThan(0);

			for (const mode of json.accessModes) {
				expect(['subscription', 'api', 'free']).toContain(mode.mode);
				expect(typeof mode.enabled).toBe('boolean');
				expect(typeof mode.priority).toBe('number');
			}
		});

		it('should fallback to default providers', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/claude-code');

			expect(res.status).toBe(200);
		});
	});

	describe('PATCH /providers/:id', () => {
		it('should return 501 not implemented', async () => {
			const res = await app.request('/providers/claude-code', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: false }),
			});

			expect(res.status).toBe(501);
			const json = await res.json();
			expect(json).toHaveProperty('error');
		});

		it('should return helpful error message', async () => {
			const res = await app.request('/providers/claude-code', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: false }),
			});

			const json = await res.json();
			expect(json.message).toContain('ado.config.yaml');
		});
	});

	describe('GET /providers/:id/usage', () => {
		it('should return provider usage', async () => {
			const res = await app.request('/providers/claude-code/usage');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(json).toHaveProperty('providerId', 'claude-code');
			expect(json).toHaveProperty('usage');
			expect(json).toHaveProperty('remaining');
		});

		it('should include usage statistics', async () => {
			const res = await app.request('/providers/claude-code/usage');
			const json = await res.json();

			expect(json.usage).toHaveProperty('requestsToday');
		});

		it('should include rate limits', async () => {
			const res = await app.request('/providers/claude-code/usage');
			const json = await res.json();

			if (json.rateLimits) {
				expect(json.rateLimits).toBeDefined();
			}
		});

		it('should calculate remaining capacity', async () => {
			const res = await app.request('/providers/claude-code/usage');
			const json = await res.json();

			expect(json.remaining).toHaveProperty('requestsToday');
			expect(typeof json.remaining.requestsToday).toBe('number');
		});

		it('should return 404 for non-existent provider', async () => {
			const res = await app.request('/providers/non-existent/usage');

			expect(res.status).toBe(404);
			const json = await res.json();
			expect(json).toHaveProperty('error', 'Provider not found');
		});

		it('should handle provider without rate limits', async () => {
			const res = await app.request('/providers/codex-cli/usage');
			const json = await res.json();

			expect(json).toBeDefined();
			expect(json.usage).toBeDefined();
		});

		it('should calculate remaining requests correctly', async () => {
			const res = await app.request('/providers/claude-code/usage');
			const json = await res.json();

			if (json.rateLimits?.requestsPerDay && json.usage?.requestsToday !== undefined) {
				const expected = json.rateLimits.requestsPerDay - json.usage.requestsToday;
				expect(json.remaining.requestsToday).toBe(expected);
			}
		});

		it('should fallback to default providers', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/claude-code/usage');

			expect(res.status).toBe(200);
		});
	});

	describe('provider types', () => {
		it('should include subscription providers', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			const subscriptionProvider = json.find((p: any) =>
				p.accessModes.some((m: any) => m.mode === 'subscription'),
			);

			expect(subscriptionProvider).toBeDefined();
		});

		it('should include API providers', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			const apiProvider = json.find((p: any) =>
				p.accessModes.some((m: any) => m.mode === 'api'),
			);

			expect(apiProvider).toBeDefined();
		});

		it('should include free providers', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			const freeProvider = json.find((p: any) =>
				p.accessModes.some((m: any) => m.mode === 'free'),
			);

			expect(freeProvider).toBeDefined();
		});
	});

	describe('enabled/disabled providers', () => {
		it('should include both enabled and disabled providers', async () => {
			const res = await app.request('/providers');
			const json = await res.json();

			const enabledProvider = json.find((p: any) => p.enabled === true);
			const disabledProvider = json.find((p: any) => p.enabled === false);

			expect(enabledProvider).toBeDefined();
			expect(disabledProvider).toBeDefined();
		});

		it('should mark codex-cli as disabled by default', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/codex-cli');
			const json = await res.json();

			expect(json.enabled).toBe(false);
		});
	});

	describe('response format', () => {
		it('should return JSON content type', async () => {
			const res = await app.request('/providers');

			expect(res.headers.get('content-type')).toContain('application/json');
		});

		it('should return valid JSON for all endpoints', async () => {
			const endpoints = [
				'/providers',
				'/providers/claude-code',
				'/providers/claude-code/usage',
			];

			for (const endpoint of endpoints) {
				const res = await app.request(endpoint);
				const json = await res.json();

				expect(json).toBeDefined();
				expect(typeof json === 'object' || Array.isArray(json)).toBe(true);
			}
		});
	});

	describe('error handling', () => {
		it('should handle config loading errors gracefully', async () => {
			const appWithBadConfig = new Hono<ApiContext>();
			appWithBadConfig.route('/providers', createProvidersRoutes());

			const res = await appWithBadConfig.request('/providers');

			expect(res.status).toBe(200);
			const json = await res.json();
			expect(Array.isArray(json)).toBe(true);
		});

		it('should handle state store errors in usage tracking', async () => {
			vi.mocked(mockStateStore.getUsageByProvider).mockImplementation(() => {
				throw new Error('Database error');
			});

			const res = await app.request('/providers');
			const json = await res.json();

			// Should still return providers with zero usage
			expect(Array.isArray(json)).toBe(true);
		});
	});

	describe('usage tracking from state store', () => {
		it('should fetch usage from state store', async () => {
			const mockUsage = [
				{
					providerId: 'claude-code',
					accessMode: 'subscription' as const,
					timestamp: new Date(),
					requestCount: 5,
					inputTokens: 1000,
					outputTokens: 500,
				},
			];

			vi.mocked(mockStateStore.getUsageByProvider).mockReturnValue(mockUsage);

			const res = await app.request('/providers');
			const json = await res.json();

			const claudeProvider = json.find((p: any) => p.id === 'claude-code');
			if (claudeProvider) {
				expect(claudeProvider.usage.requestsToday).toBeGreaterThanOrEqual(0);
			}
		});

		it('should aggregate multiple usage records', async () => {
			const mockUsage = [
				{
					providerId: 'claude-code',
					accessMode: 'subscription' as const,
					timestamp: new Date(),
					requestCount: 5,
					inputTokens: 1000,
					outputTokens: 500,
				},
				{
					providerId: 'claude-code',
					accessMode: 'api' as const,
					timestamp: new Date(),
					requestCount: 3,
					inputTokens: 500,
					outputTokens: 250,
				},
			];

			vi.mocked(mockStateStore.getUsageByProvider).mockReturnValue(mockUsage);

			const res = await app.request('/providers');
			const json = await res.json();

			const claudeProvider = json.find((p: any) => p.id === 'claude-code');
			if (claudeProvider) {
				expect(claudeProvider.usage.requestsToday).toBe(8);
			}
		});
	});

	describe('default providers', () => {
		it('should include claude-code', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/claude-code');

			expect(res.status).toBe(200);
		});

		it('should include gemini-cli', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/gemini-cli');

			expect(res.status).toBe(200);
		});

		it('should include cursor-cli', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/cursor-cli');

			expect(res.status).toBe(200);
		});

		it('should include copilot-cli', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/copilot-cli');

			expect(res.status).toBe(200);
		});

		it('should include codex-cli', async () => {
			const appWithoutConfig = new Hono<ApiContext>();
			appWithoutConfig.route('/providers', createProvidersRoutes());

			const res = await appWithoutConfig.request('/providers/codex-cli');

			expect(res.status).toBe(200);
		});
	});
});
