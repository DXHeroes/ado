/**
 * Auto-Fix Engine
 *
 * Automatically fixes common issues detected by quality validators.
 * Integrates with stuck detection to avoid infinite fix loops.
 */

import type { AttemptRecord, StuckDetector } from './stuck-detector.js';
import type {
	QualityGateConfig,
	ValidationIssue,
	ValidationResult,
	ValidatorContext,
} from './quality-validator.js';

export interface FixStrategy {
	name: string;
	category: ValidationIssue['category'];
	pattern: RegExp;
	fix: (issue: ValidationIssue, context: FixContext) => Promise<FixResult>;
	confidence: number; // 0-1, how confident the fix is correct
}

export interface FixContext {
	workingDirectory: string;
	dryRun?: boolean; // Preview fix without applying
}

export interface FixResult {
	applied: boolean;
	changes: FileChange[];
	message: string;
	verification?: {
		success: boolean;
		remainingIssues: ValidationIssue[];
	};
}

export interface FileChange {
	file: string;
	before: string;
	after: string;
	hunks: Hunk[];
}

export interface Hunk {
	startLine: number;
	endLine: number;
	oldContent: string;
	newContent: string;
}

export interface AutoFixAttempt {
	attemptNumber: number;
	timestamp: string;
	issuesTargeted: number;
	fixesApplied: number;
	fixesSucceeded: number;
	fixesFailed: number;
	remainingIssues: number;
}

/**
 * Auto-fix engine configuration
 */
export interface AutoFixConfig {
	/**
	 * Enable auto-fix
	 */
	enabled: boolean;

	/**
	 * Maximum fix attempts per task
	 */
	maxAttempts: number;

	/**
	 * Minimum confidence to apply fix (0-1)
	 */
	minConfidence: number;

	/**
	 * Verify fixes after applying
	 */
	verifyFixes: boolean;

	/**
	 * Dry run mode (preview without applying)
	 */
	dryRun: boolean;
}

/**
 * Auto-fix engine
 */
export class AutoFixEngine {
	private strategies: FixStrategy[] = [];
	private config: AutoFixConfig;
	private stuckDetector: StuckDetector;
	private attempts: Map<string, AutoFixAttempt[]> = new Map();

	constructor(
		stuckDetector: StuckDetector,
		config?: Partial<AutoFixConfig>,
	) {
		this.stuckDetector = stuckDetector;
		this.config = {
			enabled: true,
			maxAttempts: 5,
			minConfidence: 0.7,
			verifyFixes: true,
			dryRun: false,
			...config,
		};

		this.registerDefaultStrategies();
	}

	/**
	 * Register default fix strategies
	 */
	private registerDefaultStrategies(): void {
		// TypeScript unused variable
		this.registerStrategy({
			name: 'Remove unused variable',
			category: 'type_error',
			pattern: /is declared but never used|is defined but never read/i,
			confidence: 0.9,
			fix: async (issue, _context) => {
				return {
					applied: false,
					changes: [],
					message: `Would remove unused variable at ${issue.file}:${issue.line}`,
				};
			},
		});

		// Missing import
		this.registerStrategy({
			name: 'Add missing import',
			category: 'type_error',
			pattern: /Cannot find name ['"](.+?)['"]/i,
			confidence: 0.6,
			fix: async (issue, _context) => {
				return {
					applied: false,
					changes: [],
					message: `Would add import for ${issue.message} in ${issue.file}`,
				};
			},
		});

		// Lint auto-fix
		this.registerStrategy({
			name: 'ESLint auto-fix',
			category: 'lint_error',
			pattern: /.*/,
			confidence: 0.8,
			fix: async (issue, _context) => {
				return {
					applied: false,
					changes: [],
					message: `Would run eslint --fix on ${issue.file}`,
				};
			},
		});

		// Prettier format
		this.registerStrategy({
			name: 'Prettier format',
			category: 'format_error',
			pattern: /.*/,
			confidence: 1.0,
			fix: async (issue, _context) => {
				return {
					applied: false,
					changes: [],
					message: `Would run prettier --write on ${issue.file}`,
				};
			},
		});
	}

	/**
	 * Register fix strategy
	 */
	registerStrategy(strategy: FixStrategy): void {
		this.strategies.push(strategy);
	}

	/**
	 * Attempt to auto-fix validation issues
	 */
	async autoFix(
		taskId: string,
		validationResults: ValidationResult[],
		context: ValidatorContext,
		_qualityGates: QualityGateConfig,
	): Promise<{
		success: boolean;
		fixesApplied: number;
		remainingIssues: ValidationIssue[];
		shouldRetry: boolean;
		stuck: boolean;
	}> {
		if (!this.config.enabled) {
			return {
				success: false,
				fixesApplied: 0,
				remainingIssues: this.getAllIssues(validationResults),
				shouldRetry: false,
				stuck: false,
			};
		}

		// Get all issues
		const allIssues = this.getAllIssues(validationResults);

		// Check if stuck
		const attemptHistory = this.attempts.get(taskId) ?? [];
		if (attemptHistory.length >= this.config.maxAttempts) {
			return {
				success: false,
				fixesApplied: 0,
				remainingIssues: allIssues,
				shouldRetry: false,
				stuck: true,
			};
		}

		// Record attempt for stuck detection
		const attempt: AttemptRecord = {
			attemptNumber: attemptHistory.length + 1,
			timestamp: new Date().toISOString(),
			errorMessage: allIssues.map((i) => i.message).join('; '),
			changedFiles: [],
			testsPassing: !allIssues.some((i) => i.category === 'test_failure'),
			metrics: {
				linesChanged: 0,
				filesModified: 0,
				testsAdded: 0,
			},
		};

		this.stuckDetector.recordAttempt(taskId, attempt);

		// Check if stuck before applying fixes
		const stuckResult = this.stuckDetector.checkIfStuck(
			taskId,
			new Date().toISOString(),
		);
		if (stuckResult.isStuck) {
			return {
				success: false,
				fixesApplied: 0,
				remainingIssues: allIssues,
				shouldRetry: false,
				stuck: true,
			};
		}

		// Apply fixes
		let fixesApplied = 0;
		let fixesSucceeded = 0;
		const remainingIssues: ValidationIssue[] = [];

		for (const issue of allIssues) {
			// Find matching fix strategy
			const strategy = this.findStrategy(issue);

			if (!strategy) {
				remainingIssues.push(issue);
				continue;
			}

			if (strategy.confidence < this.config.minConfidence) {
				remainingIssues.push(issue);
				continue;
			}

			// Apply fix
			try {
				const fixContext: FixContext = {
					workingDirectory: context.workingDirectory,
					dryRun: this.config.dryRun,
				};

				const result = await strategy.fix(issue, fixContext);

				if (result.applied) {
					fixesApplied++;

					if (result.verification?.success) {
						fixesSucceeded++;
					} else {
						remainingIssues.push(...(result.verification?.remainingIssues ?? [issue]));
					}
				} else {
					remainingIssues.push(issue);
				}
			} catch (error) {
				console.error(`Fix strategy ${strategy.name} failed:`, error);
				remainingIssues.push(issue);
			}
		}

		// Record attempt
		const fixAttempt: AutoFixAttempt = {
			attemptNumber: attemptHistory.length + 1,
			timestamp: new Date().toISOString(),
			issuesTargeted: allIssues.length,
			fixesApplied,
			fixesSucceeded,
			fixesFailed: fixesApplied - fixesSucceeded,
			remainingIssues: remainingIssues.length,
		};

		if (!this.attempts.has(taskId)) {
			this.attempts.set(taskId, []);
		}
		this.attempts.get(taskId)?.push(fixAttempt);

		// Determine if should retry
		const shouldRetry =
			remainingIssues.length > 0 &&
			fixesSucceeded > 0 &&
			attemptHistory.length < this.config.maxAttempts;

		return {
			success: remainingIssues.length === 0,
			fixesApplied,
			remainingIssues,
			shouldRetry,
			stuck: false,
		};
	}

	/**
	 * Find fix strategy for issue
	 */
	private findStrategy(issue: ValidationIssue): FixStrategy | undefined {
		const matchingStrategies = this.strategies.filter((strategy) => {
			if (strategy.category !== issue.category) return false;
			return strategy.pattern.test(issue.message);
		});

		// Return highest confidence strategy
		return matchingStrategies.sort((a, b) => b.confidence - a.confidence)[0];
	}

	/**
	 * Get all issues from validation results
	 */
	private getAllIssues(results: ValidationResult[]): ValidationIssue[] {
		return results.flatMap((r) => r.issues);
	}

	/**
	 * Get attempt history for task
	 */
	getAttemptHistory(taskId: string): AutoFixAttempt[] {
		return this.attempts.get(taskId) ?? [];
	}

	/**
	 * Clear attempt history
	 */
	clearHistory(taskId: string): void {
		this.attempts.delete(taskId);
		this.stuckDetector.clearAttempts(taskId);
	}

	/**
	 * Get statistics
	 */
	getStats(taskId: string): {
		totalAttempts: number;
		totalFixes: number;
		successRate: number;
	} {
		const attempts = this.attempts.get(taskId) ?? [];

		const totalFixes = attempts.reduce((sum, a) => sum + a.fixesApplied, 0);
		const succeededFixes = attempts.reduce((sum, a) => sum + a.fixesSucceeded, 0);

		return {
			totalAttempts: attempts.length,
			totalFixes,
			successRate: totalFixes > 0 ? succeededFixes / totalFixes : 0,
		};
	}
}

/**
 * Create auto-fix engine
 */
export function createAutoFixEngine(
	stuckDetector: StuckDetector,
	config?: Partial<AutoFixConfig>,
): AutoFixEngine {
	return new AutoFixEngine(stuckDetector, config);
}
