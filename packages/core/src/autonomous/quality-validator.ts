/**
 * Quality Validator
 *
 * Base interfaces and types for language-specific quality validation.
 */

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationCategory =
	| 'type_error'
	| 'lint_error'
	| 'format_error'
	| 'test_failure'
	| 'coverage_insufficient'
	| 'security_issue';

export interface ValidationIssue {
	file: string;
	line?: number;
	column?: number;
	severity: ValidationSeverity;
	category: ValidationCategory;
	rule?: string;
	message: string;
	suggestion?: string;
}

export interface ValidationResult {
	success: boolean;
	language: string;
	validator: string;
	exitCode: number;
	duration: number; // milliseconds
	issues: ValidationIssue[];
	summary: {
		errors: number;
		warnings: number;
		infos: number;
	};
	coverage?: {
		lines: number; // 0-100
		statements: number; // 0-100
		branches: number; // 0-100
		functions: number; // 0-100;
	};
	metadata?: Record<string, unknown>;
}

export interface QualityGateConfig {
	/**
	 * Minimum test coverage percentage (0-100)
	 */
	minCoverage: number;

	/**
	 * Block on type errors
	 */
	blockOnTypeErrors: boolean;

	/**
	 * Block on lint errors
	 */
	blockOnLintErrors: boolean;

	/**
	 * Block on test failures
	 */
	blockOnTestFailures: boolean;

	/**
	 * Block on security issues
	 */
	blockOnSecurityIssues: boolean;

	/**
	 * Allow warnings
	 */
	allowWarnings: boolean;

	/**
	 * Maximum allowed errors
	 */
	maxErrors?: number;
}

export interface ValidatorContext {
	workingDirectory: string;
	files?: string[]; // Specific files to validate
	parallel?: boolean; // Run validators in parallel
}

/**
 * Language validator interface
 */
export interface LanguageValidator {
	readonly language: string;
	readonly validators: string[]; // List of tools (tsc, eslint, etc.)

	/**
	 * Detect if language is present in project
	 */
	detect(context: ValidatorContext): Promise<boolean>;

	/**
	 * Run all validators
	 */
	validate(context: ValidatorContext): Promise<ValidationResult[]>;

	/**
	 * Check if quality gates pass
	 */
	checkQualityGates(
		results: ValidationResult[],
		config: QualityGateConfig,
	): {
		passed: boolean;
		blockers: string[];
		warnings: string[];
	};
}

/**
 * Aggregate validation results from multiple validators
 */
export function aggregateValidationResults(results: ValidationResult[]): ValidationResult {
	const allIssues = results.flatMap((r) => r.issues);

	const errors = allIssues.filter((i) => i.severity === 'error').length;
	const warnings = allIssues.filter((i) => i.severity === 'warning').length;
	const infos = allIssues.filter((i) => i.severity === 'info').length;

	// Calculate average coverage
	const coverageResults = results
		.map((r) => r.coverage)
		.filter((c): c is NonNullable<typeof c> => c !== undefined);

	const avgCoverage =
		coverageResults.length > 0
			? {
					lines: coverageResults.reduce((sum, c) => sum + c.lines, 0) / coverageResults.length,
					statements:
						coverageResults.reduce((sum, c) => sum + c.statements, 0) / coverageResults.length,
					branches:
						coverageResults.reduce((sum, c) => sum + c.branches, 0) / coverageResults.length,
					functions:
						coverageResults.reduce((sum, c) => sum + c.functions, 0) / coverageResults.length,
				}
			: undefined;

	return {
		success: results.every((r) => r.success),
		language: 'aggregate',
		validator: 'all',
		exitCode: results.some((r) => r.exitCode !== 0) ? 1 : 0,
		duration: results.reduce((sum, r) => sum + r.duration, 0),
		issues: allIssues,
		summary: {
			errors,
			warnings,
			infos,
		},
		...(avgCoverage && { coverage: avgCoverage }),
	};
}

/**
 * Create AI-friendly error feedback
 */
export function formatErrorFeedback(results: ValidationResult[]): string {
	let feedback = '';

	for (const result of results) {
		if (result.issues.length === 0) {
			feedback += `✓ ${result.validator}: All checks passed\n`;
			continue;
		}

		feedback += `✗ ${result.validator}: ${result.issues.length} issues found\n`;

		// Group by file
		const byFile = new Map<string, ValidationIssue[]>();
		for (const issue of result.issues) {
			if (!byFile.has(issue.file)) {
				byFile.set(issue.file, []);
			}
			byFile.get(issue.file)?.push(issue);
		}

		// Show top 10 files with most issues
		const sortedFiles = Array.from(byFile.entries())
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, 10);

		for (const [file, issues] of sortedFiles) {
			feedback += `\n  ${file}:\n`;
			for (const issue of issues.slice(0, 5)) {
				// Limit to 5 issues per file
				const location = issue.line
					? `line ${issue.line}${issue.column ? `:${issue.column}` : ''}`
					: 'unknown';
				feedback += `    [${issue.severity}] ${location}: ${issue.message}\n`;
				if (issue.suggestion) {
					feedback += `      → Suggestion: ${issue.suggestion}\n`;
				}
			}
			if (issues.length > 5) {
				feedback += `    ... and ${issues.length - 5} more issues\n`;
			}
		}

		if (byFile.size > 10) {
			feedback += `  ... and ${byFile.size - 10} more files\n`;
		}

		feedback += '\n';
	}

	return feedback;
}

/**
 * Default quality gate configuration
 */
export const DEFAULT_QUALITY_GATES: QualityGateConfig = {
	minCoverage: 80,
	blockOnTypeErrors: true,
	blockOnLintErrors: true,
	blockOnTestFailures: true,
	blockOnSecurityIssues: true,
	allowWarnings: true,
	maxErrors: 0,
};
