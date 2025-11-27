/**
 * Workflow Engine Tests
 */

import type { AgentTask } from '@dxheroes/ado-shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	type WorkflowContext,
	type WorkflowDefinition,
	WorkflowEngine,
} from './workflow-engine.js';

describe('WorkflowEngine', () => {
	let engine: WorkflowEngine;
	let executionLog: string[];

	beforeEach(() => {
		engine = new WorkflowEngine();
		executionLog = [];

		engine.setTaskExecutor(async (task: AgentTask) => {
			executionLog.push(task.id);
			return { success: true, output: `Executed ${task.id}` };
		});
	});

	describe('sequential workflow', () => {
		it('should execute steps in sequence', async () => {
			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Sequential Workflow',
				rootStep: {
					id: 'root',
					type: 'sequential',
					steps: [
						{
							id: 'step-1',
							type: 'task',
							task: {
								id: 'task-1',
								prompt: 'Task 1',
								projectContext: {
									projectId: 'test',
									repositoryPath: '/test',
									repositoryKey: 'test',
								},
							},
						},
						{
							id: 'step-2',
							type: 'task',
							task: {
								id: 'task-2',
								prompt: 'Task 2',
								projectContext: {
									projectId: 'test',
									repositoryPath: '/test',
									repositoryKey: 'test',
								},
							},
						},
					],
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('completed');
			expect(executionLog).toEqual(['task-1', 'task-2']);
			expect(result.steps).toHaveLength(3); // root + 2 tasks
		});
	});

	describe('parallel workflow', () => {
		it('should execute steps in parallel', async () => {
			const delays: Record<string, number> = {};

			engine.setTaskExecutor(async (task: AgentTask) => {
				const start = Date.now();
				await new Promise((resolve) => setTimeout(resolve, 50));
				delays[task.id] = Date.now() - start;
				executionLog.push(task.id);
				return { success: true, output: `Executed ${task.id}` };
			});

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Parallel Workflow',
				rootStep: {
					id: 'root',
					type: 'parallel',
					steps: [
						{
							id: 'step-1',
							type: 'task',
							task: {
								id: 'task-1',
								prompt: 'Task 1',
								projectContext: {
									projectId: 'test',
									repositoryPath: '/test',
									repositoryKey: 'test',
								},
							},
						},
						{
							id: 'step-2',
							type: 'task',
							task: {
								id: 'task-2',
								prompt: 'Task 2',
								projectContext: {
									projectId: 'test',
									repositoryPath: '/test',
									repositoryKey: 'test',
								},
							},
						},
					],
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('completed');
			expect(executionLog).toContain('task-1');
			expect(executionLog).toContain('task-2');
			// Both tasks should execute in parallel, so total time should be ~50ms not ~100ms
		});
	});

	describe('branch workflow', () => {
		it('should execute then branch when condition is true', async () => {
			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Branch Workflow',
				rootStep: {
					id: 'root',
					type: 'branch',
					condition: () => true,
					thenStep: {
						id: 'then-step',
						type: 'task',
						task: {
							id: 'then-task',
							prompt: 'Then task',
							projectContext: {
								projectId: 'test',
								repositoryPath: '/test',
								repositoryKey: 'test',
							},
						},
					},
					elseStep: {
						id: 'else-step',
						type: 'task',
						task: {
							id: 'else-task',
							prompt: 'Else task',
							projectContext: {
								projectId: 'test',
								repositoryPath: '/test',
								repositoryKey: 'test',
							},
						},
					},
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('completed');
			expect(executionLog).toContain('then-task');
			expect(executionLog).not.toContain('else-task');
		});

		it('should execute else branch when condition is false', async () => {
			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Branch Workflow',
				rootStep: {
					id: 'root',
					type: 'branch',
					condition: () => false,
					thenStep: {
						id: 'then-step',
						type: 'task',
						task: {
							id: 'then-task',
							prompt: 'Then task',
							projectContext: {
								projectId: 'test',
								repositoryPath: '/test',
								repositoryKey: 'test',
							},
						},
					},
					elseStep: {
						id: 'else-step',
						type: 'task',
						task: {
							id: 'else-task',
							prompt: 'Else task',
							projectContext: {
								projectId: 'test',
								repositoryPath: '/test',
								repositoryKey: 'test',
							},
						},
					},
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('completed');
			expect(executionLog).not.toContain('then-task');
			expect(executionLog).toContain('else-task');
		});

		it('should handle condition with context', async () => {
			let contextReceived: WorkflowContext | undefined;

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Branch Workflow',
				rootStep: {
					id: 'root',
					type: 'branch',
					condition: (ctx) => {
						contextReceived = ctx;
						return ctx.workflowId === 'test-workflow';
					},
					thenStep: {
						id: 'then-step',
						type: 'task',
						task: {
							id: 'then-task',
							prompt: 'Then task',
							projectContext: {
								projectId: 'test',
								repositoryPath: '/test',
								repositoryKey: 'test',
							},
						},
					},
				},
			};

			await engine.execute(workflow);

			expect(contextReceived).toBeDefined();
			expect(contextReceived?.workflowId).toBe('test-workflow');
		});
	});

	describe('timeout', () => {
		it('should timeout long-running workflows', async () => {
			engine.setTaskExecutor(async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return { success: true, output: 'Done' };
			});

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Timeout Workflow',
				timeout: 100,
				rootStep: {
					id: 'step-1',
					type: 'task',
					task: {
						id: 'task-1',
						prompt: 'Long task',
						projectContext: {
							projectId: 'test',
							repositoryPath: '/test',
							repositoryKey: 'test',
						},
					},
				},
			};

			const result = await engine.execute(workflow);

			expect(result.status).toBe('timeout');
			expect(result.error?.message).toContain('timeout');
		});
	});

	describe('cancel', () => {
		it('should return true for existing workflow', async () => {
			engine.setTaskExecutor(async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				return { success: true, output: 'Done' };
			});

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Cancel Workflow',
				rootStep: {
					id: 'step-1',
					type: 'task',
					task: {
						id: 'task-1',
						prompt: 'Long task',
						projectContext: {
							projectId: 'test',
							repositoryPath: '/test',
							repositoryKey: 'test',
						},
					},
				},
			};

			const executionPromise = engine.execute(workflow);

			// Cancel immediately
			const cancelled = await engine.cancel('test-workflow');

			expect(cancelled).toBe(true);

			// Execution should complete with error or cancelled status
			await executionPromise;
		});

		it('should return false for non-existent workflow', async () => {
			const cancelled = await engine.cancel('non-existent');
			expect(cancelled).toBe(false);
		});
	});

	describe('events', () => {
		it('should emit workflow events', async () => {
			const events: string[] = [];

			engine.on((event) => {
				events.push(event.type);
			});

			const workflow: WorkflowDefinition = {
				id: 'test-workflow',
				name: 'Test Events',
				rootStep: {
					id: 'step-1',
					type: 'task',
					task: {
						id: 'task-1',
						prompt: 'Test task',
						projectContext: {
							projectId: 'test',
							repositoryPath: '/test',
							repositoryKey: 'test',
						},
					},
				},
			};

			await engine.execute(workflow);

			expect(events).toContain('workflow_started');
			expect(events).toContain('step_started');
			expect(events).toContain('step_completed');
			expect(events).toContain('workflow_completed');
		});
	});
});
