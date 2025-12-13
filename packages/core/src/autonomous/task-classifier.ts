/**
 * Task Classifier
 *
 * Classifies tasks based on prompt analysis and codebase context.
 */

import type { TaskNode } from './dependency-graph.js';

export interface ClassificationResult {
	type: TaskNode['type'];
	priority: TaskNode['priority'];
	estimatedDuration: number;
	complexity: 'simple' | 'moderate' | 'complex' | 'epic';
	requiresBreakdown: boolean;
	suggestedApproach?: string;
}

export interface TaskContext {
	prompt: string;
	repositoryPath: string;
	existingFiles?: string[];
	recentCommits?: string[];
	issueLabels?: string[];
}

/**
 * Task classifier using heuristics
 */
export class TaskClassifier {
	/**
	 * Classify task based on prompt
	 */
	classify(context: TaskContext): ClassificationResult {
		const prompt = context.prompt.toLowerCase();

		// Detect task type
		const type = this.detectType(prompt);

		// Detect priority
		const priority = this.detectPriority(prompt, context);

		// Estimate complexity
		const complexity = this.estimateComplexity(prompt, context);

		// Estimate duration based on complexity
		const estimatedDuration = this.estimateDuration(complexity, type);

		// Determine if breakdown needed
		const requiresBreakdown = complexity === 'complex' || complexity === 'epic';

		// Suggest approach
		const suggestedApproach = this.suggestApproach(type, complexity);

		return {
			type,
			priority,
			estimatedDuration,
			complexity,
			requiresBreakdown,
			suggestedApproach,
		};
	}

	/**
	 * Detect task type from prompt
	 */
	private detectType(prompt: string): TaskNode['type'] {
		// Bug patterns
		const bugKeywords = [
			'fix',
			'bug',
			'error',
			'crash',
			'broken',
			'issue',
			'problem',
			'not working',
			'fails',
			'failing',
			'incorrect',
		];
		if (bugKeywords.some((kw) => prompt.includes(kw))) {
			return 'bug';
		}

		// Test patterns
		const testKeywords = ['test', 'unit test', 'integration test', 'e2e', 'coverage', 'spec'];
		if (testKeywords.some((kw) => prompt.includes(kw))) {
			return 'test';
		}

		// Documentation patterns
		const docsKeywords = ['document', 'readme', 'docs', 'comment', 'jsdoc', 'guide', 'tutorial'];
		if (docsKeywords.some((kw) => prompt.includes(kw))) {
			return 'docs';
		}

		// Refactor patterns
		const refactorKeywords = [
			'refactor',
			'clean up',
			'reorganize',
			'restructure',
			'optimize',
			'improve',
			'simplify',
			'caching',
		];
		if (refactorKeywords.some((kw) => prompt.includes(kw))) {
			return 'refactor';
		}

		// Chore patterns - be specific to avoid false positives
		const choreKeywords = [
			'chore',
			'upgrade',
			'dependency',
			'dependencies',
			'config',
			'setup',
			'tooling',
			'ci/cd',
			'pipeline',
		];
		const chorePatterns = ['update dependencies', 'update config', 'update tooling'];
		if (
			choreKeywords.some((kw) => prompt.includes(kw)) ||
			chorePatterns.some((pattern) => prompt.includes(pattern))
		) {
			return 'chore';
		}

		// Default to feature
		return 'feature';
	}

	/**
	 * Detect priority from prompt and context
	 */
	private detectPriority(prompt: string, context: TaskContext): TaskNode['priority'] {
		// Critical patterns
		const criticalKeywords = [
			'critical',
			'urgent',
			'emergency',
			'production down',
			'security',
			'data loss',
		];
		if (criticalKeywords.some((kw) => prompt.includes(kw))) {
			return 'critical';
		}

		// High priority patterns
		const highKeywords = ['important', 'high priority', 'blocker', 'blocking', 'asap'];
		if (highKeywords.some((kw) => prompt.includes(kw))) {
			return 'high';
		}

		// Low priority patterns
		const lowKeywords = ['nice to have', 'low priority', 'when possible', 'future', 'someday'];
		if (lowKeywords.some((kw) => prompt.includes(kw))) {
			return 'low';
		}

		// Check issue labels if available
		if (context.issueLabels) {
			if (context.issueLabels.some((l) => l.includes('critical'))) {
				return 'critical';
			}
			if (context.issueLabels.some((l) => l.includes('high'))) {
				return 'high';
			}
			if (context.issueLabels.some((l) => l.includes('low'))) {
				return 'low';
			}
		}

		// Default to medium
		return 'medium';
	}

	/**
	 * Estimate task complexity
	 */
	private estimateComplexity(
		prompt: string,
		context: TaskContext,
	): ClassificationResult['complexity'] {
		let score = 0;

		// Check if this is documentation/simple task first
		const simpleDocsKeywords = ['readme', 'typo', 'comment', 'log statement', 'button color'];
		const isSimpleDocs = simpleDocsKeywords.some((kw) => prompt.includes(kw));

		// Epic indicators (score 4+)
		const epicKeywords = [
			'rewrite',
			'redesign',
			'complete',
			'entire',
			'architecture',
			'migration',
			'platform',
			'from scratch',
		];
		if (epicKeywords.some((kw) => prompt.includes(kw))) {
			score += 4;
		}

		// Complex indicators (score 2-3)
		const complexKeywords = [
			'integrate',
			'implement',
			'authentication',
			'authorization',
			'payment',
			'multi-step',
			'caching layer',
			'add support for',
			'system',
			'gateway',
		];
		if (complexKeywords.some((kw) => prompt.includes(kw))) {
			score += 2;
		}

		// Multiple files indicator
		if (context.existingFiles && context.existingFiles.length > 5) {
			score += 1;
		}

		// Moderate indicators (score 1) - but not for simple docs
		const moderateKeywords = [
			'update',
			'enhance',
			'improve',
			'extend',
			'modify',
			'notification',
			'page',
			'functionality',
			'feature',
		];
		const moderatePatterns = ['for.*service', 'for.*module', 'for.*component', 'add.*for'];
		if (!isSimpleDocs && score === 0) {
			if (
				moderateKeywords.some((kw) => prompt.includes(kw)) ||
				moderatePatterns.some((pattern) => new RegExp(pattern).test(prompt))
			) {
				score += 1;
			}
		}

		// Map score to complexity
		if (score >= 4) return 'epic';
		if (score >= 2) return 'complex';
		if (score >= 1) return 'moderate';
		return 'simple';
	}

	/**
	 * Estimate duration based on complexity and type
	 */
	private estimateDuration(
		complexity: ClassificationResult['complexity'],
		type: TaskNode['type'],
	): number {
		// Base duration by complexity (in minutes)
		const complexityDuration = {
			simple: 15,
			moderate: 45,
			complex: 120,
			epic: 480,
		};

		// Type multipliers
		const typeMultiplier = {
			feature: 1.2,
			bug: 0.8,
			refactor: 1.5,
			test: 0.7,
			docs: 0.5,
			chore: 0.6,
		};

		return Math.round(complexityDuration[complexity] * typeMultiplier[type]);
	}

	/**
	 * Suggest implementation approach
	 */
	private suggestApproach(
		type: TaskNode['type'],
		complexity: ClassificationResult['complexity'],
	): string {
		if (complexity === 'epic') {
			return 'Break down into multiple phases with checkpoints';
		}

		if (complexity === 'complex') {
			return 'Use spec-first workflow with design doc';
		}

		switch (type) {
			case 'bug':
				return 'Reproduce → Root cause → Fix → Test';
			case 'test':
				return 'Identify coverage gaps → Write tests → Verify';
			case 'docs':
				return 'Outline → Write → Review → Publish';
			case 'refactor':
				return 'Extract → Simplify → Test → Verify no regression';
			case 'feature':
				return 'Design → Implement → Test → Document';
			default:
				return 'Implement → Test → Review';
		}
	}
}

/**
 * Create task classifier
 */
export function createTaskClassifier(): TaskClassifier {
	return new TaskClassifier();
}
