/**
 * Tests for logger utilities
 */

import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';

describe('Logger', () => {
	// Using explicit any to avoid complex mock typing issues
	let stdoutSpy: MockInstance;
	let stderrSpy: MockInstance;

	beforeEach(() => {
		stdoutSpy = vi
			.spyOn(process.stdout, 'write')
			.mockImplementation(() => true) as unknown as MockInstance;
		stderrSpy = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true) as unknown as MockInstance;
	});

	afterEach(() => {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
	});

	describe('createLogger', () => {
		it('should create a logger with default config', () => {
			const logger = createLogger();
			expect(logger).toBeDefined();
			expect(typeof logger.info).toBe('function');
			expect(typeof logger.error).toBe('function');
		});

		it('should create a logger with custom config', () => {
			const logger = createLogger({ level: 'debug', format: 'json' });
			expect(logger).toBeDefined();
		});
	});

	describe('log levels', () => {
		it('should log info messages', () => {
			const logger = createLogger({ level: 'info', format: 'pretty' });
			logger.info('Test message');

			expect(stdoutSpy).toHaveBeenCalled();
			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain('Test message');
		});

		it('should log error messages to stderr', () => {
			const logger = createLogger({ level: 'error', format: 'pretty' });
			logger.error('Error message');

			expect(stderrSpy).toHaveBeenCalled();
			const output = stderrSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain('Error message');
		});

		it('should respect log level hierarchy', () => {
			const logger = createLogger({ level: 'warn', format: 'pretty' });

			logger.debug('Debug message');
			logger.info('Info message');
			logger.warn('Warn message');

			// Debug and info should not be logged when level is warn
			expect(stdoutSpy).toHaveBeenCalledTimes(1);
			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain('Warn message');
		});
	});

	describe('JSON format', () => {
		it('should output JSON when format is json', () => {
			const logger = createLogger({ level: 'info', format: 'json' });
			logger.info('Test message');

			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			const parsed = JSON.parse(output);

			expect(parsed.level).toBe('info');
			expect(parsed.msg).toBe('Test message');
			expect(parsed.time).toBeDefined();
		});

		it('should include data in JSON output', () => {
			const logger = createLogger({ level: 'info', format: 'json' });
			logger.info('Test message', { key: 'value' });

			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			const parsed = JSON.parse(output);

			expect(parsed.data.key).toBe('value');
		});
	});

	describe('child logger', () => {
		it('should create child logger with prefix', () => {
			const logger = createLogger({ level: 'info', format: 'pretty' });
			const child = logger.child('prefix');

			child.info('Child message');

			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain('[prefix]');
		});
	});

	describe('log with data', () => {
		it('should log additional data', () => {
			const logger = createLogger({ level: 'info', format: 'pretty' });
			logger.info('Message with data', { count: 42, items: ['a', 'b'] });

			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain('Message with data');
		});

		it('should handle error objects in data', () => {
			const logger = createLogger({ level: 'info', format: 'json' });
			const error = new Error('Test error');
			logger.info('Error occurred', { error });

			const output = stdoutSpy.mock.calls[0]?.[0] as string;
			const parsed = JSON.parse(output);

			expect(parsed.error.message).toBe('Test error');
		});
	});
});
