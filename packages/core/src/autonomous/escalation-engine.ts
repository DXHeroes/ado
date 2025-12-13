/**
 * Escalation Engine
 *
 * Manages escalation hierarchy for stuck or failing tasks.
 * Hierarchy: retry → different approach → partial completion → human
 */

import type { StuckDetectionResult, StuckReason } from './stuck-detector.js';

export type EscalationLevel =
	| 'retry'
	| 'different_approach'
	| 'partial_completion'
	| 'human_intervention';

export interface EscalationDecision {
	level: EscalationLevel;
	reason: string;
	actions: string[];
	requiresHuman: boolean;
	canAutoResolve: boolean;
	suggestedNextSteps: string[];
}

export interface EscalationContext {
	taskId: string;
	attemptCount: number;
	previousEscalations: EscalationLevel[];
	stuckDetection: StuckDetectionResult;
	taskPriority: 'critical' | 'high' | 'medium' | 'low';
	taskComplexity: 'simple' | 'moderate' | 'complex' | 'epic';
	elapsedMinutes: number;
}

/**
 * Escalation engine configuration
 */
export interface EscalationConfig {
	/**
	 * Maximum retries before escalating to different approach
	 */
	maxRetries: number;

	/**
	 * Maximum different approaches before partial completion
	 */
	maxApproaches: number;

	/**
	 * Auto-escalate critical tasks to human faster
	 */
	criticalTaskFastEscalation: boolean;

	/**
	 * Allow partial completion
	 */
	allowPartialCompletion: boolean;
}

/**
 * Escalation engine
 */
export class EscalationEngine {
	private config: EscalationConfig;
	private escalationHistory: Map<string, EscalationLevel[]> = new Map();

	constructor(config?: Partial<EscalationConfig>) {
		this.config = {
			maxRetries: 2,
			maxApproaches: 3,
			criticalTaskFastEscalation: true,
			allowPartialCompletion: true,
			...config,
		};
	}

	/**
	 * Decide escalation level
	 */
	decide(context: EscalationContext): EscalationDecision {
		// Critical tasks with stuck detection go straight to human
		if (
			this.config.criticalTaskFastEscalation &&
			context.taskPriority === 'critical' &&
			context.stuckDetection.isStuck &&
			context.stuckDetection.confidence > 0.8
		) {
			return this.createHumanInterventionDecision(
				context,
				'Critical task stuck with high confidence',
			);
		}

		// Count previous escalations from context
		const previousEscalations = context.previousEscalations;
		const retryCount = previousEscalations.filter((e) => e === 'retry').length;
		const approachCount = previousEscalations.filter(
			(e) => e === 'different_approach',
		).length;

		// Determine escalation level based on history and stuck detection
		if (!context.stuckDetection.isStuck) {
			// Not stuck, but may be approaching limits
			if (context.attemptCount >= 3 && retryCount >= this.config.maxRetries) {
				return this.createDifferentApproachDecision(context);
			}
			return this.createRetryDecision(context);
		}

		// Stuck - escalate based on reason and history
		const stuckReason = context.stuckDetection.reason;

		switch (stuckReason) {
			case 'identical_errors':
				// Identical errors mean retry won't help
				if (approachCount >= this.config.maxApproaches) {
					return this.createPartialCompletionDecision(context);
				}
				return this.createDifferentApproachDecision(context);

			case 'no_progress':
				// No progress - try different approach
				if (approachCount >= this.config.maxApproaches) {
					if (this.config.allowPartialCompletion) {
						return this.createPartialCompletionDecision(context);
					}
					return this.createHumanInterventionDecision(
						context,
						'No progress after multiple approaches',
					);
				}
				return this.createDifferentApproachDecision(context);

			case 'timeout':
				// Timeout - depends on task complexity
				if (context.taskComplexity === 'epic') {
					return this.createPartialCompletionDecision(context);
				}
				return this.createHumanInterventionDecision(
					context,
					'Task timeout exceeded',
				);

			case 'oscillating':
				// Oscillating - needs fundamentally different approach or human
				if (approachCount === 0) {
					return this.createDifferentApproachDecision(context);
				}
				return this.createHumanInterventionDecision(
					context,
					'Agent oscillating between states',
				);

			case 'test_failure_loop':
				// Test failures - may need requirement clarification
				if (retryCount < 1) {
					return this.createRetryDecision(context);
				}
				return this.createHumanInterventionDecision(
					context,
					'Persistent test failures may indicate unclear requirements',
				);

			default:
				return this.createRetryDecision(context);
		}
	}

	/**
	 * Record escalation decision
	 */
	recordEscalation(taskId: string, level: EscalationLevel): void {
		if (!this.escalationHistory.has(taskId)) {
			this.escalationHistory.set(taskId, []);
		}
		this.escalationHistory.get(taskId)?.push(level);
	}

	/**
	 * Create retry decision
	 */
	private createRetryDecision(_context: EscalationContext): EscalationDecision {
		return {
			level: 'retry',
			reason: 'Retry with same approach',
			actions: [
				'Review error messages carefully',
				'Check recent changes',
				'Verify test expectations',
			],
			requiresHuman: false,
			canAutoResolve: true,
			suggestedNextSteps: [
				'Re-read error output',
				'Apply targeted fix',
				'Run tests',
			],
		};
	}

	/**
	 * Create different approach decision
	 */
	private createDifferentApproachDecision(
		context: EscalationContext,
	): EscalationDecision {
		const strategies = this.suggestAlternativeStrategies(context);

		return {
			level: 'different_approach',
			reason: context.stuckDetection.isStuck
				? `Stuck: ${context.stuckDetection.reason} - trying different approach`
				: 'Multiple retries failed - trying different approach',
			actions: [
				'Analyze root cause from different perspective',
				'Consider alternative implementation strategy',
				'Review similar successful implementations',
			],
			requiresHuman: false,
			canAutoResolve: true,
			suggestedNextSteps: strategies,
		};
	}

	/**
	 * Create partial completion decision
	 */
	private createPartialCompletionDecision(
		_context: EscalationContext,
	): EscalationDecision {
		return {
			level: 'partial_completion',
			reason: 'Multiple approaches failed - attempting partial completion',
			actions: [
				'Identify completed sub-tasks',
				'Document blocking issues',
				'Prepare handoff to human',
			],
			requiresHuman: true,
			canAutoResolve: false,
			suggestedNextSteps: [
				'Complete what is achievable',
				'Document stuck points',
				'Create detailed handoff document',
				'Escalate to human for completion',
			],
		};
	}

	/**
	 * Create human intervention decision
	 */
	private createHumanInterventionDecision(
		_context: EscalationContext,
		reason: string,
	): EscalationDecision {
		return {
			level: 'human_intervention',
			reason,
			actions: [
				'Pause autonomous execution',
				'Prepare comprehensive status report',
				'Document all attempts and failures',
			],
			requiresHuman: true,
			canAutoResolve: false,
			suggestedNextSteps: [
				'Review task requirements',
				'Clarify ambiguous specifications',
				'Provide guidance on approach',
				'Consider breaking task into smaller pieces',
			],
		};
	}

	/**
	 * Suggest alternative strategies based on stuck reason
	 */
	private suggestAlternativeStrategies(
		context: EscalationContext,
	): string[] {
		const { stuckDetection } = context;

		if (!stuckDetection.reason) {
			return [
				'Try incremental approach (smaller changes)',
				'Review similar code patterns in codebase',
				'Consult documentation for the module',
			];
		}

		const strategies: Record<StuckReason, string[]> = {
			identical_errors: [
				'Identify root cause instead of symptom',
				'Check for configuration or environment issues',
				'Review dependencies and imports',
				'Try fundamentally different implementation approach',
			],
			no_progress: [
				'Break task into smaller sub-tasks',
				'Focus on one file at a time',
				'Start with simplest possible implementation',
				'Review task requirements for clarity',
			],
			timeout: [
				'Simplify solution to meet time constraints',
				'Focus on core functionality first',
				'Defer optimizations and edge cases',
			],
			oscillating: [
				'Commit to one approach and iterate',
				'Review conflicting requirements',
				'Seek clarification on priorities',
			],
			test_failure_loop: [
				'Review test expectations vs implementation',
				'Check for misunderstood requirements',
				'Verify test setup and fixtures',
				'Consider test may need updating',
			],
		};

		return strategies[stuckDetection.reason] ?? [];
	}

	/**
	 * Clear escalation history for task
	 */
	clearHistory(taskId: string): void {
		this.escalationHistory.delete(taskId);
	}

	/**
	 * Get escalation history for task
	 */
	getHistory(taskId: string): EscalationLevel[] {
		return this.escalationHistory.get(taskId) ?? [];
	}
}

/**
 * Create escalation engine
 */
export function createEscalationEngine(
	config?: Partial<EscalationConfig>,
): EscalationEngine {
	return new EscalationEngine(config);
}
