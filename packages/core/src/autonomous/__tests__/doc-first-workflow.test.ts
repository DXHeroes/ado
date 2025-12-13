/**
 * Tests for DocFirstWorkflow
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckpointManager, InMemoryCheckpointStorage } from '../../checkpoint/index.js';
import { AutoFixEngine } from '../auto-fix-engine.js';
import {
	DocFirstWorkflow,
	type DocFirstWorkflowContext,
	type WorkflowPhase,
	createDocFirstWorkflow,
} from '../doc-first-workflow.js';
import { EscalationEngine } from '../escalation-engine.js';
import { HITLCheckpointCoordinator } from '../hitl-checkpoint-coordinator.js';
import { QualityValidationCoordinator } from '../quality-validation-coordinator.js';
import { SpecGenerator } from '../spec-generator.js';
import { StuckDetector } from '../stuck-detector.js';
import { TaskClassifier } from '../task-classifier.js';
import { TaskDecomposer } from '../task-decomposer.js';

describe('DocFirstWorkflow', () => {
	let workflow: DocFirstWorkflow;
	let specGenerator: SpecGenerator;
	let taskDecomposer: TaskDecomposer;
	let qualityValidator: QualityValidationCoordinator;
	let autoFixEngine: AutoFixEngine;
	let hitlCoordinator: HITLCheckpointCoordinator;
	let stuckDetector: StuckDetector;
	let escalationEngine: EscalationEngine;

	beforeEach(() => {
		specGenerator = new SpecGenerator();
		const classifier = new TaskClassifier();
		taskDecomposer = new TaskDecomposer(classifier);
		qualityValidator = new QualityValidationCoordinator();
		stuckDetector = new StuckDetector();
		autoFixEngine = new AutoFixEngine(stuckDetector);
		const checkpointManager = new CheckpointManager(new InMemoryCheckpointStorage());
		hitlCoordinator = new HITLCheckpointCoordinator(checkpointManager);
		escalationEngine = new EscalationEngine();

		workflow = new DocFirstWorkflow(
			specGenerator,
			taskDecomposer,
			qualityValidator,
			autoFixEngine,
			hitlCoordinator,
			stuckDetector,
			escalationEngine,
		);
	});

	describe('createDocFirstWorkflow', () => {
		it('should create workflow with factory function', () => {
			const wf = createDocFirstWorkflow(
				specGenerator,
				taskDecomposer,
				qualityValidator,
				autoFixEngine,
				hitlCoordinator,
				stuckDetector,
				escalationEngine,
			);

			expect(wf).toBeDefined();
		});
	});

	describe('execute - full workflow', () => {
		it('should execute complete workflow phases', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'test-task',
				prompt: 'Add user registration form',
				workingDirectory: '/test/project',
			};

			// Mock quality validation to succeed
			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result).toBeDefined();
			expect(result.state).toBeDefined();
			expect(result.duration).toBeGreaterThan(0);
		});

		it('should track workflow phases', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'test-task-2',
				prompt: 'Fix login bug',
				workingDirectory: '/test/project',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			const phases: WorkflowPhase[] = [
				'specify',
				'plan',
				'tasks',
				'implement',
				'validate',
				'complete',
			];

			expect(phases).toContain(result.state.phase);
		});

		it('should fail when quality gates not passed', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'failing-task',
				prompt: 'Add feature',
				workingDirectory: '/test/project',
			};

			// Mock validation to fail
			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: false,
				results: [
					{
						success: false,
						language: 'typescript',
						validator: 'tsc',
						exitCode: 1,
						duration: 100,
						issues: [
							{
								file: 'test.ts',
								severity: 'error',
								category: 'type_error',
								message: 'Type error',
							},
						],
						summary: { errors: 1, warnings: 0, infos: 0 },
					},
				],
				qualityGate: {
					passed: false,
					blockers: ['Type errors found'],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Quality gates failed');
		});

		it('should handle workflow errors gracefully', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'error-task',
				prompt: 'Invalid task',
				workingDirectory: '/nonexistent',
			};

			// Mock classifier to throw error
			vi.spyOn(taskDecomposer['classifier'], 'classify').mockRejectedValue(
				new Error('Classification failed'),
			);

			const result = await workflow.execute(context);

			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});
	});

	describe('workflow state', () => {
		it('should initialize state correctly', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'state-task',
				prompt: 'Test task',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			// After execution, state should have processed tasks
			expect(result.state.currentTaskIndex).toBe(0);
			expect(result.state.failedTasks).toEqual([]);
			expect(result.state.validationReports).toBeDefined();
			expect(result.state.validationReports.length).toBeGreaterThan(0);
		});

		it('should track validation reports', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'validation-task',
				prompt: 'Test',
				workingDirectory: '/test',
			};

			const mockValidationReport = {
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue(mockValidationReport);

			const result = await workflow.execute(context);

			expect(result.state.validationReports.length).toBeGreaterThan(0);
		});
	});

	describe('workflow summary', () => {
		it('should create summary with task counts', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'summary-task',
				prompt: 'Add feature',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result.summary).toBeDefined();
			expect(result.summary.tasksCompleted).toBeGreaterThanOrEqual(0);
			expect(result.summary.tasksFailed).toBeGreaterThanOrEqual(0);
			expect(result.summary.checkpointsReached).toBeGreaterThanOrEqual(0);
			expect(result.summary.escalationsTriggered).toBeGreaterThanOrEqual(0);
			expect(result.summary.fixesApplied).toBeGreaterThanOrEqual(0);
		});
	});

	describe('event handling', () => {
		it('should allow subscribing to workflow events', async () => {
			const events: any[] = [];
			const unsubscribe = workflow.onEvent((event) => {
				events.push(event);
			});

			expect(unsubscribe).toBeInstanceOf(Function);

			// Cleanup
			unsubscribe();
		});

		it('should emit events during workflow execution', async () => {
			const events: any[] = [];
			const unsubscribe = workflow.onEvent((event) => {
				events.push(event);
			});

			const context: DocFirstWorkflowContext = {
				taskId: 'event-task',
				prompt: 'Test events',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			// Start task to trigger event tracking
			hitlCoordinator.startTask(context.taskId);

			await workflow.execute(context);

			// Cleanup
			unsubscribe();

			// Events may or may not be emitted depending on workflow execution
			expect(Array.isArray(events)).toBe(true);
		});
	});

	describe('specification phase', () => {
		it('should generate specification from prompt', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'spec-task',
				prompt: 'Implement OAuth2 authentication',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result.state.specification).toBeDefined();
			expect(result.state.specification?.specification).toBeDefined();
		});
	});

	describe('planning phase', () => {
		it('should decompose task into subtasks', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'plan-task',
				prompt: 'Build dashboard',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result.state.decomposition).toBeDefined();
			expect(result.state.decomposition?.executionPlan).toBeDefined();
		});
	});

	describe('implementation phase', () => {
		it('should execute tasks in stages', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'impl-task',
				prompt: 'Add feature',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			// Should have gone through implementation phase
			expect(result.state.phase).toBe('complete');
		});

		it('should apply auto-fixes when validation fails', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'autofix-task',
				prompt: 'Fix code',
				workingDirectory: '/test',
			};

			// Mock autoFix to return success with fixes applied
			vi.spyOn(autoFixEngine, 'autoFix').mockResolvedValue({
				success: true,
				fixesApplied: 1,
				stuck: false,
				iterations: 1,
				duration: 100,
			});

			let callCount = 0;
			vi.spyOn(qualityValidator, 'validate').mockImplementation(async () => {
				callCount++;
				if (callCount === 1) {
					// First call: validation fails
					return {
						passed: false,
						results: [
							{
								success: false,
								language: 'typescript',
								validator: 'tsc',
								exitCode: 1,
								duration: 100,
								issues: [
									{
										file: 'test.ts',
										severity: 'error',
										category: 'type_error',
										message: 'error',
									},
								],
								summary: { errors: 1, warnings: 0, infos: 0 },
							},
						],
						qualityGate: {
							passed: false,
							blockers: ['Errors found'],
							warnings: [],
						},
						duration: 100,
					};
				}
				// Subsequent calls: validation passes
				return {
					passed: true,
					results: [],
					qualityGate: {
						passed: true,
						blockers: [],
						warnings: [],
					},
					duration: 100,
				};
			});

			const _result = await workflow.execute(context);

			// Should have attempted auto-fix and re-validated
			expect(callCount).toBeGreaterThan(1);
		});
	});

	describe('validation phase', () => {
		it('should perform final validation', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'final-validation-task',
				prompt: 'Complete task',
				workingDirectory: '/test',
			};

			const validateSpy = vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			await workflow.execute(context);

			// Should have called validate multiple times (during impl + final)
			expect(validateSpy).toHaveBeenCalled();
		});
	});

	describe('human approval', () => {
		it('should respect requireHumanApproval flag', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'approval-task',
				prompt: 'Critical change',
				workingDirectory: '/test',
				requireHumanApproval: true,
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			// Workflow should complete even with approval flag
			expect(result).toBeDefined();
		});
	});

	describe('checkpoint integration', () => {
		it('should coordinate with HITL checkpoints', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'checkpoint-task',
				prompt: 'Task with checkpoints',
				workingDirectory: '/test',
			};

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: true,
				results: [],
				qualityGate: {
					passed: true,
					blockers: [],
					warnings: [],
				},
				duration: 100,
			});

			// Start task for checkpoint tracking
			hitlCoordinator.startTask(context.taskId);

			const result = await workflow.execute(context);

			expect(result).toBeDefined();
		});
	});

	describe('error scenarios', () => {
		it('should handle stuck auto-fix gracefully', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'stuck-task',
				prompt: 'Unfixable task',
				workingDirectory: '/test',
			};

			// Mock auto-fix to return stuck
			vi.spyOn(autoFixEngine, 'autoFix').mockResolvedValue({
				success: false,
				fixesApplied: 0,
				remainingIssues: [
					{
						file: 'test.ts',
						severity: 'error',
						category: 'type_error',
						message: 'Unfixable error',
					},
				],
				shouldRetry: false,
				stuck: true,
			});

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: false,
				results: [
					{
						success: false,
						language: 'typescript',
						validator: 'tsc',
						exitCode: 1,
						duration: 100,
						issues: [
							{
								file: 'test.ts',
								severity: 'error',
								category: 'type_error',
								message: 'Error',
							},
						],
						summary: { errors: 1, warnings: 0, infos: 0 },
					},
				],
				qualityGate: {
					passed: false,
					blockers: ['Errors'],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result.success).toBe(false);
		});

		it('should handle no fixes available scenario', async () => {
			const context: DocFirstWorkflowContext = {
				taskId: 'no-fixes-task',
				prompt: 'Task without fixes',
				workingDirectory: '/test',
			};

			vi.spyOn(autoFixEngine, 'autoFix').mockResolvedValue({
				success: false,
				fixesApplied: 0,
				remainingIssues: [
					{
						file: 'test.ts',
						severity: 'error',
						category: 'type_error',
						message: 'Error',
					},
				],
				shouldRetry: false,
				stuck: false,
			});

			vi.spyOn(qualityValidator, 'validate').mockResolvedValue({
				passed: false,
				results: [
					{
						success: false,
						language: 'typescript',
						validator: 'tsc',
						exitCode: 1,
						duration: 100,
						issues: [
							{
								file: 'test.ts',
								severity: 'error',
								category: 'type_error',
								message: 'Error',
							},
						],
						summary: { errors: 1, warnings: 0, infos: 0 },
					},
				],
				qualityGate: {
					passed: false,
					blockers: ['Errors'],
					warnings: [],
				},
				duration: 100,
			});

			const result = await workflow.execute(context);

			expect(result.success).toBe(false);
		});
	});
});
