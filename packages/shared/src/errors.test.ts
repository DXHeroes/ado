/**
 * Tests for error handling utilities
 */

import { describe, expect, it } from 'vitest';
import {
	AdoError,
	ConfigError,
	NoProvidersError,
	ProviderError,
	ProviderNotAvailableError,
	RateLimitError,
	StateError,
	TaskError,
	formatError,
	getRemediation,
	isAdoError,
} from './errors.js';

describe('AdoError', () => {
	it('should create an error with required properties', () => {
		const error = new AdoError({
			message: 'Test error',
			code: 'TEST_ERROR',
			recoverable: false,
			remediation: undefined,
			cause: undefined,
		});

		expect(error.message).toBe('Test error');
		expect(error.code).toBe('TEST_ERROR');
		expect(error.recoverable).toBe(false);
		expect(error.remediation).toBeUndefined();
		expect(error.name).toBe('AdoError');
	});

	it('should create an error with all options', () => {
		const cause = new Error('Original error');
		const error = new AdoError({
			message: 'Test error',
			code: 'TEST_ERROR',
			recoverable: true,
			remediation: 'Try again',
			cause,
		});

		expect(error.recoverable).toBe(true);
		expect(error.remediation).toBe('Try again');
		expect(error.cause).toBe(cause);
	});
});

describe('ConfigError', () => {
	it('should have correct defaults', () => {
		const error = new ConfigError('Invalid config');

		expect(error.code).toBe('CONFIG_ERROR');
		expect(error.recoverable).toBe(false);
		expect(error.remediation).toContain('ado.config.yaml');
	});

	it('should allow custom remediation', () => {
		const error = new ConfigError('Invalid config', 'Check syntax');

		expect(error.remediation).toBe('Check syntax');
	});
});

describe('ProviderError', () => {
	it('should include provider ID in message', () => {
		const error = new ProviderError('claude-code', 'Connection failed');

		expect(error.message).toContain('claude-code');
		expect(error.message).toContain('Connection failed');
		expect(error.providerId).toBe('claude-code');
	});
});

describe('ProviderNotAvailableError', () => {
	it('should have helpful remediation', () => {
		const error = new ProviderNotAvailableError('claude-code');

		expect(error.recoverable).toBe(true);
		expect(error.remediation).toContain('ado status');
	});
});

describe('RateLimitError', () => {
	it('should handle rate limit with reset time', () => {
		const resetsAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
		const error = new RateLimitError('claude-code', { resetsAt });

		expect(error.resetsAt).toBe(resetsAt);
		expect(error.remediation).toContain('minutes');
	});

	it('should handle rate limit without reset time', () => {
		const error = new RateLimitError('claude-code');

		expect(error.resetsAt).toBeUndefined();
		expect(error.remediation).toContain('API fallback');
	});
});

describe('TaskError', () => {
	it('should truncate task ID in message', () => {
		const error = new TaskError('12345678-abcd-efgh-ijkl-mnopqrstuvwx', 'Execution failed');

		expect(error.message).toContain('12345678');
		expect(error.message).not.toContain('abcd');
	});
});

describe('NoProvidersError', () => {
	it('should have comprehensive remediation', () => {
		const error = new NoProvidersError();

		expect(error.remediation).toContain('ado.config.yaml');
		expect(error.remediation).toContain('Rate limits');
	});
});

describe('StateError', () => {
	it('should mention .ado directory', () => {
		const error = new StateError('Database corrupted');

		expect(error.remediation).toContain('.ado');
	});
});

describe('isAdoError', () => {
	it('should return true for AdoError instances', () => {
		expect(
			isAdoError(
				new AdoError({
					message: 'test',
					code: 'TEST',
					recoverable: false,
					remediation: undefined,
					cause: undefined,
				}),
			),
		).toBe(true);
		expect(isAdoError(new ConfigError('test'))).toBe(true);
		expect(isAdoError(new ProviderError('id', 'test'))).toBe(true);
	});

	it('should return false for other errors', () => {
		expect(isAdoError(new Error('test'))).toBe(false);
		expect(isAdoError(null)).toBe(false);
		expect(isAdoError('error')).toBe(false);
	});
});

describe('getRemediation', () => {
	it('should return remediation for AdoError', () => {
		const error = new ConfigError('test', 'Fix it');
		expect(getRemediation(error)).toBe('Fix it');
	});

	it('should return undefined for non-AdoError', () => {
		expect(getRemediation(new Error('test'))).toBeUndefined();
	});
});

describe('formatError', () => {
	it('should format AdoError with remediation', () => {
		const error = new ConfigError('Invalid', 'Fix config');
		const formatted = formatError(error);

		expect(formatted).toContain('ConfigError');
		expect(formatted).toContain('Invalid');
		expect(formatted).toContain('Remediation');
	});

	it('should format regular Error', () => {
		const error = new Error('Something failed');
		expect(formatError(error)).toContain('Something failed');
	});

	it('should handle non-error values', () => {
		expect(formatError('string error')).toBe('string error');
	});
});
