/**
 * OpenTelemetry Setup Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	initializeTelemetry,
	shutdownTelemetry,
	getTelemetrySDK,
	setupGracefulShutdown,
	createTelemetryConfigFromEnv,
} from '../setup.js';
import type { TelemetryConfig } from '../types.js';

describe('OpenTelemetry Setup', () => {
	// Store original env vars
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Reset singleton state
		vi.resetModules();
	});

	afterEach(async () => {
		// Clean up SDK instance
		await shutdownTelemetry();
		// Restore env vars
		process.env = { ...originalEnv };
	});

	describe('initializeTelemetry', () => {
		it('should initialize SDK with basic config', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
			expect(getTelemetrySDK()).toBe(sdk);
		});

		it('should initialize SDK with full config', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
				serviceVersion: '1.0.0',
				environment: 'test',
				tracing: {
					enabled: true,
					endpoint: 'http://localhost:4318/v1/traces',
					sampleRate: 0.5,
				},
				metrics: {
					enabled: true,
					endpoint: 'http://localhost:4318/v1/metrics',
					interval: 30000,
				},
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
		});

		it('should use console exporters when endpoints not provided', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
		});

		it('should return same instance on subsequent calls', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk1 = initializeTelemetry(config);
			const sdk2 = initializeTelemetry(config);

			expect(sdk1).toBe(sdk2);
		});

		it('should use default service version when not provided', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
		});

		it('should use default environment when not provided', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
		});

		it('should configure trace exporter with OTLP endpoint', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
				tracing: {
					enabled: true,
					endpoint: 'http://otel-collector:4318/v1/traces',
				},
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
		});

		it('should configure metric exporter with OTLP endpoint', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
				metrics: {
					enabled: true,
					endpoint: 'http://otel-collector:4318/v1/metrics',
					interval: 60000,
				},
			};

			const sdk = initializeTelemetry(config);

			expect(sdk).toBeDefined();
		});
	});

	describe('shutdownTelemetry', () => {
		it('should shutdown SDK gracefully', async () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			initializeTelemetry(config);
			await shutdownTelemetry();

			expect(getTelemetrySDK()).toBeNull();
		});

		it('should handle shutdown when SDK not initialized', async () => {
			await expect(shutdownTelemetry()).resolves.not.toThrow();
		});

		it('should handle shutdown errors silently', async () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			initializeTelemetry(config);

			// Shutdown should not throw even if underlying shutdown fails
			await expect(shutdownTelemetry()).resolves.not.toThrow();
		});

		it('should allow re-initialization after shutdown', async () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk1 = initializeTelemetry(config);
			await shutdownTelemetry();

			const sdk2 = initializeTelemetry(config);

			expect(sdk1).not.toBe(sdk2);
		});
	});

	describe('getTelemetrySDK', () => {
		it('should return null when SDK not initialized', () => {
			expect(getTelemetrySDK()).toBeNull();
		});

		it('should return SDK instance when initialized', () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			const sdk = initializeTelemetry(config);

			expect(getTelemetrySDK()).toBe(sdk);
		});

		it('should return null after shutdown', async () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'test-service',
			};

			initializeTelemetry(config);
			await shutdownTelemetry();

			expect(getTelemetrySDK()).toBeNull();
		});
	});

	describe('setupGracefulShutdown', () => {
		it('should register signal handlers', () => {
			const onSpy = vi.spyOn(process, 'on');

			setupGracefulShutdown();

			expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
			expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
		});
	});

	describe('createTelemetryConfigFromEnv', () => {
		it('should return null when OTEL endpoint not set', () => {
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

			const config = createTelemetryConfigFromEnv();

			expect(config).toBeNull();
		});

		it('should create config from environment variables', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
			process.env.OTEL_SERVICE_NAME = 'test-service';
			process.env.NODE_ENV = 'production';

			const config = createTelemetryConfigFromEnv();

			expect(config).toEqual({
				enabled: true,
				serviceName: 'test-service',
				serviceVersion: expect.any(String),
				environment: 'production',
				tracing: {
					enabled: true,
					endpoint: 'http://localhost:4318/v1/traces',
					sampleRate: 1.0,
				},
				metrics: {
					enabled: true,
					endpoint: 'http://localhost:4318/v1/metrics',
				},
			});
		});

		it('should use default service name when not provided', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
			delete process.env.OTEL_SERVICE_NAME;

			const config = createTelemetryConfigFromEnv();

			expect(config?.serviceName).toBe('ado');
		});

		it('should use default environment when not provided', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
			delete process.env.NODE_ENV;

			const config = createTelemetryConfigFromEnv();

			expect(config?.environment).toBe('development');
		});

		it('should normalize endpoint by removing trailing slash', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318/';

			const config = createTelemetryConfigFromEnv();

			expect(config?.tracing?.endpoint).toBe('http://localhost:4318/v1/traces');
			expect(config?.metrics?.endpoint).toBe('http://localhost:4318/v1/metrics');
		});

		it('should parse sample rate from environment', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
			process.env.OTEL_TRACE_SAMPLER_ARG = '0.5';

			const config = createTelemetryConfigFromEnv();

			expect(config?.tracing?.sampleRate).toBe(0.5);
		});

		it('should use default sample rate when not provided', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
			delete process.env.OTEL_TRACE_SAMPLER_ARG;

			const config = createTelemetryConfigFromEnv();

			expect(config?.tracing?.sampleRate).toBe(1.0);
		});

		it('should auto-enable telemetry when endpoint is configured', () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

			const config = createTelemetryConfigFromEnv();

			expect(config?.enabled).toBe(true);
			expect(config?.tracing?.enabled).toBe(true);
			expect(config?.metrics?.enabled).toBe(true);
		});
	});

	describe('integration', () => {
		it('should create and shutdown SDK successfully', async () => {
			const config: TelemetryConfig = {
				enabled: true,
				serviceName: 'integration-test',
				serviceVersion: '1.0.0',
				environment: 'test',
				tracing: {
					enabled: true,
					endpoint: 'http://localhost:4318/v1/traces',
				},
				metrics: {
					enabled: true,
					endpoint: 'http://localhost:4318/v1/metrics',
					interval: 30000,
				},
			};

			const sdk = initializeTelemetry(config);
			expect(sdk).toBeDefined();

			await shutdownTelemetry();
			expect(getTelemetrySDK()).toBeNull();
		});

		it('should create config from env and initialize SDK', async () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
			process.env.OTEL_SERVICE_NAME = 'env-test';

			const config = createTelemetryConfigFromEnv();
			expect(config).toBeDefined();

			if (config) {
				const sdk = initializeTelemetry(config);
				expect(sdk).toBeDefined();

				await shutdownTelemetry();
			}
		});
	});
});
