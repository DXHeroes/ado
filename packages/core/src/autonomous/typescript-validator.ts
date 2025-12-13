/**
 * TypeScript Validator
 *
 * Validates TypeScript projects using tsc, ESLint, Prettier, and Vitest/Jest.
 * Targets ≥80% test coverage.
 */

import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import type {
	LanguageValidator,
	QualityGateConfig,
	ValidationIssue,
	ValidationResult,
	ValidatorContext,
} from './quality-validator.js';

const execAsync = promisify(exec);

export class TypeScriptValidator implements LanguageValidator {
	readonly language = 'typescript';
	readonly validators = ['tsc', 'eslint', 'prettier', 'vitest'];

	/**
	 * Detect if TypeScript is present
	 */
	async detect(context: ValidatorContext): Promise<boolean> {
		try {
			const packageJson = await fs.readFile(`${context.workingDirectory}/package.json`, 'utf-8');
			const pkg = JSON.parse(packageJson);

			return (
				pkg.devDependencies?.typescript !== undefined || pkg.dependencies?.typescript !== undefined
			);
		} catch {
			return false;
		}
	}

	/**
	 * Run all validators
	 */
	async validate(context: ValidatorContext): Promise<ValidationResult[]> {
		const results: ValidationResult[] = [];

		if (context.parallel) {
			// Run validators in parallel
			const [tscResult, eslintResult, prettierResult, testResult] = await Promise.allSettled([
				this.runTypeCheck(context),
				this.runLint(context),
				this.runFormat(context),
				this.runTests(context),
			]);

			if (tscResult.status === 'fulfilled') results.push(tscResult.value);
			if (eslintResult.status === 'fulfilled') results.push(eslintResult.value);
			if (prettierResult.status === 'fulfilled') results.push(prettierResult.value);
			if (testResult.status === 'fulfilled') results.push(testResult.value);
		} else {
			// Run sequentially
			results.push(await this.runTypeCheck(context));
			results.push(await this.runLint(context));
			results.push(await this.runFormat(context));
			results.push(await this.runTests(context));
		}

		return results;
	}

	/**
	 * Run TypeScript type checking
	 */
	private async runTypeCheck(context: ValidatorContext): Promise<ValidationResult> {
		const startTime = Date.now();
		const issues: ValidationIssue[] = [];

		try {
			const cmd = context.files
				? `pnpm tsc --noEmit ${context.files.join(' ')}`
				: 'pnpm tsc --noEmit';

			const { stdout, stderr } = await execAsync(cmd, {
				cwd: context.workingDirectory,
			});

			// Parse TypeScript errors
			const output = stdout + stderr;
			const lines = output.split('\n');

			for (const line of lines) {
				// Match format: path/to/file.ts(line,col): error TS1234: message
				const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
				if (match) {
					const [, file, line, column, severity, code, message] = match;
					issues.push({
						file: file ?? 'unknown',
						line: Number.parseInt(line ?? '0', 10),
						column: Number.parseInt(column ?? '0', 10),
						severity: severity as 'error' | 'warning',
						category: 'type_error',
						rule: `TS${code}`,
						message: message ?? 'Unknown error',
					});
				}
			}

			return {
				success: issues.filter((i) => i.severity === 'error').length === 0,
				language: 'typescript',
				validator: 'tsc',
				exitCode: 0,
				duration: Date.now() - startTime,
				issues,
				summary: {
					errors: issues.filter((i) => i.severity === 'error').length,
					warnings: issues.filter((i) => i.severity === 'warning').length,
					infos: 0,
				},
			};
		} catch (error) {
			// Type check failed - parse error output
			const output = (error as { stdout?: string; stderr?: string }).stderr ?? '';
			const lines = output.split('\n');

			for (const line of lines) {
				const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
				if (match) {
					const [, file, line, column, severity, code, message] = match;
					issues.push({
						file: file ?? 'unknown',
						line: Number.parseInt(line ?? '0', 10),
						column: Number.parseInt(column ?? '0', 10),
						severity: severity as 'error' | 'warning',
						category: 'type_error',
						rule: `TS${code}`,
						message: message ?? 'Unknown error',
					});
				}
			}

			return {
				success: false,
				language: 'typescript',
				validator: 'tsc',
				exitCode: 1,
				duration: Date.now() - startTime,
				issues,
				summary: {
					errors: issues.filter((i) => i.severity === 'error').length,
					warnings: issues.filter((i) => i.severity === 'warning').length,
					infos: 0,
				},
			};
		}
	}

	/**
	 * Run ESLint
	 */
	private async runLint(context: ValidatorContext): Promise<ValidationResult> {
		const startTime = Date.now();
		const issues: ValidationIssue[] = [];

		try {
			const cmd = context.files
				? `pnpm eslint --format json ${context.files.join(' ')}`
				: 'pnpm eslint --format json .';

			const { stdout } = await execAsync(cmd, {
				cwd: context.workingDirectory,
			});

			// Parse ESLint JSON output
			const results = JSON.parse(stdout) as Array<{
				filePath: string;
				messages: Array<{
					line?: number;
					column?: number;
					severity: number;
					ruleId: string;
					message: string;
				}>;
			}>;

			for (const fileResult of results) {
				for (const msg of fileResult.messages) {
					const issue: ValidationIssue = {
						file: fileResult.filePath,
						severity: msg.severity === 2 ? 'error' : 'warning',
						category: 'lint_error',
						rule: msg.ruleId,
						message: msg.message,
					};
					if (msg.line !== undefined) issue.line = msg.line;
					if (msg.column !== undefined) issue.column = msg.column;
					issues.push(issue);
				}
			}

			return {
				success: issues.filter((i) => i.severity === 'error').length === 0,
				language: 'typescript',
				validator: 'eslint',
				exitCode: 0,
				duration: Date.now() - startTime,
				issues,
				summary: {
					errors: issues.filter((i) => i.severity === 'error').length,
					warnings: issues.filter((i) => i.severity === 'warning').length,
					infos: 0,
				},
			};
		} catch (_error) {
			return {
				success: false,
				language: 'typescript',
				validator: 'eslint',
				exitCode: 1,
				duration: Date.now() - startTime,
				issues,
				summary: {
					errors: issues.filter((i) => i.severity === 'error').length,
					warnings: issues.filter((i) => i.severity === 'warning').length,
					infos: 0,
				},
			};
		}
	}

	/**
	 * Run Prettier format check
	 */
	private async runFormat(context: ValidatorContext): Promise<ValidationResult> {
		const startTime = Date.now();
		const issues: ValidationIssue[] = [];

		try {
			const cmd = context.files
				? `pnpm prettier --check ${context.files.join(' ')}`
				: 'pnpm prettier --check .';

			await execAsync(cmd, {
				cwd: context.workingDirectory,
			});

			return {
				success: true,
				language: 'typescript',
				validator: 'prettier',
				exitCode: 0,
				duration: Date.now() - startTime,
				issues: [],
				summary: {
					errors: 0,
					warnings: 0,
					infos: 0,
				},
			};
		} catch (error) {
			const stderr = (error as { stderr?: string }).stderr ?? '';
			const files = stderr.split('\n').filter((line) => line.trim());

			for (const file of files) {
				issues.push({
					file,
					severity: 'warning',
					category: 'format_error',
					rule: 'prettier',
					message: 'File not formatted according to Prettier rules',
					suggestion: `Run: prettier --write ${file}`,
				});
			}

			return {
				success: false,
				language: 'typescript',
				validator: 'prettier',
				exitCode: 1,
				duration: Date.now() - startTime,
				issues,
				summary: {
					errors: 0,
					warnings: issues.length,
					infos: 0,
				},
			};
		}
	}

	/**
	 * Run tests with coverage
	 */
	private async runTests(context: ValidatorContext): Promise<ValidationResult> {
		const startTime = Date.now();
		const issues: ValidationIssue[] = [];

		try {
			// Try Vitest first, fall back to Jest
			const hasVitest = await this.hasPackage(context.workingDirectory, 'vitest');
			const cmd = hasVitest ? 'pnpm vitest run --coverage' : 'pnpm jest --coverage';

			const { stdout, stderr } = await execAsync(cmd, {
				cwd: context.workingDirectory,
			});

			// Parse coverage (simplified - real implementation would parse coverage reports)
			const output = stdout + stderr;
			const coverageMatch = output.match(
				/All files[^\n]*\|\s+(\d+\.?\d*)\s+\|\s+(\d+\.?\d*)\s+\|\s+(\d+\.?\d*)\s+\|\s+(\d+\.?\d*)/,
			);

			const coverage = coverageMatch
				? {
						statements: Number.parseFloat(coverageMatch[1] ?? '0'),
						branches: Number.parseFloat(coverageMatch[2] ?? '0'),
						functions: Number.parseFloat(coverageMatch[3] ?? '0'),
						lines: Number.parseFloat(coverageMatch[4] ?? '0'),
					}
				: undefined;

			return {
				success: true,
				language: 'typescript',
				validator: hasVitest ? 'vitest' : 'jest',
				exitCode: 0,
				duration: Date.now() - startTime,
				issues: [],
				summary: {
					errors: 0,
					warnings: 0,
					infos: 0,
				},
				...(coverage && { coverage }),
			};
		} catch {
			// Parse test failures
			issues.push({
				file: 'tests',
				severity: 'error',
				category: 'test_failure',
				message: 'Some tests failed',
				suggestion: 'Review test output above',
			});

			return {
				success: false,
				language: 'typescript',
				validator: 'vitest',
				exitCode: 1,
				duration: Date.now() - startTime,
				issues,
				summary: {
					errors: issues.length,
					warnings: 0,
					infos: 0,
				},
			};
		}
	}

	/**
	 * Check if package is installed
	 */
	private async hasPackage(workingDir: string, packageName: string): Promise<boolean> {
		try {
			const packageJson = await fs.readFile(`${workingDir}/package.json`, 'utf-8');
			const pkg = JSON.parse(packageJson);
			return (
				pkg.devDependencies?.[packageName] !== undefined ||
				pkg.dependencies?.[packageName] !== undefined
			);
		} catch {
			return false;
		}
	}

	/**
	 * Check quality gates
	 */
	checkQualityGates(
		results: ValidationResult[],
		config: QualityGateConfig,
	): {
		passed: boolean;
		blockers: string[];
		warnings: string[];
	} {
		const blockers: string[] = [];
		const warnings: string[] = [];

		for (const result of results) {
			const errors = result.issues.filter((i) => i.severity === 'error');
			const warningIssues = result.issues.filter((i) => i.severity === 'warning');

			// Check type errors
			if (config.blockOnTypeErrors && result.validator === 'tsc' && errors.length > 0) {
				blockers.push(`${errors.length} type errors found`);
			}

			// Check lint errors
			if (config.blockOnLintErrors && result.validator === 'eslint' && errors.length > 0) {
				blockers.push(`${errors.length} lint errors found`);
			}

			// Check test failures
			if (
				config.blockOnTestFailures &&
				(result.validator === 'vitest' || result.validator === 'jest') &&
				!result.success
			) {
				blockers.push('Tests failed');
			}

			// Check coverage
			if (result.coverage) {
				if (result.coverage.lines < config.minCoverage) {
					blockers.push(
						`Coverage ${result.coverage.lines.toFixed(1)}% is below minimum ${config.minCoverage}%`,
					);
				}
			}

			// Check max errors
			if (config.maxErrors !== undefined && errors.length > config.maxErrors) {
				blockers.push(`${errors.length} errors exceeds maximum allowed (${config.maxErrors})`);
			}

			// Collect warnings
			if (!config.allowWarnings && warningIssues.length > 0) {
				warnings.push(`${warningIssues.length} warnings found`);
			}
		}

		return {
			passed: blockers.length === 0,
			blockers,
			warnings,
		};
	}
}

/**
 * Create TypeScript validator
 */
export function createTypeScriptValidator(): TypeScriptValidator {
	return new TypeScriptValidator();
}
