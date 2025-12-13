/**
 * Tests for TaskDecomposer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskDecomposer, type DecompositionResult } from '../task-decomposer.js';
import type { TaskContext } from '../task-classifier.js';

describe('TaskDecomposer', () => {
	let decomposer: TaskDecomposer;

	beforeEach(() => {
		decomposer = new TaskDecomposer();
	});

	describe('decompose', () => {
		it('should decompose simple task into single subtask', async () => {
			const context: TaskContext = {
				prompt: 'Fix small typo in README',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.subtasks).toHaveLength(1);
			expect(result.subtasks[0]?.id).toBe('task-1');
			expect(result.requiresHumanReview).toBe(false);
		});

		it('should decompose feature task into multiple subtasks', async () => {
			const context: TaskContext = {
				prompt: 'Add user authentication feature',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.subtasks.length).toBeGreaterThan(1);
			expect(result.subtasks.map((t) => t.id)).toContain('design');
			expect(result.subtasks.map((t) => t.id)).toContain('core-impl');
			expect(result.subtasks.map((t) => t.id)).toContain('tests');
		});

		it('should create execution plan with stages', async () => {
			const context: TaskContext = {
				prompt: 'Implement OAuth2 login',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.executionPlan.stages).toBeDefined();
			expect(result.executionPlan.stages.length).toBeGreaterThan(0);
			expect(result.executionPlan.estimatedTotalDuration).toBeGreaterThan(0);
		});

		it('should require human review for epic tasks', async () => {
			const context: TaskContext = {
				prompt: 'Rewrite entire authentication system with microservices architecture',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.requiresHumanReview).toBe(true);
		});

		it('should require human review for critical tasks', async () => {
			const context: TaskContext = {
				prompt: 'Fix critical security vulnerability in auth system',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.requiresHumanReview).toBe(true);
		});

		it('should generate checkpoints for complex tasks', async () => {
			const context: TaskContext = {
				prompt: 'Add payment processing feature',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.checkpoints.length).toBeGreaterThan(0);
		});

		it('should decompose bug fix task correctly', async () => {
			const context: TaskContext = {
				prompt: 'Fix login button not working',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.classification.type).toBe('bug');
			expect(result.subtasks.map((t) => t.id)).toContain('reproduce');
			expect(result.subtasks.map((t) => t.id)).toContain('fix');
			expect(result.subtasks.map((t) => t.id)).toContain('regression-test');
		});

		it('should decompose refactor task correctly', async () => {
			const context: TaskContext = {
				prompt: 'Refactor authentication module',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.classification.type).toBe('refactor');
			expect(result.subtasks.map((t) => t.id)).toContain('baseline-tests');
			expect(result.subtasks.map((t) => t.id)).toContain('extract');
			expect(result.subtasks.map((t) => t.id)).toContain('simplify');
		});

		it('should decompose test task correctly', async () => {
			const context: TaskContext = {
				prompt: 'Add tests for user service',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.classification.type).toBe('test');
			expect(result.subtasks.map((t) => t.id)).toContain('test-plan');
			expect(result.subtasks.map((t) => t.id)).toContain('unit-tests');
		});

		it('should decompose documentation task correctly', async () => {
			const context: TaskContext = {
				prompt: 'Write API documentation',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.classification.type).toBe('docs');
			expect(result.subtasks.map((t) => t.id)).toContain('outline');
			expect(result.subtasks.map((t) => t.id)).toContain('write');
		});
	});

	describe('feature decomposition', () => {
		it('should include design phase for features', async () => {
			const context: TaskContext = {
				prompt: 'Add email notification feature',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			const designTask = result.subtasks.find((t) => t.id === 'design');
			expect(designTask).toBeDefined();
			expect(designTask?.type).toBe('docs');
			expect(designTask?.metadata.reviewRequired).toBe(true);
		});

		it('should include quality checks for features', async () => {
			const context: TaskContext = {
				prompt: 'Implement search functionality',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			const qualityTask = result.subtasks.find((t) => t.id === 'quality');
			expect(qualityTask).toBeDefined();
			expect(qualityTask?.type).toBe('chore');
		});

		it('should mark tests as required for features', async () => {
			const context: TaskContext = {
				prompt: 'Add user profile page',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			const coreTask = result.subtasks.find((t) => t.id === 'core-impl');
			expect(coreTask?.metadata.testRequired).toBe(true);
		});
	});

	describe('checkpoints', () => {
		it('should create design review checkpoint', async () => {
			const context: TaskContext = {
				prompt: 'Build real-time chat feature',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			const designCheckpoint = result.checkpoints.find((c) => c.id === 'checkpoint-design');
			expect(designCheckpoint).toBeDefined();
			expect(designCheckpoint?.name).toBe('Design Review');
			expect(designCheckpoint?.reviewCriteria.length).toBeGreaterThan(0);
		});

		it('should create final approval checkpoint for critical tasks', async () => {
			const context: TaskContext = {
				prompt: 'Fix critical data loss bug',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			const finalCheckpoint = result.checkpoints.find((c) => c.id === 'checkpoint-final');
			expect(finalCheckpoint).toBeDefined();
			expect(finalCheckpoint?.name).toBe('Critical Task Approval');
			expect(finalCheckpoint?.blockingIssues).toBeDefined();
		});
	});

	describe('execution plan', () => {
		it('should calculate total duration correctly', async () => {
			const context: TaskContext = {
				prompt: 'Add dashboard analytics',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			expect(result.executionPlan.estimatedTotalDuration).toBeGreaterThan(0);
			expect(result.executionPlan.estimatedTotalDuration).toBeLessThanOrEqual(
				result.subtasks.reduce((sum, t) => sum + t.estimatedDuration, 0),
			);
		});

		it('should create sequential stages for dependent tasks', async () => {
			const context: TaskContext = {
				prompt: 'Implement payment integration',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			// Design should come before implementation
			const designStage = result.executionPlan.stages.find((s) =>
				s.tasks.includes('design'),
			);
			const implStage = result.executionPlan.stages.find((s) =>
				s.tasks.includes('core-impl'),
			);

			expect(designStage).toBeDefined();
			expect(implStage).toBeDefined();
			if (designStage && implStage) {
				expect(designStage.stage).toBeLessThan(implStage.stage);
			}
		});

		it('should identify parallel tasks', async () => {
			const context: TaskContext = {
				prompt: 'Add reporting feature',
				repositoryPath: '/test/repo',
			};

			const result = await decomposer.decompose(context);

			// Docs and quality can run in parallel
			const parallelStage = result.executionPlan.stages.find(
				(s) => s.tasks.includes('docs') && s.tasks.includes('quality'),
			);

			// At least some tasks should be marked as parallel
			const parallelTasks = result.subtasks.filter((t) => t.parallel);
			expect(parallelTasks.length).toBeGreaterThan(0);
		});
	});
});
