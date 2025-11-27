/**
 * Base adapter implementation with common functionality.
 */

import type {
	AgentAdapter,
	AgentCapabilities,
	AgentConfig,
	AgentEvent,
	AgentTask,
	ProjectContext,
	RateLimitDetector,
	RateLimitInfo,
	RateLimitStatus,
	RemainingCapacity,
	UsageRecord,
} from '@dxheroes/ado-shared';
import { type Span, type Tracer, context, trace } from '@opentelemetry/api';

/**
 * Abstract base adapter providing common functionality for all agent adapters.
 *
 * This class implements the AgentAdapter interface and provides shared functionality
 * that all concrete adapters can inherit, including configuration management,
 * event creation helpers, and default rate limit detection.
 */
export abstract class BaseAdapter implements AgentAdapter {
	/** Unique identifier for this adapter (e.g., 'claude-code', 'gemini-cli') */
	abstract readonly id: string;

	/** Capabilities supported by this adapter */
	abstract readonly capabilities: AgentCapabilities;

	protected config: AgentConfig | null = null;
	protected projectContext: ProjectContext | null = null;
	protected tracer: Tracer;

	constructor() {
		// Get tracer from global provider
		this.tracer = trace.getTracer('ado-adapter', '1.0.0');
	}

	/**
	 * Initialize the adapter with configuration.
	 * Stores config and project context for use during task execution.
	 *
	 * @param config - Agent configuration including working directory and project context
	 */
	async initialize(config: AgentConfig): Promise<void> {
		this.config = config;
		this.projectContext = config.projectContext;
	}

	/**
	 * Check if this adapter's underlying agent is available on the system.
	 * Implementations should verify the agent CLI is installed and authenticated.
	 *
	 * @returns Promise resolving to true if the agent is available
	 */
	abstract isAvailable(): Promise<boolean>;

	/**
	 * Execute a task using this agent adapter.
	 * Yields events as the task progresses (start, output, complete, error, etc.).
	 *
	 * @param task - The task to execute
	 * @yields Agent events during task execution
	 */
	abstract execute(task: AgentTask): AsyncIterable<AgentEvent>;

	/**
	 * Interrupt the currently running task.
	 * Implementations should gracefully stop the agent process.
	 */
	abstract interrupt(): Promise<void>;

	/**
	 * Get the path to the context file for this agent (e.g., CLAUDE.md, GEMINI.md).
	 *
	 * @returns Filename for the agent's context file
	 */
	abstract getContextFile(): string;

	/**
	 * Update the project context for this adapter.
	 *
	 * @param context - New project context
	 */
	async setProjectContext(context: ProjectContext): Promise<void> {
		this.projectContext = context;
	}

	/**
	 * Get the rate limit detector for this adapter.
	 * Default implementation returns a no-op detector.
	 */
	getRateLimitDetector(): RateLimitDetector {
		return new NoOpRateLimitDetector();
	}

	/**
	 * Create an event with common fields populated.
	 * Helper method for adapters to create properly formatted agent events.
	 *
	 * @param type - Event type (e.g., 'start', 'output', 'complete')
	 * @param taskId - ID of the task this event relates to
	 * @param extra - Additional event-specific fields
	 * @returns Fully formed agent event with timestamp
	 */
	protected createEvent<T extends AgentEvent>(
		type: T['type'],
		taskId: string,
		extra: Omit<T, 'type' | 'timestamp' | 'taskId'>,
	): T {
		return {
			type,
			timestamp: new Date(),
			taskId,
			...extra,
		} as T;
	}

	/**
	 * Generate a unique session ID for tracking agent sessions.
	 * Used for resume functionality and session tracking.
	 *
	 * @returns Unique session identifier (timestamp-based)
	 */
	protected generateSessionId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	/**
	 * Start a tracing span for adapter execution
	 */
	protected startExecutionSpan(task: AgentTask): Span {
		const span = this.tracer.startSpan('adapter.execute', {
			attributes: {
				'adapter.id': this.id,
				'task.id': task.id,
				'task.prompt': task.prompt.substring(0, 100),
				'project.id': task.projectContext.projectId,
			},
		});

		return span;
	}

	/**
	 * Record execution metrics in the span
	 */
	protected recordExecutionMetrics(
		span: Span,
		result: { duration: number; tokensUsed?: { input: number; output: number } },
	): void {
		span.setAttributes({
			'task.duration_ms': result.duration,
			...(result.tokensUsed && {
				'task.tokens.input': result.tokensUsed.input,
				'task.tokens.output': result.tokensUsed.output,
				'task.tokens.total': result.tokensUsed.input + result.tokensUsed.output,
			}),
		});
	}

	/**
	 * Execute with tracing wrapper (for use in concrete adapters)
	 */
	protected async *executeWithTracing(
		task: AgentTask,
		executor: (task: AgentTask, span: Span) => AsyncIterable<AgentEvent>,
	): AsyncIterable<AgentEvent> {
		const span = this.startExecutionSpan(task);

		try {
			// Set span as active context
			const ctx = trace.setSpan(context.active(), span);

			// Execute within context
			yield* context.with(ctx, () => executor(task, span));

			span.setStatus({ code: 1 }); // OK
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
			throw error;
		} finally {
			span.end();
		}
	}
}

/**
 * No-op rate limit detector for adapters that don't track limits.
 * Returns safe default values indicating no rate limiting.
 */
class NoOpRateLimitDetector implements RateLimitDetector {
	async getStatus(): Promise<RateLimitStatus> {
		return { isLimited: false };
	}

	parseRateLimitError(_error: Error): RateLimitInfo | null {
		return null;
	}

	async getRemainingCapacity(): Promise<RemainingCapacity> {
		return {};
	}

	async recordUsage(_usage: UsageRecord): Promise<void> {
		// No-op
	}
}
