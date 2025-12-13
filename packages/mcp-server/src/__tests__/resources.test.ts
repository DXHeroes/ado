/**
 * MCP Resources Tests
 * Tests for the MCP resources implementation
 */

import type { OrchestratorCore } from '@dxheroes/ado-core';
import type { AdoConfig } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createResources, handleResourceRead, initializeResources } from '../resources.js';

describe('MCP Resources', () => {
	describe('createResources', () => {
		it('should return array of resource definitions', () => {
			const resources = createResources();

			expect(Array.isArray(resources)).toBe(true);
			expect(resources.length).toBeGreaterThan(0);
		});

		it('should include ado://config resource', () => {
			const resources = createResources();
			const configResource = resources.find((r) => r.uri === 'ado://config');

			expect(configResource).toBeDefined();
			expect(configResource?.name).toBe('ADO Configuration');
			expect(configResource?.description).toBeDefined();
			expect(configResource?.mimeType).toBe('application/json');
		});

		it('should include ado://providers resource', () => {
			const resources = createResources();
			const providersResource = resources.find((r) => r.uri === 'ado://providers');

			expect(providersResource).toBeDefined();
			expect(providersResource?.name).toBe('Provider Status');
			expect(providersResource?.description).toBeDefined();
			expect(providersResource?.mimeType).toBe('application/json');
		});

		it('should include ado://usage resource', () => {
			const resources = createResources();
			const usageResource = resources.find((r) => r.uri === 'ado://usage');

			expect(usageResource).toBeDefined();
			expect(usageResource?.name).toBe('Usage Statistics');
			expect(usageResource?.description).toBeDefined();
			expect(usageResource?.mimeType).toBe('application/json');
		});

		it('should return resources with correct structure', () => {
			const resources = createResources();

			for (const resource of resources) {
				expect(resource).toHaveProperty('uri');
				expect(resource).toHaveProperty('name');
				expect(resource).toHaveProperty('description');
				expect(resource).toHaveProperty('mimeType');
				expect(resource.uri).toMatch(/^ado:\/\//);
			}
		});
	});

	describe('initializeResources', () => {
		it('should initialize with config only', () => {
			const mockConfig = {
				version: '2.1.0',
				project: { name: 'test-project' },
				routing: { strategy: 'subscription-first' },
				orchestration: { maxConcurrency: 2 },
				hitl: { enabled: true },
				storage: { driver: 'sqlite' },
				observability: { enabled: false },
				providers: {},
			} as unknown as AdoConfig;

			expect(() => initializeResources(mockConfig)).not.toThrow();
		});

		it('should initialize with config and orchestrator', () => {
			const mockConfig = {} as AdoConfig;
			const mockOrchestrator = {} as OrchestratorCore;

			expect(() => initializeResources(mockConfig, mockOrchestrator)).not.toThrow();
		});
	});

	describe('handleResourceRead', () => {
		let mockConfig: AdoConfig;
		let mockOrchestrator: any;
		let mockRegistry: any;
		let mockProgressStream: any;

		beforeEach(() => {
			// Create mock config
			mockConfig = {
				version: '2.1.0',
				project: { name: 'test-project', key: 'TEST' },
				routing: {
					strategy: 'subscription-first',
					failover: { enabled: true, maxRetries: 3, retryDelay: 1000 },
					apiFallback: { enabled: true, maxCostPerTask: 1.0 },
				},
				orchestration: {
					maxConcurrency: 2,
					taskTimeout: 300000,
				},
				hitl: {
					enabled: true,
					checkpointInterval: 300,
				},
				storage: {
					driver: 'sqlite',
					path: '/tmp/test.db',
				},
				observability: {
					enabled: false,
				},
				providers: {
					'test-provider': {
						id: 'test-provider',
						enabled: true,
						accessModes: [],
						capabilities: {},
					},
				},
			} as unknown as AdoConfig;

			// Create mock registry
			mockRegistry = {
				getAll: () => [
					{
						id: 'test-provider',
						enabled: true,
						accessModes: [
							{
								mode: 'subscription',
								enabled: true,
								priority: 1,
							},
						],
						capabilities: {
							codeGeneration: true,
						},
					},
				],
			};

			// Create mock progress stream with tasks
			const now = new Date();
			const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

			mockProgressStream = {
				getAllStatuses: () => [
					{
						taskId: 'task-1',
						status: 'running',
						providerId: 'test-provider',
						progress: 50,
						startedAt: startOfDay,
					},
					{
						taskId: 'task-2',
						status: 'completed',
						providerId: 'test-provider',
						progress: 100,
						startedAt: startOfDay,
						completedAt: new Date(),
					},
					{
						taskId: 'task-3',
						status: 'failed',
						providerId: 'other-provider',
						progress: 25,
						startedAt: new Date(startOfDay.getTime() - 86400000), // Yesterday
						error: 'Test error',
					},
				],
			};

			// Create mock orchestrator
			mockOrchestrator = {
				getRegistry: () => mockRegistry,
				getProgressStream: () => mockProgressStream,
			};
		});

		describe('ado://config', () => {
			it('should return configuration', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://config');

				expect(result.contents).toHaveLength(1);
				expect(result.contents[0].uri).toBe('ado://config');
				expect(result.contents[0].mimeType).toBe('application/json');

				const config = JSON.parse(result.contents[0].text);
				expect(config.version).toBe('2.1.0');
				expect(config.project).toBeDefined();
				expect(config.routing).toBeDefined();
			});

			it('should sanitize sensitive data', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://config');
				const config = JSON.parse(result.contents[0].text);

				// Should include provider IDs but not full config
				expect(config.providers).toBeDefined();
				expect(Array.isArray(config.providers)).toBe(true);

				// Should not include storage path
				expect(config.storage).toBeDefined();
				expect(config.storage.path).toBeUndefined();
			});

			it('should return error if config not initialized', async () => {
				initializeResources(null as any);

				const result = await handleResourceRead('ado://config');

				const response = JSON.parse(result.contents[0].text);
				expect(response.error).toBe('Configuration not initialized');
			});

			it('should handle errors gracefully', async () => {
				const badConfig = {
					get version() {
						throw new Error('Version error');
					},
				} as unknown as AdoConfig;

				initializeResources(badConfig);

				const result = await handleResourceRead('ado://config');

				const response = JSON.parse(result.contents[0].text);
				expect(response.error).toBe('Failed to read configuration');
			});
		});

		describe('ado://providers', () => {
			it('should return providers from orchestrator when available', async () => {
				initializeResources(mockConfig, mockOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://providers');

				expect(result.contents).toHaveLength(1);
				expect(result.contents[0].uri).toBe('ado://providers');

				const response = JSON.parse(result.contents[0].text);
				expect(response.providers).toBeDefined();
				expect(Array.isArray(response.providers)).toBe(true);
				expect(response.providers.length).toBeGreaterThan(0);
			});

			it('should include provider details', async () => {
				initializeResources(mockConfig, mockOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://providers');
				const response = JSON.parse(result.contents[0].text);
				const provider = response.providers[0];

				expect(provider).toHaveProperty('id');
				expect(provider).toHaveProperty('enabled');
				expect(provider).toHaveProperty('accessModes');
				expect(provider).toHaveProperty('capabilities');
			});

			it('should return providers from config when orchestrator not available', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://providers');
				const response = JSON.parse(result.contents[0].text);

				expect(response.providers).toBeDefined();
				expect(Array.isArray(response.providers)).toBe(true);
				// Should have provider from config
				const provider = response.providers.find((p: any) => p.id === 'test-provider');
				expect(provider).toBeDefined();
			});

			it('should return error if config not initialized', async () => {
				initializeResources(null as any);

				const result = await handleResourceRead('ado://providers');

				const response = JSON.parse(result.contents[0].text);
				expect(response.error).toBe('Configuration not initialized');
			});

			it('should handle errors gracefully', async () => {
				const badOrchestrator = {
					getRegistry: () => {
						throw new Error('Registry error');
					},
				};

				initializeResources(mockConfig, badOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://providers');

				const response = JSON.parse(result.contents[0].text);
				expect(response.error).toBe('Failed to read providers');
			});
		});

		describe('ado://usage', () => {
			it('should return usage statistics from orchestrator', async () => {
				initializeResources(mockConfig, mockOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://usage');

				expect(result.contents).toHaveLength(1);
				expect(result.contents[0].uri).toBe('ado://usage');

				const response = JSON.parse(result.contents[0].text);
				expect(response.period).toBe('today');
				expect(response.totalTasks).toBeDefined();
				expect(response.tasksToday).toBeDefined();
			});

			it('should include task counts by status', async () => {
				initializeResources(mockConfig, mockOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://usage');
				const response = JSON.parse(result.contents[0].text);

				expect(response.runningTasks).toBeDefined();
				expect(response.completedTasks).toBeDefined();
				expect(response.failedTasks).toBeDefined();
			});

			it('should group tasks by provider', async () => {
				initializeResources(mockConfig, mockOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://usage');
				const response = JSON.parse(result.contents[0].text);

				expect(response.byProvider).toBeDefined();
				expect(typeof response.byProvider).toBe('object');
			});

			it('should filter tasks to today', async () => {
				initializeResources(mockConfig, mockOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://usage');
				const response = JSON.parse(result.contents[0].text);

				// Should have 2 tasks today (task-1 and task-2)
				expect(response.tasksToday).toBe(2);
				// Total should be 3 (including yesterday's task)
				expect(response.totalTasks).toBe(3);
			});

			it('should return placeholder when orchestrator not available', async () => {
				// Initialize with config but without orchestrator
				initializeResources(mockConfig, undefined);

				const result = await handleResourceRead('ado://usage');
				const response = JSON.parse(result.contents[0].text);

				expect(response.period).toBe('today');
				expect(response.message).toBeDefined();
				expect(response.note).toBeDefined();
			});

			it('should return error if config not initialized', async () => {
				initializeResources(null as any);

				const result = await handleResourceRead('ado://usage');

				const response = JSON.parse(result.contents[0].text);
				expect(response.error).toBe('Configuration not initialized');
			});

			it('should handle errors gracefully', async () => {
				const badOrchestrator = {
					getProgressStream: () => {
						throw new Error('Stream error');
					},
				};

				initializeResources(mockConfig, badOrchestrator as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://usage');

				const response = JSON.parse(result.contents[0].text);
				expect(response.error).toBe('Failed to read usage');
			});

			it('should handle tasks without providerId', async () => {
				const streamWithNullProvider = {
					getAllStatuses: () => [
						{
							taskId: 'task-1',
							status: 'running',
							providerId: null,
							progress: 50,
							startedAt: new Date(),
						},
					],
				};

				const orchestratorWithNullProvider = {
					getRegistry: () => mockRegistry,
					getProgressStream: () => streamWithNullProvider,
				};

				initializeResources(
					mockConfig,
					orchestratorWithNullProvider as unknown as OrchestratorCore,
				);

				const result = await handleResourceRead('ado://usage');
				const response = JSON.parse(result.contents[0].text);

				// Should not crash, byProvider should be empty
				expect(response.byProvider).toBeDefined();
			});

			it('should count multiple tasks from same provider', async () => {
				const streamWithMultipleTasks = {
					getAllStatuses: () => {
						const now = new Date();
						const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

						return [
							{
								taskId: 'task-1',
								status: 'completed',
								providerId: 'test-provider',
								progress: 100,
								startedAt: startOfDay,
							},
							{
								taskId: 'task-2',
								status: 'completed',
								providerId: 'test-provider',
								progress: 100,
								startedAt: startOfDay,
							},
						];
					},
				};

				const orchestratorWithMultiple = {
					getRegistry: () => mockRegistry,
					getProgressStream: () => streamWithMultipleTasks,
				};

				initializeResources(mockConfig, orchestratorWithMultiple as unknown as OrchestratorCore);

				const result = await handleResourceRead('ado://usage');
				const response = JSON.parse(result.contents[0].text);

				expect(response.byProvider['test-provider']).toBe(2);
			});
		});

		describe('unknown resource', () => {
			it('should return error for unknown resource URI', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://unknown');

				expect(result.contents).toHaveLength(1);
				const response = JSON.parse(result.contents[0].text);

				expect(response.error).toBe('Unknown resource');
				expect(response.uri).toBe('ado://unknown');
				expect(response.availableResources).toBeDefined();
				expect(Array.isArray(response.availableResources)).toBe(true);
			});

			it('should include available resources in error', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://invalid');
				const response = JSON.parse(result.contents[0].text);

				expect(response.availableResources).toContain('ado://config');
				expect(response.availableResources).toContain('ado://providers');
				expect(response.availableResources).toContain('ado://usage');
			});
		});

		describe('error handling', () => {
			it('should catch and format errors', async () => {
				const errorConfig = {
					get version() {
						throw new Error('Unexpected error');
					},
				} as unknown as AdoConfig;

				initializeResources(errorConfig);

				const result = await handleResourceRead('ado://config');

				expect(result.contents).toHaveLength(1);
				const response = JSON.parse(result.contents[0].text);

				expect(response.error).toBe('Failed to read configuration');
				expect(response.message).toBe('Unexpected error');
			});

			it('should handle non-Error objects', async () => {
				const errorConfig = {
					get version() {
						throw 'String error';
					},
				} as unknown as AdoConfig;

				initializeResources(errorConfig);

				const result = await handleResourceRead('ado://config');
				const response = JSON.parse(result.contents[0].text);

				expect(response.error).toBeDefined();
				expect(response.message).toBe('String error');
			});
		});

		describe('response format', () => {
			it('should return properly formatted response', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://config');

				expect(result).toHaveProperty('contents');
				expect(Array.isArray(result.contents)).toBe(true);
				expect(result.contents[0]).toHaveProperty('uri');
				expect(result.contents[0]).toHaveProperty('mimeType');
				expect(result.contents[0]).toHaveProperty('text');
			});

			it('should return valid JSON in text field', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://config');

				expect(() => JSON.parse(result.contents[0].text)).not.toThrow();
			});

			it('should format JSON with proper indentation', async () => {
				initializeResources(mockConfig);

				const result = await handleResourceRead('ado://config');

				// Should be pretty-printed (has newlines and indentation)
				expect(result.contents[0].text).toContain('\n');
				expect(result.contents[0].text).toMatch(/\n\s+/);
			});
		});
	});
});
