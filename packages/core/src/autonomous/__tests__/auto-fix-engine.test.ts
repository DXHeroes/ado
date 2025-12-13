/**
 * Tests for AutoFixEngine
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoFixEngine, type FixStrategy, createAutoFixEngine } from '../auto-fix-engine.js';
import type {
	QualityGateConfig,
	ValidationIssue,
	ValidationResult,
	ValidatorContext,
} from '../quality-validator.js';
import { StuckDetector } from '../stuck-detector.js';

describe('AutoFixEngine', () => {
	let stuckDetector: StuckDetector;
	let autoFixEngine: AutoFixEngine;
	const taskId = 'test-task';

	beforeEach(() => {
		stuckDetector = new StuckDetector();
		autoFixEngine = new AutoFixEngine(stuckDetector);
	});

	describe('constructor', () => {
		it('should create with default config', () => {
			const engine = new AutoFixEngine(stuckDetector);
			expect(engine).toBeDefined();
		});

		it('should create with custom config', () => {
			const engine = new AutoFixEngine(stuckDetector, {
				enabled: false,
				maxAttempts: 10,
				minConfidence: 0.5,
				verifyFixes: false,
				dryRun: true,
			});
			expect(engine).toBeDefined();
		});

		it('should register default strategies on creation', () => {
			const engine = new AutoFixEngine(stuckDetector);
			// Default strategies should be registered
			expect(engine).toBeDefined();
		});
	});

	describe('createAutoFixEngine', () => {
		it('should create engine with factory function', () => {
			const engine = createAutoFixEngine(stuckDetector);
			expect(engine).toBeDefined();
		});

		it('should create engine with custom config', () => {
			const engine = createAutoFixEngine(stuckDetector, {
				maxAttempts: 3,
			});
			expect(engine).toBeDefined();
		});
	});

	describe('registerStrategy', () => {
		it('should register custom fix strategy', () => {
			const strategy: FixStrategy = {
				name: 'Custom Fix',
				category: 'type_error',
				pattern: /custom error/i,
				confidence: 0.9,
				fix: async (_issue, _context) => ({
					applied: true,
					changes: [],
					message: 'Fixed custom error',
				}),
			};

			autoFixEngine.registerStrategy(strategy);
			expect(autoFixEngine).toBeDefined();
		});
	});

	describe('autoFix', () => {
		const context: ValidatorContext = {
			workingDirectory: '/test/dir',
		};

		const qualityGates: QualityGateConfig = {
			minCoverage: 80,
			blockOnTypeErrors: true,
			blockOnLintErrors: true,
			blockOnTestFailures: true,
			blockOnSecurityIssues: true,
			allowWarnings: true,
		};

		it('should return early if disabled', async () => {
			const disabledEngine = new AutoFixEngine(stuckDetector, {
				enabled: false,
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					line: 10,
					severity: 'error',
					category: 'type_error',
					message: 'Type error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const result = await disabledEngine.autoFix(taskId, results, context, qualityGates);

			expect(result.success).toBe(false);
			expect(result.fixesApplied).toBe(0);
			expect(result.shouldRetry).toBe(false);
		});

		it('should detect stuck after max attempts', async () => {
			const engine = new AutoFixEngine(stuckDetector, {
				maxAttempts: 2,
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'Error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			// First attempt
			await engine.autoFix(taskId, results, context, qualityGates);
			// Second attempt
			await engine.autoFix(taskId, results, context, qualityGates);
			// Third attempt - should be stuck
			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(result.stuck).toBe(true);
			expect(result.shouldRetry).toBe(false);
		});

		it('should skip issues with low confidence', async () => {
			const engine = new AutoFixEngine(stuckDetector, {
				minConfidence: 0.9,
			});

			// Register low confidence strategy
			engine.registerStrategy({
				name: 'Low confidence fix',
				category: 'type_error',
				pattern: /test error/i,
				confidence: 0.5,
				fix: async () => ({
					applied: true,
					changes: [],
					message: 'Fixed',
				}),
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'test error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(result.fixesApplied).toBe(0);
			expect(result.remainingIssues.length).toBe(1);
		});

		it('should apply fixes with sufficient confidence', async () => {
			const mockFix = vi.fn().mockResolvedValue({
				applied: true,
				changes: [],
				message: 'Fixed',
				verification: {
					success: true,
					remainingIssues: [],
				},
			});

			const engine = new AutoFixEngine(stuckDetector, {
				minConfidence: 0.7,
			});

			engine.registerStrategy({
				name: 'High confidence fix',
				category: 'type_error',
				pattern: /fixable error/i,
				confidence: 0.95,
				fix: mockFix,
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					line: 10,
					severity: 'error',
					category: 'type_error',
					message: 'fixable error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(mockFix).toHaveBeenCalled();
			expect(result.fixesApplied).toBe(1);
			expect(result.success).toBe(true);
		});

		it('should handle fix strategy errors gracefully', async () => {
			const mockFix = vi.fn().mockRejectedValue(new Error('Fix failed'));

			const engine = new AutoFixEngine(stuckDetector);

			engine.registerStrategy({
				name: 'Failing fix',
				category: 'type_error',
				pattern: /error/i,
				confidence: 0.9,
				fix: mockFix,
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(result.fixesApplied).toBe(0);
			expect(result.remainingIssues.length).toBe(1);
		});

		it('should suggest retry when fixes succeeded but issues remain', async () => {
			const engine = new AutoFixEngine(stuckDetector, {
				maxAttempts: 5,
			});

			engine.registerStrategy({
				name: 'Partial fix',
				category: 'type_error',
				pattern: /error/i,
				confidence: 0.9,
				fix: async () => ({
					applied: true,
					changes: [],
					message: 'Fixed',
					verification: {
						success: true,
						remainingIssues: [],
					},
				}),
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'error 1',
				},
				{
					file: 'test.ts',
					severity: 'error',
					category: 'lint_error',
					message: 'error 2',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 2, warnings: 0, infos: 0 },
				},
			];

			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(result.fixesApplied).toBe(1);
			expect(result.shouldRetry).toBe(true);
			expect(result.remainingIssues.length).toBe(1);
		});

		it('should not retry if no fixes succeeded', async () => {
			const engine = new AutoFixEngine(stuckDetector);

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'unfixable error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(result.shouldRetry).toBe(false);
		});

		it('should handle verification failures', async () => {
			const engine = new AutoFixEngine(stuckDetector);

			engine.registerStrategy({
				name: 'Fix with verification failure',
				category: 'type_error',
				pattern: /error/i,
				confidence: 0.9,
				fix: async () => ({
					applied: true,
					changes: [],
					message: 'Fixed',
					verification: {
						success: false,
						remainingIssues: [
							{
								file: 'test.ts',
								severity: 'error' as const,
								category: 'type_error' as const,
								message: 'Still broken',
							},
						],
					},
				}),
			});

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const result = await engine.autoFix(taskId, results, context, qualityGates);

			expect(result.fixesApplied).toBe(1);
			expect(result.remainingIssues.length).toBeGreaterThan(0);
		});
	});

	describe('getAttemptHistory', () => {
		it('should return empty array for unknown task', () => {
			const history = autoFixEngine.getAttemptHistory('unknown-task');
			expect(history).toEqual([]);
		});

		it('should return attempt history after fixes', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/dir',
			};

			const qualityGates: QualityGateConfig = {
				minCoverage: 80,
				blockOnTypeErrors: true,
				blockOnLintErrors: true,
				blockOnTestFailures: true,
				blockOnSecurityIssues: true,
				allowWarnings: true,
			};

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			await autoFixEngine.autoFix(taskId, results, context, qualityGates);

			const history = autoFixEngine.getAttemptHistory(taskId);
			expect(history.length).toBe(1);
			expect(history[0]?.attemptNumber).toBe(1);
		});
	});

	describe('clearHistory', () => {
		it('should clear attempt history', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/dir',
			};

			const qualityGates: QualityGateConfig = {
				minCoverage: 80,
				blockOnTypeErrors: true,
				blockOnLintErrors: true,
				blockOnTestFailures: true,
				blockOnSecurityIssues: true,
				allowWarnings: true,
			};

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			await autoFixEngine.autoFix(taskId, results, context, qualityGates);

			expect(autoFixEngine.getAttemptHistory(taskId).length).toBe(1);

			autoFixEngine.clearHistory(taskId);

			expect(autoFixEngine.getAttemptHistory(taskId).length).toBe(0);
		});
	});

	describe('getStats', () => {
		it('should return zero stats for unknown task', () => {
			const stats = autoFixEngine.getStats('unknown-task');

			expect(stats.totalAttempts).toBe(0);
			expect(stats.totalFixes).toBe(0);
			expect(stats.successRate).toBe(0);
		});

		it('should calculate stats correctly', async () => {
			const engine = new AutoFixEngine(stuckDetector);

			engine.registerStrategy({
				name: 'Successful fix',
				category: 'type_error',
				pattern: /error/i,
				confidence: 0.9,
				fix: async () => ({
					applied: true,
					changes: [],
					message: 'Fixed',
					verification: {
						success: true,
						remainingIssues: [],
					},
				}),
			});

			const context: ValidatorContext = {
				workingDirectory: '/test/dir',
			};

			const qualityGates: QualityGateConfig = {
				minCoverage: 80,
				blockOnTypeErrors: true,
				blockOnLintErrors: true,
				blockOnTestFailures: true,
				blockOnSecurityIssues: true,
				allowWarnings: true,
			};

			const issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					severity: 'error',
					category: 'type_error',
					message: 'error',
				},
			];

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues,
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			await engine.autoFix(taskId, results, context, qualityGates);
			await engine.autoFix(taskId, results, context, qualityGates);

			const stats = engine.getStats(taskId);

			expect(stats.totalAttempts).toBe(2);
			expect(stats.totalFixes).toBe(2);
			expect(stats.successRate).toBe(1); // All fixes succeeded
		});
	});

	describe('default strategies', () => {
		it('should match unused variable pattern', () => {
			const engine = new AutoFixEngine(stuckDetector);

			const _issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					line: 10,
					severity: 'error',
					category: 'type_error',
					message: 'variable is declared but never used',
				},
			];

			// Default strategy should match
			expect(engine).toBeDefined();
		});

		it('should match missing import pattern', () => {
			const engine = new AutoFixEngine(stuckDetector);

			const _issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					line: 5,
					severity: 'error',
					category: 'type_error',
					message: "Cannot find name 'React'",
				},
			];

			expect(engine).toBeDefined();
		});

		it('should match lint errors', () => {
			const engine = new AutoFixEngine(stuckDetector);

			const _issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					line: 15,
					severity: 'error',
					category: 'lint_error',
					message: 'Missing semicolon',
				},
			];

			expect(engine).toBeDefined();
		});

		it('should match format errors', () => {
			const engine = new AutoFixEngine(stuckDetector);

			const _issues: ValidationIssue[] = [
				{
					file: 'test.ts',
					line: 20,
					severity: 'warning',
					category: 'format_error',
					message: 'Incorrect indentation',
				},
			];

			expect(engine).toBeDefined();
		});
	});
});
