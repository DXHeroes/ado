/**
 * Quality Validation Coordinator
 *
 * Coordinates quality validation across multiple languages.
 * Implements parallel execution strategy for multiple validators.
 */

import type {
	LanguageValidator,
	QualityGateConfig,
	ValidationResult,
	ValidatorContext,
} from './quality-validator.js';
import {
	DEFAULT_QUALITY_GATES,
	aggregateValidationResults,
	formatErrorFeedback,
} from './quality-validator.js';

export interface ValidationReport {
	timestamp: string;
	duration: number; // milliseconds
	results: ValidationResult[];
	aggregate: ValidationResult;
	qualityGate: {
		passed: boolean;
		blockers: string[];
		warnings: string[];
	};
	feedback: string; // AI-friendly error feedback
}

/**
 * Quality validation coordinator
 */
export class QualityValidationCoordinator {
	private validators: Map<string, LanguageValidator> = new Map();
	private qualityGates: QualityGateConfig;

	constructor(config?: Partial<QualityGateConfig>) {
		this.qualityGates = {
			...DEFAULT_QUALITY_GATES,
			...config,
		};
	}

	/**
	 * Register language validator
	 */
	registerValidator(validator: LanguageValidator): void {
		this.validators.set(validator.language, validator);
	}

	/**
	 * Detect languages in project
	 */
	async detectLanguages(context: ValidatorContext): Promise<string[]> {
		const detected: string[] = [];

		for (const [language, validator] of this.validators.entries()) {
			try {
				const isPresent = await validator.detect(context);
				if (isPresent) {
					detected.push(language);
				}
			} catch (_error) {}
		}

		return detected;
	}

	/**
	 * Validate project
	 */
	async validate(context: ValidatorContext, languages?: string[]): Promise<ValidationReport> {
		const startTime = Date.now();

		// Auto-detect languages if not specified
		const languagesToValidate = languages ?? (await this.detectLanguages(context));

		// Run validators in parallel
		const validatorPromises = languagesToValidate.map(async (language) => {
			const validator = this.validators.get(language);
			if (!validator) {
				return [];
			}

			try {
				return await validator.validate(context);
			} catch (_error) {
				return [];
			}
		});

		const resultsArrays = await Promise.all(validatorPromises);
		const results = resultsArrays.flat();

		// Aggregate results
		const aggregate = aggregateValidationResults(results);

		// Check quality gates
		const qualityGate = this.checkQualityGates(results);

		// Generate AI-friendly feedback
		const feedback = formatErrorFeedback(results);

		return {
			timestamp: new Date().toISOString(),
			duration: Date.now() - startTime,
			results,
			aggregate,
			qualityGate,
			feedback,
		};
	}

	/**
	 * Check quality gates across all results
	 */
	private checkQualityGates(results: ValidationResult[]): {
		passed: boolean;
		blockers: string[];
		warnings: string[];
	} {
		const allBlockers: string[] = [];
		const allWarnings: string[] = [];

		// Group by language
		const byLanguage = new Map<string, ValidationResult[]>();
		for (const result of results) {
			if (!byLanguage.has(result.language)) {
				byLanguage.set(result.language, []);
			}
			byLanguage.get(result.language)?.push(result);
		}

		// Check each language's quality gates
		for (const [language, langResults] of byLanguage.entries()) {
			const validator = this.validators.get(language);
			if (validator) {
				const { blockers, warnings } = validator.checkQualityGates(langResults, this.qualityGates);
				allBlockers.push(...blockers);
				allWarnings.push(...warnings);
			}
		}

		return {
			passed: allBlockers.length === 0,
			blockers: allBlockers,
			warnings: allWarnings,
		};
	}

	/**
	 * Update quality gate configuration
	 */
	updateQualityGates(config: Partial<QualityGateConfig>): void {
		this.qualityGates = {
			...this.qualityGates,
			...config,
		};
	}

	/**
	 * Get quality gate configuration
	 */
	getQualityGates(): QualityGateConfig {
		return { ...this.qualityGates };
	}

	/**
	 * Get registered validators
	 */
	getValidators(): string[] {
		return Array.from(this.validators.keys());
	}
}

/**
 * Create quality validation coordinator
 */
export function createQualityValidationCoordinator(
	config?: Partial<QualityGateConfig>,
): QualityValidationCoordinator {
	return new QualityValidationCoordinator(config);
}
