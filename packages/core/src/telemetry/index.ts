/**
 * ADO Telemetry Module
 *
 * Provides OpenTelemetry integration for tracing, metrics, and observability.
 */

export * from './types.js';
export * from './tracer.js';
export * from './metrics.js';
export * from './setup.js';
export {
	initializeTelemetry,
	shutdownTelemetry,
	getTelemetrySDK,
	setupGracefulShutdown,
} from './setup.js';
export { Tracer, traceTaskExecution, traceProviderRequest } from './tracer.js';
export { MetricsCollector, measureDuration } from './metrics.js';

import { MetricsCollector } from './metrics.js';
import { initializeTelemetry } from './setup.js';
import { Tracer } from './tracer.js';
import type { TelemetryConfig } from './types.js';

/**
 * Main telemetry service that combines tracing and metrics
 */
export class TelemetryService {
	public readonly tracer: Tracer;
	public readonly metrics: MetricsCollector;

	constructor(config: TelemetryConfig) {
		// Initialize OpenTelemetry SDK
		if (config.enabled) {
			initializeTelemetry(config);
		}

		// Create tracer and metrics collector
		this.tracer = new Tracer(config);
		this.metrics = new MetricsCollector(config);
	}

	/**
	 * Check if telemetry is enabled
	 */
	isEnabled(): boolean {
		return this.tracer['enabled'] || this.metrics['enabled'];
	}
}

/**
 * Create a telemetry service instance
 */
export function createTelemetryService(config: TelemetryConfig): TelemetryService {
	return new TelemetryService(config);
}
