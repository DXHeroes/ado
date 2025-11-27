/**
 * Provider Router - Orchestrates subscription-first routing with cost confirmation.
 */

import type { ProviderSelection, TaskDefinition, UsageRecord } from '@dxheroes/ado-shared';
import { AdoError } from '@dxheroes/ado-shared';
import type { CostTracker } from '../cost/tracker.js';
import type { RateLimitTracker } from '../rate-limit/tracker.js';
import type { ProviderRegistry } from './registry.js';

/**
 * Router configuration
 */
export interface RouterConfig {
	/** Strategy for provider selection */
	strategy: 'subscription-first' | 'round-robin' | 'cost-optimized';

	/** Failover settings */
	failover: {
		enabled: boolean;
		onErrors: string[];
		maxRetries: number;
		retryDelay: number;
	};

	/** API fallback settings */
	apiFallback: {
		enabled: boolean;
		confirmAboveCost: number;
		maxCostPerTask: number;
		maxDailyCost: number;
	};
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
	strategy: 'subscription-first',
	failover: {
		enabled: true,
		onErrors: ['rate_limit', 'timeout', 'server_error'],
		maxRetries: 3,
		retryDelay: 1000,
	},
	apiFallback: {
		enabled: true,
		confirmAboveCost: 1.0,
		maxCostPerTask: 10.0,
		maxDailyCost: 50.0,
	},
};

/**
 * Cost confirmation callback
 */
export type CostConfirmationCallback = (
	provider: string,
	mode: string,
	estimatedCost: number,
) => Promise<boolean>;

/**
 * Provider Router
 */
export class ProviderRouter {
	private registry: ProviderRegistry;
	private rateLimitTracker: RateLimitTracker;
	private costTracker: CostTracker;
	private config: RouterConfig;
	private costConfirmationCallback?: CostConfirmationCallback;

	constructor(
		registry: ProviderRegistry,
		rateLimitTracker: RateLimitTracker,
		costTracker: CostTracker,
		config: Partial<RouterConfig> = {},
	) {
		this.registry = registry;
		this.rateLimitTracker = rateLimitTracker;
		this.costTracker = costTracker;
		this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
	}

	/**
	 * Set callback for cost confirmation
	 */
	setCostConfirmationCallback(callback: CostConfirmationCallback): void {
		this.costConfirmationCallback = callback;
	}

	/**
	 * Select provider for task using configured routing strategy
	 */
	async selectProvider(task: TaskDefinition): Promise<ProviderSelection> {
		// Check daily cost limit
		if (this.config.apiFallback.enabled) {
			const dailyCost = await this.costTracker.getDailyCost();
			if (dailyCost >= this.config.apiFallback.maxDailyCost) {
				throw new AdoError({
					code: 'DAILY_COST_LIMIT_EXCEEDED',
					message: `Daily cost limit of $${this.config.apiFallback.maxDailyCost} exceeded (current: $${dailyCost.toFixed(2)})`,
					recoverable: false,
					remediation:
						'Wait until tomorrow or increase the daily cost limit in your configuration.',
					cause: undefined,
				});
			}
		}

		// Select provider based on strategy
		let selection: ProviderSelection | null;
		switch (this.config.strategy) {
			case 'round-robin':
				selection = await this.selectProviderRoundRobin(task);
				break;
			case 'cost-optimized':
				selection = await this.selectProviderCostOptimized(task);
				break;
			default:
				selection = await this.registry.selectProvider(task);
				break;
		}

		if (!selection) {
			throw new AdoError({
				code: 'NO_PROVIDER_AVAILABLE',
				message: 'No available provider found for this task. All providers may be rate limited.',
				recoverable: false,
				remediation:
					'Check provider availability with "ado status" or wait for rate limits to reset.',
				cause: undefined,
			});
		}

		// Check if API mode requires confirmation
		if (selection.accessMode.mode === 'api' && selection.estimatedCost !== undefined) {
			// Check per-task cost limit
			if (selection.estimatedCost > this.config.apiFallback.maxCostPerTask) {
				throw new AdoError({
					code: 'TASK_COST_LIMIT_EXCEEDED',
					message: `Estimated cost ($${selection.estimatedCost.toFixed(2)}) exceeds per-task limit ($${this.config.apiFallback.maxCostPerTask})`,
					recoverable: false,
					remediation: 'Increase the per-task cost limit or disable API fallback.',
					cause: undefined,
				});
			}

			// Request confirmation if above threshold
			if (
				selection.estimatedCost > this.config.apiFallback.confirmAboveCost &&
				this.costConfirmationCallback
			) {
				const confirmed = await this.costConfirmationCallback(
					selection.provider.id,
					selection.accessMode.mode,
					selection.estimatedCost,
				);

				if (!confirmed) {
					throw new AdoError({
						code: 'COST_CONFIRMATION_REJECTED',
						message: 'User rejected API cost confirmation',
						recoverable: false,
						remediation:
							'Use --yes flag to skip confirmation or wait for subscription limits to reset.',
						cause: undefined,
					});
				}
			}
		}

		return selection;
	}

	/**
	 * Round-robin provider selection strategy
	 * Distributes tasks evenly across all available providers
	 */
	private lastProviderIndex = 0;

	private async selectProviderRoundRobin(task: TaskDefinition): Promise<ProviderSelection | null> {
		// Get all enabled providers
		const providers = this.registry.getEnabled();

		// Apply filters
		let candidates = providers;

		if (task.preferredProviders && task.preferredProviders.length > 0) {
			candidates = candidates.filter((p) => task.preferredProviders?.includes(p.id));
		}

		if (task.excludeProviders && task.excludeProviders.length > 0) {
			candidates = candidates.filter((p) => !task.excludeProviders?.includes(p.id));
		}

		if (task.constraints?.requiredCapabilities) {
			candidates = candidates.filter((p) => {
				return task.constraints?.requiredCapabilities?.every((cap) => Boolean(p.capabilities[cap]));
			});
		}

		if (candidates.length === 0) {
			return null;
		}

		// Round-robin through candidates
		const startIndex = this.lastProviderIndex % candidates.length;
		for (let i = 0; i < candidates.length; i++) {
			const index = (startIndex + i) % candidates.length;
			const provider = candidates[index];

			if (!provider) continue;

			// Try each access mode in priority order
			const enabledModes = provider.accessModes
				.filter((am) => am.enabled)
				.filter((am) => !task.preferredAccessMode || am.mode === task.preferredAccessMode)
				.filter((am) => am.mode !== 'api' || task.allowApiFailover !== false)
				.sort((a, b) => a.priority - b.priority);

			for (const accessMode of enabledModes) {
				const status = await this.rateLimitTracker.getStatus(provider.id, accessMode.mode);

				if (!status.isLimited) {
					// Calculate estimated cost
					let estimatedCost: number | undefined;
					if (accessMode.mode === 'api' && accessMode.api) {
						estimatedCost =
							(1000 * accessMode.api.costPerMillion.input +
								2000 * accessMode.api.costPerMillion.output) /
							1_000_000;
					}

					// Check max cost constraint
					if (
						accessMode.mode === 'api' &&
						task.maxApiCostUsd !== undefined &&
						estimatedCost !== undefined &&
						estimatedCost > task.maxApiCostUsd
					) {
						continue;
					}

					// Update last used index
					this.lastProviderIndex = index + 1;

					return {
						provider,
						accessMode,
						reason: 'round-robin selection',
						estimatedCost,
					};
				}
			}
		}

		return null;
	}

	/**
	 * Cost-optimized provider selection strategy
	 * Selects the lowest-cost available provider
	 */
	private async selectProviderCostOptimized(
		task: TaskDefinition,
	): Promise<ProviderSelection | null> {
		// Get all enabled providers
		const providers = this.registry.getEnabled();

		// Apply filters
		let candidates = providers;

		if (task.preferredProviders && task.preferredProviders.length > 0) {
			candidates = candidates.filter((p) => task.preferredProviders?.includes(p.id));
		}

		if (task.excludeProviders && task.excludeProviders.length > 0) {
			candidates = candidates.filter((p) => !task.excludeProviders?.includes(p.id));
		}

		if (task.constraints?.requiredCapabilities) {
			candidates = candidates.filter((p) => {
				return task.constraints?.requiredCapabilities?.every((cap) => Boolean(p.capabilities[cap]));
			});
		}

		if (candidates.length === 0) {
			return null;
		}

		// Build list of available (provider, accessMode) pairs with costs
		type CostOption = {
			provider: (typeof candidates)[0];
			accessMode: (typeof candidates)[0]['accessModes'][0];
			cost: number;
		};

		const options: CostOption[] = [];

		for (const provider of candidates) {
			const enabledModes = provider.accessModes
				.filter((am) => am.enabled)
				.filter((am) => !task.preferredAccessMode || am.mode === task.preferredAccessMode)
				.filter((am) => am.mode !== 'api' || task.allowApiFailover !== false);

			for (const accessMode of enabledModes) {
				const status = await this.rateLimitTracker.getStatus(provider.id, accessMode.mode);

				if (!status.isLimited) {
					// Calculate cost - subscription/free are 0 cost
					let cost = 0;
					if (accessMode.mode === 'api' && accessMode.api) {
						cost =
							(1000 * accessMode.api.costPerMillion.input +
								2000 * accessMode.api.costPerMillion.output) /
							1_000_000;

						// Check max cost constraint
						if (task.maxApiCostUsd !== undefined && cost > task.maxApiCostUsd) {
							continue;
						}
					}

					options.push({ provider, accessMode, cost });
				}
			}
		}

		if (options.length === 0) {
			return null;
		}

		// Sort by cost (lowest first)
		options.sort((a, b) => a.cost - b.cost);

		const selected = options[0];
		if (!selected) {
			return null;
		}

		return {
			provider: selected.provider,
			accessMode: selected.accessMode,
			reason: `cost-optimized ($${selected.cost.toFixed(4)})`,
			estimatedCost: selected.cost > 0 ? selected.cost : undefined,
		};
	}

	/**
	 * Record usage after task execution
	 */
	async recordUsage(
		providerId: string,
		accessMode: 'subscription' | 'api' | 'free',
		requestCount: number,
		inputTokens: number,
		outputTokens: number,
	): Promise<void> {
		const provider = this.registry.get(providerId);
		if (!provider) {
			return;
		}

		// Find the access mode config
		const modeConfig = provider.accessModes.find((am) => am.mode === accessMode);
		if (!modeConfig) {
			return;
		}

		// Calculate cost for API mode
		let costUsd: number | undefined;
		if (accessMode === 'api' && modeConfig.api) {
			costUsd = this.costTracker.estimateCost(
				providerId,
				inputTokens,
				outputTokens,
				modeConfig.api.costPerMillion,
			);
		}

		const usage: UsageRecord = {
			providerId,
			accessMode,
			timestamp: new Date(),
			requestCount,
			inputTokens,
			outputTokens,
			costUsd,
		};

		// Record in both trackers
		await Promise.all([
			this.rateLimitTracker.recordUsage(usage),
			this.costTracker.recordUsage(usage),
		]);
	}

	/**
	 * Get router configuration
	 */
	getConfig(): RouterConfig {
		return { ...this.config };
	}

	/**
	 * Update router configuration
	 */
	updateConfig(config: Partial<RouterConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

/**
 * Create a new provider router
 */
export function createProviderRouter(
	registry: ProviderRegistry,
	rateLimitTracker: RateLimitTracker,
	costTracker: CostTracker,
	config?: Partial<RouterConfig>,
): ProviderRouter {
	return new ProviderRouter(registry, rateLimitTracker, costTracker, config);
}
