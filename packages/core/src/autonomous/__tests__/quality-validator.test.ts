/**
 * Tests for QualityValidator
 */

import { describe, it, expect } from 'vitest';
import {
	aggregateValidationResults,
	formatErrorFeedback,
	DEFAULT_QUALITY_GATES,
	type ValidationResult,
	type ValidationIssue,
	type QualityGateConfig,
} from '../quality-validator.js';

describe('QualityValidator', () => {
	describe('aggregateValidationResults', () => {
		it('should aggregate multiple validation results', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 0,
					duration: 1000,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
				{
					success: true,
					language: 'typescript',
					validator: 'biome',
					exitCode: 0,
					duration: 500,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
			];

			const aggregated = aggregateValidationResults(results);

			expect(aggregated.success).toBe(true);
			expect(aggregated.language).toBe('aggregate');
			expect(aggregated.validator).toBe('all');
			expect(aggregated.duration).toBe(1500);
		});

		it('should aggregate issues from all validators', () => {
			const issue1: ValidationIssue = {
				file: 'test1.ts',
				line: 10,
				severity: 'error',
				category: 'type_error',
				message: 'Type error',
			};
			const issue2: ValidationIssue = {
				file: 'test2.ts',
				line: 20,
				severity: 'warning',
				category: 'lint_error',
				message: 'Lint warning',
			};

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 1000,
					issues: [issue1],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
				{
					success: true,
					language: 'typescript',
					validator: 'biome',
					exitCode: 0,
					duration: 500,
					issues: [issue2],
					summary: { errors: 0, warnings: 1, infos: 0 },
				},
			];

			const aggregated = aggregateValidationResults(results);

			expect(aggregated.issues).toHaveLength(2);
			expect(aggregated.summary.errors).toBe(1);
			expect(aggregated.summary.warnings).toBe(1);
		});

		it('should mark success as false if any validator fails', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 0,
					duration: 1000,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
				{
					success: false,
					language: 'typescript',
					validator: 'biome',
					exitCode: 1,
					duration: 500,
					issues: [],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const aggregated = aggregateValidationResults(results);

			expect(aggregated.success).toBe(false);
			expect(aggregated.exitCode).toBe(1);
		});

		it('should calculate average coverage', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 0,
					duration: 1000,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
					coverage: {
						lines: 80,
						statements: 80,
						branches: 70,
						functions: 85,
					},
				},
				{
					success: true,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 0,
					duration: 1000,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
					coverage: {
						lines: 90,
						statements: 90,
						branches: 80,
						functions: 95,
					},
				},
			];

			const aggregated = aggregateValidationResults(results);

			expect(aggregated.coverage).toBeDefined();
			expect(aggregated.coverage?.lines).toBe(85);
			expect(aggregated.coverage?.statements).toBe(85);
			expect(aggregated.coverage?.branches).toBe(75);
			expect(aggregated.coverage?.functions).toBe(90);
		});

		it('should handle empty results array', () => {
			const aggregated = aggregateValidationResults([]);

			expect(aggregated.success).toBe(true);
			expect(aggregated.issues).toEqual([]);
			expect(aggregated.summary.errors).toBe(0);
		});
	});

	describe('formatErrorFeedback', () => {
		it('should format errors for AI consumption', () => {
			const issue: ValidationIssue = {
				file: 'test.ts',
				line: 10,
				column: 5,
				severity: 'error',
				category: 'type_error',
				message: 'Type "string" is not assignable to type "number"',
			};

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 1000,
					issues: [issue],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const feedback = formatErrorFeedback(results);

			expect(feedback).toContain('tsc');
			expect(feedback).toContain('test.ts');
			expect(feedback).toContain('line 10');
			expect(feedback).toContain('Type "string" is not assignable');
		});

		it('should include suggestions when available', () => {
			const issue: ValidationIssue = {
				file: 'test.ts',
				line: 10,
				severity: 'error',
				category: 'type_error',
				message: 'Missing return type',
				suggestion: 'Add ": number" return type annotation',
			};

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 1000,
					issues: [issue],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const feedback = formatErrorFeedback(results);

			expect(feedback).toContain('Suggestion');
			expect(feedback).toContain('Add ": number" return type annotation');
		});

		it('should show success message for passing validators', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'biome',
					exitCode: 0,
					duration: 500,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
			];

			const feedback = formatErrorFeedback(results);

			expect(feedback).toContain('✓');
			expect(feedback).toContain('biome');
			expect(feedback).toContain('All checks passed');
		});

		it('should limit issues per file to 5', () => {
			const issues: ValidationIssue[] = Array.from({ length: 10 }, (_, i) => ({
				file: 'test.ts',
				line: i + 1,
				severity: 'error' as const,
				category: 'type_error' as const,
				message: `Error ${i + 1}`,
			}));

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 1000,
					issues,
					summary: { errors: 10, warnings: 0, infos: 0 },
				},
			];

			const feedback = formatErrorFeedback(results);

			expect(feedback).toContain('and 5 more issues');
		});

		it('should group issues by file', () => {
			const issues: ValidationIssue[] = [
				{
					file: 'file1.ts',
					line: 10,
					severity: 'error',
					category: 'type_error',
					message: 'Error in file1',
				},
				{
					file: 'file2.ts',
					line: 20,
					severity: 'error',
					category: 'type_error',
					message: 'Error in file2',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 1000,
					issues,
					summary: { errors: 2, warnings: 0, infos: 0 },
				},
			];

			const feedback = formatErrorFeedback(results);

			expect(feedback).toContain('file1.ts');
			expect(feedback).toContain('file2.ts');
		});
	});

	describe('DEFAULT_QUALITY_GATES', () => {
		it('should have sensible defaults', () => {
			expect(DEFAULT_QUALITY_GATES.minCoverage).toBe(80);
			expect(DEFAULT_QUALITY_GATES.blockOnTypeErrors).toBe(true);
			expect(DEFAULT_QUALITY_GATES.blockOnLintErrors).toBe(true);
			expect(DEFAULT_QUALITY_GATES.blockOnTestFailures).toBe(true);
			expect(DEFAULT_QUALITY_GATES.blockOnSecurityIssues).toBe(true);
			expect(DEFAULT_QUALITY_GATES.allowWarnings).toBe(true);
			expect(DEFAULT_QUALITY_GATES.maxErrors).toBe(0);
		});
	});

	describe('quality gate validation', () => {
		it('should pass quality gates with no errors', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 0,
					duration: 1000,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
					coverage: {
						lines: 85,
						statements: 85,
						branches: 80,
						functions: 90,
					},
				},
			];

			const aggregated = aggregateValidationResults(results);

			expect(aggregated.success).toBe(true);
			expect(aggregated.coverage?.lines).toBeGreaterThanOrEqual(
				DEFAULT_QUALITY_GATES.minCoverage,
			);
		});

		it('should identify coverage below threshold', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 0,
					duration: 1000,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
					coverage: {
						lines: 60,
						statements: 60,
						branches: 50,
						functions: 70,
					},
				},
			];

			const aggregated = aggregateValidationResults(results);

			expect(aggregated.coverage?.lines).toBeLessThan(DEFAULT_QUALITY_GATES.minCoverage);
		});
	});

	describe('validation issue categorization', () => {
		it('should categorize type errors correctly', () => {
			const issue: ValidationIssue = {
				file: 'test.ts',
				line: 10,
				severity: 'error',
				category: 'type_error',
				rule: 'TS2322',
				message: 'Type error',
			};

			expect(issue.category).toBe('type_error');
			expect(issue.severity).toBe('error');
		});

		it('should categorize lint errors correctly', () => {
			const issue: ValidationIssue = {
				file: 'test.ts',
				line: 10,
				severity: 'warning',
				category: 'lint_error',
				rule: 'no-unused-vars',
				message: 'Unused variable',
			};

			expect(issue.category).toBe('lint_error');
			expect(issue.severity).toBe('warning');
		});

		it('should categorize test failures correctly', () => {
			const issue: ValidationIssue = {
				file: 'test.test.ts',
				line: 20,
				severity: 'error',
				category: 'test_failure',
				message: 'Test failed: expected true to be false',
			};

			expect(issue.category).toBe('test_failure');
			expect(issue.severity).toBe('error');
		});
	});
});
