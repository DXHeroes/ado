/**
 * OpenTelemetry SDK setup and initialization
 */

import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import {
	SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
	SEMRESATTRS_SERVICE_NAME,
	SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import type { TelemetryConfig } from './types.js';

let sdkInstance: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 */
export function initializeTelemetry(config: TelemetryConfig): NodeSDK {
	if (sdkInstance) {
		return sdkInstance;
	}

	// Create resource attributes
	const resource = new Resource({
		[SEMRESATTRS_SERVICE_NAME]: config.serviceName,
		[SEMRESATTRS_SERVICE_VERSION]: config.serviceVersion ?? 'unknown',
		[SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment ?? 'development',
	});

	// Configure trace exporter
	const traceExporter = config.tracing?.endpoint
		? new OTLPTraceExporter({
				url: config.tracing.endpoint,
			})
		: new ConsoleSpanExporter();

	// Configure metric exporter and reader
	const metricExporter = config.metrics?.endpoint
		? new OTLPMetricExporter({
				url: config.metrics.endpoint,
			})
		: new ConsoleMetricExporter();

	const metricReader = new PeriodicExportingMetricReader({
		exporter: metricExporter,
		exportIntervalMillis: config.metrics?.interval ?? 60000, // Default 1 minute
	});

	// Create SDK instance
	// Cast metricReader due to OpenTelemetry SDK type incompatibilities between versions
	sdkInstance = new NodeSDK({
		resource,
		traceExporter,
		// biome-ignore lint/suspicious/noExplicitAny: Type incompatibility between OTel SDK versions
		metricReader: metricReader as any,
	});

	// Start the SDK
	sdkInstance.start();

	return sdkInstance;
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
	if (!sdkInstance) {
		return;
	}

	try {
		await sdkInstance.shutdown();
		sdkInstance = null;
	} catch (_error) {}
}

/**
 * Get current SDK instance
 */
export function getTelemetrySDK(): NodeSDK | null {
	return sdkInstance;
}

/**
 * Setup process signal handlers for graceful shutdown
 */
export function setupGracefulShutdown(): void {
	const signals = ['SIGINT', 'SIGTERM'];

	for (const signal of signals) {
		process.on(signal, async () => {
			await shutdownTelemetry();
			process.exit(0);
		});
	}
}

/**
 * Create TelemetryConfig from environment variables.
 * Automatically enables telemetry when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *
 * Supported environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base OTLP endpoint (required for auto-enable)
 * - OTEL_SERVICE_NAME: Service name (default: 'ado')
 * - OTEL_TRACE_SAMPLER_ARG: Trace sampling rate 0.0-1.0 (default: 1.0)
 * - NODE_ENV: Environment name (default: 'development')
 *
 * @returns TelemetryConfig if OTEL endpoint is configured, null otherwise
 */
export function createTelemetryConfigFromEnv(): TelemetryConfig | null {
	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

	// Auto-enable only when OTEL endpoint is configured
	if (!endpoint) {
		return null;
	}

	// Normalize endpoint (remove trailing slash if present)
	const normalizedEndpoint = endpoint.replace(/\/$/, '');

	return {
		enabled: true,
		serviceName: process.env.OTEL_SERVICE_NAME ?? 'ado',
		serviceVersion: process.env.npm_package_version ?? '1.0.0',
		environment: process.env.NODE_ENV ?? 'development',
		tracing: {
			enabled: true,
			endpoint: `${normalizedEndpoint}/v1/traces`,
			sampleRate: Number.parseFloat(process.env.OTEL_TRACE_SAMPLER_ARG ?? '1.0'),
		},
		metrics: {
			enabled: true,
			endpoint: `${normalizedEndpoint}/v1/metrics`,
		},
	};
}
