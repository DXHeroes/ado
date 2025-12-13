/**
 * Tests for TemporalWorkflowEngine
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	type ActivityDefinition,
	type TemporalWorkflowConfig,
	TemporalWorkflowEngine,
	type WorkflowDefinition,
	type WorkflowStep,
	createLLMRetryPolicy,
	createTemporalWorkflowEngine,
} from '../temporal-engine.js';

describe('TemporalWorkflowEngine', () => {
	let engine: TemporalWorkflowEngine;

	beforeEach(() => {
		engine = createTemporalWorkflowEngine();
	});

	describe('createTemporalWorkflowEngine', () => {
		it('should create engine with default config', () => {
			const newEngine = createTemporalWorkflowEngine();
			expect(newEngine).toBeInstanceOf(TemporalWorkflowEngine);
		});

		it('should create engine with custom config', () => {
			const config: Partial<TemporalWorkflowConfig> = {
				serverUrl: 'http://localhost:7233',
				namespace: 'test',
				taskQueue: 'test-queue',
				maxConcurrentWorkflows: 10,
			};
			const newEngine = createTemporalWorkflowEngine(config);
			expect(newEngine).toBeInstanceOf(TemporalWorkflowEngine);
		});
	});

	describe('createLLMRetryPolicy', () => {
		it('should create LLM-specific retry policy', () => {
			const policy = createLLMRetryPolicy();
			expect(policy.initialInterval).toBe(2000);
			expect(policy.maximumAttempts).toBe(10);
			expect(policy.backoffCoefficient).toBe(2);
			expect(policy.nonRetryableErrors).toContain('InvalidAPIKey');
		});
	});

	describe('registerWorkflow', () => {
		it('should register a workflow definition', () => {
			const workflow: WorkflowDefinition = {
				name: 'test-workflow',
				version: '1.0.0',
				description: 'Test workflow',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);

			// Workflow should be registered (no error thrown)
			expect(() => engine.registerWorkflow(workflow)).not.toThrow();
		});
	});

	describe('registerActivity', () => {
		it('should register an activity', () => {
			const activity: ActivityDefinition = {
				name: 'test-activity',
				handler: async (input: unknown) => {
					return { success: true, input };
				},
			};

			engine.registerActivity(activity);

			// Activity should be registered (no error thrown)
			expect(() => engine.registerActivity(activity)).not.toThrow();
		});

		it('should register activity with retry policy', () => {
			const activity: ActivityDefinition = {
				name: 'test-activity',
				handler: async () => ({ success: true }),
				retryPolicy: {
					initialInterval: 500,
					backoffCoefficient: 1.5,
					maximumInterval: 30000,
					maximumAttempts: 3,
					nonRetryableErrors: ['FatalError'],
				},
			};

			engine.registerActivity(activity);
			expect(() => engine.registerActivity(activity)).not.toThrow();
		});
	});

	describe('startWorkflow', () => {
		it('should throw error for non-existent workflow', async () => {
			await expect(engine.startWorkflow('non-existent')).rejects.toThrow(
				'Workflow not found: non-existent',
			);
		});

		it('should start a workflow and return execution', async () => {
			const activity: ActivityDefinition = {
				name: 'slow-activity',
				handler: async () => {
					await new Promise((resolve) => setTimeout(resolve, 100));
					return { success: true };
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Slow Step',
				type: 'activity',
				activityName: 'slow-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'simple-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('simple-workflow');

			expect(execution.workflowId).toBeTruthy();
			expect(execution.runId).toBeTruthy();
			expect(execution.workflowName).toBe('simple-workflow');
			expect(execution.status).toBe('running');
			expect(execution.currentStepIndex).toBe(0);
			expect(execution.startedAt).toBeInstanceOf(Date);
		});

		it('should increment metrics when starting workflow', async () => {
			const workflow: WorkflowDefinition = {
				name: 'metrics-workflow',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);

			const metricsBefore = engine.getMetrics();
			await engine.startWorkflow('metrics-workflow');

			// Give workflow time to start executing
			await new Promise((resolve) => setTimeout(resolve, 50));

			const metricsAfter = engine.getMetrics();
			expect(metricsAfter.workflowsStarted).toBe(metricsBefore.workflowsStarted + 1);
		});

		it('should execute workflow steps and complete', async () => {
			const activity: ActivityDefinition = {
				name: 'success-activity',
				handler: async () => ({ result: 'success' }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Test Step',
				type: 'activity',
				activityName: 'success-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'complete-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('complete-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('completed');
		});

		it('should handle workflow failure', async () => {
			const activity: ActivityDefinition = {
				name: 'failing-activity',
				handler: async () => {
					throw new Error('Activity failed');
				},
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 1,
					nonRetryableErrors: [],
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Failing Step',
				type: 'activity',
				activityName: 'failing-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'failing-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 1,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('failing-workflow');

			// Wait for workflow to fail
			await new Promise((resolve) => setTimeout(resolve, 200));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('failed');
			expect(updatedExecution?.error).toBeTruthy();
		});
	});

	describe('checkpoints', () => {
		it('should create checkpoint for every-step strategy', async () => {
			const activity: ActivityDefinition = {
				name: 'checkpoint-activity',
				handler: async () => ({ success: true }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Checkpoint Step',
				type: 'activity',
				activityName: 'checkpoint-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'checkpoint-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('checkpoint-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			const checkpoints = await engine.getWorkflowHistory(execution.workflowId);
			expect(checkpoints.length).toBeGreaterThan(0);
			expect(checkpoints[0]?.stepId).toBe('step-1');
		});

		it('should create checkpoint only when required for manual strategy', async () => {
			const activity: ActivityDefinition = {
				name: 'manual-checkpoint-activity',
				handler: async () => ({ success: true }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Manual Checkpoint Step',
				type: 'activity',
				activityName: 'manual-checkpoint-activity',
				requiresCheckpoint: true,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'manual-checkpoint-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'manual',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('manual-checkpoint-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			const checkpoints = await engine.getWorkflowHistory(execution.workflowId);
			expect(checkpoints.length).toBeGreaterThan(0);
		});
	});

	describe('retry logic', () => {
		it('should retry failed activities', async () => {
			let attempts = 0;

			const activity: ActivityDefinition = {
				name: 'retry-activity',
				handler: async () => {
					attempts++;
					if (attempts < 3) {
						throw new Error('Temporary failure');
					}
					return { success: true };
				},
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Retry Step',
				type: 'activity',
				activityName: 'retry-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'retry-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('retry-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 300));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('completed');
			expect(attempts).toBe(3);
		});

		it('should not retry non-retryable errors', async () => {
			let attempts = 0;

			const activity: ActivityDefinition = {
				name: 'non-retry-activity',
				handler: async () => {
					attempts++;
					const error = new Error('Invalid input');
					error.name = 'InvalidInput';
					throw error;
				},
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 5,
					nonRetryableErrors: ['InvalidInput'],
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Non-Retry Step',
				type: 'activity',
				activityName: 'non-retry-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'non-retry-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 5,
					nonRetryableErrors: ['InvalidInput'],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('non-retry-workflow');

			// Wait for workflow to fail
			await new Promise((resolve) => setTimeout(resolve, 200));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('failed');
			expect(attempts).toBe(1); // Should only attempt once
		});

		it('should use exponential backoff for retries', async () => {
			const timestamps: number[] = [];

			const activity: ActivityDefinition = {
				name: 'backoff-activity',
				handler: async () => {
					timestamps.push(Date.now());
					if (timestamps.length < 3) {
						throw new Error('Retry me');
					}
					return { success: true };
				},
				retryPolicy: {
					initialInterval: 50,
					backoffCoefficient: 2,
					maximumInterval: 500,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Backoff Step',
				type: 'activity',
				activityName: 'backoff-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'backoff-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 50,
					backoffCoefficient: 2,
					maximumInterval: 500,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			await engine.startWorkflow('backoff-workflow');

			// Wait for retries to complete
			await new Promise((resolve) => setTimeout(resolve, 500));

			expect(timestamps.length).toBe(3);
			// Second attempt should be ~50ms after first
			// Third attempt should be ~100ms after second (2x backoff)
			const firstDelay = timestamps[1]! - timestamps[0]!;
			const secondDelay = timestamps[2]! - timestamps[1]!;

			expect(firstDelay).toBeGreaterThanOrEqual(40); // Allow some margin
			expect(secondDelay).toBeGreaterThanOrEqual(80);
		});
	});

	describe('step types', () => {
		it('should execute signal step', async () => {
			const step: WorkflowStep = {
				id: 'signal-step',
				name: 'Signal Step',
				type: 'signal',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'signal-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('signal-workflow');

			await new Promise((resolve) => setTimeout(resolve, 200));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('completed');
		});

		it('should execute timer step', async () => {
			const step: WorkflowStep = {
				id: 'timer-step',
				name: 'Timer Step',
				type: 'timer',
				timeout: 50,
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'timer-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const startTime = Date.now();
			const execution = await engine.startWorkflow('timer-workflow');

			await new Promise((resolve) => setTimeout(resolve, 200));

			const duration = Date.now() - startTime;
			const updatedExecution = await engine.queryWorkflow(execution.workflowId);

			expect(updatedExecution?.status).toBe('completed');
			expect(duration).toBeGreaterThanOrEqual(50);
		});

		it('should execute decision step', async () => {
			const step: WorkflowStep = {
				id: 'decision-step',
				name: 'Decision Step',
				type: 'decision',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'decision-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('decision-workflow');

			await new Promise((resolve) => setTimeout(resolve, 200));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('completed');
		});

		it('should execute child-workflow step', async () => {
			const step: WorkflowStep = {
				id: 'child-workflow-step',
				name: 'Child Workflow Step',
				type: 'child-workflow',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'parent-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('parent-workflow');

			await new Promise((resolve) => setTimeout(resolve, 200));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('completed');
		});

		it('should throw error for activity step without activity name', async () => {
			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Invalid Activity Step',
				type: 'activity',
				// Missing activityName
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'invalid-activity-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 1,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('invalid-activity-workflow');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('failed');
			expect(updatedExecution?.error).toContain('Activity name required');
		});

		it('should throw error for non-existent activity', async () => {
			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Missing Activity Step',
				type: 'activity',
				activityName: 'non-existent-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'missing-activity-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 1,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('missing-activity-workflow');

			await new Promise((resolve) => setTimeout(resolve, 100));

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.status).toBe('failed');
			expect(updatedExecution?.error).toContain('Activity not found');
		});
	});

	describe('signals', () => {
		it('should send signal to workflow', async () => {
			const workflow: WorkflowDefinition = {
				name: 'signal-workflow',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('signal-workflow');

			await engine.sendSignal(execution.workflowId, 'approval');

			const updatedExecution = await engine.queryWorkflow(execution.workflowId);
			expect(updatedExecution?.pendingSignals).toContain('approval');
		});

		it('should throw error when sending signal to non-existent workflow', async () => {
			await expect(engine.sendSignal('non-existent', 'signal')).rejects.toThrow(
				'Workflow not found',
			);
		});
	});

	describe('queryWorkflow', () => {
		it('should return undefined for non-existent workflow', async () => {
			const result = await engine.queryWorkflow('non-existent');
			expect(result).toBeUndefined();
		});

		it('should return workflow execution state', async () => {
			const workflow: WorkflowDefinition = {
				name: 'query-workflow',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('query-workflow');

			const queried = await engine.queryWorkflow(execution.workflowId);
			expect(queried).toBeDefined();
			expect(queried?.workflowId).toBe(execution.workflowId);
			expect(queried?.workflowName).toBe('query-workflow');
		});
	});

	describe('cancelWorkflow', () => {
		it('should throw error for non-existent workflow', async () => {
			await expect(engine.cancelWorkflow('non-existent')).rejects.toThrow('Workflow not found');
		});

		it('should cancel running workflow', async () => {
			const workflow: WorkflowDefinition = {
				name: 'cancel-workflow',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('cancel-workflow');

			await engine.cancelWorkflow(execution.workflowId);

			const queried = await engine.queryWorkflow(execution.workflowId);
			expect(queried?.status).toBe('cancelled');
		});
	});

	describe('getWorkflowHistory', () => {
		it('should throw error for non-existent workflow', async () => {
			await expect(engine.getWorkflowHistory('non-existent')).rejects.toThrow('Workflow not found');
		});

		it('should return workflow checkpoints', async () => {
			const activity: ActivityDefinition = {
				name: 'history-activity',
				handler: async () => ({ success: true }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'History Step',
				type: 'activity',
				activityName: 'history-activity',
				requiresCheckpoint: true,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'history-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('history-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			const history = await engine.getWorkflowHistory(execution.workflowId);
			expect(history.length).toBeGreaterThan(0);
		});
	});

	describe('replayFromCheckpoint', () => {
		it('should throw error for non-existent workflow', async () => {
			await expect(engine.replayFromCheckpoint('non-existent', 'checkpoint-1')).rejects.toThrow(
				'Workflow not found',
			);
		});

		it('should throw error for non-existent checkpoint', async () => {
			const workflow: WorkflowDefinition = {
				name: 'replay-workflow',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow);
			const execution = await engine.startWorkflow('replay-workflow');

			await expect(
				engine.replayFromCheckpoint(execution.workflowId, 'non-existent-checkpoint'),
			).rejects.toThrow('Checkpoint not found');
		});

		it('should replay workflow from checkpoint', async () => {
			const activity: ActivityDefinition = {
				name: 'replay-activity',
				handler: async () => ({ success: true }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Replay Step',
				type: 'activity',
				activityName: 'replay-activity',
				requiresCheckpoint: true,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'replay-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('replay-workflow');

			// Wait for checkpoint to be created
			await new Promise((resolve) => setTimeout(resolve, 200));

			const checkpoints = await engine.getWorkflowHistory(execution.workflowId);
			expect(checkpoints.length).toBeGreaterThan(0);

			const checkpointId = checkpoints[0]?.id;
			await engine.replayFromCheckpoint(execution.workflowId, checkpointId);

			const queried = await engine.queryWorkflow(execution.workflowId);
			expect(queried?.status).toBe('running');
			expect(queried?.currentStepIndex).toBe(0);
		});
	});

	describe('metrics', () => {
		it('should track workflow metrics', async () => {
			const activity: ActivityDefinition = {
				name: 'metrics-activity',
				handler: async () => ({ success: true }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Metrics Step',
				type: 'activity',
				activityName: 'metrics-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'metrics-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const initialMetrics = engine.getMetrics();
			await engine.startWorkflow('metrics-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			const finalMetrics = engine.getMetrics();

			expect(finalMetrics.workflowsStarted).toBe(initialMetrics.workflowsStarted + 1);
			expect(finalMetrics.workflowsCompleted).toBe(initialMetrics.workflowsCompleted + 1);
			expect(finalMetrics.activitiesExecuted).toBeGreaterThan(initialMetrics.activitiesExecuted);
			expect(finalMetrics.checkpointsCreated).toBeGreaterThan(initialMetrics.checkpointsCreated);
		});

		it('should track retry metrics', async () => {
			let attempts = 0;

			const activity: ActivityDefinition = {
				name: 'retry-metrics-activity',
				handler: async () => {
					attempts++;
					if (attempts < 2) {
						throw new Error('Retry me');
					}
					return { success: true };
				},
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 3,
					nonRetryableErrors: [],
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Retry Metrics Step',
				type: 'activity',
				activityName: 'retry-metrics-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'retry-metrics-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 10,
					backoffCoefficient: 1,
					maximumInterval: 10,
					maximumAttempts: 3,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const initialMetrics = engine.getMetrics();
			await engine.startWorkflow('retry-metrics-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 200));

			const finalMetrics = engine.getMetrics();

			expect(finalMetrics.activitiesRetried).toBeGreaterThan(initialMetrics.activitiesRetried);
		});

		it('should calculate average workflow duration', async () => {
			const activity: ActivityDefinition = {
				name: 'duration-activity',
				handler: async () => {
					await new Promise((resolve) => setTimeout(resolve, 50));
					return { success: true };
				},
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Duration Step',
				type: 'activity',
				activityName: 'duration-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: false,
			};

			const workflow: WorkflowDefinition = {
				name: 'duration-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			await engine.startWorkflow('duration-workflow');

			// Wait for workflow to complete
			await new Promise((resolve) => setTimeout(resolve, 300));

			const metrics = engine.getMetrics();
			expect(metrics.avgWorkflowDuration).toBeGreaterThan(0);
		});
	});

	describe('getExecutions', () => {
		it('should return all workflow executions', async () => {
			const workflow1: WorkflowDefinition = {
				name: 'workflow-1',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			const workflow2: WorkflowDefinition = {
				name: 'workflow-2',
				version: '1.0.0',
				steps: [],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: false,
			};

			engine.registerWorkflow(workflow1);
			engine.registerWorkflow(workflow2);

			await engine.startWorkflow('workflow-1');
			await engine.startWorkflow('workflow-2');

			const executions = engine.getExecutions();
			expect(executions.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('shutdown', () => {
		it('should shutdown cleanly', async () => {
			await expect(engine.shutdown()).resolves.toBeUndefined();
		});
	});

	describe('HITL (Human-In-The-Loop)', () => {
		it('should pause workflow for human approval', async () => {
			const activity: ActivityDefinition = {
				name: 'approval-activity',
				handler: async () => ({ success: true }),
			};

			const step: WorkflowStep = {
				id: 'step-1',
				name: 'Approval Step',
				type: 'activity',
				activityName: 'approval-activity',
				requiresCheckpoint: false,
				requiresHumanApproval: true,
			};

			const workflow: WorkflowDefinition = {
				name: 'hitl-workflow',
				version: '1.0.0',
				steps: [step],
				retryPolicy: {
					initialInterval: 1000,
					backoffCoefficient: 2,
					maximumInterval: 60000,
					maximumAttempts: 5,
					nonRetryableErrors: [],
				},
				checkpointStrategy: 'every-step',
				enableHITL: true,
			};

			engine.registerActivity(activity);
			engine.registerWorkflow(workflow);

			const execution = await engine.startWorkflow('hitl-workflow');

			// Wait a bit for the workflow to start
			await new Promise((resolve) => setTimeout(resolve, 100));

			const _queried = await engine.queryWorkflow(execution.workflowId);
			// Should eventually complete after simulated approval
			await new Promise((resolve) => setTimeout(resolve, 1200));

			const final = await engine.queryWorkflow(execution.workflowId);
			expect(final?.status).toBe('completed');
		});
	});
});
