/**
 * Agent adapter types for ADO.
 * Defines the interface for agent execution and events.
 */

import type { AgentCapabilities, ProviderConfig } from './provider.js';
import type { RateLimitDetector } from './rate-limit.js';

/**
 * Project context passed to agents
 */
export interface ProjectContext {
	projectId: string;
	repositoryPath: string;
	repositoryKey: string;
	contextFile?: string;
}

/**
 * Configuration for initializing an agent
 */
export interface AgentConfig {
	provider: ProviderConfig;
	workingDirectory: string;
	projectContext: ProjectContext;
}

/**
 * Task definition for agent execution
 */
export interface AgentTask {
	id: string;
	prompt: string;
	projectContext: ProjectContext;
	sessionId?: string; // For resume functionality
	options?: AgentTaskOptions;
}

/**
 * Options for task execution
 */
export interface AgentTaskOptions {
	maxTurns?: number;
	timeout?: number;
	model?: string;
	/** Permission mode for Claude CLI: acceptEdits, bypassPermissions, default, plan */
	permissionMode?: 'acceptEdits' | 'bypassPermissions' | 'default' | 'plan';
	/** Resume from existing session (uses sessionId from AgentTask) */
	resume?: boolean;
}

/**
 * Event types emitted during agent execution
 */
export type AgentEventType =
	| 'start'
	| 'output'
	| 'tool_use'
	| 'tool_result'
	| 'error'
	| 'rate_limit'
	| 'complete'
	| 'interrupt';

/**
 * Base event interface
 */
export interface AgentEventBase {
	type: AgentEventType;
	timestamp: Date;
	taskId: string;
}

/**
 * Start event - agent execution started
 */
export interface AgentStartEvent extends AgentEventBase {
	type: 'start';
	sessionId: string;
}

/**
 * Output event - agent produced text output
 */
export interface AgentOutputEvent extends AgentEventBase {
	type: 'output';
	content: string;
	isPartial: boolean;
}

/**
 * Tool use event - agent is using a tool
 */
export interface AgentToolUseEvent extends AgentEventBase {
	type: 'tool_use';
	toolName: string;
	toolInput: Record<string, unknown>;
}

/**
 * Tool result event - tool execution completed
 */
export interface AgentToolResultEvent extends AgentEventBase {
	type: 'tool_result';
	toolName: string;
	result: unknown;
	success: boolean;
}

/**
 * Error event - an error occurred
 */
export interface AgentErrorEvent extends AgentEventBase {
	type: 'error';
	error: Error;
	recoverable: boolean;
}

/**
 * Rate limit event - rate limit hit
 */
export interface AgentRateLimitEvent extends AgentEventBase {
	type: 'rate_limit';
	reason: string;
	resetsAt?: Date | undefined;
}

/**
 * Complete event - task completed successfully
 */
export interface AgentCompleteEvent extends AgentEventBase {
	type: 'complete';
	result: AgentResult;
}

/**
 * Interrupt event - task was interrupted
 */
export interface AgentInterruptEvent extends AgentEventBase {
	type: 'interrupt';
	reason: string;
}

/**
 * Union of all event types
 */
export type AgentEvent =
	| AgentStartEvent
	| AgentOutputEvent
	| AgentToolUseEvent
	| AgentToolResultEvent
	| AgentErrorEvent
	| AgentRateLimitEvent
	| AgentCompleteEvent
	| AgentInterruptEvent;

/**
 * Result of agent execution
 */
export interface AgentResult {
	success: boolean;
	output: string;
	sessionId: string;
	tokensUsed?: {
		input: number;
		output: number;
	};
	duration: number; // milliseconds
	filesModified?: string[];
}

/**
 * Agent adapter interface - implemented by each provider adapter
 */
export interface AgentAdapter {
	readonly id: string;
	readonly capabilities: AgentCapabilities;

	/**
	 * Initialize the adapter with configuration
	 */
	initialize(config: AgentConfig): Promise<void>;

	/**
	 * Check if the agent is available (CLI installed, authenticated, etc.)
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Execute a task and stream events
	 */
	execute(task: AgentTask): AsyncIterable<AgentEvent>;

	/**
	 * Interrupt current execution
	 */
	interrupt(): Promise<void>;

	/**
	 * Get the rate limit detector for this adapter
	 */
	getRateLimitDetector(): RateLimitDetector;

	/**
	 * Get the context file name for this adapter
	 */
	getContextFile(): string;

	/**
	 * Set project context for the adapter
	 */
	setProjectContext(context: ProjectContext): Promise<void>;
}
