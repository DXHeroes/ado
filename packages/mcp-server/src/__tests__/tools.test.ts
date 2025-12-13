/**
 * MCP Tools Tests
 * Tests for the MCP tools implementation including all tool handlers
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrchestratorCore, TaskDefinition, TaskHandle } from '@dxheroes/ado-core';
import { createTools, handleToolCall, initializeTools } from '../tools.js';

describe('MCP Tools', () => {
	describe('createTools', () => {
		it('should return array of tool definitions', () => {
			const tools = createTools();

			expect(Array.isArray(tools)).toBe(true);
			expect(tools.length).toBeGreaterThan(0);
		});

		it('should include ado_run_task tool', () => {
			const tools = createTools();
			const runTaskTool = tools.find((t) => t.name === 'ado_run_task');

			expect(runTaskTool).toBeDefined();
			expect(runTaskTool?.description).toBeDefined();
			expect(runTaskTool?.inputSchema).toBeDefined();
			expect(runTaskTool?.inputSchema.properties).toHaveProperty('prompt');
			expect(runTaskTool?.inputSchema.required).toContain('prompt');
		});

		it('should include ado_status tool', () => {
			const tools = createTools();
			const statusTool = tools.find((t) => t.name === 'ado_status');

			expect(statusTool).toBeDefined();
			expect(statusTool?.description).toBeDefined();
			expect(statusTool?.inputSchema).toBeDefined();
		});

		it('should include ado_list_providers tool', () => {
			const tools = createTools();
			const listProvidersTool = tools.find((t) => t.name === 'ado_list_providers');

			expect(listProvidersTool).toBeDefined();
			expect(listProvidersTool?.description).toBeDefined();
		});

		it('should include ado_list_tasks tool', () => {
			const tools = createTools();
			const listTasksTool = tools.find((t) => t.name === 'ado_list_tasks');

			expect(listTasksTool).toBeDefined();
			expect(listTasksTool?.inputSchema.properties).toHaveProperty('limit');
			expect(listTasksTool?.inputSchema.properties).toHaveProperty('status');
		});

		it('should include ado_get_task tool', () => {
			const tools = createTools();
			const getTaskTool = tools.find((t) => t.name === 'ado_get_task');

			expect(getTaskTool).toBeDefined();
			expect(getTaskTool?.inputSchema.properties).toHaveProperty('taskId');
			expect(getTaskTool?.inputSchema.required).toContain('taskId');
		});

		it('should include ado_cancel_task tool', () => {
			const tools = createTools();
			const cancelTaskTool = tools.find((t) => t.name === 'ado_cancel_task');

			expect(cancelTaskTool).toBeDefined();
			expect(cancelTaskTool?.inputSchema.properties).toHaveProperty('taskId');
			expect(cancelTaskTool?.inputSchema.required).toContain('taskId');
		});

		it('should include ado_enable_provider tool', () => {
			const tools = createTools();
			const enableProviderTool = tools.find((t) => t.name === 'ado_enable_provider');

			expect(enableProviderTool).toBeDefined();
			expect(enableProviderTool?.inputSchema.properties).toHaveProperty('providerId');
			expect(enableProviderTool?.inputSchema.properties).toHaveProperty('enabled');
			expect(enableProviderTool?.inputSchema.required).toContain('providerId');
			expect(enableProviderTool?.inputSchema.required).toContain('enabled');
		});

		it('should return tools with correct schema structure', () => {
			const tools = createTools();

			for (const tool of tools) {
				expect(tool).toHaveProperty('name');
				expect(tool).toHaveProperty('description');
				expect(tool).toHaveProperty('inputSchema');
				expect(tool.inputSchema).toHaveProperty('type');
				expect(tool.inputSchema.type).toBe('object');
			}
		});
	});

	describe('initializeTools', () => {
		it('should initialize orchestrator instance', () => {
			const mockOrchestrator = {} as OrchestratorCore;

			// Should not throw
			expect(() => initializeTools(mockOrchestrator)).not.toThrow();
		});
	});

	describe('handleToolCall', () => {
		let mockOrchestrator: any;
		let mockHandle: any;
		let mockRegistry: any;
		let mockProgressStream: any;

		beforeEach(() => {
			// Create mock task handle
			mockHandle = {
				taskId: 'test-task-123',
				getStatus: vi.fn().mockResolvedValue({
					taskId: 'test-task-123',
					status: 'pending',
					progress: 0,
				}),
				cancel: vi.fn().mockResolvedValue(undefined),
			};

			// Create mock registry
			mockRegistry = {
				getAll: vi.fn().mockReturnValue([
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
				]),
				get: vi.fn((id: string) => {
					if (id === 'test-provider') {
						return {
							id: 'test-provider',
							enabled: true,
						};
					}
					return null;
				}),
				setEnabled: vi.fn(),
			};

			// Create mock progress stream
			mockProgressStream = {
				getAllStatuses: vi.fn().mockReturnValue([
					{
						taskId: 'test-task-123',
						status: 'running',
						providerId: 'test-provider',
						progress: 50,
						startedAt: new Date(),
					},
					{
						taskId: 'test-task-456',
						status: 'completed',
						providerId: 'test-provider',
						progress: 100,
						startedAt: new Date(),
						completedAt: new Date(),
					},
				]),
			};

			// Create mock orchestrator
			mockOrchestrator = {
				submit: vi.fn().mockResolvedValue(mockHandle),
				status: vi.fn().mockResolvedValue({
					taskId: 'test-task-123',
					status: 'running',
					progress: 50,
					startedAt: new Date(),
				}),
				cancel: vi.fn().mockResolvedValue(undefined),
				getRegistry: vi.fn().mockReturnValue(mockRegistry),
				getProgressStream: vi.fn().mockReturnValue(mockProgressStream),
			};

			initializeTools(mockOrchestrator as unknown as OrchestratorCore);
		});

		describe('ado_run_task', () => {
			it('should execute task successfully', async () => {
				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task prompt',
				});

				expect(result.content).toHaveLength(1);
				expect(result.content[0].type).toBe('text');

				const response = JSON.parse(result.content[0].text);
				expect(response.status).toBe('submitted');
				expect(response.taskId).toBe('test-task-123');
				expect(response.prompt).toBe('Test task prompt');
			});

			it('should accept provider parameter', async () => {
				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task',
					provider: 'test-provider',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.provider).toBe('test-provider');

				expect(mockOrchestrator.submit).toHaveBeenCalledWith(
					expect.objectContaining({
						preferredProviders: ['test-provider'],
					}),
				);
			});

			it('should accept workingDirectory parameter', async () => {
				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task',
					workingDirectory: '/custom/path',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.workingDirectory).toBe('/custom/path');
			});

			it('should use current working directory by default', async () => {
				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task',
				});

				expect(mockOrchestrator.submit).toHaveBeenCalledWith(
					expect.objectContaining({
						repositoryPath: expect.any(String),
					}),
				);
			});

			it('should return error for missing prompt', async () => {
				const result = await handleToolCall('ado_run_task', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid prompt');
			});

			it('should return error for empty prompt', async () => {
				const result = await handleToolCall('ado_run_task', {
					prompt: '   ',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid prompt');
			});

			it('should return error for non-string prompt', async () => {
				const result = await handleToolCall('ado_run_task', {
					prompt: 123,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid prompt');
			});

			it('should handle orchestrator submit error', async () => {
				mockOrchestrator.submit.mockRejectedValueOnce(new Error('Submit failed'));

				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Failed to submit task');
				expect(response.message).toBe('Submit failed');
			});
		});

		describe('ado_status', () => {
			it('should return orchestrator status', async () => {
				const result = await handleToolCall('ado_status', {});

				expect(result.content).toHaveLength(1);
				const response = JSON.parse(result.content[0].text);
				expect(response.status).toBe('running');
				expect(response.message).toBeDefined();
			});

			it('should include timestamp', async () => {
				const result = await handleToolCall('ado_status', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.timestamp).toBeDefined();
				expect(new Date(response.timestamp)).toBeInstanceOf(Date);
			});

			it('should handle errors gracefully', async () => {
				// Simulate error by removing orchestrator
				initializeTools(null as any);

				const result = await handleToolCall('ado_status', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Orchestrator not initialized');
			});
		});

		describe('ado_list_providers', () => {
			it('should return list of providers', async () => {
				const result = await handleToolCall('ado_list_providers', {});

				expect(result.content).toHaveLength(1);
				const response = JSON.parse(result.content[0].text);
				expect(response.providers).toBeDefined();
				expect(Array.isArray(response.providers)).toBe(true);
				expect(response.providers.length).toBeGreaterThan(0);
			});

			it('should include provider details', async () => {
				const result = await handleToolCall('ado_list_providers', {});

				const response = JSON.parse(result.content[0].text);
				const provider = response.providers[0];

				expect(provider).toHaveProperty('id');
				expect(provider).toHaveProperty('enabled');
				expect(provider).toHaveProperty('accessModes');
				expect(provider).toHaveProperty('capabilities');
			});

			it('should handle errors gracefully', async () => {
				initializeTools(null as any);

				const result = await handleToolCall('ado_list_providers', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Orchestrator not initialized');
			});
		});

		describe('ado_list_tasks', () => {
			it('should return list of tasks', async () => {
				const result = await handleToolCall('ado_list_tasks', {});

				expect(result.content).toHaveLength(1);
				const response = JSON.parse(result.content[0].text);
				expect(response.tasks).toBeDefined();
				expect(Array.isArray(response.tasks)).toBe(true);
			});

			it('should apply default limit of 10', async () => {
				const result = await handleToolCall('ado_list_tasks', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.query.limit).toBe(10);
			});

			it('should accept custom limit', async () => {
				const result = await handleToolCall('ado_list_tasks', {
					limit: 5,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.query.limit).toBe(5);
			});

			it('should filter by status', async () => {
				const result = await handleToolCall('ado_list_tasks', {
					status: 'running',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.query.status).toBe('running');
				expect(response.tasks.every((t: any) => t.status === 'running')).toBe(true);
			});

			it('should include task metadata', async () => {
				const result = await handleToolCall('ado_list_tasks', {});

				const response = JSON.parse(result.content[0].text);
				const task = response.tasks[0];

				expect(task).toHaveProperty('id');
				expect(task).toHaveProperty('status');
				expect(task).toHaveProperty('providerId');
				expect(task).toHaveProperty('progress');
			});

			it('should handle errors gracefully', async () => {
				initializeTools(null as any);

				const result = await handleToolCall('ado_list_tasks', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Orchestrator not initialized');
			});
		});

		describe('ado_get_task', () => {
			it('should return task details', async () => {
				const result = await handleToolCall('ado_get_task', {
					taskId: 'test-task-123',
				});

				expect(result.content).toHaveLength(1);
				const response = JSON.parse(result.content[0].text);
				expect(response.taskId).toBe('test-task-123');
				expect(response.status).toBeDefined();
			});

			it('should return error for missing taskId', async () => {
				const result = await handleToolCall('ado_get_task', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid taskId');
			});

			it('should return error for non-string taskId', async () => {
				const result = await handleToolCall('ado_get_task', {
					taskId: 123,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid taskId');
			});

			it('should handle task not found', async () => {
				mockOrchestrator.status.mockRejectedValueOnce(new Error('Task not found'));

				const result = await handleToolCall('ado_get_task', {
					taskId: 'non-existent-task',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Task not found');
			});

			it('should handle errors gracefully', async () => {
				initializeTools(null as any);

				const result = await handleToolCall('ado_get_task', {
					taskId: 'test-task-123',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Orchestrator not initialized');
			});
		});

		describe('ado_cancel_task', () => {
			it('should cancel task successfully', async () => {
				const result = await handleToolCall('ado_cancel_task', {
					taskId: 'test-task-123',
				});

				expect(result.content).toHaveLength(1);
				const response = JSON.parse(result.content[0].text);
				expect(response.status).toBe('cancelled');
				expect(response.taskId).toBe('test-task-123');
				expect(mockOrchestrator.cancel).toHaveBeenCalledWith('test-task-123');
			});

			it('should return error for missing taskId', async () => {
				const result = await handleToolCall('ado_cancel_task', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid taskId');
			});

			it('should return error for non-string taskId', async () => {
				const result = await handleToolCall('ado_cancel_task', {
					taskId: 123,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid taskId');
			});

			it('should handle cancel errors', async () => {
				mockOrchestrator.cancel.mockRejectedValueOnce(new Error('Cancel failed'));

				const result = await handleToolCall('ado_cancel_task', {
					taskId: 'test-task-123',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Failed to cancel task');
			});

			it('should handle errors gracefully', async () => {
				initializeTools(null as any);

				const result = await handleToolCall('ado_cancel_task', {
					taskId: 'test-task-123',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Orchestrator not initialized');
			});
		});

		describe('ado_enable_provider', () => {
			it('should enable provider successfully', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					providerId: 'test-provider',
					enabled: true,
				});

				expect(result.content).toHaveLength(1);
				const response = JSON.parse(result.content[0].text);
				expect(response.success).toBe(true);
				expect(response.providerId).toBe('test-provider');
				expect(response.enabled).toBe(true);
				expect(mockRegistry.setEnabled).toHaveBeenCalledWith('test-provider', true);
			});

			it('should disable provider successfully', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					providerId: 'test-provider',
					enabled: false,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.success).toBe(true);
				expect(response.enabled).toBe(false);
				expect(mockRegistry.setEnabled).toHaveBeenCalledWith('test-provider', false);
			});

			it('should return error for missing providerId', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					enabled: true,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid providerId');
			});

			it('should return error for non-string providerId', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					providerId: 123,
					enabled: true,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid providerId');
			});

			it('should return error for missing enabled', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					providerId: 'test-provider',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid enabled');
			});

			it('should return error for non-boolean enabled', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					providerId: 'test-provider',
					enabled: 'true',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Invalid enabled');
			});

			it('should return error for non-existent provider', async () => {
				const result = await handleToolCall('ado_enable_provider', {
					providerId: 'non-existent-provider',
					enabled: true,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Provider not found');
				expect(response.providerId).toBe('non-existent-provider');
			});

			it('should handle errors gracefully', async () => {
				initializeTools(null as any);

				const result = await handleToolCall('ado_enable_provider', {
					providerId: 'test-provider',
					enabled: true,
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Orchestrator not initialized');
			});
		});

		describe('unknown tool', () => {
			it('should return error for unknown tool', async () => {
				const result = await handleToolCall('unknown_tool', {});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBe('Unknown tool: unknown_tool');
			});
		});

		describe('error handling', () => {
			it('should catch and format errors', async () => {
				// Restore orchestrator but make submit throw
				initializeTools(mockOrchestrator as unknown as OrchestratorCore);
				mockOrchestrator.submit.mockRejectedValueOnce(new Error('Unexpected error'));

				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task',
				});

				expect(result.content).toHaveLength(1);
				expect(result.content[0].type).toBe('text');

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBeDefined();
			});

			it('should handle non-Error objects', async () => {
				initializeTools(mockOrchestrator as unknown as OrchestratorCore);
				mockOrchestrator.submit.mockRejectedValueOnce('String error');

				const result = await handleToolCall('ado_run_task', {
					prompt: 'Test task',
				});

				const response = JSON.parse(result.content[0].text);
				expect(response.error).toBeDefined();
				expect(response.message).toBe('String error');
			});
		});
	});
});
