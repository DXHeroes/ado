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
} from '@ado/shared';

/**
 * Abstract base adapter providing common functionality
 */
export abstract class BaseAdapter implements AgentAdapter {
	abstract readonly id: string;
	abstract readonly capabilities: AgentCapabilities;

	protected config: AgentConfig | null = null;
	protected projectContext: ProjectContext | null = null;

	async initialize(config: AgentConfig): Promise<void> {
		this.config = config;
		this.projectContext = config.projectContext;
	}

	abstract isAvailable(): Promise<boolean>;
	abstract execute(task: AgentTask): AsyncIterable<AgentEvent>;
	abstract interrupt(): Promise<void>;
	abstract getContextFile(): string;

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
	 * Create an event with common fields
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
}

/**
 * No-op rate limit detector for adapters that don't track limits
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
