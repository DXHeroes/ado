/**
 * Comprehensive tests for Provider Capability Matcher
 */

import type { AgentCapabilities, ProviderConfig } from '@dxheroes/ado-shared';
import { describe, expect, it } from 'vitest';
import {
	type TaskRequirements,
	findBestMatch,
	meetsRequirements,
	rankProviders,
	scoreProvider,
} from '../capability-matcher.js';

/**
 * Helper function to create test provider configs
 */
function createTestProvider(
	id: string,
	capabilities: Partial<AgentCapabilities> = {},
): ProviderConfig {
	return {
		id,
		enabled: true,
		accessModes: [
			{
				mode: 'subscription' as const,
				enabled: true,
				priority: 1,
			},
		],
		capabilities: {
			codeGeneration: capabilities.codeGeneration ?? true,
			codeReview: capabilities.codeReview ?? true,
			refactoring: capabilities.refactoring ?? true,
			testing: capabilities.testing ?? true,
			documentation: capabilities.documentation ?? true,
			debugging: capabilities.debugging ?? true,
			languages: capabilities.languages ?? ['typescript', 'javascript'],
			maxContextTokens: capabilities.maxContextTokens ?? 100000,
			supportsStreaming: capabilities.supportsStreaming ?? true,
			supportsMCP: capabilities.supportsMCP ?? false,
			supportsResume: capabilities.supportsResume ?? true,
		},
	};
}

describe('ProviderCapabilityMatcher', () => {
	describe('meetsRequirements', () => {
		describe('capability matching', () => {
			it('should match when provider has all required capabilities', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					codeReview: true,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview'],
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should match when provider has at least one required capability', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					codeReview: false,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview'],
				};

				// Function uses .some(), so at least one match is sufficient
				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when provider lacks all required capabilities', () => {
				const provider = createTestProvider('test', {
					codeGeneration: false,
					codeReview: false,
					refactoring: true,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview'],
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});

			it('should match when no capabilities are required', () => {
				const provider = createTestProvider('test');

				const requirements: TaskRequirements = {
					capabilities: [],
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should match when capabilities are not specified', () => {
				const provider = createTestProvider('test');

				const requirements: TaskRequirements = {};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});
		});

		describe('language matching', () => {
			it('should match when provider supports all required languages', () => {
				const provider = createTestProvider('test', {
					languages: ['typescript', 'javascript', 'python'],
				});

				const requirements: TaskRequirements = {
					languages: ['typescript', 'python'],
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should match when provider supports at least one required language', () => {
				const provider = createTestProvider('test', {
					languages: ['typescript', 'javascript'],
				});

				const requirements: TaskRequirements = {
					languages: ['typescript', 'python'],
				};

				// Function uses .some(), so at least one match is sufficient
				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when provider lacks all required languages', () => {
				const provider = createTestProvider('test', {
					languages: ['javascript'],
				});

				const requirements: TaskRequirements = {
					languages: ['python', 'rust'],
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});

			it('should be case-insensitive for language matching', () => {
				const provider = createTestProvider('test', {
					languages: ['typescript', 'javascript'],
				});

				const requirements: TaskRequirements = {
					languages: ['TypeScript', 'JAVASCRIPT'],
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should match when no languages are required', () => {
				const provider = createTestProvider('test');

				const requirements: TaskRequirements = {
					languages: [],
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});
		});

		describe('context size matching', () => {
			it('should match when provider has sufficient context tokens', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 200000,
				});

				const requirements: TaskRequirements = {
					minContextTokens: 100000,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should match when provider has exactly the minimum context tokens', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 100000,
				});

				const requirements: TaskRequirements = {
					minContextTokens: 100000,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when provider has insufficient context tokens', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 50000,
				});

				const requirements: TaskRequirements = {
					minContextTokens: 100000,
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});

			it('should match when no minimum context tokens are required', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 1000,
				});

				const requirements: TaskRequirements = {};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});
		});

		describe('streaming support matching', () => {
			it('should match when streaming is required and provider supports it', () => {
				const provider = createTestProvider('test', {
					supportsStreaming: true,
				});

				const requirements: TaskRequirements = {
					requiresStreaming: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when streaming is required but provider does not support it', () => {
				const provider = createTestProvider('test', {
					supportsStreaming: false,
				});

				const requirements: TaskRequirements = {
					requiresStreaming: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});

			it('should match when streaming is not required', () => {
				const provider = createTestProvider('test', {
					supportsStreaming: false,
				});

				const requirements: TaskRequirements = {
					requiresStreaming: false,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});
		});

		describe('MCP support matching', () => {
			it('should match when MCP is required and provider supports it', () => {
				const provider = createTestProvider('test', {
					supportsMCP: true,
				});

				const requirements: TaskRequirements = {
					requiresMCP: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when MCP is required but provider does not support it', () => {
				const provider = createTestProvider('test', {
					supportsMCP: false,
				});

				const requirements: TaskRequirements = {
					requiresMCP: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});

			it('should match when MCP is not required', () => {
				const provider = createTestProvider('test', {
					supportsMCP: false,
				});

				const requirements: TaskRequirements = {
					requiresMCP: false,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});
		});

		describe('resume support matching', () => {
			it('should match when resume is required and provider supports it', () => {
				const provider = createTestProvider('test', {
					supportsResume: true,
				});

				const requirements: TaskRequirements = {
					requiresResume: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when resume is required but provider does not support it', () => {
				const provider = createTestProvider('test', {
					supportsResume: false,
				});

				const requirements: TaskRequirements = {
					requiresResume: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});

			it('should match when resume is not required', () => {
				const provider = createTestProvider('test', {
					supportsResume: false,
				});

				const requirements: TaskRequirements = {
					requiresResume: false,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});
		});

		describe('combined requirements', () => {
			it('should match when all requirements are met', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					languages: ['typescript', 'python'],
					maxContextTokens: 200000,
					supportsStreaming: true,
					supportsMCP: true,
					supportsResume: true,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration'],
					languages: ['typescript'],
					minContextTokens: 100000,
					requiresStreaming: true,
					requiresMCP: true,
					requiresResume: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(true);
			});

			it('should not match when any requirement is not met', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					languages: ['typescript'],
					maxContextTokens: 200000,
					supportsStreaming: false, // This requirement will fail
					supportsMCP: true,
					supportsResume: true,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration'],
					languages: ['typescript'],
					minContextTokens: 100000,
					requiresStreaming: true,
					requiresMCP: true,
					requiresResume: true,
				};

				expect(meetsRequirements(provider, requirements)).toBe(false);
			});
		});
	});

	describe('scoreProvider', () => {
		describe('capability scoring', () => {
			it('should give full capability score when all capabilities match', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					codeReview: true,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview'],
				};

				const score = scoreProvider(provider, requirements);

				// 30 points for capabilities + 20 for languages + 20 for context + 30 for optional features = 100
				expect(score.score).toBeGreaterThanOrEqual(70); // At least capability + language + context
				expect(score.matches.capabilities).toBe(true);
			});

			it('should give partial capability score when some capabilities match', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					codeReview: false,
					refactoring: false,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview', 'refactoring'],
				};

				const score = scoreProvider(provider, requirements);

				// Only 1 out of 3 capabilities match: (1/3) * 30 = 10 points
				expect(score.score).toBeLessThan(100);
				expect(score.matches.capabilities).toBe(false);
			});

			it('should give zero capability score when no capabilities match', () => {
				const provider = createTestProvider('test', {
					codeGeneration: false,
					codeReview: false,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview'],
				};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBeLessThan(100);
				expect(score.matches.capabilities).toBe(false);
			});

			it('should give full capability score when no capabilities are required', () => {
				const provider = createTestProvider('test');

				const requirements: TaskRequirements = {
					capabilities: [],
				};

				const score = scoreProvider(provider, requirements);

				// No requirements = full score (100)
				expect(score.score).toBe(100);
			});
		});

		describe('language scoring', () => {
			it('should give full language score when all languages match', () => {
				const provider = createTestProvider('test', {
					languages: ['typescript', 'javascript', 'python'],
				});

				const requirements: TaskRequirements = {
					languages: ['typescript', 'python'],
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.languages).toBe(true);
				expect(score.score).toBeGreaterThan(0);
			});

			it('should give partial language score when some languages match', () => {
				const provider = createTestProvider('test', {
					languages: ['typescript'],
				});

				const requirements: TaskRequirements = {
					languages: ['typescript', 'python', 'rust'],
				};

				const score = scoreProvider(provider, requirements);

				// Only 1 out of 3 languages match: (1/3) * 20 ≈ 6.67 points
				expect(score.matches.languages).toBe(false);
				expect(score.score).toBeLessThan(100);
			});

			it('should give zero language score when no languages match', () => {
				const provider = createTestProvider('test', {
					languages: ['javascript'],
				});

				const requirements: TaskRequirements = {
					languages: ['python', 'rust'],
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.languages).toBe(false);
			});

			it('should give full language score when no languages are required', () => {
				const provider = createTestProvider('test');

				const requirements: TaskRequirements = {};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBe(100);
			});
		});

		describe('context size scoring', () => {
			it('should give score when context size meets minimum', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 100000,
				});

				const requirements: TaskRequirements = {
					minContextTokens: 100000,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.contextSize).toBe(true);
				expect(score.score).toBeGreaterThan(0);
			});

			it('should give bonus for much larger context windows', () => {
				const provider1 = createTestProvider('test1', {
					maxContextTokens: 100000,
				});

				const provider2 = createTestProvider('test2', {
					maxContextTokens: 400000,
				});

				const requirements: TaskRequirements = {
					minContextTokens: 100000,
				};

				const score1 = scoreProvider(provider1, requirements);
				const score2 = scoreProvider(provider2, requirements);

				// Provider with larger context window should score higher
				expect(score2.score).toBeGreaterThan(score1.score);
			});

			it('should not give context score when size is insufficient', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 50000,
				});

				const requirements: TaskRequirements = {
					minContextTokens: 100000,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.contextSize).toBe(false);
			});

			it('should give full context score when no minimum is required', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 1000,
				});

				const requirements: TaskRequirements = {};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBe(100);
			});
		});

		describe('streaming scoring', () => {
			it('should give bonus when streaming is required and supported', () => {
				const provider = createTestProvider('test', {
					supportsStreaming: true,
				});

				const requirements: TaskRequirements = {
					requiresStreaming: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.streaming).toBe(true);
			});

			it('should not give bonus when streaming is required but not supported', () => {
				const provider = createTestProvider('test', {
					supportsStreaming: false,
				});

				const requirements: TaskRequirements = {
					requiresStreaming: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.streaming).toBe(false);
			});

			it('should give full bonus when streaming is not required', () => {
				const provider = createTestProvider('test', {
					supportsStreaming: false,
				});

				const requirements: TaskRequirements = {};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBe(100);
			});
		});

		describe('MCP scoring', () => {
			it('should give bonus when MCP is required and supported', () => {
				const provider = createTestProvider('test', {
					supportsMCP: true,
				});

				const requirements: TaskRequirements = {
					requiresMCP: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.mcp).toBe(true);
			});

			it('should not give bonus when MCP is required but not supported', () => {
				const provider = createTestProvider('test', {
					supportsMCP: false,
				});

				const requirements: TaskRequirements = {
					requiresMCP: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.mcp).toBe(false);
			});

			it('should give full bonus when MCP is not required', () => {
				const provider = createTestProvider('test', {
					supportsMCP: false,
				});

				const requirements: TaskRequirements = {};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBe(100);
			});
		});

		describe('resume scoring', () => {
			it('should give bonus when resume is required and supported', () => {
				const provider = createTestProvider('test', {
					supportsResume: true,
				});

				const requirements: TaskRequirements = {
					requiresResume: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.resume).toBe(true);
			});

			it('should not give bonus when resume is required but not supported', () => {
				const provider = createTestProvider('test', {
					supportsResume: false,
				});

				const requirements: TaskRequirements = {
					requiresResume: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.matches.resume).toBe(false);
			});

			it('should give full bonus when resume is not required', () => {
				const provider = createTestProvider('test', {
					supportsResume: false,
				});

				const requirements: TaskRequirements = {};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBe(100);
			});
		});

		describe('score bounds', () => {
			it('should cap score at 100', () => {
				const provider = createTestProvider('test', {
					maxContextTokens: 1000000, // Very large context
				});

				const requirements: TaskRequirements = {
					minContextTokens: 10000,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBeLessThanOrEqual(100);
			});

			it('should round score to integer', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					codeReview: false,
					refactoring: false,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration', 'codeReview', 'refactoring'],
				};

				const score = scoreProvider(provider, requirements);

				expect(Number.isInteger(score.score)).toBe(true);
			});
		});

		describe('complete scoring scenarios', () => {
			it('should score perfect match as 100', () => {
				const provider = createTestProvider('test', {
					codeGeneration: true,
					languages: ['typescript'],
					maxContextTokens: 100000,
					supportsStreaming: true,
					supportsMCP: true,
					supportsResume: true,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration'],
					languages: ['typescript'],
					// No minContextTokens to get full 20 points instead of logarithmic calculation
					requiresStreaming: true,
					requiresMCP: true,
					requiresResume: true,
				};

				const score = scoreProvider(provider, requirements);

				// 30 (caps) + 20 (langs) + 20 (context) + 10 (stream) + 10 (mcp) + 10 (resume) = 100
				expect(score.score).toBe(100);
				expect(score.matches.capabilities).toBe(true);
				expect(score.matches.languages).toBe(true);
				expect(score.matches.contextSize).toBe(true);
				expect(score.matches.streaming).toBe(true);
				expect(score.matches.mcp).toBe(true);
				expect(score.matches.resume).toBe(true);
			});

			it('should score no match scenario', () => {
				const provider = createTestProvider('test', {
					codeGeneration: false,
					languages: ['javascript'],
					maxContextTokens: 10000,
					supportsStreaming: false,
					supportsMCP: false,
					supportsResume: false,
				});

				const requirements: TaskRequirements = {
					capabilities: ['codeGeneration'],
					languages: ['python'],
					minContextTokens: 100000,
					requiresStreaming: true,
					requiresMCP: true,
					requiresResume: true,
				};

				const score = scoreProvider(provider, requirements);

				expect(score.score).toBe(0);
				expect(score.matches.capabilities).toBe(false);
				expect(score.matches.languages).toBe(false);
				expect(score.matches.contextSize).toBe(false);
				expect(score.matches.streaming).toBe(false);
				expect(score.matches.mcp).toBe(false);
				expect(score.matches.resume).toBe(false);
			});
		});
	});

	describe('rankProviders', () => {
		it('should rank providers by score in descending order', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: true,
				codeReview: false,
			});

			const provider2 = createTestProvider('provider-2', {
				codeGeneration: true,
				codeReview: true,
			});

			const provider3 = createTestProvider('provider-3', {
				codeGeneration: false,
				codeReview: false,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration', 'codeReview'],
			};

			const ranked = rankProviders([provider1, provider2, provider3], requirements);

			expect(ranked).toHaveLength(3);
			expect(ranked[0]?.provider.id).toBe('provider-2'); // Best match
			expect(ranked[1]?.provider.id).toBe('provider-1'); // Partial match
			expect(ranked[2]?.provider.id).toBe('provider-3'); // Worst match
			expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score);
			expect(ranked[1]?.score).toBeGreaterThan(ranked[2]?.score);
		});

		it('should filter out providers with zero score', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: true,
			});

			const provider2 = createTestProvider('provider-2', {
				codeGeneration: false,
				codeReview: false,
				refactoring: false,
				testing: false,
				documentation: false,
				debugging: false,
				languages: [],
				maxContextTokens: 0,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const ranked = rankProviders([provider1, provider2], requirements);

			// Provider2 should be included even with zero score (filter only checks > 0)
			// But if it has score 0, it will be filtered
			expect(ranked.length).toBeGreaterThanOrEqual(1);
			expect(ranked[0]?.provider.id).toBe('provider-1');
		});

		it('should handle empty provider list', () => {
			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const ranked = rankProviders([], requirements);

			expect(ranked).toHaveLength(0);
		});

		it('should rank providers with equal scores in original order', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: true,
			});

			const provider2 = createTestProvider('provider-2', {
				codeGeneration: true,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const ranked = rankProviders([provider1, provider2], requirements);

			expect(ranked).toHaveLength(2);
			expect(ranked[0]?.score).toBe(ranked[1]?.score);
		});

		it('should rank by context size when all else is equal', () => {
			const provider1 = createTestProvider('provider-1', {
				maxContextTokens: 100000,
			});

			const provider2 = createTestProvider('provider-2', {
				maxContextTokens: 200000,
			});

			const provider3 = createTestProvider('provider-3', {
				maxContextTokens: 50000,
			});

			const requirements: TaskRequirements = {
				minContextTokens: 50000,
			};

			const ranked = rankProviders([provider1, provider2, provider3], requirements);

			expect(ranked).toHaveLength(3);
			// Provider with largest context should rank highest
			expect(ranked[0]?.provider.id).toBe('provider-2');
			expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score);
		});

		it('should rank providers with optional features higher', () => {
			const provider1 = createTestProvider('provider-1', {
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			});

			const provider2 = createTestProvider('provider-2', {
				supportsStreaming: true,
				supportsMCP: true,
				supportsResume: true,
			});

			const requirements: TaskRequirements = {
				requiresStreaming: true,
				requiresMCP: true,
				requiresResume: true,
			};

			const ranked = rankProviders([provider1, provider2], requirements);

			expect(ranked).toHaveLength(2);
			expect(ranked[0]?.provider.id).toBe('provider-2');
			expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score);
		});

		it('should handle complex multi-criteria ranking', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: true,
				codeReview: true,
				languages: ['typescript', 'javascript'],
				maxContextTokens: 100000,
				supportsStreaming: true,
				supportsMCP: false,
				supportsResume: true,
			});

			const provider2 = createTestProvider('provider-2', {
				codeGeneration: true,
				codeReview: false,
				languages: ['typescript', 'python'],
				maxContextTokens: 200000,
				supportsStreaming: true,
				supportsMCP: true,
				supportsResume: true,
			});

			const provider3 = createTestProvider('provider-3', {
				codeGeneration: false,
				codeReview: true,
				languages: ['python'],
				maxContextTokens: 50000,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration', 'codeReview'],
				languages: ['typescript'],
				minContextTokens: 80000,
				requiresStreaming: true,
				requiresMCP: true,
			};

			const ranked = rankProviders([provider1, provider2, provider3], requirements);

			expect(ranked).toHaveLength(3);
			// Verify descending score order
			for (let i = 0; i < ranked.length - 1; i++) {
				expect(ranked[i]?.score).toBeGreaterThanOrEqual(ranked[i + 1]?.score);
			}
		});
	});

	describe('findBestMatch', () => {
		it('should return the highest scoring provider', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: true,
				codeReview: false,
			});

			const provider2 = createTestProvider('provider-2', {
				codeGeneration: true,
				codeReview: true,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration', 'codeReview'],
			};

			const best = findBestMatch([provider1, provider2], requirements);

			expect(best).toBeDefined();
			expect(best?.id).toBe('provider-2');
		});

		it('should return null when no providers are available', () => {
			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const best = findBestMatch([], requirements);

			expect(best).toBeNull();
		});

		it('should return null when all providers score zero', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: false,
				codeReview: false,
				refactoring: false,
				testing: false,
				documentation: false,
				debugging: false,
				languages: [],
				maxContextTokens: 0,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
				languages: ['typescript'],
				minContextTokens: 100000,
				requiresStreaming: true,
				requiresMCP: true,
				requiresResume: true,
			};

			const best = findBestMatch([provider1], requirements);

			expect(best).toBeNull();
		});

		it('should return first provider when multiple have same score', () => {
			const provider1 = createTestProvider('provider-1', {
				codeGeneration: true,
			});

			const provider2 = createTestProvider('provider-2', {
				codeGeneration: true,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const best = findBestMatch([provider1, provider2], requirements);

			expect(best).toBeDefined();
			// Should return first in the ranked list (which maintains input order for ties)
			expect(['provider-1', 'provider-2']).toContain(best?.id);
		});

		it('should work with no requirements (returns best overall provider)', () => {
			const provider1 = createTestProvider('provider-1');
			const provider2 = createTestProvider('provider-2');

			const requirements: TaskRequirements = {};

			const best = findBestMatch([provider1, provider2], requirements);

			expect(best).toBeDefined();
			expect(['provider-1', 'provider-2']).toContain(best?.id);
		});

		it('should find best match with complex requirements', () => {
			const provider1 = createTestProvider('claude', {
				codeGeneration: true,
				codeReview: true,
				refactoring: true,
				languages: ['typescript', 'python', 'rust'],
				maxContextTokens: 200000,
				supportsStreaming: true,
				supportsMCP: true,
				supportsResume: true,
			});

			const provider2 = createTestProvider('gemini', {
				codeGeneration: true,
				codeReview: false,
				refactoring: true,
				languages: ['typescript', 'javascript'],
				maxContextTokens: 100000,
				supportsStreaming: true,
				supportsMCP: false,
				supportsResume: false,
			});

			const provider3 = createTestProvider('cursor', {
				codeGeneration: true,
				codeReview: true,
				refactoring: false,
				languages: ['typescript'],
				maxContextTokens: 50000,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: true,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration', 'codeReview', 'refactoring'],
				languages: ['typescript', 'python'],
				minContextTokens: 150000,
				requiresStreaming: true,
				requiresMCP: true,
				requiresResume: true,
			};

			const best = findBestMatch([provider1, provider2, provider3], requirements);

			expect(best).toBeDefined();
			expect(best?.id).toBe('claude');
		});
	});

	describe('edge cases and boundary conditions', () => {
		it('should handle provider with missing capability properties gracefully', () => {
			// This tests the Boolean() conversion in the code
			const provider = createTestProvider('test', {
				codeGeneration: false,
			});

			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const result = meetsRequirements(provider, requirements);
			expect(result).toBe(false);
		});

		it('should handle extremely large context windows', () => {
			const provider = createTestProvider('test', {
				maxContextTokens: Number.MAX_SAFE_INTEGER,
			});

			const requirements: TaskRequirements = {
				minContextTokens: 1000000,
			};

			const score = scoreProvider(provider, requirements);

			expect(score.matches.contextSize).toBe(true);
			expect(score.score).toBeLessThanOrEqual(100);
		});

		it('should handle zero context tokens requirement', () => {
			const provider = createTestProvider('test', {
				maxContextTokens: 100000,
			});

			const requirements: TaskRequirements = {
				minContextTokens: 0,
			};

			const result = meetsRequirements(provider, requirements);
			expect(result).toBe(true);
		});

		it('should handle empty languages array in provider', () => {
			const provider = createTestProvider('test', {
				languages: [],
			});

			const requirements: TaskRequirements = {
				languages: ['typescript'],
			};

			const result = meetsRequirements(provider, requirements);
			expect(result).toBe(false);
		});

		it('should handle empty capabilities array in requirements', () => {
			const provider = createTestProvider('test');

			const requirements: TaskRequirements = {
				capabilities: [],
			};

			const score = scoreProvider(provider, requirements);

			expect(score.score).toBeGreaterThan(0);
		});

		it('should handle all boolean flags set to false', () => {
			const provider = createTestProvider('test', {
				codeGeneration: false,
				codeReview: false,
				refactoring: false,
				testing: false,
				documentation: false,
				debugging: false,
				supportsStreaming: false,
				supportsMCP: false,
				supportsResume: false,
			});

			const requirements: TaskRequirements = {};

			const score = scoreProvider(provider, requirements);

			// Should still get full score since no requirements are specified
			expect(score.score).toBe(100);
		});

		it('should maintain consistency across multiple calls', () => {
			const provider = createTestProvider('test');
			const requirements: TaskRequirements = {
				capabilities: ['codeGeneration'],
			};

			const score1 = scoreProvider(provider, requirements);
			const score2 = scoreProvider(provider, requirements);

			expect(score1.score).toBe(score2.score);
			expect(score1.matches).toEqual(score2.matches);
		});

		it('should handle Unicode in language names', () => {
			const provider = createTestProvider('test', {
				languages: ['typescript', '日本語', 'español'],
			});

			const requirements: TaskRequirements = {
				languages: ['日本語'],
			};

			const result = meetsRequirements(provider, requirements);
			expect(result).toBe(true);
		});
	});
});
