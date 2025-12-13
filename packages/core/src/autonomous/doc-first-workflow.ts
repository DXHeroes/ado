/**
 * Documentation-First Workflow Engine
 *
 * Orchestrates the complete autonomous workflow:
 * /specify → /plan → /tasks → /implement
 *
 * Integrates task decomposition, spec generation, HITL checkpoints,
 * quality validation, auto-fix, and escalation.
 */

import type { AutoFixEngine } from './auto-fix-engine.js';
import type { DecompositionResult, TaskDecomposer } from './task-decomposer.js';
import type { EscalationEngine } from './escalation-engine.js';
import type {
	HITLCheckpointCoordinator,
	HITLCheckpointEvent,
} from './hitl-checkpoint-coordinator.js';
import type {
	QualityValidationCoordinator,
	ValidationReport,
} from './quality-validation-coordinator.js';
import type { SpecGenerator, SpecGenerationResult } from './spec-generator.js';
import type { StuckDetector } from './stuck-detector.js';
import type { TaskNode } from './dependency-graph.js';

export type WorkflowPhase = 'specify' | 'plan' | 'tasks' | 'implement' | 'validate' | 'complete';

export interface DocFirstWorkflowContext {
	taskId: string;
	prompt: string;
	workingDirectory: string;
	requireHumanApproval?: boolean;
}

export interface WorkflowState {
	phase: WorkflowPhase;
	specification?: SpecGenerationResult;
	decomposition?: DecompositionResult;
	currentTaskIndex: number;
	completedTasks: string[];
	failedTasks: string[];
	validationReports: ValidationReport[];
	checkpointEvents: HITLCheckpointEvent[];
}

export interface WorkflowResult {
	success: boolean;
	state: WorkflowState;
	duration: number;
	summary: {
		tasksCompleted: number;
		tasksFailed: number;
		checkpointsReached: number;
		escalationsTriggered: number;
		fixesApplied: number;
	};
	output?: string;
	error?: string;
}

/**
 * Doc-First Workflow Engine
 */
export class DocFirstWorkflow {
	private specGenerator: SpecGenerator;
	private taskDecomposer: TaskDecomposer;
	private qualityValidator: QualityValidationCoordinator;
	private autoFixEngine: AutoFixEngine;
	private hitlCoordinator: HITLCheckpointCoordinator;

	constructor(
		specGenerator: SpecGenerator,
		taskDecomposer: TaskDecomposer,
		qualityValidator: QualityValidationCoordinator,
		autoFixEngine: AutoFixEngine,
		hitlCoordinator: HITLCheckpointCoordinator,
		_stuckDetector: StuckDetector,
		_escalationEngine: EscalationEngine,
	) {
		this.specGenerator = specGenerator;
		this.taskDecomposer = taskDecomposer;
		this.qualityValidator = qualityValidator;
		this.autoFixEngine = autoFixEngine;
		this.hitlCoordinator = hitlCoordinator;
	}

	/**
	 * Execute full workflow
	 */
	async execute(context: DocFirstWorkflowContext): Promise<WorkflowResult> {
		const startTime = Date.now();
		const state: WorkflowState = {
			phase: 'specify',
			currentTaskIndex: 0,
			completedTasks: [],
			failedTasks: [],
			validationReports: [],
			checkpointEvents: [],
		};

		try {
			// Phase 1: Specify
			state.specification = await this.specify(context);
			state.phase = 'plan';

			// Phase 2: Plan & Decompose Tasks
			state.decomposition = await this.planAndDecompose(context, state.specification);
			state.phase = 'tasks';

			// Phase 3: Implement Tasks
			await this.implementTasks(context, state);
			state.phase = 'validate';

			// Phase 4: Final Validation
			const finalValidation = await this.finalValidation(context);
			state.validationReports.push(finalValidation);

			if (!finalValidation.qualityGate.passed) {
				return {
					success: false,
					state,
					duration: Date.now() - startTime,
					summary: this.createSummary(state),
					error: `Quality gates failed: ${finalValidation.qualityGate.blockers.join(', ')}`,
				};
			}

			state.phase = 'complete';

			return {
				success: true,
				state,
				duration: Date.now() - startTime,
				summary: this.createSummary(state),
			};
		} catch (error) {
			return {
				success: false,
				state,
				duration: Date.now() - startTime,
				summary: this.createSummary(state),
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Phase 1: Generate specification
	 */
	private async specify(context: DocFirstWorkflowContext): Promise<SpecGenerationResult> {
		// Classify task to determine spec type
		const classification = await this.taskDecomposer['classifier'].classify({
			prompt: context.prompt,
			repositoryPath: context.workingDirectory,
		});

		// Generate specification
		return await this.specGenerator.generate({
			brief: context.prompt,
			taskType: classification.type,
			classification,
		});
	}

	/**
	 * Phase 2: Create plan and decompose into tasks
	 */
	private async planAndDecompose(
		context: DocFirstWorkflowContext,
		_specification: SpecGenerationResult,
	): Promise<DecompositionResult> {
		return await this.taskDecomposer.decompose({
			prompt: context.prompt,
			repositoryPath: context.workingDirectory,
		});
	}

	/**
	 * Phase 3: Implement tasks with checkpoints
	 */
	private async implementTasks(
		context: DocFirstWorkflowContext,
		state: WorkflowState,
	): Promise<void> {
		if (!state.decomposition) {
			throw new Error('No task decomposition available');
		}

		const { executionPlan, checkpoints } = state.decomposition;

		this.hitlCoordinator.startTask(context.taskId);

		// Execute by stages (enables parallelization in future)
		for (const stage of executionPlan.stages) {
			// Check checkpoint if exists for this stage
			const checkpoint = checkpoints.find((c) => c.stage === stage.stage);
			if (checkpoint) {
				const checkpointResult = await this.hitlCoordinator.evaluateCheckpoint(
					context.taskId,
					checkpoint,
					{
						task: {
							taskId: context.taskId,
							prompt: context.prompt,
						},
						status: 'running',
						progress: (state.completedTasks.length / executionPlan.tasks.length) * 100,
					} as any,
				);

				if (!checkpointResult.shouldProceed) {
					throw new Error(`Checkpoint blocked: ${checkpointResult.reason}`);
				}
			}

			// Execute tasks in stage (sequentially for now, parallel in future)
			for (const taskId of stage.tasks) {
				const task = executionPlan.tasks.find((t) => t.id === taskId);
				if (!task) continue;

				try {
					await this.executeTask(context, task, state);
					state.completedTasks.push(taskId);
				} catch (error) {
					state.failedTasks.push(taskId);
					throw error;
				}
			}
		}
	}

	/**
	 * Execute single task
	 */
	private async executeTask(
		context: DocFirstWorkflowContext,
		task: TaskNode,
		state: WorkflowState,
	): Promise<void> {
		// In real implementation, this would call AI to implement the task
		// For now, we just simulate validation

		// Validate after implementation
		const validation = await this.qualityValidator.validate({
			workingDirectory: context.workingDirectory,
			parallel: true,
		});

		state.validationReports.push(validation);

		// If validation fails, try auto-fix
		if (!validation.qualityGate.passed) {
			const fixResult = await this.autoFixEngine.autoFix(
				context.taskId,
				validation.results,
				{ workingDirectory: context.workingDirectory },
				this.qualityValidator.getQualityGates(),
			);

			if (fixResult.stuck) {
				throw new Error(`Auto-fix stuck on task: ${task.description}`);
			}

			if (!fixResult.success && fixResult.fixesApplied === 0) {
				throw new Error(`Quality gates failed and no auto-fixes available`);
			}
		}
	}

	/**
	 * Phase 4: Final validation
	 */
	private async finalValidation(context: DocFirstWorkflowContext): Promise<ValidationReport> {
		return await this.qualityValidator.validate({
			workingDirectory: context.workingDirectory,
			parallel: true,
		});
	}

	/**
	 * Create summary
	 */
	private createSummary(state: WorkflowState): WorkflowResult['summary'] {
		const fixesApplied = state.validationReports.reduce((sum, _report) => {
			// In real implementation, track fixes from auto-fix engine
			return sum;
		}, 0);

		return {
			tasksCompleted: state.completedTasks.length,
			tasksFailed: state.failedTasks.length,
			checkpointsReached: state.checkpointEvents.filter(
				(e) => e.type === 'checkpoint_reached',
			).length,
			escalationsTriggered: state.checkpointEvents.filter(
				(e) => e.type === 'escalation_triggered',
			).length,
			fixesApplied,
		};
	}

	/**
	 * Subscribe to workflow events
	 */
	onEvent(handler: (event: HITLCheckpointEvent) => void): () => void {
		return this.hitlCoordinator.on(handler);
	}
}

/**
 * Create doc-first workflow
 */
export function createDocFirstWorkflow(
	specGenerator: SpecGenerator,
	taskDecomposer: TaskDecomposer,
	qualityValidator: QualityValidationCoordinator,
	autoFixEngine: AutoFixEngine,
	hitlCoordinator: HITLCheckpointCoordinator,
	stuckDetector: StuckDetector,
	escalationEngine: EscalationEngine,
): DocFirstWorkflow {
	return new DocFirstWorkflow(
		specGenerator,
		taskDecomposer,
		qualityValidator,
		autoFixEngine,
		hitlCoordinator,
		stuckDetector,
		escalationEngine,
	);
}
