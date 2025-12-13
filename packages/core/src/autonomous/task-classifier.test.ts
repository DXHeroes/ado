/**
 * Tests for TaskClassifier
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { type TaskClassifier, type TaskContext, createTaskClassifier } from './task-classifier.js';

describe('TaskClassifier', () => {
	let classifier: TaskClassifier;

	beforeEach(() => {
		classifier = createTaskClassifier();
	});

	describe('classify', () => {
		it('should return complete classification result', () => {
			const context: TaskContext = {
				prompt: 'Add a new user authentication feature',
				repositoryPath: '/test/repo',
			};

			const result = classifier.classify(context);

			expect(result).toHaveProperty('type');
			expect(result).toHaveProperty('priority');
			expect(result).toHaveProperty('estimatedDuration');
			expect(result).toHaveProperty('complexity');
			expect(result).toHaveProperty('requiresBreakdown');
			expect(result).toHaveProperty('suggestedApproach');
		});
	});

	describe('detectType', () => {
		it('should classify bug tasks', () => {
			const bugPrompts = [
				'Fix the login bug',
				'Error in payment processing',
				'The app crashes when clicking submit',
				'Broken link on homepage',
				'Issue with database connection',
			];

			for (const prompt of bugPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.type).toBe('bug');
			}
		});

		it('should classify test tasks', () => {
			const testPrompts = [
				'Add unit tests for auth module',
				'Write integration tests',
				'Improve test coverage',
				'Add e2e tests for checkout flow',
			];

			for (const prompt of testPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.type).toBe('test');
			}
		});

		it('should classify documentation tasks', () => {
			const docsPrompts = [
				'Update README documentation',
				'Add API docs',
				'Write tutorial for setup',
				'Add JSDoc comments',
			];

			for (const prompt of docsPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.type).toBe('docs');
			}
		});

		it('should classify refactoring tasks', () => {
			const refactorPrompts = [
				'Refactor user service',
				'Clean up the codebase',
				'Reorganize project structure',
				'Optimize database queries',
			];

			for (const prompt of refactorPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.type).toBe('refactor');
			}
		});

		it('should classify chore tasks', () => {
			const chorePrompts = [
				'Update dependencies',
				'Upgrade Node.js version',
				'Setup CI/CD pipeline',
				'Configure linting',
			];

			for (const prompt of chorePrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.type).toBe('chore');
			}
		});

		it('should default to feature type', () => {
			const featurePrompts = [
				'Add user profile page',
				'Create dashboard',
				'Build notification system',
			];

			for (const prompt of featurePrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.type).toBe('feature');
			}
		});
	});

	describe('detectPriority', () => {
		it('should detect critical priority', () => {
			const criticalPrompts = [
				'Critical: Production down',
				'Urgent security vulnerability',
				'Emergency: Data loss detected',
			];

			for (const prompt of criticalPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.priority).toBe('critical');
			}
		});

		it('should detect high priority', () => {
			const highPrompts = [
				'Important: Fix payment bug',
				'High priority feature request',
				'Blocker for release',
				'Need this ASAP',
			];

			for (const prompt of highPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.priority).toBe('high');
			}
		});

		it('should detect low priority', () => {
			const lowPrompts = [
				'Nice to have: Add dark mode',
				'Low priority enhancement',
				'Future improvement',
				'Someday: Refactor old code',
			];

			for (const prompt of lowPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.priority).toBe('low');
			}
		});

		it('should default to medium priority', () => {
			const result = classifier.classify({
				prompt: 'Add new feature',
				repositoryPath: '/test',
			});
			expect(result.priority).toBe('medium');
		});

		it('should detect priority from issue labels', () => {
			const context: TaskContext = {
				prompt: 'Fix bug',
				repositoryPath: '/test',
				issueLabels: ['bug', 'critical'],
			};

			const result = classifier.classify(context);
			expect(result.priority).toBe('critical');
		});
	});

	describe('estimateComplexity', () => {
		it('should classify epic complexity', () => {
			const epicPrompts = [
				'Rewrite the entire backend',
				'Complete redesign of UI',
				'Migrate to new architecture',
				'Build new platform from scratch',
			];

			for (const prompt of epicPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.complexity).toBe('epic');
			}
		});

		it('should classify complex complexity', () => {
			const complexPrompts = [
				'Implement user authentication system',
				'Integrate payment gateway',
				'Add support for multiple languages',
			];

			for (const prompt of complexPrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.complexity).toBe('complex');
			}
		});

		it('should classify moderate complexity', () => {
			const moderatePrompts = [
				'Update user profile page',
				'Enhance search functionality',
				'Modify API response format',
			];

			for (const prompt of moderatePrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.complexity).toBe('moderate');
			}
		});

		it('should classify simple complexity', () => {
			const simplePrompts = ['Change button color', 'Fix typo in README', 'Add log statement'];

			for (const prompt of simplePrompts) {
				const result = classifier.classify({ prompt, repositoryPath: '/test' });
				expect(result.complexity).toBe('simple');
			}
		});

		it('should increase complexity for many existing files', () => {
			const context: TaskContext = {
				prompt: 'Make small change',
				repositoryPath: '/test',
				existingFiles: ['file1', 'file2', 'file3', 'file4', 'file5', 'file6'],
			};

			const result = classifier.classify(context);
			// Should increase complexity score by 1
			expect(['moderate', 'complex', 'epic']).toContain(result.complexity);
		});
	});

	describe('requiresBreakdown', () => {
		it('should require breakdown for complex tasks', () => {
			const result = classifier.classify({
				prompt: 'Implement authentication and authorization',
				repositoryPath: '/test',
			});

			expect(result.requiresBreakdown).toBe(true);
			expect(result.complexity).toBe('complex');
		});

		it('should require breakdown for epic tasks', () => {
			const result = classifier.classify({
				prompt: 'Rewrite entire application architecture',
				repositoryPath: '/test',
			});

			expect(result.requiresBreakdown).toBe(true);
			expect(result.complexity).toBe('epic');
		});

		it('should not require breakdown for simple tasks', () => {
			const result = classifier.classify({
				prompt: 'Fix typo',
				repositoryPath: '/test',
			});

			expect(result.requiresBreakdown).toBe(false);
			expect(result.complexity).toBe('simple');
		});

		it('should not require breakdown for moderate tasks', () => {
			const result = classifier.classify({
				prompt: 'Update button style',
				repositoryPath: '/test',
			});

			expect(result.requiresBreakdown).toBe(false);
			expect(result.complexity).toBe('moderate');
		});
	});

	describe('estimateDuration', () => {
		it('should estimate duration for simple bug', () => {
			const result = classifier.classify({
				prompt: 'Fix button click bug',
				repositoryPath: '/test',
			});

			// simple (15) * bug multiplier (0.8) = 12
			expect(result.estimatedDuration).toBe(12);
		});

		it('should estimate duration for moderate feature', () => {
			const result = classifier.classify({
				prompt: 'Update user profile',
				repositoryPath: '/test',
			});

			// moderate (45) * feature multiplier (1.2) = 54
			expect(result.estimatedDuration).toBe(54);
		});

		it('should estimate duration for complex refactor', () => {
			const result = classifier.classify({
				prompt: 'Implement new caching layer',
				repositoryPath: '/test',
			});

			// complex (120) * refactor multiplier (1.5) = 180
			expect(result.estimatedDuration).toBe(180);
		});

		it('should estimate duration for epic feature', () => {
			const result = classifier.classify({
				prompt: 'Rewrite entire platform',
				repositoryPath: '/test',
			});

			// epic (480) * feature multiplier (1.2) = 576
			expect(result.estimatedDuration).toBe(576);
		});

		it('should estimate shorter duration for docs', () => {
			const result = classifier.classify({
				prompt: 'Write API documentation',
				repositoryPath: '/test',
			});

			// moderate (45) * docs multiplier (0.5) = 22.5 → 22
			expect(result.estimatedDuration).toBeLessThan(30);
		});
	});

	describe('suggestApproach', () => {
		it('should suggest phase breakdown for epic tasks', () => {
			const result = classifier.classify({
				prompt: 'Complete platform migration',
				repositoryPath: '/test',
			});

			expect(result.suggestedApproach).toContain('phases');
			expect(result.suggestedApproach).toContain('checkpoints');
		});

		it('should suggest spec-first for complex tasks', () => {
			const result = classifier.classify({
				prompt: 'Implement payment integration',
				repositoryPath: '/test',
			});

			expect(result.suggestedApproach).toContain('spec-first');
			expect(result.suggestedApproach).toContain('design doc');
		});

		it('should suggest bug workflow for bugs', () => {
			const result = classifier.classify({
				prompt: 'Fix login error',
				repositoryPath: '/test',
			});

			expect(result.suggestedApproach).toContain('Reproduce');
			expect(result.suggestedApproach).toContain('Root cause');
		});

		it('should suggest test workflow for tests', () => {
			const result = classifier.classify({
				prompt: 'Add unit tests',
				repositoryPath: '/test',
			});

			expect(result.suggestedApproach).toContain('coverage');
		});

		it('should suggest docs workflow for documentation', () => {
			const result = classifier.classify({
				prompt: 'Write user guide',
				repositoryPath: '/test',
			});

			expect(result.suggestedApproach).toContain('Outline');
		});

		it('should suggest refactor workflow for refactoring', () => {
			const result = classifier.classify({
				prompt: 'Refactor auth module',
				repositoryPath: '/test',
			});

			expect(result.suggestedApproach).toContain('Extract');
			expect(result.suggestedApproach).toContain('Simplify');
		});
	});

	describe('real-world scenarios', () => {
		it('should correctly classify adding authentication', () => {
			const result = classifier.classify({
				prompt: 'Add user authentication with JWT tokens',
				repositoryPath: '/test',
			});

			expect(result.type).toBe('feature');
			expect(result.complexity).toBe('complex');
			expect(result.requiresBreakdown).toBe(true);
			expect(result.estimatedDuration).toBeGreaterThan(100);
		});

		it('should correctly classify critical production bug', () => {
			const result = classifier.classify({
				prompt: 'Critical: Production database connection failing',
				repositoryPath: '/test',
				issueLabels: ['bug', 'critical', 'production'],
			});

			expect(result.type).toBe('bug');
			expect(result.priority).toBe('critical');
			expect(result.requiresBreakdown).toBe(false);
		});

		it('should correctly classify documentation update', () => {
			const result = classifier.classify({
				prompt: 'Update README with new installation instructions',
				repositoryPath: '/test',
			});

			expect(result.type).toBe('docs');
			expect(result.complexity).toBe('simple');
			expect(result.requiresBreakdown).toBe(false);
			expect(result.estimatedDuration).toBeLessThan(20);
		});

		it('should correctly classify dependency upgrade', () => {
			const result = classifier.classify({
				prompt: 'Upgrade React to version 18',
				repositoryPath: '/test',
			});

			expect(result.type).toBe('chore');
		});

		it('should correctly classify large refactoring', () => {
			const result = classifier.classify({
				prompt: 'Refactor entire API layer to use new architecture',
				repositoryPath: '/test',
				existingFiles: Array(20).fill('file'),
			});

			expect(result.type).toBe('refactor');
			expect(result.complexity).toBe('epic');
			expect(result.requiresBreakdown).toBe(true);
		});
	});
});
