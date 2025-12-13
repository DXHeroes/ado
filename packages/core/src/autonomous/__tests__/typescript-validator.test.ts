/**
 * Tests for TypeScriptValidator
 */

import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	QualityGateConfig,
	ValidationResult,
	ValidatorContext,
} from '../quality-validator.js';
import { TypeScriptValidator, createTypeScriptValidator } from '../typescript-validator.js';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('TypeScriptValidator', () => {
	let validator: TypeScriptValidator;

	beforeEach(() => {
		validator = new TypeScriptValidator();
		vi.clearAllMocks();
	});

	describe('constructor', () => {
		it('should create validator with correct properties', () => {
			expect(validator.language).toBe('typescript');
			expect(validator.validators).toEqual(['tsc', 'eslint', 'prettier', 'vitest']);
		});
	});

	describe('createTypeScriptValidator', () => {
		it('should create validator with factory function', () => {
			const val = createTypeScriptValidator();
			expect(val).toBeInstanceOf(TypeScriptValidator);
		});
	});

	describe('detect', () => {
		it('should detect TypeScript in devDependencies', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/project',
			};

			const packageJson = JSON.stringify({
				devDependencies: {
					typescript: '^5.0.0',
				},
			});

			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const result = await validator.detect(context);

			expect(result).toBe(true);
		});

		it('should detect TypeScript in dependencies', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/project',
			};

			const packageJson = JSON.stringify({
				dependencies: {
					typescript: '^5.0.0',
				},
			});

			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const result = await validator.detect(context);

			expect(result).toBe(true);
		});

		it('should not detect TypeScript when missing', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/project',
			};

			const packageJson = JSON.stringify({
				dependencies: {},
			});

			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const result = await validator.detect(context);

			expect(result).toBe(false);
		});

		it('should handle missing package.json', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/project',
			};

			vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

			const result = await validator.detect(context);

			expect(result).toBe(false);
		});
	});

	describe('validate', () => {
		const context: ValidatorContext = {
			workingDirectory: '/test/project',
		};

		it('should run validators in parallel when enabled', async () => {
			const contextParallel: ValidatorContext = {
				...context,
				parallel: true,
			};

			// Mock successful validation
			const mockExec = vi.fn().mockImplementation((_cmd, _opts, callback) => {
				if (typeof callback === 'function') {
					callback(null, { stdout: '', stderr: '' });
				}
				return { stdout: '', stderr: '' };
			});

			vi.mocked(exec).mockImplementation(mockExec as any);

			const packageJson = JSON.stringify({
				devDependencies: { vitest: '^1.0.0' },
			});
			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const results = await validator.validate(contextParallel);

			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBeGreaterThan(0);
		});

		it('should run validators sequentially when parallel disabled', async () => {
			const contextSequential: ValidatorContext = {
				...context,
				parallel: false,
			};

			const mockExec = vi.fn().mockImplementation((_cmd, _opts, callback) => {
				if (typeof callback === 'function') {
					callback(null, { stdout: '', stderr: '' });
				}
				return { stdout: '', stderr: '' };
			});

			vi.mocked(exec).mockImplementation(mockExec as any);

			const packageJson = JSON.stringify({
				devDependencies: { vitest: '^1.0.0' },
			});
			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const results = await validator.validate(contextSequential);

			expect(Array.isArray(results)).toBe(true);
		});
	});

	describe('checkQualityGates', () => {
		const config: QualityGateConfig = {
			minCoverage: 80,
			blockOnTypeErrors: true,
			blockOnLintErrors: true,
			blockOnTestFailures: true,
			blockOnSecurityIssues: true,
			allowWarnings: true,
			maxErrors: 5,
		};

		it('should pass when no issues', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 0,
					duration: 100,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(true);
			expect(gates.blockers).toHaveLength(0);
		});

		it('should block on type errors when configured', () => {
			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							line: 10,
							severity: 'error',
							category: 'type_error',
							message: 'Type error',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(false);
			expect(gates.blockers.some((b) => b.includes('type errors'))).toBe(true);
		});

		it('should block on lint errors when configured', () => {
			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'eslint',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'error',
							category: 'lint_error',
							message: 'Lint error',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(false);
			expect(gates.blockers.some((b) => b.includes('lint errors'))).toBe(true);
		});

		it('should block on test failures when configured', () => {
			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'tests',
							severity: 'error',
							category: 'test_failure',
							message: 'Tests failed',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(false);
			expect(gates.blockers.some((b) => b.includes('Tests failed'))).toBe(true);
		});

		it('should block when coverage below minimum', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 0,
					duration: 100,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
					coverage: {
						lines: 65,
						statements: 70,
						branches: 60,
						functions: 75,
					},
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(false);
			expect(gates.blockers.some((b) => b.includes('Coverage'))).toBe(true);
		});

		it('should pass with sufficient coverage', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 0,
					duration: 100,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
					coverage: {
						lines: 85,
						statements: 87,
						branches: 82,
						functions: 90,
					},
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(true);
		});

		it('should block when exceeding max errors', () => {
			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues: Array.from({ length: 10 }, (_, i) => ({
						file: 'test.ts',
						line: i + 1,
						severity: 'error' as const,
						category: 'type_error' as const,
						message: `Error ${i + 1}`,
					})),
					summary: { errors: 10, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(false);
			expect(gates.blockers.some((b) => b.includes('exceeds maximum'))).toBe(true);
		});

		it('should warn about warnings when not allowed', () => {
			const strictConfig: QualityGateConfig = {
				...config,
				allowWarnings: false,
			};

			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 0,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'warning',
							category: 'type_error',
							message: 'Warning',
						},
					],
					summary: { errors: 0, warnings: 1, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, strictConfig);

			expect(gates.warnings.some((w) => w.includes('warnings'))).toBe(true);
		});

		it('should not block on warnings when allowed', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'eslint',
					exitCode: 0,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'warning',
							category: 'lint_error',
							message: 'Minor issue',
						},
					],
					summary: { errors: 0, warnings: 1, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(true);
		});

		it('should handle multiple validation results', () => {
			const results: ValidationResult[] = [
				{
					success: true,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 0,
					duration: 100,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
				{
					success: true,
					language: 'typescript',
					validator: 'eslint',
					exitCode: 0,
					duration: 100,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
				{
					success: true,
					language: 'typescript',
					validator: 'prettier',
					exitCode: 0,
					duration: 100,
					issues: [],
					summary: { errors: 0, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(true);
			expect(gates.blockers).toHaveLength(0);
		});

		it('should accumulate blockers from multiple results', () => {
			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'error',
							category: 'type_error',
							message: 'Type error',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
				{
					success: false,
					language: 'typescript',
					validator: 'eslint',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'error',
							category: 'lint_error',
							message: 'Lint error',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			expect(gates.passed).toBe(false);
			expect(gates.blockers.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('context handling', () => {
		it('should handle specific files', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/test/project',
				files: ['src/file1.ts', 'src/file2.ts'],
				parallel: false,
			};

			// Mock exec to work with promisify
			const mockExec = vi.fn().mockImplementation((_cmd, _opts, callback) => {
				// Simulate async behavior
				setImmediate(() => {
					if (typeof callback === 'function') {
						callback(null, { stdout: '', stderr: '' });
					}
				});
			});

			// Add __promisify__ property for promisify to work
			(mockExec as any).__promisify__ = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

			vi.mocked(exec).mockImplementation(mockExec as any);

			const packageJson = JSON.stringify({
				devDependencies: { vitest: '^1.0.0' },
			});
			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const results = await validator.validate(context);

			// Validation should complete successfully
			expect(results).toBeDefined();
			expect(results.length).toBeGreaterThan(0);
		});

		it('should use working directory', async () => {
			const context: ValidatorContext = {
				workingDirectory: '/custom/path',
				parallel: false,
			};

			// Mock exec to work with promisify
			const mockExec = vi.fn().mockImplementation((_cmd, _opts, callback) => {
				// Simulate async behavior
				setImmediate(() => {
					if (typeof callback === 'function') {
						callback(null, { stdout: '', stderr: '' });
					}
				});
			});

			// Add __promisify__ property for promisify to work
			(mockExec as any).__promisify__ = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

			vi.mocked(exec).mockImplementation(mockExec as any);

			const packageJson = JSON.stringify({
				devDependencies: { vitest: '^1.0.0' },
			});
			vi.mocked(fs.readFile).mockResolvedValue(packageJson);

			const results = await validator.validate(context);

			// Validation should complete successfully
			expect(results).toBeDefined();
			expect(results.length).toBeGreaterThan(0);
		});
	});

	describe('validator properties', () => {
		it('should have correct language property', () => {
			expect(validator.language).toBe('typescript');
		});

		it('should list all validators', () => {
			const validators = validator.validators;

			expect(validators).toContain('tsc');
			expect(validators).toContain('eslint');
			expect(validators).toContain('prettier');
			expect(validators).toContain('vitest');
		});
	});

	describe('quality gate configuration', () => {
		it('should respect blockOnTypeErrors setting', () => {
			const config: QualityGateConfig = {
				minCoverage: 80,
				blockOnTypeErrors: false,
				blockOnLintErrors: true,
				blockOnTestFailures: true,
				blockOnSecurityIssues: true,
				allowWarnings: true,
			};

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'tsc',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'error',
							category: 'type_error',
							message: 'Type error',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			// Should pass because blockOnTypeErrors is false
			expect(gates.passed).toBe(true);
		});

		it('should respect blockOnLintErrors setting', () => {
			const config: QualityGateConfig = {
				minCoverage: 80,
				blockOnTypeErrors: true,
				blockOnLintErrors: false,
				blockOnTestFailures: true,
				blockOnSecurityIssues: true,
				allowWarnings: true,
			};

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'eslint',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'test.ts',
							severity: 'error',
							category: 'lint_error',
							message: 'Lint error',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			// Should pass because blockOnLintErrors is false
			expect(gates.passed).toBe(true);
		});

		it('should respect blockOnTestFailures setting', () => {
			const config: QualityGateConfig = {
				minCoverage: 80,
				blockOnTypeErrors: true,
				blockOnLintErrors: true,
				blockOnTestFailures: false,
				blockOnSecurityIssues: true,
				allowWarnings: true,
			};

			const results: ValidationResult[] = [
				{
					success: false,
					language: 'typescript',
					validator: 'vitest',
					exitCode: 1,
					duration: 100,
					issues: [
						{
							file: 'tests',
							severity: 'error',
							category: 'test_failure',
							message: 'Test failed',
						},
					],
					summary: { errors: 1, warnings: 0, infos: 0 },
				},
			];

			const gates = validator.checkQualityGates(results, config);

			// Should pass because blockOnTestFailures is false
			expect(gates.passed).toBe(true);
		});
	});
});
