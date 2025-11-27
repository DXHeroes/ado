/**
 * Capability Matcher - Helps match tasks to providers based on capabilities.
 */

import type { AgentCapabilities, ProviderConfig } from '@dxheroes/ado-shared';

/**
 * Task requirements that can be matched against provider capabilities
 */
export interface TaskRequirements {
	/** Required capabilities (at least one must be true) */
	capabilities?: (keyof AgentCapabilities)[];

	/** Required programming languages */
	languages?: string[];

	/** Minimum context tokens needed */
	minContextTokens?: number;

	/** Whether streaming is required */
	requiresStreaming?: boolean;

	/** Whether MCP support is required */
	requiresMCP?: boolean;

	/** Whether resume support is required */
	requiresResume?: boolean;
}

/**
 * Score result for provider matching
 */
export interface ProviderScore {
	provider: ProviderConfig;
	score: number;
	matches: {
		capabilities: boolean;
		languages: boolean;
		contextSize: boolean;
		streaming: boolean;
		mcp: boolean;
		resume: boolean;
	};
}

/**
 * Check if provider meets task requirements
 */
export function meetsRequirements(
	provider: ProviderConfig,
	requirements: TaskRequirements,
): boolean {
	const { capabilities } = provider;

	// Check required capabilities
	if (requirements.capabilities && requirements.capabilities.length > 0) {
		const hasCapability = requirements.capabilities.some((cap) => {
			const value = capabilities[cap];
			return Boolean(value);
		});
		if (!hasCapability) return false;
	}

	// Check required languages
	if (requirements.languages && requirements.languages.length > 0) {
		const hasLanguage = requirements.languages.some((lang) =>
			capabilities.languages.includes(lang.toLowerCase()),
		);
		if (!hasLanguage) return false;
	}

	// Check minimum context tokens
	if (requirements.minContextTokens) {
		if (capabilities.maxContextTokens < requirements.minContextTokens) return false;
	}

	// Check streaming requirement
	if (requirements.requiresStreaming && !capabilities.supportsStreaming) return false;

	// Check MCP requirement
	if (requirements.requiresMCP && !capabilities.supportsMCP) return false;

	// Check resume requirement
	if (requirements.requiresResume && !capabilities.supportsResume) return false;

	return true;
}

/**
 * Score a provider against task requirements (0-100)
 */
export function scoreProvider(
	provider: ProviderConfig,
	requirements: TaskRequirements,
): ProviderScore {
	const { capabilities } = provider;
	let score = 0;

	const matches = {
		capabilities: true,
		languages: true,
		contextSize: true,
		streaming: true,
		mcp: true,
		resume: true,
	};

	// Score based on capabilities (30 points max)
	if (requirements.capabilities && requirements.capabilities.length > 0) {
		const matchedCaps = requirements.capabilities.filter((cap) => Boolean(capabilities[cap]));
		const capScore = (matchedCaps.length / requirements.capabilities.length) * 30;
		score += capScore;
		matches.capabilities = matchedCaps.length === requirements.capabilities.length;
	} else {
		score += 30; // No requirements = full score
	}

	// Score based on languages (20 points max)
	if (requirements.languages && requirements.languages.length > 0) {
		const matchedLangs = requirements.languages.filter((lang) =>
			capabilities.languages.includes(lang.toLowerCase()),
		);
		const langScore = (matchedLangs.length / requirements.languages.length) * 20;
		score += langScore;
		matches.languages = matchedLangs.length === requirements.languages.length;
	} else {
		score += 20;
	}

	// Score based on context size (20 points max)
	if (requirements.minContextTokens) {
		if (capabilities.maxContextTokens >= requirements.minContextTokens) {
			// Bonus for much larger context windows
			const ratio = capabilities.maxContextTokens / requirements.minContextTokens;
			score += Math.min(20, 10 + Math.log2(ratio) * 5);
		} else {
			matches.contextSize = false;
		}
	} else {
		score += 20;
	}

	// Bonus for optional features (10 points each)
	if (requirements.requiresStreaming) {
		if (capabilities.supportsStreaming) {
			score += 10;
		} else {
			matches.streaming = false;
		}
	} else {
		score += 10;
	}

	if (requirements.requiresMCP) {
		if (capabilities.supportsMCP) {
			score += 10;
		} else {
			matches.mcp = false;
		}
	} else {
		score += 10;
	}

	if (requirements.requiresResume) {
		if (capabilities.supportsResume) {
			score += 10;
		} else {
			matches.resume = false;
		}
	} else {
		score += 10;
	}

	return {
		provider,
		score: Math.min(100, Math.round(score)),
		matches,
	};
}

/**
 * Rank providers by how well they match task requirements
 */
export function rankProviders(
	providers: ProviderConfig[],
	requirements: TaskRequirements,
): ProviderScore[] {
	return providers
		.map((provider) => scoreProvider(provider, requirements))
		.filter((score) => score.score > 0)
		.sort((a, b) => b.score - a.score);
}

/**
 * Find the best matching provider for task requirements
 */
export function findBestMatch(
	providers: ProviderConfig[],
	requirements: TaskRequirements,
): ProviderConfig | null {
	const ranked = rankProviders(providers, requirements);
	const best = ranked[0];
	return best ? best.provider : null;
}
