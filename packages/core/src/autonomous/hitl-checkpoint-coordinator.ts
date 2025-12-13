/**
 * HITL Checkpoint Coordinator
 *
 * Coordinates Human-In-The-Loop (HITL) checkpoints with stuck detection
 * and escalation management.
 */

import type { CheckpointManager, TaskState } from '../checkpoint/index.js';
import type { CheckpointDefinition } from './task-decomposer.js';
import {
	EscalationEngine,
	type EscalationContext,
	type EscalationDecision,
} from './escalation-engine.js';
import {
	StuckDetector,
	type AttemptRecord,
	type StuckDetectionResult,
} from './stuck-detector.js';

export interface HITLCheckpointConfig {
	/**
	 * Enable automatic stuck detection
	 */
	enableStuckDetection: boolean;

	/**
	 * Enable automatic escalation
	 */
	enableAutoEscalation: boolean;

	/**
	 * Require human approval for critical checkpoints
	 */
	requireHumanApproval: boolean;

	/**
	 * Notify humans when escalation occurs
	 */
	notifyOnEscalation: boolean;
}

export interface CheckpointReview {
	checkpointId: string;
	approved: boolean;
	feedback?: string;
	suggestedChanges?: string[];
	timestamp: string;
}

export interface HITLCheckpointEvent {
	type: 'checkpoint_reached' | 'stuck_detected' | 'escalation_triggered' | 'human_review_required';
	taskId: string;
	checkpoint?: CheckpointDefinition;
	stuckDetection?: StuckDetectionResult;
	escalation?: EscalationDecision;
	requiresAction: boolean;
	message: string;
}

/**
 * HITL Checkpoint Coordinator
 */
export class HITLCheckpointCoordinator {
	private checkpointManager: CheckpointManager;
	private stuckDetector: StuckDetector;
	private escalationEngine: EscalationEngine;
	private config: HITLCheckpointConfig;

	private taskStartTimes: Map<string, string> = new Map();
	private checkpointReviews: Map<string, CheckpointReview> = new Map();
	private eventListeners: ((event: HITLCheckpointEvent) => void)[] = [];

	constructor(
		checkpointManager: CheckpointManager,
		config?: Partial<HITLCheckpointConfig>,
	) {
		this.checkpointManager = checkpointManager;
		this.stuckDetector = new StuckDetector();
		this.escalationEngine = new EscalationEngine();

		this.config = {
			enableStuckDetection: true,
			enableAutoEscalation: true,
			requireHumanApproval: false,
			notifyOnEscalation: true,
			...config,
		};
	}

	/**
	 * Start tracking a task
	 */
	startTask(taskId: string): void {
		this.taskStartTimes.set(taskId, new Date().toISOString());
	}

	/**
	 * Record an attempt
	 */
	recordAttempt(taskId: string, attempt: AttemptRecord): void {
		if (this.config.enableStuckDetection) {
			this.stuckDetector.recordAttempt(taskId, attempt);
			this.checkForStuck(taskId);
		}
	}

	/**
	 * Check if task is stuck and trigger escalation if needed
	 */
	private async checkForStuck(taskId: string): Promise<void> {
		const startTime = this.taskStartTimes.get(taskId);
		if (!startTime) return;

		const stuckResult = this.stuckDetector.checkIfStuck(taskId, startTime);

		if (stuckResult.isStuck) {
			// Emit stuck detection event
			this.emitEvent({
				type: 'stuck_detected',
				taskId,
				stuckDetection: stuckResult,
				requiresAction: true,
				message: `Task stuck: ${stuckResult.reason} (confidence: ${Math.round(stuckResult.confidence * 100)}%)`,
			});

			// Trigger escalation if enabled
			if (this.config.enableAutoEscalation) {
				await this.triggerEscalation(taskId, stuckResult);
			}
		}
	}

	/**
	 * Trigger escalation
	 */
	private async triggerEscalation(
		taskId: string,
		stuckResult: StuckDetectionResult,
	): Promise<void> {
		const attempts = this.stuckDetector.getAttempts(taskId);
		const startTime = this.taskStartTimes.get(taskId);
		if (!startTime) return;

		const elapsedMs = Date.now() - new Date(startTime).getTime();
		const elapsedMinutes = elapsedMs / (1000 * 60);

		// Create escalation context
		const context: EscalationContext = {
			taskId,
			attemptCount: attempts.length,
			previousEscalations: this.escalationEngine.getHistory(taskId),
			stuckDetection: stuckResult,
			taskPriority: 'medium', // TODO: get from task metadata
			taskComplexity: 'moderate', // TODO: get from classification
			elapsedMinutes,
		};

		// Get escalation decision
		const decision = this.escalationEngine.decide(context);

		// Record escalation
		this.escalationEngine.recordEscalation(taskId, decision.level);

		// Emit escalation event
		this.emitEvent({
			type: 'escalation_triggered',
			taskId,
			escalation: decision,
			requiresAction: decision.requiresHuman,
			message: `Escalation: ${decision.level} - ${decision.reason}`,
		});

		// If human intervention required, create checkpoint and wait for review
		if (decision.requiresHuman) {
			await this.requestHumanReview(taskId, decision);
		}
	}

	/**
	 * Request human review
	 */
	private async requestHumanReview(
		taskId: string,
		escalation: EscalationDecision,
	): Promise<void> {
		this.emitEvent({
			type: 'human_review_required',
			taskId,
			escalation,
			requiresAction: true,
			message: `Human review required: ${escalation.reason}`,
		});

		// In a real implementation, this would pause execution and wait for human input
		// For now, we just emit the event
	}

	/**
	 * Evaluate checkpoint
	 */
	async evaluateCheckpoint(
		taskId: string,
		checkpoint: CheckpointDefinition,
		currentState: TaskState,
	): Promise<{ shouldProceed: boolean; reason: string }> {
		// Save checkpoint
		await this.checkpointManager.checkpoint(taskId, currentState);

		// Emit checkpoint event
		this.emitEvent({
			type: 'checkpoint_reached',
			taskId,
			checkpoint,
			requiresAction: this.config.requireHumanApproval,
			message: `Checkpoint reached: ${checkpoint.name}`,
		});

		// Check if stuck
		if (this.config.enableStuckDetection) {
			const startTime = this.taskStartTimes.get(taskId);
			if (startTime) {
				const stuckResult = this.stuckDetector.checkIfStuck(taskId, startTime);
				if (stuckResult.isStuck && stuckResult.confidence > 0.8) {
					await this.triggerEscalation(taskId, stuckResult);
					return {
						shouldProceed: false,
						reason: `Task is stuck: ${stuckResult.reason}`,
					};
				}
			}
		}

		// If human approval required, check for approval
		if (this.config.requireHumanApproval) {
			const review = this.checkpointReviews.get(checkpoint.id);
			if (!review) {
				return {
					shouldProceed: false,
					reason: 'Waiting for human review',
				};
			}

			if (!review.approved) {
				return {
					shouldProceed: false,
					reason: `Checkpoint rejected: ${review.feedback ?? 'No feedback provided'}`,
				};
			}
		}

		// Check blocking issues
		if (checkpoint.blockingIssues && checkpoint.blockingIssues.length > 0) {
			return {
				shouldProceed: false,
				reason: `Blocking issues: ${checkpoint.blockingIssues.join(', ')}`,
			};
		}

		return {
			shouldProceed: true,
			reason: 'Checkpoint passed',
		};
	}

	/**
	 * Submit checkpoint review
	 */
	submitReview(checkpointId: string, review: CheckpointReview): void {
		this.checkpointReviews.set(checkpointId, review);
	}

	/**
	 * Get escalation decision for task
	 */
	async getEscalationDecision(taskId: string): Promise<EscalationDecision | null> {
		const startTime = this.taskStartTimes.get(taskId);
		if (!startTime) return null;

		const stuckResult = this.stuckDetector.checkIfStuck(taskId, startTime);
		const attempts = this.stuckDetector.getAttempts(taskId);

		const elapsedMs = Date.now() - new Date(startTime).getTime();
		const elapsedMinutes = elapsedMs / (1000 * 60);

		const context: EscalationContext = {
			taskId,
			attemptCount: attempts.length,
			previousEscalations: this.escalationEngine.getHistory(taskId),
			stuckDetection: stuckResult,
			taskPriority: 'medium',
			taskComplexity: 'moderate',
			elapsedMinutes,
		};

		return this.escalationEngine.decide(context);
	}

	/**
	 * Register event listener
	 */
	on(listener: (event: HITLCheckpointEvent) => void): () => void {
		this.eventListeners.push(listener);

		// Return unsubscribe function
		return () => {
			const index = this.eventListeners.indexOf(listener);
			if (index !== -1) {
				this.eventListeners.splice(index, 1);
			}
		};
	}

	/**
	 * Emit event to all listeners
	 */
	private emitEvent(event: HITLCheckpointEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('Error in checkpoint event listener:', error);
			}
		}
	}

	/**
	 * Clear task data
	 */
	clearTask(taskId: string): void {
		this.taskStartTimes.delete(taskId);
		this.stuckDetector.clearAttempts(taskId);
		this.escalationEngine.clearHistory(taskId);
	}

	/**
	 * Get task statistics
	 */
	getTaskStats(taskId: string): {
		attempts: number;
		escalations: number;
		elapsedMinutes: number;
		isStuck: boolean;
	} {
		const attempts = this.stuckDetector.getAttempts(taskId);
		const escalations = this.escalationEngine.getHistory(taskId);
		const startTime = this.taskStartTimes.get(taskId);

		const elapsedMs = startTime
			? Date.now() - new Date(startTime).getTime()
			: 0;
		const elapsedMinutes = elapsedMs / (1000 * 60);

		const stuckResult = startTime
			? this.stuckDetector.checkIfStuck(taskId, startTime)
			: { isStuck: false };

		return {
			attempts: attempts.length,
			escalations: escalations.length,
			elapsedMinutes,
			isStuck: stuckResult.isStuck,
		};
	}
}

/**
 * Create HITL checkpoint coordinator
 */
export function createHITLCheckpointCoordinator(
	checkpointManager: CheckpointManager,
	config?: Partial<HITLCheckpointConfig>,
): HITLCheckpointCoordinator {
	return new HITLCheckpointCoordinator(checkpointManager, config);
}
