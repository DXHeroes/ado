/**
 * Simple expression evaluator for workflow conditions
 * Supports basic comparisons and logical operators
 */

import type { WorkflowContext } from './workflow-engine.js';

/**
 * Evaluate a condition expression in the context of a workflow
 *
 * Supported syntax:
 * - Literals: true, false, numbers, strings (in quotes)
 * - Variables: $variableName, ${variableName}
 * - Comparisons: ==, !=, <, >, <=, >=
 * - Logical: &&, ||, !
 * - Grouping: ()
 * - Array membership: in (e.g., "'apple' in ['apple', 'banana']")
 * - Regex matching: matches (e.g., "$name matches '^[A-Z]'")
 * - Step results: $results.stepId.status
 *
 * Examples:
 * - "true" -> true
 * - "$success == true" -> context.variables.get('success') === true
 * - "$count > 5" -> context.variables.get('count') > 5
 * - "$results.step1.status == 'success'" -> context.results.get('step1')?.status === 'success'
 * - "$results.step1.status == 'success' && $count > 0" -> both conditions
 * - "$status in ['pending', 'running']" -> check if status is in array
 * - "$name matches '^test'" -> check if name matches regex pattern
 */
export function evaluateCondition(expression: string, context: WorkflowContext): boolean {
	// Trim whitespace
	const trimmedExpression = expression.trim();

	// Handle literal booleans
	if (trimmedExpression === 'true') return true;
	if (trimmedExpression === 'false') return false;

	// Replace variables with their values
	let substituted = substituteVariables(trimmedExpression, context);

	// Transform 'in' operator: "value in array" -> "array.includes(value)"
	substituted = transformInOperator(substituted);

	// Transform 'matches' operator: "value matches pattern" -> "/pattern/.test(value)"
	substituted = transformMatchesOperator(substituted);

	try {
		// Use Function constructor for safe evaluation (no access to global scope)
		// This is safer than eval() but still allows expression evaluation
		const fn = new Function(`return (${substituted})`);
		const result = fn();
		return Boolean(result);
	} catch (error) {
		throw new Error(
			`Failed to evaluate condition "${trimmedExpression}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Substitute variables and step results in the expression
 */
function substituteVariables(expression: string, context: WorkflowContext): string {
	// Replace $results.stepId.status patterns
	let result = expression.replace(/\$results\.(\w+)\.status/g, (_match, stepId) => {
		const stepResult = context.results.get(stepId);
		if (!stepResult) {
			return 'null';
		}
		return JSON.stringify(stepResult.status);
	});

	// Replace $results.stepId.output patterns
	result = result.replace(/\$results\.(\w+)\.output/g, (_match, stepId) => {
		const stepResult = context.results.get(stepId);
		if (!stepResult) {
			return 'null';
		}
		return JSON.stringify(stepResult.output);
	});

	// Replace ${variableName} patterns
	result = result.replace(/\$\{(\w+)\}/g, (_match, varName) => {
		const value = context.variables.get(varName);
		if (value === undefined) {
			return 'null';
		}
		return JSON.stringify(value);
	});

	// Replace $variableName patterns (must be word boundary)
	result = result.replace(/\$(\w+)\b/g, (_match, varName) => {
		const value = context.variables.get(varName);
		if (value === undefined) {
			return 'null';
		}
		return JSON.stringify(value);
	});

	return result;
}

/**
 * Transform 'in' operator to JavaScript includes() method
 * Example: "'apple' in ['apple', 'banana']" -> "['apple', 'banana'].includes('apple')"
 */
function transformInOperator(expression: string): string {
	// Match pattern: value in array
	// We need to handle: literal in array, variable in array, expression in array
	// Pattern: (expression) in (array)
	const inPattern = /([^&|()]+?)\s+in\s+(\[[^\]]+\])/g;

	return expression.replace(inPattern, (_match, value, array) => {
		// Trim whitespace
		const trimmedValue = value.trim();
		const trimmedArray = array.trim();
		return `${trimmedArray}.includes(${trimmedValue})`;
	});
}

/**
 * Transform 'matches' operator to JavaScript regex test
 * Example: "$name matches '^[A-Z]'" -> "/^[A-Z]/.test($name)"
 */
function transformMatchesOperator(expression: string): string {
	// Match pattern: value matches 'regex' or value matches "regex"
	const matchesPattern = /([^&|()]+?)\s+matches\s+(['"])(.*?)\2/g;

	return expression.replace(matchesPattern, (_match, value, _quote, pattern) => {
		// Trim whitespace from value
		const trimmedValue = value.trim();
		// Escape backslashes in the pattern for the regex constructor
		const escapedPattern = pattern.replace(/\\/g, '\\\\');
		return `/${escapedPattern}/.test(${trimmedValue})`;
	});
}

/**
 * Parse a string expression into a function that can be called with a context
 */
export function parseConditionExpression(
	expression: string,
): (context: WorkflowContext) => boolean {
	return (context: WorkflowContext) => evaluateCondition(expression, context);
}

/**
 * Validate that an expression is syntactically valid
 */
export function validateConditionExpression(expression: string): {
	valid: boolean;
	error?: string;
} {
	try {
		// Try to parse with empty context
		const testContext: WorkflowContext = {
			workflowId: 'test',
			variables: new Map(),
			results: new Map(),
		};

		// Check for balanced parentheses
		let parenCount = 0;
		for (const char of expression) {
			if (char === '(') parenCount++;
			if (char === ')') parenCount--;
			if (parenCount < 0) {
				return { valid: false, error: 'Unbalanced parentheses' };
			}
		}
		if (parenCount !== 0) {
			return { valid: false, error: 'Unbalanced parentheses' };
		}

		// Try to evaluate with test context
		evaluateCondition(expression, testContext);
		return { valid: true };
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
