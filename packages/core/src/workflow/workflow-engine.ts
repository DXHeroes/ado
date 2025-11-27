/**
 * Workflow Engine - Orchestrates sequential, parallel, and conditional task execution.
 */

import { AdoError } from '@dxheroes/ado-shared';
import type { AgentTask } from '@dxheroes/ado-shared';

/**
 * Workflow step types
 */
export type WorkflowStepType = 'sequential' | 'parallel' | 'branch' | 'task';

/**
 * Base workflow step
 */
export interface WorkflowStepBase {
	id: string;
	type: WorkflowStepType;
	name?: string;
}

/**
 * Task step - executes a single task
 */
export interface TaskStep extends WorkflowStepBase {
	type: 'task';
	task: AgentTask;
}

/**
 * Sequential step - executes steps one after another
 */
export interface SequentialStep extends WorkflowStepBase {
	type: 'sequential';
	steps: WorkflowStep[];
}

/**
 * Parallel step - executes steps concurrently
 */
export interface ParallelStep extends WorkflowStepBase {
	type: 'parallel';
	steps: WorkflowStep[];
	maxConcurrency?: number;
}

/**
 * Branch step - conditional execution
 */
export interface BranchStep extends WorkflowStepBase {
	type: 'branch';
	condition: BranchCondition;
	thenStep: WorkflowStep;
	elseStep?: WorkflowStep;
}

/**
 * Branch condition evaluator
 */
export type BranchCondition = (context: WorkflowContext) => boolean | Promise<boolean>;

/**
 * Union of all step types
 */
export type WorkflowStep = TaskStep | SequentialStep | ParallelStep | BranchStep;

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
	id: string;
	name: string;
	description?: string;
	rootStep: WorkflowStep;
	timeout?: number; // milliseconds
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
	workflowId: string;
	variables: Map<string, unknown>;
	results: Map<string, WorkflowStepResult>;
}

/**
 * Workflow step result
 */
export interface WorkflowStepResult {
	stepId: string;
	status: 'success' | 'failed' | 'skipped';
	output?: unknown;
	error?: Error;
	startedAt: Date;
	completedAt: Date;
	duration: number;
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
	workflowId: string;
	status: 'completed' | 'failed' | 'timeout' | 'cancelled';
	steps: WorkflowStepResult[];
	startedAt: Date;
	completedAt: Date;
	duration: number;
	error?: Error;
}

/**
 * Task executor function
 */
export type TaskExecutor = (task: AgentTask) => Promise<unknown>;

/**
 * Workflow event types
 */
export type WorkflowEventType =
	| 'workflow_started'
	| 'step_started'
	| 'step_completed'
	| 'step_failed'
	| 'workflow_completed'
	| 'workflow_failed';

/**
 * Workflow event
 */
export interface WorkflowEvent {
	type: WorkflowEventType;
	workflowId: string;
	stepId?: string;
	timestamp: Date;
	data?: unknown;
}

/**
 * Workflow Engine
 */
export class WorkflowEngine {
	private taskExecutor?: TaskExecutor;
	private activeWorkflows: Map<string, AbortController> = new Map();
	private eventHandlers: ((event: WorkflowEvent) => void)[] = [];

	/**
	 * Set the task executor
	 */
	setTaskExecutor(executor: TaskExecutor): void {
		this.taskExecutor = executor;
	}

	/**
	 * Subscribe to workflow events
	 */
	on(handler: (event: WorkflowEvent) => void): void {
		this.eventHandlers.push(handler);
	}

	/**
	 * Execute a workflow
	 */
	async execute(workflow: WorkflowDefinition): Promise<WorkflowExecutionResult> {
		if (!this.taskExecutor) {
			throw new AdoError({
				code: 'TASK_EXECUTOR_NOT_SET',
				message: 'Task executor not set',
				recoverable: false,
				remediation: 'Call setTaskExecutor() before executing workflows',
				cause: undefined,
			});
		}

		const startedAt = new Date();
		const context: WorkflowContext = {
			workflowId: workflow.id,
			variables: new Map(),
			results: new Map(),
		};

		const abortController = new AbortController();
		this.activeWorkflows.set(workflow.id, abortController);

		this.emitEvent({
			type: 'workflow_started',
			workflowId: workflow.id,
			timestamp: new Date(),
		});

		try {
			// Execute with timeout if specified
			const executionPromise = this.executeStep(workflow.rootStep, context, abortController.signal);

			if (workflow.timeout) {
				const timeoutPromise = new Promise((_, reject) => {
					setTimeout(() => reject(new Error('Workflow timeout')), workflow.timeout);
				});
				await Promise.race([executionPromise, timeoutPromise]);
			} else {
				await executionPromise;
			}

			const completedAt = new Date();

			this.emitEvent({
				type: 'workflow_completed',
				workflowId: workflow.id,
				timestamp: completedAt,
			});

			return {
				workflowId: workflow.id,
				status: 'completed',
				steps: Array.from(context.results.values()),
				startedAt,
				completedAt,
				duration: completedAt.getTime() - startedAt.getTime(),
			};
		} catch (error) {
			const completedAt = new Date();
			const err = error instanceof Error ? error : new Error(String(error));

			this.emitEvent({
				type: 'workflow_failed',
				workflowId: workflow.id,
				timestamp: completedAt,
				data: { error: err.message },
			});

			return {
				workflowId: workflow.id,
				status: err.message === 'Workflow timeout' ? 'timeout' : 'failed',
				steps: Array.from(context.results.values()),
				startedAt,
				completedAt,
				duration: completedAt.getTime() - startedAt.getTime(),
				error: err,
			};
		} finally {
			this.activeWorkflows.delete(workflow.id);
		}
	}

	/**
	 * Cancel a running workflow
	 */
	async cancel(workflowId: string): Promise<boolean> {
		const controller = this.activeWorkflows.get(workflowId);
		if (!controller) {
			return false;
		}

		controller.abort();
		this.activeWorkflows.delete(workflowId);
		return true;
	}

	/**
	 * Execute a single workflow step
	 */
	private async executeStep(
		step: WorkflowStep,
		context: WorkflowContext,
		signal: AbortSignal,
	): Promise<unknown> {
		if (signal.aborted) {
			throw new Error('Workflow cancelled');
		}

		const startedAt = new Date();

		this.emitEvent({
			type: 'step_started',
			workflowId: context.workflowId,
			stepId: step.id,
			timestamp: startedAt,
		});

		try {
			let result: unknown;

			switch (step.type) {
				case 'task':
					result = await this.executeTaskStep(step, signal);
					break;

				case 'sequential':
					result = await this.executeSequentialStep(step, context, signal);
					break;

				case 'parallel':
					result = await this.executeParallelStep(step, context, signal);
					break;

				case 'branch':
					result = await this.executeBranchStep(step, context, signal);
					break;

				default:
					throw new Error(`Unknown step type: ${(step as WorkflowStep).type}`);
			}

			const completedAt = new Date();
			const stepResult: WorkflowStepResult = {
				stepId: step.id,
				status: 'success',
				output: result,
				startedAt,
				completedAt,
				duration: completedAt.getTime() - startedAt.getTime(),
			};

			context.results.set(step.id, stepResult);

			this.emitEvent({
				type: 'step_completed',
				workflowId: context.workflowId,
				stepId: step.id,
				timestamp: completedAt,
			});

			return result;
		} catch (error) {
			const completedAt = new Date();
			const err = error instanceof Error ? error : new Error(String(error));

			const stepResult: WorkflowStepResult = {
				stepId: step.id,
				status: 'failed',
				error: err,
				startedAt,
				completedAt,
				duration: completedAt.getTime() - startedAt.getTime(),
			};

			context.results.set(step.id, stepResult);

			this.emitEvent({
				type: 'step_failed',
				workflowId: context.workflowId,
				stepId: step.id,
				timestamp: completedAt,
				data: { error: err.message },
			});

			throw error;
		}
	}

	/**
	 * Execute a task step
	 */
	private async executeTaskStep(step: TaskStep, signal: AbortSignal): Promise<unknown> {
		if (!this.taskExecutor) {
			throw new Error('Task executor not set');
		}

		if (signal.aborted) {
			throw new Error('Task cancelled');
		}

		return await this.taskExecutor(step.task);
	}

	/**
	 * Execute sequential steps
	 */
	private async executeSequentialStep(
		step: SequentialStep,
		context: WorkflowContext,
		signal: AbortSignal,
	): Promise<unknown[]> {
		const results: unknown[] = [];

		for (const childStep of step.steps) {
			const result = await this.executeStep(childStep, context, signal);
			results.push(result);
		}

		return results;
	}

	/**
	 * Execute parallel steps
	 */
	private async executeParallelStep(
		step: ParallelStep,
		context: WorkflowContext,
		signal: AbortSignal,
	): Promise<unknown[]> {
		// Execute all steps in parallel
		const promises = step.steps.map((childStep) => this.executeStep(childStep, context, signal));

		return await Promise.all(promises);
	}

	/**
	 * Execute branch step
	 */
	private async executeBranchStep(
		step: BranchStep,
		context: WorkflowContext,
		signal: AbortSignal,
	): Promise<unknown> {
		const condition = await step.condition(context);

		if (condition) {
			return await this.executeStep(step.thenStep, context, signal);
		}
		if (step.elseStep) {
			return await this.executeStep(step.elseStep, context, signal);
		}

		return null;
	}

	/**
	 * Emit a workflow event
	 */
	private emitEvent(event: WorkflowEvent): void {
		for (const handler of this.eventHandlers) {
			try {
				handler(event);
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: Error logging
				console.error('Error in event handler:', error);
			}
		}
	}
}

/**
 * Create a new workflow engine
 */
export function createWorkflowEngine(): WorkflowEngine {
	return new WorkflowEngine();
}
