/**
 * Task and orchestration types for ADO.
 */

import type { AgentCapabilities } from './provider.js';

/**
 * Human-in-the-loop policy
 */
export type HITLPolicy =
	| 'autonomous' // No human intervention
	| 'review-edits' // Human reviews file changes before apply
	| 'approve-steps' // Human approves each major step
	| 'manual'; // Human must approve every action

/**
 * Task constraints
 */
export interface TaskConstraints {
	maxDuration?: number; // seconds
	maxTokens?: number;
	requiredCapabilities?: (keyof AgentCapabilities)[];
}

/**
 * Task definition submitted to the orchestrator
 */
export interface TaskDefinition {
	prompt: string;
	projectKey: string;
	repositoryPath: string;

	// Provider preferences (optional)
	preferredProviders?: string[];
	excludeProviders?: string[];

	// Access mode preferences
	allowApiFailover?: boolean;
	maxApiCostUsd?: number;

	constraints?: TaskConstraints;
	hitlPolicy?: HITLPolicy;
}

/**
 * Task status values
 */
export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Task state information
 */
export interface TaskState {
	id: string;
	definition: TaskDefinition;
	status: TaskStatus;
	providerId?: string | undefined;
	sessionId?: string | undefined;
	startedAt?: Date | undefined;
	completedAt?: Date | undefined;
	error?: string | undefined;
	result?: TaskResult | undefined;
}

/**
 * Task result
 */
export interface TaskResult {
	success: boolean;
	output: string;
	tokensUsed?: {
		input: number;
		output: number;
	};
	costUsd?: number;
	duration: number;
	filesModified?: string[];
}

/**
 * Task handle returned when submitting a task
 */
export interface TaskHandle {
	id: string;
	status: TaskStatus;
	abort: () => Promise<void>;
}
