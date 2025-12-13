/**
 * Tests for Expression Evaluator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	evaluateCondition,
	parseConditionExpression,
	validateConditionExpression,
} from '../expression-evaluator.js';
import type { WorkflowContext } from '../workflow-engine.js';

describe('Expression Evaluator', () => {
	let context: WorkflowContext;

	beforeEach(() => {
		context = {
			workflowId: 'test-workflow',
			variables: new Map(),
			results: new Map(),
		};
	});

	describe('evaluateCondition', () => {
		describe('literal booleans', () => {
			it('should evaluate true literal', () => {
				expect(evaluateCondition('true', context)).toBe(true);
			});

			it('should evaluate false literal', () => {
				expect(evaluateCondition('false', context)).toBe(false);
			});

			it('should handle whitespace around literals', () => {
				expect(evaluateCondition('  true  ', context)).toBe(true);
				expect(evaluateCondition('  false  ', context)).toBe(false);
			});
		});

		describe('variable substitution', () => {
			it('should substitute simple variable with $ syntax', () => {
				context.variables.set('success', true);
				expect(evaluateCondition('$success', context)).toBe(true);
			});

			it('should substitute variable with ${} syntax', () => {
				context.variables.set('count', 42);
				expect(evaluateCondition('${count} == 42', context)).toBe(true);
			});

			it('should return null for undefined variables', () => {
				expect(evaluateCondition('$undefined == null', context)).toBe(true);
			});

			it('should substitute string variables', () => {
				context.variables.set('status', 'running');
				expect(evaluateCondition('$status == "running"', context)).toBe(true);
			});

			it('should substitute number variables', () => {
				context.variables.set('age', 25);
				expect(evaluateCondition('$age > 18', context)).toBe(true);
			});

			it('should handle multiple variables in expression', () => {
				context.variables.set('x', 10);
				context.variables.set('y', 20);
				expect(evaluateCondition('$x + $y == 30', context)).toBe(true);
			});
		});

		describe('step results', () => {
			it('should access step result status', () => {
				context.results.set('step1', {
					stepId: 'step1',
					status: 'success',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(evaluateCondition('$results.step1.status == "success"', context)).toBe(true);
			});

			it('should access step result output', () => {
				context.results.set('step1', {
					stepId: 'step1',
					status: 'success',
					output: { value: 42 },
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(
					evaluateCondition('$results.step1.output.value == 42', context),
				).toBe(true);
			});

			it('should return null for non-existent step', () => {
				expect(evaluateCondition('$results.nonexistent.status == null', context)).toBe(true);
			});

			it('should handle failed status', () => {
				context.results.set('step1', {
					stepId: 'step1',
					status: 'failed',
					error: new Error('Test error'),
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(evaluateCondition('$results.step1.status == "failed"', context)).toBe(true);
			});

			it('should handle skipped status', () => {
				context.results.set('step1', {
					stepId: 'step1',
					status: 'skipped',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 0,
				});

				expect(evaluateCondition('$results.step1.status == "skipped"', context)).toBe(true);
			});
		});

		describe('comparison operators', () => {
			it('should evaluate equality (==)', () => {
				context.variables.set('value', 5);
				expect(evaluateCondition('$value == 5', context)).toBe(true);
				expect(evaluateCondition('$value == 10', context)).toBe(false);
			});

			it('should evaluate inequality (!=)', () => {
				context.variables.set('value', 5);
				expect(evaluateCondition('$value != 10', context)).toBe(true);
				expect(evaluateCondition('$value != 5', context)).toBe(false);
			});

			it('should evaluate less than (<)', () => {
				context.variables.set('value', 5);
				expect(evaluateCondition('$value < 10', context)).toBe(true);
				expect(evaluateCondition('$value < 5', context)).toBe(false);
			});

			it('should evaluate greater than (>)', () => {
				context.variables.set('value', 10);
				expect(evaluateCondition('$value > 5', context)).toBe(true);
				expect(evaluateCondition('$value > 10', context)).toBe(false);
			});

			it('should evaluate less than or equal (<=)', () => {
				context.variables.set('value', 5);
				expect(evaluateCondition('$value <= 5', context)).toBe(true);
				expect(evaluateCondition('$value <= 10', context)).toBe(true);
				expect(evaluateCondition('$value <= 4', context)).toBe(false);
			});

			it('should evaluate greater than or equal (>=)', () => {
				context.variables.set('value', 5);
				expect(evaluateCondition('$value >= 5', context)).toBe(true);
				expect(evaluateCondition('$value >= 4', context)).toBe(true);
				expect(evaluateCondition('$value >= 6', context)).toBe(false);
			});
		});

		describe('logical operators', () => {
			it('should evaluate AND (&&)', () => {
				context.variables.set('x', 5);
				context.variables.set('y', 10);
				expect(evaluateCondition('$x == 5 && $y == 10', context)).toBe(true);
				expect(evaluateCondition('$x == 5 && $y == 5', context)).toBe(false);
			});

			it('should evaluate OR (||)', () => {
				context.variables.set('x', 5);
				context.variables.set('y', 10);
				expect(evaluateCondition('$x == 5 || $y == 5', context)).toBe(true);
				expect(evaluateCondition('$x == 10 || $y == 10', context)).toBe(true);
				expect(evaluateCondition('$x == 10 || $y == 5', context)).toBe(false);
			});

			it('should evaluate NOT (!)', () => {
				context.variables.set('flag', false);
				expect(evaluateCondition('!$flag', context)).toBe(true);

				context.variables.set('flag', true);
				expect(evaluateCondition('!$flag', context)).toBe(false);
			});

			it('should handle complex logical expressions', () => {
				context.variables.set('a', 5);
				context.variables.set('b', 10);
				context.variables.set('c', 15);

				expect(evaluateCondition('$a < $b && $b < $c', context)).toBe(true);
				expect(evaluateCondition('($a == 5 && $b == 10) || $c == 20', context)).toBe(true);
				expect(evaluateCondition('$a > 10 || ($b == 10 && $c == 15)', context)).toBe(true);
			});
		});

		describe('grouping with parentheses', () => {
			it('should respect parentheses grouping', () => {
				context.variables.set('a', 5);
				context.variables.set('b', 10);
				context.variables.set('c', 15);

				expect(evaluateCondition('($a + $b) == $c', context)).toBe(true);
				expect(evaluateCondition('$a + ($b + $c) == 30', context)).toBe(true);
			});

			it('should handle nested parentheses', () => {
				context.variables.set('x', 2);
				context.variables.set('y', 3);
				context.variables.set('z', 4);

				expect(evaluateCondition('(($x + $y) * $z) == 20', context)).toBe(true);
			});
		});

		describe('in operator', () => {
			it('should check if value is in array', () => {
				context.variables.set('status', 'running');
				expect(
					evaluateCondition('$status in ["pending", "running", "completed"]', context),
				).toBe(true);
			});

			it('should return false if value not in array', () => {
				context.variables.set('status', 'failed');
				expect(
					evaluateCondition('$status in ["pending", "running", "completed"]', context),
				).toBe(false);
			});

			it('should handle number arrays', () => {
				context.variables.set('code', 200);
				expect(evaluateCondition('$code in [200, 201, 204]', context)).toBe(true);
			});

			it('should handle literal values', () => {
				expect(evaluateCondition('"apple" in ["apple", "banana", "orange"]', context)).toBe(
					true,
				);
				expect(evaluateCondition('5 in [1, 2, 3, 4, 5]', context)).toBe(true);
			});
		});

		describe('matches operator', () => {
			it('should match string against regex pattern', () => {
				context.variables.set('name', 'TestCase');
				expect(evaluateCondition('$name matches "^Test"', context)).toBe(true);
			});

			it('should return false for non-matching pattern', () => {
				context.variables.set('name', 'SomeValue');
				expect(evaluateCondition('$name matches "^Test"', context)).toBe(false);
			});

			it('should handle single quotes in pattern', () => {
				context.variables.set('email', 'test@example.com');
				expect(
					evaluateCondition('$email matches "^[a-z]+@[a-z]+"', context),
				).toBe(true);
			});

			it('should handle case-sensitive matching', () => {
				context.variables.set('text', 'Hello');
				expect(evaluateCondition('$text matches "^hello"', context)).toBe(false);
				expect(evaluateCondition('$text matches "^Hello"', context)).toBe(true);
			});

			it('should handle special regex characters', () => {
				context.variables.set('version', 'v1.2.3');
				expect(evaluateCondition('$version matches "^v[0-9]"', context)).toBe(
					true,
				);
			});
		});

		describe('combined operators', () => {
			it('should combine step results with logical operators', () => {
				context.results.set('step1', {
					stepId: 'step1',
					status: 'success',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				context.results.set('step2', {
					stepId: 'step2',
					status: 'success',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(
					evaluateCondition(
						'$results.step1.status == "success" && $results.step2.status == "success"',
						context,
					),
				).toBe(true);
			});

			it('should combine variables and results', () => {
				context.variables.set('retryCount', 3);
				context.results.set('step1', {
					stepId: 'step1',
					status: 'failed',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(
					evaluateCondition(
						'$results.step1.status == "failed" && $retryCount < 5',
						context,
					),
				).toBe(true);
			});

			it('should use in operator with variables', () => {
				context.variables.set('priority', 'high');
				expect(evaluateCondition('$priority in ["high", "critical"]', context)).toBe(true);
			});

			it('should combine matches with logical operators', () => {
				context.variables.set('branch', 'feature-new-feature');
				context.variables.set('approved', true);

				expect(
					evaluateCondition('$branch matches "^feature" && $approved == true', context),
				).toBe(true);
			});
		});

		describe('error handling', () => {
			it('should throw error for invalid expression', () => {
				expect(() => evaluateCondition('$invalid syntax!', context)).toThrow();
			});

			it('should throw error for syntax errors', () => {
				expect(() => evaluateCondition('$x == ', context)).toThrow();
			});

			it('should provide helpful error message', () => {
				try {
					evaluateCondition('$x ==', context);
					expect.fail('Should have thrown error');
				} catch (error) {
					expect(error instanceof Error).toBe(true);
					expect((error as Error).message).toContain('Failed to evaluate condition');
				}
			});
		});

		describe('edge cases', () => {
			it('should handle empty string variables', () => {
				context.variables.set('empty', '');
				expect(evaluateCondition('$empty == ""', context)).toBe(true);
			});

			it('should handle zero values', () => {
				context.variables.set('zero', 0);
				expect(evaluateCondition('$zero == 0', context)).toBe(true);
				expect(evaluateCondition('$zero > 0', context)).toBe(false);
			});

			it('should handle boolean variables', () => {
				context.variables.set('isActive', true);
				context.variables.set('isDisabled', false);

				expect(evaluateCondition('$isActive', context)).toBe(true);
				expect(evaluateCondition('$isDisabled', context)).toBe(false);
				expect(evaluateCondition('$isActive && !$isDisabled', context)).toBe(true);
			});

			it('should handle null values', () => {
				context.variables.set('nullable', null);
				expect(evaluateCondition('$nullable == null', context)).toBe(true);
			});

			it('should handle object variables', () => {
				context.variables.set('config', { enabled: true, timeout: 5000 });
				expect(evaluateCondition('$config.enabled == true', context)).toBe(true);
				expect(evaluateCondition('$config.timeout > 1000', context)).toBe(true);
			});

			it('should handle array variables', () => {
				context.variables.set('items', [1, 2, 3, 4, 5]);
				expect(evaluateCondition('$items.length == 5', context)).toBe(true);
				expect(evaluateCondition('$items[0] == 1', context)).toBe(true);
			});
		});

		describe('complex real-world scenarios', () => {
			it('should evaluate CI/CD pipeline condition', () => {
				context.variables.set('branch', 'main');
				context.variables.set('testsPassed', true);
				context.results.set('build', {
					stepId: 'build',
					status: 'success',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(
					evaluateCondition(
						'$branch == "main" && $testsPassed && $results.build.status == "success"',
						context,
					),
				).toBe(true);
			});

			it('should evaluate retry logic condition', () => {
				context.variables.set('attemptCount', 2);
				context.variables.set('maxAttempts', 5);
				context.results.set('task', {
					stepId: 'task',
					status: 'failed',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});

				expect(
					evaluateCondition(
						'$results.task.status == "failed" && $attemptCount < $maxAttempts',
						context,
					),
				).toBe(true);
			});

			it('should evaluate approval workflow condition', () => {
				context.variables.set('environment', 'production');
				context.variables.set('approved', false);
				context.variables.set('skipApproval', false);

				expect(
					evaluateCondition(
						'$environment == "production" && (!$approved && !$skipApproval)',
						context,
					),
				).toBe(true);
			});

			it('should evaluate multi-stage deployment condition', () => {
				context.results.set('dev', {
					stepId: 'dev',
					status: 'success',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});
				context.results.set('staging', {
					stepId: 'staging',
					status: 'success',
					startedAt: new Date(),
					completedAt: new Date(),
					duration: 100,
				});
				context.variables.set('prodEnabled', true);

				expect(
					evaluateCondition(
						'$results.dev.status == "success" && $results.staging.status == "success" && $prodEnabled',
						context,
					),
				).toBe(true);
			});
		});
	});

	describe('parseConditionExpression', () => {
		it('should return a function that evaluates expression', () => {
			context.variables.set('x', 10);
			const fn = parseConditionExpression('$x > 5');

			expect(typeof fn).toBe('function');
			expect(fn(context)).toBe(true);
		});

		it('should create reusable evaluator function', () => {
			const fn = parseConditionExpression('$value == 42');

			context.variables.set('value', 42);
			expect(fn(context)).toBe(true);

			context.variables.set('value', 100);
			expect(fn(context)).toBe(false);
		});

		it('should work with different contexts', () => {
			const fn = parseConditionExpression('$status == "success"');

			const context1: WorkflowContext = {
				workflowId: 'wf1',
				variables: new Map([['status', 'success']]),
				results: new Map(),
			};

			const context2: WorkflowContext = {
				workflowId: 'wf2',
				variables: new Map([['status', 'failed']]),
				results: new Map(),
			};

			expect(fn(context1)).toBe(true);
			expect(fn(context2)).toBe(false);
		});
	});

	describe('validateConditionExpression', () => {
		it('should validate valid expression', () => {
			const result = validateConditionExpression('true');
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should validate complex valid expression', () => {
			const result = validateConditionExpression('$x > 5 && $y < 10');
			expect(result.valid).toBe(true);
		});

		it('should detect unbalanced parentheses - too many closing', () => {
			const result = validateConditionExpression('($x + $y))');
			expect(result.valid).toBe(false);
			expect(result.error).toBe('Unbalanced parentheses');
		});

		it('should detect unbalanced parentheses - too many opening', () => {
			const result = validateConditionExpression('(($x + $y)');
			expect(result.valid).toBe(false);
			expect(result.error).toBe('Unbalanced parentheses');
		});

		it('should detect syntax errors', () => {
			const result = validateConditionExpression('$x ==');
			expect(result.valid).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('should validate expression with in operator', () => {
			const result = validateConditionExpression('$x in [1, 2, 3]');
			expect(result.valid).toBe(true);
		});

		it('should validate expression with matches operator', () => {
			const result = validateConditionExpression('$name matches "^test"');
			expect(result.valid).toBe(true);
		});

		it('should validate step result expressions', () => {
			const result = validateConditionExpression('$results.step1.status == "success"');
			expect(result.valid).toBe(true);
		});

		it('should handle balanced nested parentheses', () => {
			const result = validateConditionExpression('(($x + $y) * ($a - $b))');
			expect(result.valid).toBe(true);
		});

		it('should validate logical operators', () => {
			expect(validateConditionExpression('$a && $b').valid).toBe(true);
			expect(validateConditionExpression('$a || $b').valid).toBe(true);
			expect(validateConditionExpression('!$a').valid).toBe(true);
		});

		it('should validate comparison operators', () => {
			expect(validateConditionExpression('$x == 5').valid).toBe(true);
			expect(validateConditionExpression('$x != 5').valid).toBe(true);
			expect(validateConditionExpression('$x < 5').valid).toBe(true);
			expect(validateConditionExpression('$x > 5').valid).toBe(true);
			expect(validateConditionExpression('$x <= 5').valid).toBe(true);
			expect(validateConditionExpression('$x >= 5').valid).toBe(true);
		});
	});

	describe('type coercion and truthiness', () => {
		it('should handle truthy values', () => {
			context.variables.set('str', 'hello');
			context.variables.set('num', 1);
			context.variables.set('arr', [1, 2, 3]);

			expect(evaluateCondition('!!$str', context)).toBe(true);
			expect(evaluateCondition('!!$num', context)).toBe(true);
			expect(evaluateCondition('!!$arr', context)).toBe(true);
		});

		it('should handle falsy values', () => {
			context.variables.set('zero', 0);
			context.variables.set('emptyStr', '');
			context.variables.set('nullVal', null);

			expect(evaluateCondition('!$zero', context)).toBe(true);
			expect(evaluateCondition('!$emptyStr', context)).toBe(true);
			expect(evaluateCondition('!$nullVal', context)).toBe(true);
		});

		it('should handle undefined as falsy', () => {
			expect(evaluateCondition('!$undefined', context)).toBe(true);
		});
	});

	describe('performance and edge cases', () => {
		it('should handle very long variable names', () => {
			const longName = 'veryLongVariableNameThatShouldStillWork';
			context.variables.set(longName, 42);
			expect(evaluateCondition(`$${longName} == 42`, context)).toBe(true);
		});

		it('should handle expressions with many variables', () => {
			for (let i = 0; i < 10; i++) {
				context.variables.set(`var${i}`, i);
			}

			expect(
				evaluateCondition(
					'$var0 + $var1 + $var2 + $var3 + $var4 + $var5 + $var6 + $var7 + $var8 + $var9 == 45',
					context,
				),
			).toBe(true);
		});

		it('should handle deeply nested expressions', () => {
			context.variables.set('a', 1);
			context.variables.set('b', 2);
			context.variables.set('c', 3);
			context.variables.set('d', 4);

			expect(
				evaluateCondition('((($a + $b) + $c) + $d) == 10', context),
			).toBe(true);
		});
	});
});
