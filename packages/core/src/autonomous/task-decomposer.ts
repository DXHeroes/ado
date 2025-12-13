/**
 * Task Decomposer
 *
 * Decomposes complex tasks into smaller subtasks with dependencies.
 */

import { DependencyGraph, type ExecutionPlan, type TaskNode } from './dependency-graph.js';
import { type ClassificationResult, TaskClassifier, type TaskContext } from './task-classifier.js';

export interface DecompositionResult {
	originalTask: string;
	classification: ClassificationResult;
	subtasks: TaskNode[];
	executionPlan: ExecutionPlan;
	requiresHumanReview: boolean;
	checkpoints: CheckpointDefinition[];
}

export interface CheckpointDefinition {
	id: string;
	stage: number;
	name: string;
	description: string;
	reviewCriteria: string[];
	blockingIssues?: string[];
}

/**
 * Task decomposer engine
 */
export class TaskDecomposer {
	private classifier: TaskClassifier;

	constructor() {
		this.classifier = new TaskClassifier();
	}

	/**
	 * Decompose task into subtasks
	 */
	async decompose(context: TaskContext): Promise<DecompositionResult> {
		// Classify the task
		const classification = this.classifier.classify(context);

		// Generate subtasks based on classification
		const subtasks = this.generateSubtasks(context, classification);

		// Build dependency graph
		const graph = new DependencyGraph();
		for (const task of subtasks) {
			graph.addTask(task);
		}

		// Generate execution plan
		const executionPlan = graph.generateExecutionPlan();

		// Determine if human review needed
		const requiresHumanReview =
			classification.complexity === 'epic' ||
			classification.complexity === 'complex' ||
			classification.priority === 'critical';

		// Generate checkpoints
		const checkpoints = this.generateCheckpoints(executionPlan, classification);

		return {
			originalTask: context.prompt,
			classification,
			subtasks,
			executionPlan,
			requiresHumanReview,
			checkpoints,
		};
	}

	/**
	 * Generate subtasks based on task type and complexity
	 */
	private generateSubtasks(context: TaskContext, classification: ClassificationResult): TaskNode[] {
		const { type, complexity } = classification;

		// Simple tasks don't need decomposition (except bugs, tests, docs which have structured workflows)
		if (complexity === 'simple' && type !== 'bug' && type !== 'test' && type !== 'docs') {
			return [
				{
					id: 'task-1',
					type,
					description: context.prompt,
					estimatedDuration: classification.estimatedDuration,
					priority: classification.priority,
					dependencies: [],
					parallel: false,
					metadata: {
						testRequired: type === 'feature',
						reviewRequired: classification.priority === 'critical',
					},
				},
			];
		}

		// Generate subtasks based on type
		switch (type) {
			case 'feature':
				return this.decomposeFeature(context, classification);
			case 'bug':
				return this.decomposeBug(context, classification);
			case 'refactor':
				return this.decomposeRefactor(context, classification);
			case 'test':
				return this.decomposeTest(context, classification);
			case 'docs':
				return this.decomposeDocs(context, classification);
			default:
				return this.decomposeGeneric(context, classification);
		}
	}

	/**
	 * Decompose feature task
	 */
	private decomposeFeature(context: TaskContext, classification: ClassificationResult): TaskNode[] {
		const tasks: TaskNode[] = [];
		const baseTime = classification.estimatedDuration / 6; // 6 phases

		// Phase 1: Design & Planning
		tasks.push({
			id: 'design',
			type: 'docs',
			description: `Design specification for: ${context.prompt}`,
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: [],
			parallel: false,
			metadata: {
				reviewRequired: true,
			},
		});

		// Phase 2: Core Implementation
		tasks.push({
			id: 'core-impl',
			type: 'feature',
			description: 'Implement core functionality',
			estimatedDuration: baseTime * 2,
			priority: classification.priority,
			dependencies: ['design'],
			parallel: false,
			metadata: {
				testRequired: true,
			},
		});

		// Phase 3: Edge Cases & Validation
		tasks.push({
			id: 'validation',
			type: 'feature',
			description: 'Handle edge cases and validation',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: ['core-impl'],
			parallel: false,
			metadata: {
				testRequired: true,
			},
		});

		// Phase 4: Tests
		tasks.push({
			id: 'tests',
			type: 'test',
			description: 'Write unit and integration tests',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: ['validation'],
			parallel: false,
			metadata: {
				testRequired: false,
			},
		});

		// Phase 5: Documentation
		tasks.push({
			id: 'docs',
			type: 'docs',
			description: 'Update documentation and examples',
			estimatedDuration: baseTime * 0.5,
			priority: 'low',
			dependencies: ['tests'],
			parallel: true, // Can run in parallel with quality checks
			metadata: {},
		});

		// Phase 6: Quality Checks
		tasks.push({
			id: 'quality',
			type: 'chore',
			description: 'Run linting, type checking, and build',
			estimatedDuration: baseTime * 0.5,
			priority: classification.priority,
			dependencies: ['tests'],
			parallel: true, // Can run in parallel with docs
			metadata: {},
		});

		return tasks;
	}

	/**
	 * Decompose bug fix task
	 */
	private decomposeBug(context: TaskContext, classification: ClassificationResult): TaskNode[] {
		// For truly simple bugs (typos, cosmetic fixes), don't decompose
		const trivialBugKeywords = ['typo', 'spelling', 'cosmetic', 'whitespace', 'formatting'];
		const isTrivial = trivialBugKeywords.some((kw) => context.prompt.toLowerCase().includes(kw));

		if (classification.complexity === 'simple' && isTrivial) {
			return [
				{
					id: 'task-1',
					type: 'bug',
					description: context.prompt,
					estimatedDuration: classification.estimatedDuration,
					priority: classification.priority,
					dependencies: [],
					parallel: false,
					metadata: {
						testRequired: false,
						reviewRequired: classification.priority === 'critical',
					},
				},
			];
		}

		const tasks: TaskNode[] = [];
		const baseTime = classification.estimatedDuration / 4; // 4 phases

		tasks.push({
			id: 'reproduce',
			type: 'bug',
			description: 'Reproduce the bug and identify root cause',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: [],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'fix',
			type: 'bug',
			description: 'Implement fix',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: ['reproduce'],
			parallel: false,
			metadata: {
				testRequired: true,
			},
		});

		tasks.push({
			id: 'regression-test',
			type: 'test',
			description: 'Add regression test to prevent recurrence',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: ['fix'],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'verify',
			type: 'bug',
			description: 'Verify fix and check for side effects',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: ['regression-test'],
			parallel: false,
			metadata: {
				reviewRequired: classification.priority === 'critical',
			},
		});

		return tasks;
	}

	/**
	 * Decompose refactor task
	 */
	private decomposeRefactor(
		_context: TaskContext,
		classification: ClassificationResult,
	): TaskNode[] {
		const tasks: TaskNode[] = [];
		const baseTime = classification.estimatedDuration / 5; // 5 phases

		tasks.push({
			id: 'baseline-tests',
			type: 'test',
			description: 'Ensure comprehensive test coverage before refactoring',
			estimatedDuration: baseTime,
			priority: 'high',
			dependencies: [],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'extract',
			type: 'refactor',
			description: 'Extract and isolate components',
			estimatedDuration: baseTime * 1.5,
			priority: classification.priority,
			dependencies: ['baseline-tests'],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'simplify',
			type: 'refactor',
			description: 'Simplify and optimize code',
			estimatedDuration: baseTime * 1.5,
			priority: classification.priority,
			dependencies: ['extract'],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'verify-tests',
			type: 'test',
			description: 'Verify all tests still pass',
			estimatedDuration: baseTime * 0.5,
			priority: 'high',
			dependencies: ['simplify'],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'cleanup',
			type: 'chore',
			description: 'Remove dead code and update references',
			estimatedDuration: baseTime * 0.5,
			priority: 'medium',
			dependencies: ['verify-tests'],
			parallel: false,
			metadata: {},
		});

		return tasks;
	}

	/**
	 * Decompose test task
	 */
	private decomposeTest(context: TaskContext, classification: ClassificationResult): TaskNode[] {
		// For simple test tasks, don't decompose
		if (classification.complexity === 'simple') {
			return [
				{
					id: 'task-1',
					type: 'test',
					description: context.prompt,
					estimatedDuration: classification.estimatedDuration,
					priority: classification.priority,
					dependencies: [],
					parallel: false,
					metadata: {},
				},
			];
		}

		const tasks: TaskNode[] = [];
		const baseTime = classification.estimatedDuration / 3;

		tasks.push({
			id: 'test-plan',
			type: 'docs',
			description: 'Identify test cases and coverage gaps',
			estimatedDuration: baseTime * 0.5,
			priority: classification.priority,
			dependencies: [],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'unit-tests',
			type: 'test',
			description: 'Write unit tests',
			estimatedDuration: baseTime,
			priority: classification.priority,
			dependencies: ['test-plan'],
			parallel: true,
			metadata: {},
		});

		tasks.push({
			id: 'integration-tests',
			type: 'test',
			description: 'Write integration tests',
			estimatedDuration: baseTime * 1.5,
			priority: classification.priority,
			dependencies: ['test-plan'],
			parallel: true,
			metadata: {},
		});

		return tasks;
	}

	/**
	 * Decompose documentation task
	 */
	private decomposeDocs(context: TaskContext, classification: ClassificationResult): TaskNode[] {
		// For simple docs (typos, small updates), don't decompose
		const simpleDocsKeywords = ['typo', 'readme', 'comment', 'jsdoc'];
		const isSimple = simpleDocsKeywords.some((kw) => context.prompt.toLowerCase().includes(kw));

		if (classification.complexity === 'simple' && isSimple) {
			return [
				{
					id: 'task-1',
					type: 'docs',
					description: context.prompt,
					estimatedDuration: classification.estimatedDuration,
					priority: classification.priority,
					dependencies: [],
					parallel: false,
					metadata: {},
				},
			];
		}

		const tasks: TaskNode[] = [];
		const baseTime = classification.estimatedDuration / 3;

		tasks.push({
			id: 'outline',
			type: 'docs',
			description: 'Create documentation outline',
			estimatedDuration: baseTime * 0.5,
			priority: classification.priority,
			dependencies: [],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'write',
			type: 'docs',
			description: 'Write documentation content',
			estimatedDuration: baseTime * 2,
			priority: classification.priority,
			dependencies: ['outline'],
			parallel: false,
			metadata: {},
		});

		tasks.push({
			id: 'examples',
			type: 'docs',
			description: 'Add code examples and demos',
			estimatedDuration: baseTime * 0.5,
			priority: classification.priority,
			dependencies: ['write'],
			parallel: false,
			metadata: {},
		});

		return tasks;
	}

	/**
	 * Decompose generic task
	 */
	private decomposeGeneric(context: TaskContext, classification: ClassificationResult): TaskNode[] {
		return [
			{
				id: 'task-1',
				type: classification.type,
				description: context.prompt,
				estimatedDuration: classification.estimatedDuration,
				priority: classification.priority,
				dependencies: [],
				parallel: false,
				metadata: {
					testRequired: true,
					reviewRequired: classification.complexity === 'complex',
				},
			},
		];
	}

	/**
	 * Generate checkpoints for human review
	 */
	private generateCheckpoints(
		plan: ExecutionPlan,
		classification: ClassificationResult,
	): CheckpointDefinition[] {
		const checkpoints: CheckpointDefinition[] = [];

		// Add checkpoint after design phase
		const designStage = plan.stages.find((s) =>
			s.tasks.some((t) => t === 'design' || t.includes('design')),
		);
		if (designStage) {
			checkpoints.push({
				id: 'checkpoint-design',
				stage: designStage.stage,
				name: 'Design Review',
				description: 'Review design specification before implementation',
				reviewCriteria: [
					'Design is clear and complete',
					'Edge cases are identified',
					'Breaking changes are documented',
					'Performance implications are considered',
				],
			});
		}

		// Add checkpoint before final stage for complex tasks
		if (classification.complexity === 'complex' || classification.complexity === 'epic') {
			const finalStage = plan.stages[plan.stages.length - 1];
			if (finalStage) {
				checkpoints.push({
					id: 'checkpoint-pre-final',
					stage: Math.max(0, finalStage.stage - 1),
					name: 'Pre-Completion Review',
					description: 'Review implementation before final quality checks',
					reviewCriteria: [
						'All core functionality is implemented',
						'Tests are passing',
						'No known blockers',
						'Ready for final validation',
					],
				});
			}
		}

		// Add final checkpoint for critical priority
		if (classification.priority === 'critical') {
			const lastStage = plan.stages[plan.stages.length - 1];
			if (lastStage) {
				checkpoints.push({
					id: 'checkpoint-final',
					stage: lastStage.stage,
					name: 'Critical Task Approval',
					description: 'Final approval required for critical task',
					reviewCriteria: [
						'All tests passing',
						'Security review completed',
						'Breaking changes documented',
						'Rollback plan prepared',
					],
					blockingIssues: ['Cannot proceed without explicit approval'],
				});
			}
		}

		return checkpoints;
	}
}

/**
 * Create task decomposer
 */
export function createTaskDecomposer(): TaskDecomposer {
	return new TaskDecomposer();
}
