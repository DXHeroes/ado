/**
 * Telemetry types and interfaces for OpenTelemetry integration
 */

export interface TelemetryConfig {
	enabled: boolean;
	serviceName: string;
	serviceVersion?: string;
	environment?: string;

	// Tracing configuration
	tracing?: {
		enabled: boolean;
		endpoint?: string;
		sampleRate?: number; // 0.0 to 1.0
	};

	// Metrics configuration
	metrics?: {
		enabled: boolean;
		endpoint?: string;
		interval?: number; // milliseconds
	};

	// Logging configuration
	logging?: {
		enabled: boolean;
		endpoint?: string;
		level?: 'debug' | 'info' | 'warn' | 'error';
	};
}

export interface SpanContext {
	traceId: string;
	spanId: string;
	traceFlags: number;
}

export interface MetricAttributes {
	[key: string]: string | number | boolean;
}

export interface TaskMetrics {
	taskId: string;
	provider: string;
	duration: number;
	inputTokens: number;
	outputTokens: number;
	cost: number;
	status: 'completed' | 'failed' | 'cancelled';
}

export interface ProviderMetrics {
	providerId: string;
	requestCount: number;
	failureCount: number;
	avgLatency: number;
	rateLimitHits: number;
}
