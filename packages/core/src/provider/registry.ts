/**
 * Provider Registry - manages provider configurations and selection.
 * Implements subscription-first routing logic.
 */

import type {
	AccessMode,
	AccessModeConfig,
	AgentCapabilities,
	ProviderConfig,
	ProviderSelection,
	TaskDefinition,
} from '@ado/shared';
import type { RateLimitTracker } from '../rate-limit/tracker.js';

/**
 * Provider Registry interface
 */
export interface ProviderRegistry {
	/** Register a new provider */
	register(config: ProviderConfig): void;

	/** Unregister a provider */
	unregister(providerId: string): void;

	/** Get a provider by ID */
	get(providerId: string): ProviderConfig | undefined;

	/** Get all registered providers */
	getAll(): ProviderConfig[];

	/** Get all enabled providers */
	getEnabled(): ProviderConfig[];

	/** Enable or disable a provider at runtime */
	setEnabled(providerId: string, enabled: boolean): void;

	/** Enable or disable a specific access mode */
	setAccessModeEnabled(providerId: string, mode: AccessMode, enabled: boolean): void;

	/** Update priority for a provider's access mode */
	setPriority(providerId: string, mode: AccessMode, priority: number): void;

	/** Select best available provider for a task */
	selectProvider(task: TaskDefinition): Promise<ProviderSelection | null>;
}

/**
 * Check if provider has required capabilities
 */
function hasRequiredCapabilities(
	capabilities: AgentCapabilities,
	required: (keyof AgentCapabilities)[] | undefined,
): boolean {
	if (!required || required.length === 0) {
		return true;
	}

	return required.every((cap) => {
		const value = capabilities[cap];
		// For boolean capabilities, check if true
		// For arrays/numbers, check if truthy
		return Boolean(value);
	});
}

/**
 * Default implementation of Provider Registry
 */
export class DefaultProviderRegistry implements ProviderRegistry {
	private providers: Map<string, ProviderConfig> = new Map();
	private rateLimitTracker: RateLimitTracker;

	constructor(rateLimitTracker: RateLimitTracker) {
		this.rateLimitTracker = rateLimitTracker;
	}

	register(config: ProviderConfig): void {
		this.providers.set(config.id, { ...config });
	}

	unregister(providerId: string): void {
		this.providers.delete(providerId);
	}

	get(providerId: string): ProviderConfig | undefined {
		const provider = this.providers.get(providerId);
		return provider ? { ...provider } : undefined;
	}

	getAll(): ProviderConfig[] {
		return Array.from(this.providers.values()).map((p) => ({ ...p }));
	}

	getEnabled(): ProviderConfig[] {
		return this.getAll().filter((p) => p.enabled);
	}

	setEnabled(providerId: string, enabled: boolean): void {
		const provider = this.providers.get(providerId);
		if (provider) {
			provider.enabled = enabled;
		}
	}

	setAccessModeEnabled(providerId: string, mode: AccessMode, enabled: boolean): void {
		const provider = this.providers.get(providerId);
		if (provider) {
			const accessMode = provider.accessModes.find((am) => am.mode === mode);
			if (accessMode) {
				accessMode.enabled = enabled;
			}
		}
	}

	setPriority(providerId: string, mode: AccessMode, priority: number): void {
		const provider = this.providers.get(providerId);
		if (provider) {
			const accessMode = provider.accessModes.find((am) => am.mode === mode);
			if (accessMode) {
				accessMode.priority = priority;
			}
		}
	}

	/**
	 * Select the best available provider for a task using subscription-first routing.
	 *
	 * Algorithm:
	 * 1. Filter enabled providers with required capabilities
	 * 2. Sort by access mode priority (subscription first)
	 * 3. Check rate limit status for each candidate
	 * 4. Return first available or null if all exhausted
	 */
	async selectProvider(task: TaskDefinition): Promise<ProviderSelection | null> {
		// Step 1: Filter enabled providers
		let candidates = this.getEnabled();

		// Apply provider preferences if specified
		if (task.preferredProviders && task.preferredProviders.length > 0) {
			candidates = candidates.filter((p) => task.preferredProviders?.includes(p.id));
		}

		// Exclude specified providers
		if (task.excludeProviders && task.excludeProviders.length > 0) {
			candidates = candidates.filter((p) => !task.excludeProviders?.includes(p.id));
		}

		// Filter by required capabilities
		candidates = candidates.filter((p) =>
			hasRequiredCapabilities(p.capabilities, task.constraints?.requiredCapabilities),
		);

		if (candidates.length === 0) {
			return null;
		}

		// Step 2: Build list of (provider, accessMode) pairs sorted by priority
		type ProviderAccessPair = {
			provider: ProviderConfig;
			accessMode: AccessModeConfig;
		};

		const pairs: ProviderAccessPair[] = [];

		for (const provider of candidates) {
			for (const accessMode of provider.accessModes) {
				if (!accessMode.enabled) continue;

				// Skip API modes if API fallback is disabled
				if (accessMode.mode === 'api' && task.allowApiFailover === false) {
					continue;
				}

				pairs.push({ provider, accessMode });
			}
		}

		// Sort by priority (lower = higher priority)
		pairs.sort((a, b) => a.accessMode.priority - b.accessMode.priority);

		// Step 3: Find first available provider
		for (const { provider, accessMode } of pairs) {
			const status = await this.rateLimitTracker.getStatus(provider.id, accessMode.mode);

			if (!status.isLimited) {
				// Calculate estimated cost for API mode
				let estimatedCost: number | undefined;
				if (accessMode.mode === 'api' && accessMode.api) {
					// Rough estimate: assume 1000 input tokens, 2000 output tokens per request
					estimatedCost =
						(1000 * accessMode.api.costPerMillion.input +
							2000 * accessMode.api.costPerMillion.output) /
						1_000_000;
				}

				// Check against max API cost if specified
				if (
					accessMode.mode === 'api' &&
					task.maxApiCostUsd !== undefined &&
					estimatedCost !== undefined &&
					estimatedCost > task.maxApiCostUsd
				) {
					continue; // Skip this option due to cost limit
				}

				return {
					provider,
					accessMode,
					reason:
						accessMode.mode === 'subscription'
							? 'subscription available'
							: accessMode.mode === 'api'
								? 'API fallback'
								: 'free tier available',
					estimatedCost,
				};
			}
		}

		// All providers exhausted
		return null;
	}
}

/**
 * Create a new provider registry
 */
export function createProviderRegistry(rateLimitTracker: RateLimitTracker): ProviderRegistry {
	return new DefaultProviderRegistry(rateLimitTracker);
}
