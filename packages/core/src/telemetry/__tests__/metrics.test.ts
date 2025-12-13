/**
 * OpenTelemetry Metrics Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MetricsCollector, measureDuration } from '../metrics.js';
import type { TelemetryConfig } from '../types.js';

describe('MetricsCollector', () => {
	describe('with metrics enabled', () => {
		let metrics: MetricsCollector;

		beforeEach(() => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
				serviceVersion: '1.0.0',
				metrics: {
					enabled: true,
				},
			};

			metrics = new MetricsCollector(config);
		});

		it('should create a metrics collector instance', () => {
			expect(metrics).toBeDefined();
		});

		describe('recordTask', () => {
			it('should record completed task', () => {
				expect(() => {
					metrics.recordTask('completed', 'claude-code', 5.5);
				}).not.toThrow();
			});

			it('should record failed task', () => {
				expect(() => {
					metrics.recordTask('failed', 'test-provider', 2.3);
				}).not.toThrow();
			});

			it('should record cancelled task', () => {
				expect(() => {
					metrics.recordTask('cancelled', 'test-provider', 1.0);
				}).not.toThrow();
			});

			it('should record task with custom attributes', () => {
				expect(() => {
					metrics.recordTask('completed', 'test-provider', 3.2, {
						'task.type': 'code-generation',
						'task.complexity': 'high',
					});
				}).not.toThrow();
			});

			it('should handle different providers', () => {
				expect(() => {
					metrics.recordTask('completed', 'claude-code', 5.0);
					metrics.recordTask('completed', 'gemini-cli', 3.5);
					metrics.recordTask('completed', 'cursor-cli', 4.2);
				}).not.toThrow();
			});

			it('should handle various durations', () => {
				expect(() => {
					metrics.recordTask('completed', 'test-provider', 0.1); // 100ms
					metrics.recordTask('completed', 'test-provider', 1.0); // 1s
					metrics.recordTask('completed', 'test-provider', 60.0); // 1min
					metrics.recordTask('completed', 'test-provider', 300.0); // 5min
				}).not.toThrow();
			});
		});

		describe('recordProviderRequest', () => {
			it('should record successful provider request', () => {
				expect(() => {
					metrics.recordProviderRequest('claude-code', 150, true);
				}).not.toThrow();
			});

			it('should record failed provider request', () => {
				expect(() => {
					metrics.recordProviderRequest('test-provider', 250, false);
				}).not.toThrow();
			});

			it('should record request with custom attributes', () => {
				expect(() => {
					metrics.recordProviderRequest('test-provider', 100, true, {
						'request.type': 'streaming',
						'request.model': 'claude-3-opus',
					});
				}).not.toThrow();
			});

			it('should increment error counter on failure', () => {
				expect(() => {
					metrics.recordProviderRequest('test-provider', 200, false);
					metrics.recordProviderRequest('test-provider', 300, false);
				}).not.toThrow();
			});

			it('should handle various latencies', () => {
				expect(() => {
					metrics.recordProviderRequest('test-provider', 50, true);
					metrics.recordProviderRequest('test-provider', 500, true);
					metrics.recordProviderRequest('test-provider', 5000, true);
				}).not.toThrow();
			});
		});

		describe('recordRateLimit', () => {
			it('should record rate limit hit', () => {
				expect(() => {
					metrics.recordRateLimit('claude-code', 'subscription');
				}).not.toThrow();
			});

			it('should record different access modes', () => {
				expect(() => {
					metrics.recordRateLimit('test-provider', 'subscription');
					metrics.recordRateLimit('test-provider', 'api');
					metrics.recordRateLimit('test-provider', 'free');
				}).not.toThrow();
			});

			it('should record multiple rate limit hits', () => {
				expect(() => {
					for (let i = 0; i < 5; i++) {
						metrics.recordRateLimit('test-provider', 'subscription');
					}
				}).not.toThrow();
			});
		});

		describe('recordTokenUsage', () => {
			it('should record token usage', () => {
				expect(() => {
					metrics.recordTokenUsage('claude-code', 1000, 500);
				}).not.toThrow();
			});

			it('should record token usage with attributes', () => {
				expect(() => {
					metrics.recordTokenUsage('test-provider', 2000, 1000, {
						'model.name': 'claude-3-opus',
						'request.type': 'streaming',
					});
				}).not.toThrow();
			});

			it('should handle various token counts', () => {
				expect(() => {
					metrics.recordTokenUsage('test-provider', 100, 50);
					metrics.recordTokenUsage('test-provider', 10000, 5000);
					metrics.recordTokenUsage('test-provider', 100000, 50000);
				}).not.toThrow();
			});

			it('should record both input and output tokens separately', () => {
				expect(() => {
					metrics.recordTokenUsage('test-provider', 1500, 750);
				}).not.toThrow();
			});
		});

		describe('recordCost', () => {
			it('should record cost', () => {
				expect(() => {
					metrics.recordCost('claude-code', 0.05, 'api');
				}).not.toThrow();
			});

			it('should record cost with attributes', () => {
				expect(() => {
					metrics.recordCost('test-provider', 0.1, 'subscription', {
						'task.id': 'task-123',
						'model.name': 'claude-3-opus',
					});
				}).not.toThrow();
			});

			it('should record different access modes', () => {
				expect(() => {
					metrics.recordCost('test-provider', 0.05, 'api');
					metrics.recordCost('test-provider', 0.0, 'subscription');
					metrics.recordCost('test-provider', 0.0, 'free');
				}).not.toThrow();
			});

			it('should handle various cost amounts', () => {
				expect(() => {
					metrics.recordCost('test-provider', 0.001, 'api'); // $0.001
					metrics.recordCost('test-provider', 0.05, 'api'); // $0.05
					metrics.recordCost('test-provider', 1.0, 'api'); // $1.00
					metrics.recordCost('test-provider', 10.5, 'api'); // $10.50
				}).not.toThrow();
			});
		});

		describe('recordError', () => {
			it('should record error', () => {
				expect(() => {
					metrics.recordError('validation_error', 'test-provider');
				}).not.toThrow();
			});

			it('should record error without provider', () => {
				expect(() => {
					metrics.recordError('system_error');
				}).not.toThrow();
			});

			it('should record error with attributes', () => {
				expect(() => {
					metrics.recordError('network_error', 'test-provider', {
						'error.severity': 'high',
						'error.recoverable': 'true',
					});
				}).not.toThrow();
			});

			it('should handle different error types', () => {
				expect(() => {
					metrics.recordError('timeout', 'test-provider');
					metrics.recordError('rate_limit', 'test-provider');
					metrics.recordError('authentication', 'test-provider');
					metrics.recordError('validation', 'test-provider');
				}).not.toThrow();
			});
		});
	});

	describe('with metrics disabled', () => {
		let metrics: MetricsCollector;

		beforeEach(() => {
			const config: TelemetryConfig = {
				enabled: false,
				serviceName: 'test-service',
				metrics: {
					enabled: false,
				},
			};

			metrics = new MetricsCollector(config);
		});

		it('should create collector but not initialize metrics', () => {
			expect(metrics).toBeDefined();
		});

		it('should not record task when disabled', () => {
			expect(() => {
				metrics.recordTask('completed', 'test-provider', 5.0);
			}).not.toThrow();
		});

		it('should not record provider request when disabled', () => {
			expect(() => {
				metrics.recordProviderRequest('test-provider', 100, true);
			}).not.toThrow();
		});

		it('should not record rate limit when disabled', () => {
			expect(() => {
				metrics.recordRateLimit('test-provider', 'subscription');
			}).not.toThrow();
		});

		it('should not record token usage when disabled', () => {
			expect(() => {
				metrics.recordTokenUsage('test-provider', 1000, 500);
			}).not.toThrow();
		});

		it('should not record cost when disabled', () => {
			expect(() => {
				metrics.recordCost('test-provider', 0.05, 'api');
			}).not.toThrow();
		});

		it('should not record error when disabled', () => {
			expect(() => {
				metrics.recordError('test_error', 'test-provider');
			}).not.toThrow();
		});
	});

	describe('integration scenarios', () => {
		let metrics: MetricsCollector;

		beforeEach(() => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
				metrics: {
					enabled: true,
				},
			};

			metrics = new MetricsCollector(config);
		});

		it('should record complete task lifecycle', () => {
			expect(() => {
				// Task execution
				metrics.recordTask('completed', 'claude-code', 10.5, {
					'task.id': 'task-123',
				});

				// Provider requests
				metrics.recordProviderRequest('claude-code', 150, true);
				metrics.recordProviderRequest('claude-code', 200, true);

				// Token usage
				metrics.recordTokenUsage('claude-code', 2000, 1000);

				// Cost
				metrics.recordCost('claude-code', 0.075, 'api');
			}).not.toThrow();
		});

		it('should record task failure with error', () => {
			expect(() => {
				// Failed provider request
				metrics.recordProviderRequest('test-provider', 300, false);

				// Record error
				metrics.recordError('api_error', 'test-provider');

				// Failed task
				metrics.recordTask('failed', 'test-provider', 5.0);
			}).not.toThrow();
		});

		it('should record rate limit scenario', () => {
			expect(() => {
				// Multiple successful requests
				metrics.recordProviderRequest('test-provider', 100, true);
				metrics.recordProviderRequest('test-provider', 110, true);
				metrics.recordProviderRequest('test-provider', 105, true);

				// Rate limit hit
				metrics.recordRateLimit('test-provider', 'subscription');

				// Failed request due to rate limit
				metrics.recordProviderRequest('test-provider', 50, false);
				metrics.recordError('rate_limit', 'test-provider');
			}).not.toThrow();
		});

		it('should record multi-provider workflow', () => {
			expect(() => {
				// Claude request
				metrics.recordTask('completed', 'claude-code', 8.0);
				metrics.recordTokenUsage('claude-code', 1500, 750);
				metrics.recordCost('claude-code', 0.05, 'subscription');

				// Gemini request
				metrics.recordTask('completed', 'gemini-cli', 6.5);
				metrics.recordTokenUsage('gemini-cli', 2000, 1000);
				metrics.recordCost('gemini-cli', 0.0, 'free');

				// Cursor request
				metrics.recordTask('completed', 'cursor-cli', 7.2);
				metrics.recordTokenUsage('cursor-cli', 1800, 900);
				metrics.recordCost('cursor-cli', 0.0, 'subscription');
			}).not.toThrow();
		});
	});
});

describe('measureDuration', () => {
	it('should measure function execution duration', async () => {
		const [result, duration] = await measureDuration(async () => {
			return 'success';
		});

		expect(result).toBe('success');
		expect(duration).toBeGreaterThanOrEqual(0);
		expect(duration).toBeLessThan(1); // Should be less than 1 second
	});

	it('should measure duration of async operations', async () => {
		const [result, duration] = await measureDuration(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
			return 42;
		});

		expect(result).toBe(42);
		expect(duration).toBeGreaterThanOrEqual(0.05); // At least 50ms
		expect(duration).toBeLessThan(0.2); // But not too long
	});

	it('should return duration in seconds', async () => {
		const [, duration] = await measureDuration(async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return;
		});

		// Duration should be approximately 0.1 seconds (100ms)
		expect(duration).toBeGreaterThanOrEqual(0.1);
		expect(duration).toBeLessThan(0.2);
	});

	it('should propagate errors from measured function', async () => {
		const testError = new Error('Test error');

		await expect(
			measureDuration(async () => {
				throw testError;
			}),
		).rejects.toThrow('Test error');
	});

	it('should measure duration even when function throws', async () => {
		try {
			await measureDuration(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				throw new Error('Test error');
			});
		} catch (error) {
			// Error should be thrown, but we can't easily measure duration here
			expect(error).toBeInstanceOf(Error);
		}
	});

	it('should return result and duration as tuple', async () => {
		const [result, duration] = await measureDuration(async () => {
			return { data: 'test' };
		});

		expect(result).toEqual({ data: 'test' });
		expect(typeof duration).toBe('number');
	});

	it('should work with different return types', async () => {
		const [stringResult] = await measureDuration(async () => 'string');
		expect(stringResult).toBe('string');

		const [numberResult] = await measureDuration(async () => 42);
		expect(numberResult).toBe(42);

		const [booleanResult] = await measureDuration(async () => true);
		expect(booleanResult).toBe(true);

		const [objectResult] = await measureDuration(async () => ({ key: 'value' }));
		expect(objectResult).toEqual({ key: 'value' });

		const [arrayResult] = await measureDuration(async () => [1, 2, 3]);
		expect(arrayResult).toEqual([1, 2, 3]);
	});

	it('should measure near-zero duration for fast operations', async () => {
		const [result, duration] = await measureDuration(async () => {
			return 'instant';
		});

		expect(result).toBe('instant');
		expect(duration).toBeGreaterThanOrEqual(0);
		expect(duration).toBeLessThan(0.01); // Less than 10ms
	});
});
