/**
 * Prompt utilities for length management and validation
 */

export interface PromptLengthConfig {
	/**
	 * Maximum prompt length in characters
	 * Claude CLI argument limit: ~100KB on most systems
	 */
	maxLength: number;
	/**
	 * Warning threshold (% of maxLength)
	 */
	warningThreshold: number;
	/**
	 * Truncation strategy when prompt exceeds maxLength
	 */
	truncationStrategy: 'error' | 'truncate-start' | 'truncate-end' | 'truncate-middle';
}

export interface PromptValidationResult {
	valid: boolean;
	length: number;
	maxLength: number;
	truncated: boolean;
	warning?: string;
	error?: string;
	truncatedPrompt?: string;
}

/**
 * Default prompt length configuration
 */
export const DEFAULT_PROMPT_CONFIG: PromptLengthConfig = {
	// Conservative limit: 50KB (well below OS limits)
	// Leaves room for CLAUDE.md, AGENTS.md, and other context
	maxLength: 50_000,
	warningThreshold: 0.8, // Warn at 80%
	truncationStrategy: 'error',
};

/**
 * Validate and optionally truncate prompt
 */
export function validatePromptLength(
	prompt: string,
	config: Partial<PromptLengthConfig> = {},
): PromptValidationResult {
	const cfg = { ...DEFAULT_PROMPT_CONFIG, ...config };
	const length = prompt.length;
	const warningLength = cfg.maxLength * cfg.warningThreshold;

	const result: PromptValidationResult = {
		valid: true,
		length,
		maxLength: cfg.maxLength,
		truncated: false,
	};

	// Check if exceeds max length
	if (length > cfg.maxLength) {
		result.valid = false;

		switch (cfg.truncationStrategy) {
			case 'error':
				result.error = `Prompt too long: ${length} characters (max: ${cfg.maxLength})`;
				break;

			case 'truncate-start':
				result.truncatedPrompt = prompt.slice(length - cfg.maxLength);
				result.truncated = true;
				result.valid = true;
				result.warning = `Prompt truncated from start: ${length} → ${cfg.maxLength} characters`;
				break;

			case 'truncate-end':
				result.truncatedPrompt = prompt.slice(0, cfg.maxLength);
				result.truncated = true;
				result.valid = true;
				result.warning = `Prompt truncated from end: ${length} → ${cfg.maxLength} characters`;
				break;

			case 'truncate-middle':
				{
					const halfLength = Math.floor(cfg.maxLength / 2);
					const start = prompt.slice(0, halfLength);
					const end = prompt.slice(length - halfLength);
					const ellipsis =
						'\n\n[... middle section truncated due to length ...]\n\n';
					result.truncatedPrompt = start + ellipsis + end;
					result.truncated = true;
					result.valid = true;
					result.warning = `Prompt truncated from middle: ${length} → ${result.truncatedPrompt.length} characters`;
				}
				break;
		}
	}
	// Check if approaching warning threshold
	else if (length > warningLength) {
		result.warning = `Prompt is ${((length / cfg.maxLength) * 100).toFixed(1)}% of max length (${length}/${cfg.maxLength} chars)`;
	}

	return result;
}

/**
 * Estimate total prompt length including context files
 */
export function estimateTotalPromptLength(
	basePrompt: string,
	contextFiles: Array<{ name: string; size: number }>,
): number {
	// Base prompt
	let total = basePrompt.length;

	// Add context file sizes
	for (const file of contextFiles) {
		total += file.size;
		// Add overhead for file markers (e.g., "--- CLAUDE.md ---")
		total += 100;
	}

	// Add overhead for CLI formatting and metadata
	total += 500;

	return total;
}

/**
 * Smart prompt truncation that preserves important sections
 */
export function smartTruncatePrompt(
	prompt: string,
	maxLength: number,
	options: {
		preserveStart?: number; // Always keep first N chars
		preserveEnd?: number; // Always keep last N chars
		marker?: string; // Truncation marker
	} = {},
): { truncated: string; removed: number } {
	if (prompt.length <= maxLength) {
		return { truncated: prompt, removed: 0 };
	}

	const { preserveStart = 1000, preserveEnd = 500, marker = '\n\n[...]\n\n' } = options;

	const markerLength = marker.length;
	const availableLength = maxLength - markerLength;

	// If we can't preserve requested amounts, adjust proportionally
	const totalPreserve = preserveStart + preserveEnd;
	let actualStart = preserveStart;
	let actualEnd = preserveEnd;

	if (totalPreserve > availableLength) {
		const ratio = availableLength / totalPreserve;
		actualStart = Math.floor(preserveStart * ratio);
		actualEnd = Math.floor(preserveEnd * ratio);
	}

	const start = prompt.slice(0, actualStart);
	const end = prompt.slice(-actualEnd);
	const truncated = start + marker + end;

	return {
		truncated,
		removed: prompt.length - truncated.length,
	};
}
